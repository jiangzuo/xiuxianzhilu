// pages/profile/profile.js
const app = getApp();
const CultivationService = require('../../services/cultivation.service');
const { QUOTES_LIBRARY } = require('../../utils/level-data.js');

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    
    // 核心数据
    userInfo: {},
    userAttributes: {},
    dailyQuote: '',

    // --- 玩法说明数据 ---
    showHelp: false,
    currentHelpIndex: 0, // 当前轮播页码
    helpImages: [
      '/images/guide-1.png', 
      '/images/guide-2.png', 
      '/images/guide-3.png'
    ],
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/profile/profile');
    }
    this.refreshData();
    this.updateDailyQuote();
  },

  refreshData() {
    const levelInfo = CultivationService.getCurrentLevelInfo();
    const attributes = CultivationService.calculateAttributes();
    this.setData({ userInfo: levelInfo, userAttributes: attributes });
  },

  updateDailyQuote() {
    const today = new Date().toDateString();
    const lastDate = wx.getStorageSync('lastQuoteDate');
    
    if (today !== lastDate) {
      const randomIndex = Math.floor(Math.random() * QUOTES_LIBRARY.length);
      const newQuote = QUOTES_LIBRARY[randomIndex];
      this.setData({ dailyQuote: newQuote });
      wx.setStorageSync('dailyQuote', newQuote);
      wx.setStorageSync('lastQuoteDate', today);
    } else {
      const cachedQuote = wx.getStorageSync('dailyQuote') || QUOTES_LIBRARY[0];
      this.setData({ dailyQuote: cachedQuote });
    }
  },

  // --- 玩法说明交互逻辑 ---

  // 打开弹窗
  onShowHelp() {
    this.setData({ 
      showHelp: true,
      currentHelpIndex: 0 // 每次打开重置到第一张
    });
  },

  // 关闭弹窗
  onCloseHelp() {
    this.setData({ showHelp: false });
  },

  // 监听轮播滑动
  onHelpSwiperChange(e) {
    this.setData({ currentHelpIndex: e.detail.current });
  },

  // 点击上一张
  onHelpPrev() {
    let current = this.data.currentHelpIndex;
    if (current > 0) {
      this.setData({ currentHelpIndex: current - 1 });
    }
  },

  // 点击下一张
  onHelpNext() {
    let current = this.data.currentHelpIndex;
    if (current < this.data.helpImages.length - 1) {
      this.setData({ currentHelpIndex: current + 1 });
    }
  },

  navigateToJournal() {
    wx.navigateTo({ url: '/pkg_journal/pages/list/list' })
  },

  navigateToReview() {
    wx.showToast({ title: '功能开发中~', icon: 'none' });
  },
})