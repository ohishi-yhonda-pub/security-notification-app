import { beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { setupTestEnvironment, mockFetch } from './test-helpers';

// Global test setup
export function globalTestSetup() {
	beforeAll(() => {
		setupTestEnvironment();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});
}

// Setup for RPC tests
export function rpcTestSetup() {
	globalTestSetup();
	
	beforeEach(() => {
		// Additional setup for RPC tests if needed
	});
}

// Setup for Durable Object tests
export function durableObjectTestSetup() {
	globalTestSetup();
	
	beforeEach(() => {
		// Clear any Durable Object state between tests
	});
}