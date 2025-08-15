import { vi } from 'vitest';
import { env } from 'cloudflare:test';

// Type assertion for env with required properties
export const testEnv = env as typeof env & {
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_ZONE_ID: string;
	NOTIFICATION_MANAGER: DurableObjectNamespace;
	PROCESSED_EVENTS: KVNamespace;
};

// Mock global fetch with default success response
export function mockFetch(response?: any) {
	const defaultResponse = new Response(JSON.stringify({ result: [] }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
	
	global.fetch = vi.fn(() => Promise.resolve(response || defaultResponse)) as any;
	return global.fetch;
}

// Create a test endpoint
export function createTestEndpoint(overrides: Partial<any> = {}) {
	return {
		id: crypto.randomUUID(),
		name: 'Test Endpoint',
		type: 'webhook' as const,
		url: 'https://example.com/test',
		enabled: true,
		createdAt: new Date().toISOString(),
		...overrides
	};
}

// Create a test security event
export function createTestSecurityEvent(overrides: Partial<any> = {}) {
	return {
		id: 'test-ray-id',
		timestamp: new Date().toISOString(),
		action: 'block',
		clientIP: '1.2.3.4',
		country: 'US',
		method: 'GET',
		host: 'example.com',
		uri: '/test',
		userAgent: 'Test User Agent',
		ruleId: 'rule-123',
		ruleName: 'Test Rule',
		...overrides
	};
}

// Mock KV storage methods
export function mockKVStorage(get?: any, put?: any, list?: any) {
	const originalGet = testEnv.PROCESSED_EVENTS.get;
	const originalPut = testEnv.PROCESSED_EVENTS.put;
	const originalList = testEnv.PROCESSED_EVENTS.list;
	
	if (get !== undefined) {
		testEnv.PROCESSED_EVENTS.get = vi.fn().mockImplementation(get);
	}
	if (put !== undefined) {
		testEnv.PROCESSED_EVENTS.put = vi.fn().mockImplementation(put);
	}
	if (list !== undefined) {
		testEnv.PROCESSED_EVENTS.list = vi.fn().mockImplementation(list);
	}
	
	return {
		restore: () => {
			testEnv.PROCESSED_EVENTS.get = originalGet;
			testEnv.PROCESSED_EVENTS.put = originalPut;
			testEnv.PROCESSED_EVENTS.list = originalList;
		}
	};
}

// Mock Durable Object stub methods
export function mockDurableObjectStub() {
	return {
		checkAndNotifySecurityEvents: vi.fn().mockResolvedValue(undefined),
		getEndpoints: vi.fn().mockResolvedValue([]),
		addEndpoint: vi.fn().mockResolvedValue(undefined),
		removeEndpoint: vi.fn().mockResolvedValue(undefined),
		toggleEndpoint: vi.fn().mockResolvedValue(undefined),
		sendNotifications: vi.fn().mockResolvedValue(undefined)
	};
}

// Setup test environment
export function setupTestEnvironment() {
	testEnv.CLOUDFLARE_API_TOKEN = 'test-token';
	testEnv.CLOUDFLARE_ZONE_ID = 'test-zone-id';
	mockFetch();
}