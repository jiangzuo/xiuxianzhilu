// app.js (最终完整版)
const CacheManager = require('./utils/cache-manager');
const MemoryService = require('./services/memory.service');
const AIService = require('./services/ai.service');

App({
  globalData: {
    fontLoaded: false
  },
  
  onLaunch() {
    // 1. 【核心新增】初始化内存缓存
    // 必须在 App 启动最开始调用，确保后续页面能直接从内存读取数据
    CacheManager.init();

    // 2. 记录登录时间
    this.recordLoginDate();

    // 3. 加载自定义字体
    this.loadCustomFont();
  },

  recordLoginDate() {
    const today = new Date().toDateString();
    const lastLoginDate = wx.getStorageSync('lastLoginDate');
    if (lastLoginDate !== today) {
      wx.setStorageSync('lastLoginDate', today);
    }
  },
  

  loadCustomFont() {
    const that = this;
    console.log('【app.js】: 开始从 Base64 数据直接加载字体...');
    
    require.async('pkg_assets/font-data.js')
      .then(module => {
        const fontBase64 = module.fontBase64;

        // 容错：如果 font-data.js 文件为空，或者内容格式不对，这里会出错
        if (!fontBase64 || typeof fontBase64 !== 'string') {
            console.error('【app.js】: fontBase64 数据异常，请检查 pkg_assets/font-data.js 文件内容。');
            that.globalData.fontLoaded = true; // 标记为已完成，防止 Splash 页卡住
            if (that.fontReadyCallback) { that.fontReadyCallback(); }
            return;
        }

        const fontSrc = `data:font/truetype;base64,${fontBase64}`;

        wx.loadFontFace({
          family: 'LishuFont',
          source: `url("${fontSrc}")`,
          global: true,
          success: () => {
            console.log('【app.js】: 字体分包加载成功！');
            that.globalData.fontLoaded = true;
            if (that.fontReadyCallback) { that.fontReadyCallback(); }
          },
          fail: (err) => {
            console.error('【app.js】: loadFontFace 失败', err);
            that.globalData.fontLoaded = true; 
            if (that.fontReadyCallback) { that.fontReadyCallback(); }
          }
        });
      })
      .catch(err => {
        console.error('【app.js】: 异步加载字体分包失败', err);
        that.globalData.fontLoaded = true; // 标记为已完成，防止 Splash 页卡住
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
      });
  }
})