// pages/profile/profile.js
const { LEVEL_SYSTEM, QUOTES_LIBRARY } = require('../../utils/level-data.js');

Page({
  data: {
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
  },

  onShow() {
    // 【核心】调用自定义 TabBar 的更新方法
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/profile/profile');
    }
    // 【核心】调用数据更新的主函数
    this.updateAllUserData();
    this.updateDailyQuote();
  },

  // 【核心】确保这个函数及其所有辅助函数都存在且正确
  updateAllUserData() {
    const userCultivations = wx.getStorageSync('userCultivations') || { body: [], mind: [], skill: [], wealth: [] };
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

  calculateTotalExp(cultivationList) {
    if (!cultivationList || cultivationList.length === 0) return 0;
    return cultivationList.reduce((sum, item) => sum + (item.exp * (item.count || 0)), 0);
  },

  calculateLevelInfo(totalExp) {
    let accumulatedExp = 0;
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const currentLevel = LEVEL_SYSTEM[i];
      if (currentLevel.expToNext === Infinity) return currentLevel;
      if (totalExp < accumulatedExp + currentLevel.expToNext) {
        const currentExp = totalExp - accumulatedExp;
        return {
          levelName: currentLevel.name,
          currentExp: currentExp,
          expToNext: currentLevel.expToNext,
          expPercentage: (currentExp / currentLevel.expToNext) * 100,
        };
      }
      accumulatedExp += currentLevel.expToNext;
    }
    const highestLevel = LEVEL_SYSTEM[LEVEL_SYSTEM.length - 1];
    return {
      levelName: highestLevel.name,
      currentExp: "∞",
      expToNext: "∞",
      expPercentage: 100,
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
    wx.navigateTo({ url: '/pages/journal/list/list' });
  },

  navigateToReview() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },
})