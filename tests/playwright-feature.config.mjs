// @ts-check
import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export default defineConfig({
  testDir:'.',
  testMatch:'browser-feature.spec.mjs',
  timeout:80000,
  expect:{timeout:10000},
  fullyParallel:false,
  forbidOnly:Boolean(process.env.CI),
  retries:0,
  workers:1,
  reporter:'line',
  use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'node scripts/serve-feature-preview.mjs',cwd:projectRoot,
    url:'http://127.0.0.1:4174/index.html',reuseExistingServer:!process.env.CI,timeout:30000}
});
