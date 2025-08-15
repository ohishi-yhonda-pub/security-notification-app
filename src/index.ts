import { DurableObject } from "cloudflare:workers";

interface NotificationEndpoint {
	id: string;
	name: string;
	type: 'webhook' | 'email' | 'slack';
	url?: string;
	email?: string;
	enabled: boolean;
	createdAt: string;
}

interface SecurityEvent {
	id: string;
	timestamp: string;
	action: string;
	clientIP: string;
	country: string;
	method: string;
	host: string;
	uri: string;
	userAgent: string;
	ruleId: string;
	ruleName: string;
}

export class NotificationManager extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async addEndpoint(endpoint: NotificationEndpoint): Promise<void> {
		await this.ctx.storage.put(`endpoint:${endpoint.id}`, endpoint);
	}

	async removeEndpoint(id: string): Promise<void> {
		await this.ctx.storage.delete(`endpoint:${id}`);
	}

	async getEndpoints(): Promise<NotificationEndpoint[]> {
		const entries = await this.ctx.storage.list({ prefix: 'endpoint:' });
		return Array.from(entries.values()) as NotificationEndpoint[];
	}

	async toggleEndpoint(id: string, enabled: boolean): Promise<void> {
		const key = `endpoint:${id}`;
		const endpoint = await this.ctx.storage.get<NotificationEndpoint>(key);
		if (endpoint) {
			endpoint.enabled = enabled;
			await this.ctx.storage.put(key, endpoint);
		}
	}

	async checkAndNotifySecurityEvents(): Promise<void> {
		try {
			const now = new Date();
			const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
			
			const events = await this.fetchSecurityEvents(fiveMinutesAgo, now);
			
			for (const event of events) {
				const eventKey = `event:${event.id}`;
				const processed = await this.env.PROCESSED_EVENTS.get(eventKey);
				
				if (!processed) {
					await this.sendNotifications(event);
					await this.env.PROCESSED_EVENTS.put(eventKey, JSON.stringify(event), {
						expirationTtl: 86400 // 24 hours
					});
				}
			}
		} catch (error) {
			console.error('Error checking security events:', error);
		}
	}

	private async fetchSecurityEvents(startTime: Date, endTime: Date): Promise<SecurityEvent[]> {
		const apiUrl = `https://api.cloudflare.com/client/v4/zones/${this.env.CLOUDFLARE_ZONE_ID}/security/events`;
		
		const params = new URLSearchParams({
			since: startTime.toISOString(),
			until: endTime.toISOString(),
			limit: '100',
			order: 'desc'
		});

		const response = await fetch(`${apiUrl}?${params}`, {
			headers: {
				'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			throw new Error(`Cloudflare API error: ${response.status}`);
		}

		const data = await response.json() as any;
		
		return data.result
			.filter((event: any) => 
				event.action === 'block' || 
				event.action === 'challenge' || 
				event.action === 'jschallenge'
			)
			.map((event: any) => ({
				id: event.ray_id,
				timestamp: event.occurred_at,
				action: event.action,
				clientIP: event.client_ip,
				country: event.country,
				method: event.method,
				host: event.host,
				uri: event.uri,
				userAgent: event.user_agent,
				ruleId: event.rule_id,
				ruleName: event.rule_message || 'Unknown',
			}));
	}

	async sendNotifications(event: SecurityEvent): Promise<void> {
		const endpoints = await this.getEndpoints();
		const activeEndpoints = endpoints.filter(ep => ep.enabled);

		const promises = activeEndpoints.map(endpoint => 
			this.sendToEndpoint(endpoint, event).catch(err => 
				console.error(`Failed to send to ${endpoint.name}:`, err)
			)
		);

		await Promise.all(promises);
	}

	private async sendToEndpoint(endpoint: NotificationEndpoint, event: SecurityEvent): Promise<void> {
		switch (endpoint.type) {
			case 'webhook':
				await this.sendWebhook(endpoint.url!, event);
				break;
			case 'slack':
				await this.sendSlack(endpoint.url!, event);
				break;
			case 'email':
				// Email implementation would go here
				console.log(`Email notification to ${endpoint.email} for event ${event.id}`);
				break;
		}
	}

	private async sendWebhook(url: string, event: SecurityEvent): Promise<void> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'cloudflare_security_event',
				event: event,
				timestamp: new Date().toISOString()
			})
		});

		if (!response.ok) {
			throw new Error(`Webhook failed: ${response.status}`);
		}
	}

	private async sendSlack(url: string, event: SecurityEvent): Promise<void> {
		const message = {
			text: `🚨 Security Alert: ${event.action.toUpperCase()}`,
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `*Security Event Detected*\n*Action:* ${event.action}\n*Time:* ${new Date(event.timestamp).toLocaleString()}`
					}
				},
				{
					type: 'section',
					fields: [
						{ type: 'mrkdwn', text: `*Client IP:*\n${event.clientIP}` },
						{ type: 'mrkdwn', text: `*Country:*\n${event.country}` },
						{ type: 'mrkdwn', text: `*Method:*\n${event.method}` },
						{ type: 'mrkdwn', text: `*Host:*\n${event.host}` },
						{ type: 'mrkdwn', text: `*URI:*\n${event.uri}` },
						{ type: 'mrkdwn', text: `*Rule:*\n${event.ruleName}` },
					]
				},
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: `Ray ID: ${event.id} | User Agent: ${event.userAgent.substring(0, 50)}...`
						}
					]
				}
			]
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(message)
		});

		if (!response.ok) {
			throw new Error(`Slack webhook failed: ${response.status}`);
		}
	}
}


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const notificationManager = env.NOTIFICATION_MANAGER.get(env.NOTIFICATION_MANAGER.idFromName("global"));

		// API endpoints for managing notification endpoints
		if (url.pathname === '/api/endpoints' && request.method === 'GET') {
			const endpoints = await notificationManager.getEndpoints();
			return Response.json({ endpoints });
		}

		if (url.pathname === '/api/endpoints' && request.method === 'POST') {
			const endpoint: NotificationEndpoint = await request.json();
			endpoint.id = crypto.randomUUID();
			endpoint.createdAt = new Date().toISOString();
			await notificationManager.addEndpoint(endpoint);
			return Response.json({ success: true, endpoint });
		}

		if (url.pathname.startsWith('/api/endpoints/') && request.method === 'DELETE') {
			const id = url.pathname.split('/').pop()!;
			await notificationManager.removeEndpoint(id);
			return Response.json({ success: true });
		}

		if (url.pathname.startsWith('/api/endpoints/') && url.pathname.endsWith('/toggle') && request.method === 'POST') {
			const id = url.pathname.split('/')[3];
			const body = await request.json() as { enabled: boolean };
			await notificationManager.toggleEndpoint(id, body.enabled);
			return Response.json({ success: true });
		}

		// Manual trigger for checking security events
		if (url.pathname === '/api/check-events' && request.method === 'POST') {
			await notificationManager.checkAndNotifySecurityEvents();
			return Response.json({ success: true, message: 'Security events checked' });
		}

		return new Response('Security Notification API', { status: 200 });
	},

	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		const notificationManager = env.NOTIFICATION_MANAGER.get(env.NOTIFICATION_MANAGER.idFromName("global"));
		await notificationManager.checkAndNotifySecurityEvents();
	}
} satisfies ExportedHandler<Env>;
