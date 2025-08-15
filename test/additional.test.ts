import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { NotificationManager } from '../src/index';

// Mock global fetch
global.fetch = vi.fn() as any;

// Suppress console errors during tests
const originalError = console.error;
console.error = (...args: any[]) => {
	const errorString = args.join(' ');
	if (
		errorString.includes('Error checking security events') ||
		errorString.includes('Failed to send')
	) {
		return;
	}
	originalError.apply(console, args);
};

describe('Additional Coverage Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.CLOUDFLARE_API_TOKEN = 'test-token';
		env.CLOUDFLARE_ZONE_ID = 'test-zone-id';
	});

	it('should handle events without rule_message', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-no-rule-message');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Add endpoint to ensure notification is sent
		const endpoint = {
			id: 'test-endpoint',
			name: 'Test Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};
		await stub.addEndpoint(endpoint);

		// Mock Cloudflare API response without rule_message
		const originalFetch = global.fetch;
		let notificationBody: any = null;

		global.fetch = vi.fn()
			.mockImplementation(async (url: string, options?: any) => {
				if (url.includes('api.cloudflare.com')) {
					return new Response(JSON.stringify({
						result: [{
							ray_id: 'event-no-msg',
							occurred_at: new Date().toISOString(),
							action: 'block',
							client_ip: '1.2.3.4',
							country: 'US',
							method: 'GET',
							host: 'example.com',
							uri: '/test',
							user_agent: 'Mozilla/5.0',
							rule_id: 'rule-1'
							// Note: no rule_message field
						}]
					}), { status: 200 });
				} else {
					// Capture notification body
					notificationBody = JSON.parse(options.body);
					return new Response('OK', { status: 200 });
				}
			});

		try {
			await stub.checkAndNotifySecurityEvents();

			// Should have called the webhook with 'Unknown' as ruleName
			expect(notificationBody).toBeTruthy();
			expect(notificationBody.event.ruleName).toBe('Unknown');
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('should handle webhook failure with non-ok response', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-webhook-failure');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-webhook-fail',
			name: 'Test Webhook',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		const event = {
			id: 'event-1',
			timestamp: new Date().toISOString(),
			action: 'block',
			clientIP: '1.2.3.4',
			country: 'US',
			method: 'GET',
			host: 'example.com',
			uri: '/test',
			userAgent: 'Mozilla/5.0',
			ruleId: 'rule-1',
			ruleName: 'Blocked by WAF'
		};

		// Mock fetch to return non-ok response
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }));

		// Spy on console.error
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await stub.addEndpoint(endpoint);
			await stub.sendNotifications(event);

			// Should have logged the error
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to send'),
				expect.any(Error)
			);
		} finally {
			global.fetch = originalFetch;
			consoleSpy.mockRestore();
		}
	});

	it('should handle slack webhook failure with non-ok response', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-slack-failure');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-slack-fail',
			name: 'Test Slack',
			type: 'slack' as const,
			url: 'https://hooks.slack.com/services/test',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		const event = {
			id: 'event-1',
			timestamp: new Date().toISOString(),
			action: 'block',
			clientIP: '1.2.3.4',
			country: 'US',
			method: 'GET',
			host: 'example.com',
			uri: '/test',
			userAgent: 'Mozilla/5.0',
			ruleId: 'rule-1',
			ruleName: 'Blocked by WAF'
		};

		// Mock fetch to return non-ok response
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 }));

		// Spy on console.error
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await stub.addEndpoint(endpoint);
			await stub.sendNotifications(event);

			// Should have logged the error
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to send'),
				expect.any(Error)
			);
		} finally {
			global.fetch = originalFetch;
			consoleSpy.mockRestore();
		}
	});

	it('should process new events and store them', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-process-new');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Add an endpoint to receive notifications
		const endpoint = {
			id: 'test-endpoint',
			name: 'Test Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};
		await stub.addEndpoint(endpoint);

		// Mock Cloudflare API response
		const originalFetch = global.fetch;
		const putSpy = vi.fn();
		
		// Override PROCESSED_EVENTS for this specific test
		const originalKV = env.PROCESSED_EVENTS;
		env.PROCESSED_EVENTS = {
			...originalKV,
			get: vi.fn().mockResolvedValue(null), // Event not processed
			put: putSpy
		} as any;

		global.fetch = vi.fn()
			.mockImplementation(async (url: string) => {
				if (url.includes('api.cloudflare.com')) {
					return new Response(JSON.stringify({
						result: [{
							ray_id: 'new-event-1',
							occurred_at: new Date().toISOString(),
							action: 'block',
							client_ip: '1.2.3.4',
							country: 'US',
							method: 'GET',
							host: 'example.com',
							uri: '/test',
							user_agent: 'Mozilla/5.0',
							rule_id: 'rule-1',
							rule_message: 'Blocked by WAF'
						}]
					}), { status: 200 });
				}
				// Webhook response
				return new Response('OK', { status: 200 });
			});

		try {
			await stub.checkAndNotifySecurityEvents();

			// Should have called the webhook
			expect(global.fetch).toHaveBeenCalledWith(
				endpoint.url,
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				})
			);
		} finally {
			global.fetch = originalFetch;
			env.PROCESSED_EVENTS = originalKV;
		}
	});
});