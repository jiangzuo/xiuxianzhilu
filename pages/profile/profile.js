// pages/profile/profile.js
const { LEVEL_SYSTEM, QUOTES_LIBRARY } = require('../../utils/level-data.js');
const app = getApp();

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    userInfo: {
      levelName: '凡人',
      currentExp: 0,
      expToNext: 1000,
      expPercentage: 0,
    },
    userAttributes: {
      shouYuan: 80.00,
      tiZhi: 50.00,
      xinJing: 50.00,
      zhiHui: 50.00,
      caiFu: 50.00,
    },
    dailyQuote: '大道三千，始于足下。',
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
    
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/profile/profile');
    }
    this.updateAllUserData();
    this.updateDailyQuote();
  },

  updateAllUserData() {
    const userCultivations = wx.getStorageSync('userCultivations') || { body: [], mind: [], skill: [], wealth: [] };
    
    // 【核心改造】这里的计算逻辑，现在与 practice.js 完全统一
    const totalExpMap = {
      body: this.calculateTotalExp(userCultivations.body),
      mind: this.calculateTotalExp(userCultivations.mind),
      skill: this.calculateTotalExp(userCultivations.skill),
      wealth: this.calculateTotalExp(userCultivations.wealth),
    };

    const totalExp = Object.values(totalExpMap).reduce((sum, current) => sum + current, 0);
    const levelInfo = this.calculateLevelInfo(totalExp);
    const attributes = this.calculateAttributes(totalExpMap);

    this.setData({
      userInfo: levelInfo,
      userAttributes: attributes,
    });
  },

  
  /**
   * 计算单个分类的总经验
   * 修正为累加 totalExpEarned 字段
   */
  calculateTotalExp(cultivationList) {
    if (!cultivationList || cultivationList.length === 0) return 0;
    // 直接读取每个功法已经记录好的“功劳簿”
    return cultivationList.reduce((sum, item) => sum + (item.totalExpEarned || 0), 0);
  },


  calculateLevelInfo(totalExp) {
    let accumulatedExp = 0;
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const currentLevel = LEVEL_SYSTEM[i];
      if (currentLevel.expToNext === Infinity) {
        return {
          // ... 最高等级处理 ...
          expPercentage: '100%' // 【核心改造】
        };
      }
      if (totalExp < accumulatedExp + currentLevel.expToNext) {
        const currentExp = totalExp - accumulatedExp;
        const percentage = (currentExp / currentLevel.expToNext) * 100;
        return {
          levelName: currentLevel.name,
          currentExp: currentExp,
          expToNext: currentLevel.expToNext,
          // 【核心改造】在这里直接拼接上 '%' 单位
          expPercentage: percentage + '%' 
        };
      }
      accumulatedExp += currentLevel.expToNext;
    }
    // ... 保险代码 ...
    return {
      // ...
      expPercentage: '100%' // 【核心改造】
    };
    },
  
  calculateAttributes(totalExpMap) {
    const attributes = {
      shouYuan: 80 + (totalExpMap.body / 1000) + (totalExpMap.mind / 1000),
      tiZhi: 50 + (totalExpMap.body / 500),
      xinJing: 50 + (totalExpMap.mind / 500),
      zhiHui: 50 + (totalExpMap.skill / 500),
      caiFu: 50 + (totalExpMap.wealth / 500),
    };
    for (const key in attributes) {
      attributes[key] = attributes[key].toFixed(2);
    }
    return attributes;
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

  navigateToJournal() {
    wx.navigateTo({ url: '/pkg_journal/pages/list/list' })
  },

  navigateToReview() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },
})