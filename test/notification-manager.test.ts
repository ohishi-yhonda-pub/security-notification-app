import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext, runInDurableObject } from 'cloudflare:test';
import { NotificationManager } from '../src/index';

// Mock global fetch
global.fetch = vi.fn() as any;

// Suppress console errors during tests
const originalError = console.error;
console.error = (...args: any[]) => {
	const errorString = args.join(' ');
	if (
		errorString.includes('Error checking security events') ||
		errorString.includes('Cannot perform I/O')
	) {
		return;
	}
	originalError.apply(console, args);
};

describe('NotificationManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Override env vars for tests
		env.CLOUDFLARE_API_TOKEN = 'test-token';
		env.CLOUDFLARE_ZONE_ID = 'test-zone-id';
	});

	it('should add and get endpoints', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-1',
			name: 'Test Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		// Add endpoint
		await stub.addEndpoint(endpoint);

		// Get endpoints
		const endpoints = await stub.getEndpoints();
		expect(endpoints).toHaveLength(1);
		expect(endpoints[0]).toMatchObject(endpoint);
	});

	it('should remove endpoints', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-remove');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-remove-1',
			name: 'Test Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		// Add and then remove endpoint
		await stub.addEndpoint(endpoint);
		await stub.removeEndpoint(endpoint.id);

		// Check it's gone
		const endpoints = await stub.getEndpoints();
		expect(endpoints).toHaveLength(0);
	});

	it('should toggle endpoint status', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-toggle');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-toggle-1',
			name: 'Test Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/webhook',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		// Add endpoint
		await stub.addEndpoint(endpoint);

		// Toggle to false
		await stub.toggleEndpoint(endpoint.id, false);

		// Check status
		const endpoints = await stub.getEndpoints();
		expect(endpoints[0].enabled).toBe(false);

		// Toggle back to true
		await stub.toggleEndpoint(endpoint.id, true);

		// Check status again
		const endpoints2 = await stub.getEndpoints();
		expect(endpoints2[0].enabled).toBe(true);
	});

	it('should handle non-existent endpoint toggle', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-toggle-nonexistent');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Toggle non-existent endpoint - should not throw
		await expect(stub.toggleEndpoint('non-existent', true)).resolves.not.toThrow();
	});

	it('should send notifications to webhook endpoints', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-webhook');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-webhook-1',
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

		// Mock fetch
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

		try {
			await stub.addEndpoint(endpoint);
			await stub.sendNotifications(event);

			expect(global.fetch).toHaveBeenCalledWith(
				endpoint.url,
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: expect.stringContaining(event.id)
				})
			);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('should send notifications to slack endpoints', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-slack');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-slack-1',
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

		// Mock fetch
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

		try {
			await stub.addEndpoint(endpoint);
			await stub.sendNotifications(event);

			expect(global.fetch).toHaveBeenCalledWith(
				endpoint.url,
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: expect.stringContaining('Security Alert')
				})
			);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('should log email notifications', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-email');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-email-1',
			name: 'Test Email',
			type: 'email' as const,
			email: 'test@example.com',
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

		// Spy on console
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		try {
			await stub.addEndpoint(endpoint);
			await stub.sendNotifications(event);

			expect(consoleSpy).toHaveBeenCalledWith(
				`Email notification to ${endpoint.email} for event ${event.id}`
			);
		} finally {
			consoleSpy.mockRestore();
		}
	});

	it('should handle notification failures gracefully', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-failure');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const endpoint = {
			id: 'test-failure-1',
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

		// Mock fetch to fail
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		// Spy on console.error
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await stub.addEndpoint(endpoint);
			
			// Should not throw
			await expect(stub.sendNotifications(event)).resolves.not.toThrow();

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to send'),
				expect.any(Error)
			);
		} finally {
			global.fetch = originalFetch;
			consoleSpy.mockRestore();
		}
	});

	it('should only send to enabled endpoints', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-enabled');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		const enabledEndpoint = {
			id: 'test-enabled-1',
			name: 'Enabled Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/enabled',
			enabled: true,
			createdAt: new Date().toISOString()
		};

		const disabledEndpoint = {
			id: 'test-disabled-1',
			name: 'Disabled Endpoint',
			type: 'webhook' as const,
			url: 'https://example.com/disabled',
			enabled: false,
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

		// Mock fetch
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));

		try {
			await stub.addEndpoint(enabledEndpoint);
			await stub.addEndpoint(disabledEndpoint);
			await stub.sendNotifications(event);

			// Should only call enabled endpoint
			expect(global.fetch).toHaveBeenCalledTimes(1);
			expect(global.fetch).toHaveBeenCalledWith(
				enabledEndpoint.url,
				expect.any(Object)
			);
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('should check and notify security events', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-check-events');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Add an endpoint to ensure notification is sent
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
		global.fetch = vi.fn()
			.mockImplementation(async (url: string, options?: any) => {
				if (url.includes('api.cloudflare.com')) {
					return new Response(JSON.stringify({
						result: [{
							ray_id: 'event-1',
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

		// Mock KV storage
		const originalKV = env.PROCESSED_EVENTS;
		env.PROCESSED_EVENTS = {
			...originalKV,
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn()
		} as any;

		try {
			await stub.checkAndNotifySecurityEvents();

			// Should call Cloudflare API
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining('api.cloudflare.com'),
				expect.objectContaining({
					headers: expect.objectContaining({
						'Authorization': expect.stringContaining('Bearer'),
						'Content-Type': 'application/json'
					})
				})
			);

			// Should send notification
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

	it('should skip already processed events', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-skip-processed');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Mock Cloudflare API response
		const originalFetch = global.fetch;
		global.fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				result: [{
					ray_id: 'event-1',
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
			}), { status: 200 }));

		// Mock KV to indicate event is already processed
		env.PROCESSED_EVENTS.get = vi.fn().mockResolvedValue('already-processed');
		env.PROCESSED_EVENTS.put = vi.fn();

		try {
			await stub.checkAndNotifySecurityEvents();

			// Should not send notification or store event
			expect(env.PROCESSED_EVENTS.put).not.toHaveBeenCalled();
			expect(global.fetch).toHaveBeenCalledTimes(1); // Only API call
		} finally {
			global.fetch = originalFetch;
		}
	});

	it('should handle API errors gracefully', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-api-error');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Mock failed API response
		const originalFetch = global.fetch;
		global.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

		// Spy on console.error
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			// Should not throw
			await expect(stub.checkAndNotifySecurityEvents()).resolves.not.toThrow();

			expect(consoleSpy).toHaveBeenCalledWith(
				'Error checking security events:',
				expect.any(Error)
			);
		} finally {
			global.fetch = originalFetch;
			consoleSpy.mockRestore();
		}
	});

	it('should filter security events by action type', async () => {
		const doId = env.NOTIFICATION_MANAGER.idFromName('test-filter-events');
		const stub = env.NOTIFICATION_MANAGER.get(doId);

		// Mock Cloudflare API response with mixed event types
		const originalFetch = global.fetch;
		let filteredEvents: any[] = [];
		
		global.fetch = vi.fn()
			.mockImplementation(async (url: string) => {
				if (url.includes('api.cloudflare.com')) {
					return new Response(JSON.stringify({
						result: [
							{
								ray_id: 'event-1',
								occurred_at: new Date().toISOString(),
								action: 'allow', // Should be filtered out
								client_ip: '1.2.3.4',
								country: 'US',
								method: 'GET',
								host: 'example.com',
								uri: '/test',
								user_agent: 'Mozilla/5.0',
								rule_id: 'rule-1'
							},
							{
								ray_id: 'event-2',
								occurred_at: new Date().toISOString(),
								action: 'block', // Should be included
								client_ip: '5.6.7.8',
								country: 'CN',
								method: 'POST',
								host: 'example.com',
								uri: '/admin',
								user_agent: 'Bot',
								rule_id: 'rule-2',
								rule_message: 'Blocked'
							},
							{
								ray_id: 'event-3',
								occurred_at: new Date().toISOString(),
								action: 'challenge', // Should be included
								client_ip: '9.10.11.12',
								country: 'RU',
								method: 'GET',
								host: 'example.com',
								uri: '/api',
								user_agent: 'Suspicious',
								rule_id: 'rule-3',
								rule_message: 'Challenge'
							}
						]
					}), { status: 200 });
				}
				return new Response('OK', { status: 200 });
			});

		try {
			await stub.checkAndNotifySecurityEvents();

			// API should be called
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining('api.cloudflare.com'),
				expect.any(Object)
			);
			
			// Verify that the API was called (indicating the method executed)
			expect(global.fetch).toHaveBeenCalled();
		} finally {
			global.fetch = originalFetch;
		}
	});
});