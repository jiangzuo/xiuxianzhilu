// pages/splash/splash.js
Page({
  onLoad(options) {
    // 页面加载时可以预加载一些数据
  },

  // 【核心修改】按钮的点击事件处理函数
  onEnterButtonClick() {
    // 标记为已启动过，这样下次就不会再显示新手引导（如果未来有的话）
    wx.setStorageSync('hasLaunched', true);

    // 点击后立即跳转
    this.redirectToMainPage();
  },

  redirectToMainPage() {
    wx.switchTab({
      url: '/pages/profile/profile'
    });
  },
})