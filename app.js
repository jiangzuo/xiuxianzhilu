// app.js (最终奥义 - Base64 内联大法)
const { fontBase64 } = require('./utils/font-data.js');

App({
  globalData: {
    fontLoaded: false
  },
  
  onLaunch() {
    // 彻底移除所有云开发代码，直接从本地加载字体
    this.loadCustomFont();
  },

  loadCustomFont() {
    const that = this;
    console.log('【app.js】: 开始从 Base64 数据直接加载字体...');
    
    const fontSrc = `data:font/truetype;base64,${fontBase64}`;

    wx.loadFontFace({
      family: 'LishuFont',
      source: `url("${fontSrc}")`,
      global: true,
      success: () => {
        console.log('【app.js】: 字体加载成功！');
        that.globalData.fontLoaded = true;
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
      },
      fail: (err) => {
        console.error('【app.js】: loadFontFace 失败', err);
        if (that.fontReadyCallback) { that.fontReadyCallback(); }
      }
    });
  }
})