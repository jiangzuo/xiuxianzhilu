// app.js (最终完整版)
const { fontBase64 } = require('./utils/font-data.js');
const CacheManager = require('./utils/cache-manager'); // 【新增】引入缓存管理器

App({
  globalData: {
    fontLoaded: false
  },
  
  onLaunch() {
    // 1. 【核心新增】初始化内存缓存
    // 必须在 App 启动最开始调用，确保后续页面能直接从内存读取数据
    CacheManager.init();

    // 2. 加载自定义字体
    this.loadCustomFont();
  },

  loadCustomFont() {
    const that = this;
    console.log('【app.js】: 开始从 Base64 数据直接加载字体...');
    
    // 简单容错：如果字体文件还没生成，避免报错卡死
    if (!fontBase64) {
        console.warn('【app.js】: fontBase64 为空，请检查 utils/font-data.js');
        that.globalData.fontLoaded = true; // 标记为已完成，避免 Splash 页无限等待
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
        return;
    }

    const fontSrc = `data:font/truetype;base64,${fontBase64}`;

    wx.loadFontFace({
      family: 'LishuFont',
      source: `url("${fontSrc}")`,
      global: true,
      success: () => {
        console.log('【app.js】: 字体加载成功！');
        that.globalData.fontLoaded = true;
        // 通知正在等待字体的页面 (如 Splash)
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
      },
      fail: (err) => {
        console.error('【app.js】: loadFontFace 失败', err);
        // 即使失败也要执行回调，防止页面卡在 Loading 状态
        that.globalData.fontLoaded = true; 
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
      }
    });
  }
})