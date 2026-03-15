const { test, expect } = require('@playwright/test');

test.describe('小程序基本功能测试', () => {
  test('启动小程序并检查初始页面', async ({ page }) => {
    // 导航到小程序
    await page.goto('wechat-miniprogram://app');
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
    
    // 检查是否显示启动页面
    await expect(page).toHaveSelector('.splash-container');
  });

  test('测试底部导航栏', async ({ page }) => {
    await page.goto('wechat-miniprogram://app');
    
    // 等待启动页面加载完成
    await page.waitForLoadState('networkidle');
    
    // 点击练习页面
    await page.click('text=练习');
    await expect(page).toHaveSelector('.practice-container');
    
    // 点击聊天页面
    await page.click('text=聊天');
    await expect(page).toHaveSelector('.chat-container');
    
    // 点击个人页面
    await page.click('text=我的');
    await expect(page).toHaveSelector('.profile-container');
  });

  test('测试AI服务配置', async ({ page }) => {
    await page.goto('wechat-miniprogram://app');
    
    // 进入设置页面
    await page.click('text=设置');
    await expect(page).toHaveSelector('.settings-container');
    
    // 检查AI服务配置选项
    await expect(page).toHaveSelector('text=AI服务配置');
  });

  test('测试字体加载', async ({ page }) => {
    await page.goto('wechat-miniprogram://app');
    
    // 等待字体加载完成
    await page.waitForFunction(() => {
      return getApp().globalData.fontLoaded === true;
    });
    
    // 验证字体加载状态
    const fontLoaded = await page.evaluate(() => {
      return getApp().globalData.fontLoaded;
    });
    
    expect(fontLoaded).toBe(true);
  });
});