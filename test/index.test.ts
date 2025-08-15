import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import worker from '../src/index';

// Type assertion for env with required properties
const testEnv = env as typeof env & {
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_ZONE_ID: string;
};

// Mock global fetch
global.fetch = vi.fn(() =>
	Promise.resolve(
		new Response(JSON.stringify({ result: [] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	)
) as any;

// Suppress console errors during tests
const originalError = console.error;
console.error = (...args: any[]) => {
	const errorString = args.join(' ');
	if (errorString.includes('Error checking security events')) {
		return;
	}
	originalError.apply(console, args);
};

describe('Security Notification App', () => {
	beforeAll(() => {
		// Set up test environment variables
		testEnv.CLOUDFLARE_API_TOKEN = 'test-token';
		testEnv.CLOUDFLARE_ZONE_ID = 'test-zone-id';
	});

	describe('API Endpoints', () => {
		it('should return 200 on root path', async () => {
			const request = new Request('http://localhost/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe('Security Notification API');
		});

		it('should get empty endpoints initially', async () => {
			const request = new Request('http://localhost/api/endpoints');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const data = await response.json() as { endpoints: any[] };
			expect(data).toHaveProperty('endpoints');
			expect(Array.isArray(data.endpoints)).toBe(true);
		});

		it('should add a new endpoint', async () => {
			const endpoint = {
				name: 'Test Slack',
				type: 'slack',
				url: 'https://hooks.slack.com/test',
				enabled: true
			};

			const request = new Request('http://localhost/api/endpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(endpoint)
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const data = await response.json() as { success: boolean; endpoint: any };
			expect(data.success).toBe(true);
			expect(data.endpoint).toMatchObject(endpoint);
			expect(data.endpoint.id).toBeDefined();
			expect(data.endpoint.createdAt).toBeDefined();
		});

		it('should toggle endpoint status', async () => {
			// First add an endpoint
			const endpoint = {
				name: 'Test Webhook',
				type: 'webhook',
				url: 'https://example.com/webhook',
				enabled: true
			};

			const addRequest = new Request('http://localhost/api/endpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(endpoint)
			});
			const ctx1 = createExecutionContext();
			const addResponse = await worker.fetch(addRequest, testEnv, ctx1);
			await waitOnExecutionContext(ctx1);

			const { endpoint: addedEndpoint } = await addResponse.json() as { endpoint: any };

			// Toggle it off
			const toggleRequest = new Request(`http://localhost/api/endpoints/${addedEndpoint.id}/toggle`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false })
			});
			const ctx2 = createExecutionContext();
			const toggleResponse = await worker.fetch(toggleRequest, testEnv, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(toggleResponse.status).toBe(200);
			const toggleData = await toggleResponse.json() as { success: boolean };
			expect(toggleData.success).toBe(true);
		});

		it('should delete an endpoint', async () => {
			// First add an endpoint
			const endpoint = {
				name: 'Test Delete',
				type: 'webhook',
				url: 'https://example.com/delete',
				enabled: true
			};

			const addRequest = new Request('http://localhost/api/endpoints', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(endpoint)
			});
			const ctx1 = createExecutionContext();
			const addResponse = await worker.fetch(addRequest, testEnv, ctx1);
			await waitOnExecutionContext(ctx1);

			const { endpoint: addedEndpoint } = await addResponse.json() as { endpoint: any };

			// Delete it
			const deleteRequest = new Request(`http://localhost/api/endpoints/${addedEndpoint.id}`, {
				method: 'DELETE'
			});
			const ctx2 = createExecutionContext();
			const deleteResponse = await worker.fetch(deleteRequest, testEnv, ctx2);
			await waitOnExecutionContext(ctx2);

			expect(deleteResponse.status).toBe(200);
			const deleteData = await deleteResponse.json() as { success: boolean };
			expect(deleteData.success).toBe(true);
		});

		it('should manually trigger security check', async () => {
			const request = new Request('http://localhost/api/check-events', {
				method: 'POST'
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const data = await response.json() as { success: boolean; message: string };
			expect(data.success).toBe(true);
			expect(data.message).toBe('Security events checked');
		});
	});

	describe('Scheduled handler', () => {
		it('should execute scheduled event', async () => {
			const controller = {
				scheduledTime: Date.now(),
				cron: '*/5 * * * *',
				noRetry: () => {}
			};
			
			const ctx = createExecutionContext();
			await worker.scheduled(controller, testEnv, ctx);
			await waitOnExecutionContext(ctx);
			
			// Should complete without errors
			expect(true).toBe(true);
		});
	});
});