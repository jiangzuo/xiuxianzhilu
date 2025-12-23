// pages/splash/splash.js
const app = getApp();

Page({
  data: {
    pageClass: '',
  },

  onLoad(options) {
    // 为启动页自己应用字体
    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
  },

  /**
   * 【核心改造】点击按钮时的智能跳转逻辑
   */
  onEnterButtonClick() {
    // 检查全局字体是否已经加载完成
    if (app.globalData.fontLoaded) {
      // 如果字体已就绪，直接跳转
      console.log('【splash.js】: 字体已加载，直接跳转');
      this.redirectToMainPage();
    } 
    else {
      // 如果字体尚未就绪，显示加载提示，并“预定”一个跳转任务
      console.log('【splash.js】: 字体未加载，显示loading并等待回调');
      wx.showLoading({
        title: '正在进入...',
        mask: true // 防止用户在等待时重复点击
      });
      
      // 将真正的跳转任务，注册为 app 的回调函数
      // app.js 加载成功或失败后，都会来调用它
      app.fontReadyCallback = () => {
        console.log('【splash.js】: 收到字体就绪信号，执行跳转');
        wx.hideLoading(); // 隐藏加载提示
        this.redirectToMainPage();
      };
    }
  },

  /**
   * 真正的跳转函数
   */
  redirectToMainPage() {
    // 标记为已启动过
    wx.setStorageSync('hasLaunched', true);
    // 跳转到 tabBar 页面
    wx.switchTab({
      url: '/pages/profile/profile'
    });
  },
})