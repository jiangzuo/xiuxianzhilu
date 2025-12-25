// pages/profile/profile.js
const app = getApp();
// 【引入 Service】
const CultivationService = require('../../services/cultivation.service');
// 语录数据依然保留在 level-data 中，或者未来也可以移入 Service
const { QUOTES_LIBRARY } = require('../../utils/level-data.js'); 

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    
    // 用户核心数据 (直接从 Service 获取并渲染)
    userInfo: {
      levelName: '凡人',
      currentExp: 0,
      expToNext: 50,
      expPercentage: '0%',
    },
    userAttributes: {
      shouYuan: '80.00',
      tiZhi: '50.00',
      xinJing: '50.00',
      zhiHui: '50.00',
      caiFu: '50.00',
    },
    
    dailyQuote: '大道三千，始于足下。',

    // 玩法说明弹窗数据 (预留给后续 A1 需求使用)
    showHelp: false,
    helpImages: [], 
    currentHelpIndex: 0,
  },

  onLoad(options) {
    // 1. 获取系统状态栏高度，用于适配顶部导航
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 2. 字体加载逻辑
    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
  },

  onShow() {
    // 1. 更新 TabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/profile/profile');
    }
    
    // 2. 刷新核心数据 (调用 Service)
    this.refreshData();
    
    // 3. 更新每日语录
    this.updateDailyQuote();
  },

  /**
   * 【核心重构】刷新页面数据
   * 不再直接操作 Storage 或计算公式，全部委托给 Service
   */
  refreshData() {
    // 1. 获取当前境界信息 (如：练气三层, 进度50%)
    const levelInfo = CultivationService.getCurrentLevelInfo();
    
    // 2. 获取五维属性信息 (如：寿元, 体质等)
    const attributes = CultivationService.calculateAttributes();

    this.setData({
      userInfo: levelInfo,
      userAttributes: attributes
    });
  },

  /**
   * 更新每日语录
   * 逻辑：每天只更新一次，存入 Storage
   */
  updateDailyQuote() {
    const today = new Date().toDateString();
    const lastDate = wx.getStorageSync('lastQuoteDate'); // 这里读 Storage 频率极低，暂不放入 Cache
    
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

  // --- 页面跳转逻辑 ---

  navigateToJournal() {
    wx.navigateTo({ url: '/pkg_journal/pages/list/list' })
  },

  navigateToReview() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // --- 玩法说明弹窗逻辑 (预留) ---
  
  onShowHelp() {
    this.setData({ showHelp: true });
  },

  onCloseHelp() {
    this.setData({ showHelp: false });
  }
})