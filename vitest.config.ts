import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			reporter: ['text', 'lcov'],
			include: ['nodes/**', 'credentials/**'],
			exclude: ['nodes/**/descriptions/**', '**/*.svg'],
		},
	},
});
