import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		pool: '@cloudflare/vitest-pool-workers',
		globals: true,
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					// Required to use `SELF.scheduled()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					compatibilityFlags: ["service_binding_extra_handlers"],
				},
			}
		},
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json', 'html'],
			all: true,
			include: ['src/**/*.ts'],
			exclude: [
				'test/**/*.test.ts',
				'test/**/*.spec.ts',
				'worker-configuration.d.ts'
			],
			branches: 100,
			functions: 100,
			lines: 100,
			statements: 100
		}
	}
});