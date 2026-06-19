
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'wechat-miniprogram://app',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'wechat-miniprogram',
      use: { 
        ...devices['Desktop Chrome'],
        // 微信小程序特定配置
        wechat: {
          appid: 'wx73dbbdca94e22521', // 需要替换为实际小程序appid
          projectPath: process.cwd() // 当前项目目录
        }
      },
    },
  ],
});