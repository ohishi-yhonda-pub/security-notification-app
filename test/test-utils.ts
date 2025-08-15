import { env, createExecutionContext } from 'cloudflare:test';
import SecurityNotificationWorker from '../src/index';

// Create a test worker instance that properly handles the default export
export function createTestWorker(testEnv: any) {
	// Create a wrapper that implements the ExportedHandler interface
	const worker = {
		async fetch(request: Request, env: any, ctx: any): Promise<Response> {
			const instance = new SecurityNotificationWorker(ctx, env);
			return instance.fetch(request);
		},
		async scheduled(controller: any, env: any, ctx: any): Promise<void> {
			const instance = new SecurityNotificationWorker(ctx, env);
			return instance.scheduled(controller);
		}
	};
	
	return worker;
}

// Helper to create RPC-style worker instance for testing
export function createRPCWorker(testEnv: any) {
	const ctx = createExecutionContext();
	// Mock the WorkerEntrypoint behavior for tests
	const worker = {
		ctx,
		env: testEnv,
		
		// Directly expose the methods we want to test
		async checkSecurityEvents() {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			await notificationManager.checkAndNotifySecurityEvents();
			return { success: true, message: 'Security events checked via RPC' };
		},

		async getEndpointsList() {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			return await notificationManager.getEndpoints();
		},

		async addEndpoint(endpoint: any) {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			const newEndpoint = {
				...endpoint,
				id: crypto.randomUUID(),
				createdAt: new Date().toISOString()
			};
			await notificationManager.addEndpoint(newEndpoint);
			return newEndpoint;
		},

		async removeEndpoint(id: string) {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			await notificationManager.removeEndpoint(id);
			return { success: true };
		},

		async toggleEndpoint(id: string, enabled: boolean) {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			await notificationManager.toggleEndpoint(id, enabled);
			return { success: true };
		},

		async sendTestNotification(event: any) {
			const notificationManager = testEnv.NOTIFICATION_MANAGER.get(
				testEnv.NOTIFICATION_MANAGER.idFromName("global")
			);
			await notificationManager.sendNotifications(event);
			const endpoints = await notificationManager.getEndpoints();
			const activeEndpoints = endpoints.filter((ep: any) => ep.enabled);
			return { success: true, notifiedEndpoints: activeEndpoints.length };
		},

		async getProcessedEvents(limit: number = 100) {
			const list = await testEnv.PROCESSED_EVENTS.list({ limit });
			const events = await Promise.all(
				list.keys.map(async (key: any) => {
					try {
						const eventData = await testEnv.PROCESSED_EVENTS.get(key.name);
						return eventData ? { key: key.name, event: JSON.parse(eventData) } : null;
					} catch (e) {
						// Handle JSON parse errors
						throw e;
					}
				})
			);
			return events.filter((e: any) => e !== null);
		},

		async fetch(request: Request) {
			const instance = new SecurityNotificationWorker(ctx, testEnv);
			return instance.fetch(request);
		},

		async scheduled(controller: any) {
			const instance = new SecurityNotificationWorker(ctx, testEnv);
			return instance.scheduled(controller);
		}
	};
	
	return worker;
}