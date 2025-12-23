// pages/journal/list/list.js
const { MOOD_MAP } = require('../mood-data.js');
const app = getApp();

Page({
  data: {
    pageClass: '',
    // 【核心新增】
    statusBarHeight: 0, 

    journals: [],
    moodMap: MOOD_MAP,
  },
  
  onLoad(options) {
    // 【核心新增】获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    
    const applyFont = () => {
      this.setData({ pageClass: 'font-lishu' });
    };
    if (app.globalData.fontLoaded) {
      applyFont();
    } else {
      app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont;
    }
  },

  onShow() {
    this.loadJournals();
  },
  
  // 【核心新增】返回上一页的方法
  navigateBack() {
    wx.navigateBack();
  },

  loadJournals() {
    const journals = wx.getStorageSync('userJournals') || [];
    const processedJournals = journals.map(item => ({
      ...item,
      displayTime: this.formatTime(item.timestamp)
    }));
    processedJournals.sort((a, b) => b.timestamp - a.timestamp);
    this.setData({ journals: processedJournals });
  },

  navigateToEdit() {
    wx.navigateTo({ url: '/pkg_journal/pages/edit/edit' })
  },

  onJournalTap(event) {
    wx.showToast({ title: '暂不支持查看详情', icon: 'none' });
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}年${month}月${day}日 ${hours}:${minutes}`;
  },
})