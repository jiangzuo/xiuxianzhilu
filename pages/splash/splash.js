// pages/splash/splash.js
const app = getApp();

Page({
  data: {
    pageClass: '',
  },

  onLoad(options) {
    // 为启动页自己应用字体
    // 【修复】改用 app.onFontReady，避免单回调变量被覆盖/字符串拼接
    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    app.onFontReady(applyFont);
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
      // 如果字体尚未就绪，显示加载提示，并"预定"一个跳转任务
      console.log('【splash.js】: 字体未加载，显示loading并等待回调');
      wx.showLoading({
        title: '正在进入...',
        mask: true // 防止用户在等待时重复点击
      });

      // 【修复】用 onFontReady 注册跳转任务，与 onLoad 中注册的 applyFont 共存
      // 字体加载完成后会按注册顺序依次触发：先 applyFont（让 splash 短暂显示带字体的样子），再跳转
      app.onFontReady(() => {
        console.log('【splash.js】: 收到字体就绪信号，执行跳转');
        wx.hideLoading(); // 隐藏加载提示
        this.redirectToMainPage();
      });
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