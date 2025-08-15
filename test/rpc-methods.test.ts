import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { SELF } from 'cloudflare:test';
import { testEnv, setupTestEnvironment, createTestEndpoint, createTestSecurityEvent, mockFetch, mockKVStorage } from './helpers/test-helpers';
import { createRPCWorker } from './test-utils';

describe('RPC Methods', () => {
	beforeAll(() => {
		setupTestEnvironment();
	});

	describe('RPC via Test Utils', () => {
		let worker: any;

		beforeEach(() => {
			worker = createRPCWorker(testEnv);
			vi.clearAllMocks();
			mockFetch();
		});

		it('should check security events via RPC', async () => {
			const result = await worker.checkSecurityEvents();
			expect(result).toEqual({ success: true, message: 'Security events checked via RPC' });
		});

		it('should return endpoints list', async () => {
			const endpoints = await worker.getEndpointsList();
			expect(Array.isArray(endpoints)).toBe(true);
		});

		it('should handle complete endpoint lifecycle via RPC', async () => {
			// Add
			const endpoint = createTestEndpoint({
				name: 'RPC Lifecycle Test',
				type: 'webhook',
				url: 'https://example.com/rpc-lifecycle'
			});
			const added = await worker.addEndpoint(endpoint);
			expect(added.id).toBeDefined();

			// Toggle
			const toggleResult = await worker.toggleEndpoint(added.id, false);
			expect(toggleResult).toEqual({ success: true });

			// Remove
			const removeResult = await worker.removeEndpoint(added.id);
			expect(removeResult).toEqual({ success: true });
		});

		it('should send test notifications', async () => {
			// Add endpoint
			await worker.addEndpoint(createTestEndpoint({
				name: 'RPC Notification Test',
				enabled: true
			}));

			const event = createTestSecurityEvent();
			mockFetch(new Response('OK', { status: 200 }));

			const result = await worker.sendTestNotification(event);
			expect(result.success).toBe(true);
			expect(result.notifiedEndpoints).toBeGreaterThan(0);
		});

		it('should get processed events', async () => {
			const events = await worker.getProcessedEvents();
			expect(Array.isArray(events)).toBe(true);
		});

		it('should handle KV storage with events', async () => {
			const mockEvent = createTestSecurityEvent({ id: 'rpc-stored-event' });
			
			const kvMock = mockKVStorage(
				() => Promise.resolve(JSON.stringify(mockEvent)),
				undefined,
				() => Promise.resolve({ keys: [{ name: 'event:rpc-stored-event' }] })
			);

			const events = await worker.getProcessedEvents(10);
			expect(events).toHaveLength(1);
			expect(events[0].event.id).toBe('rpc-stored-event');

			kvMock.restore();
		});
	});

	describe('RPC via SELF', () => {
		beforeEach(() => {
			vi.clearAllMocks();
			mockFetch();
		});

		it('should call checkSecurityEvents via SELF', async () => {
			const result = await (SELF as any).checkSecurityEvents();
			expect(result).toEqual({ success: true, message: 'Security events checked via RPC' });
		});

		it('should call getEndpointsList via SELF', async () => {
			const endpoints = await (SELF as any).getEndpointsList();
			expect(Array.isArray(endpoints)).toBe(true);
		});

		it('should handle complete endpoint lifecycle via SELF', async () => {
			// Add
			const endpoint = createTestEndpoint({
				name: 'SELF Lifecycle Test',
				type: 'slack',
				url: 'https://hooks.slack.com/self-lifecycle'
			});
			const added = await (SELF as any).addEndpoint(endpoint);
			expect(added.id).toBeDefined();

			// Get list
			const list = await (SELF as any).getEndpointsList();
			expect(list.some((e: any) => e.id === added.id)).toBe(true);

			// Toggle
			const toggleResult = await (SELF as any).toggleEndpoint(added.id, false);
			expect(toggleResult).toEqual({ success: true });

			// Remove
			const removeResult = await (SELF as any).removeEndpoint(added.id);
			expect(removeResult).toEqual({ success: true });
		});

		it('should send test notification via SELF', async () => {
			// Add endpoint
			const endpoint = await (SELF as any).addEndpoint(createTestEndpoint({
				name: 'SELF Notification Test',
				enabled: true
			}));

			const event = createTestSecurityEvent({ id: 'self-test-event' });
			mockFetch(new Response('OK', { status: 200 }));

			const result = await (SELF as any).sendTestNotification(event);
			expect(result.success).toBe(true);
			expect(result.notifiedEndpoints).toBeGreaterThan(0);
		});

		it('should get processed events with limit via SELF', async () => {
			const events = await (SELF as any).getProcessedEvents(50);
			expect(Array.isArray(events)).toBe(true);
		});

		it('should handle null KV entries via SELF', async () => {
			const kvMock = mockKVStorage(
				(key: string) => key === 'event:exists' ? Promise.resolve(JSON.stringify({ id: 'exists' })) : Promise.resolve(null),
				undefined,
				() => Promise.resolve({ keys: [{ name: 'event:exists' }, { name: 'event:null' }] })
			);

			const events = await (SELF as any).getProcessedEvents();
			expect(events).toHaveLength(1);
			expect(events[0].key).toBe('event:exists');

			kvMock.restore();
		});

		it('should handle email endpoints via SELF', async () => {
			const endpoint = await (SELF as any).addEndpoint({
				name: 'Email Test',
				type: 'email',
				email: 'test@example.com',
				enabled: true
			});

			expect(endpoint.type).toBe('email');
			expect(endpoint.email).toBe('test@example.com');

			// Clean up
			await (SELF as any).removeEndpoint(endpoint.id);
		});

		it('should handle multiple endpoint types', async () => {
			const endpoints = [
				{ name: 'Webhook', type: 'webhook', url: 'https://example.com/hook' },
				{ name: 'Slack', type: 'slack', url: 'https://hooks.slack.com/test' },
				{ name: 'Email', type: 'email', email: 'multi@example.com' }
			];

			const added = [];
			for (const ep of endpoints) {
				const result = await (SELF as any).addEndpoint({ ...ep, enabled: true });
				added.push(result);
			}

			const list = await (SELF as any).getEndpointsList();
			expect(list.length).toBeGreaterThanOrEqual(3);

			// Clean up
			for (const ep of added) {
				await (SELF as any).removeEndpoint(ep.id);
			}
		});
	});
});