// @ts-check
import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:45_000,
  expect:{timeout:10_000},
  fullyParallel:false,
  forbidOnly:Boolean(process.env.CI),
  retries:0,
  workers:process.env.CI?1:undefined,
  reporter:process.env.CI?[['line'],['html',{open:'never'}]]:'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'node scripts/serve-static.mjs',
    url:'http://127.0.0.1:4173/index.html',
    reuseExistingServer:!process.env.CI,
    timeout:30_000,
  },
});
