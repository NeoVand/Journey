import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	// Only this checkout's tests: agents' worktrees live under .claude/ with copies of everything.
	testDir: 'src',
	testMatch: '**/*.e2e.{ts,js}'
});
