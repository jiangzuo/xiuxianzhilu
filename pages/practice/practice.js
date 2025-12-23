// pages/practice/practice.js (最终大头部固定版)
import Dialog from '@vant/weapp/dialog/dialog';
import Notify from '@vant/weapp/notify/notify';
const { LEVEL_SYSTEM } = require('../../utils/level-data.js');
const app = getApp();

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    notifyTop: 0,
    showCustomDialog: false,
    dialogTitle: '',
    dialogMessage: '',
    tempCultivationData: null,
    activeTab: 'body',
    userCultivations: { body: [], mind: [], skill: [], wealth: [] },
    totalExpMap: { body: 0, mind: 0, skill: 0, wealth: 0 },
    categoryMap: { body: '体修', mind: '心修', skill: '技修', wealth: '财修' },
    categoryIconMap: { 
      body: 'gongfa-book-icon1.png', 
      mind: 'gongfa-book-icon2.png', 
      skill: 'gongfa-book-icon3.png', 
      wealth: 'gongfa-book-icon4.png' 
    },
    isCultivating: false,
    showLevelUp: false,
    levelUpInfo: {
      realm: '',
      levelName: '',
      description: '你的修为有了新的精进，对大道的理解更深了一层。' 
    },
    levelUpAnimation: {},
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    // 【修改】只设置 statusBarHeight
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
  },
  onReady() {
    // 【新增】在页面渲染完成后，计算头部高度
    this.calculateHeaderHeight();
  },
  
  // 【新增】计算并设置 Notify 的 top 值
  calculateHeaderHeight() {
    setTimeout(() => {
      const query = wx.createSelectorQuery().in(this);
      // 只测量真正固定的 .custom-nav 的高度
      query.select('.custom-nav').boundingClientRect(res => {
        if (res && res.height) {
          this.setData({
            notifyTop: res.height
          });
        }
      }).exec();
    }, 100);
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/practice/practice');
    }
    this.loadUserCultivations();
  },

  loadUserCultivations() {
    const cultivations = wx.getStorageSync('userCultivations') || { body: [], mind: [], skill: [], wealth: [] };
    this.setData({ userCultivations: cultivations });
    this.calculateAllTotalExp();
  },

  calculateAllTotalExp() {
    const cultivations = this.data.userCultivations;
    const totalExpMap = {
      body: this.calculateTotalExpForCategory(cultivations.body),
      mind: this.calculateTotalExpForCategory(cultivations.mind),
      skill: this.calculateTotalExpForCategory(cultivations.skill),
      wealth: this.calculateTotalExpForCategory(cultivations.wealth),
    };
    this.setData({ totalExpMap });
  },
  
  /**
   * 计算单个分类的累计修为
   * 修正为累加 totalExpEarned 字段
   */
  calculateTotalExpForCategory(list) {
    if (!list) return 0;
    // 直接读取每个功法已经记录好的“功劳簿”，而不再进行实时计算
    return list.reduce((sum, item) => sum + (item.totalExpEarned || 0), 0);
  },

  /**
   * 处理一次修炼的结果
   * 修正为累加 totalExpEarned 字段
   */
  processCultivationResult(gongfa, category) {
    const oldTotalExp = this.calculateTotalExpForAll();
    
    const cultivations = this.data.userCultivations;
    const gongfaIndex = cultivations[category].findIndex(item => item.id === gongfa.id);
    
    if (gongfaIndex !== -1) {
      // 1. 增加修炼次数
      cultivations[category][gongfaIndex].count = (cultivations[category][gongfaIndex].count || 0) + 1;
      
      // 2. 累加“已获得的总经验”，这个值将不再受功法本身 exp 变化的影响
      let currentTotalExp = cultivations[category][gongfaIndex].totalExpEarned || 0;
      cultivations[category][gongfaIndex].totalExpEarned = currentTotalExp + gongfa.exp;
    }
    
    wx.setStorageSync('userCultivations', cultivations);
    
    // --- 升级判断逻辑保持不变 ---
    const newTotalExp = oldTotalExp + gongfa.exp;
    const oldLevelInfo = this.findLevelInfoByExp(oldTotalExp);
    const newLevelInfo = this.findLevelInfoByExp(newTotalExp);
    
    if (newLevelInfo.level > oldLevelInfo.level) {
      const breakthroughDesc = newLevelInfo.breakthroughDesc || this.data.levelUpInfo.description;
      this.setData({
        'levelUpInfo.levelName': newLevelInfo.name,
        'levelUpInfo.description': breakthroughDesc,
        showLevelUp: true
      });
      
      const animation = wx.createAnimation({ duration: 400, timingFunction: 'ease' });
      wx.nextTick(() => {
        animation.scale(1).opacity(1).step();
        this.setData({ levelUpAnimation: animation.export() });
      });
    }  else {
      Notify({
        type: 'success',
        message: `恭喜！获得 ${gongfa.exp} 点修为，对${this.data.categoryMap[category]}有所精进。`,
        // 关键：指定在哪个 van-notify 组件上显示
        selector: '#van-notify',
        // 关键：指定组件所在的上下文，即当前页面
        context: this,
        top: this.data.notifyTop
      });
    }
    this.loadUserCultivations();
  },

  // -------------------------------------------------------------------
  // --- 【核心改造】到这里结束 ---
  // -------------------------------------------------------------------
  
  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  onCultivate(event) {
    const { gongfa, category } = event.currentTarget.dataset;
    this.setData({
      showCustomDialog: true,
      dialogTitle: '确认修炼',
      dialogMessage: `是否要完成一次【${gongfa.name}】的修炼？`,
      tempCultivationData: { gongfa, category } 
    });
  },

  onDialogConfirm() {
    const { gongfa, category } = this.data.tempCultivationData;
    this.setData({ isCultivating: true });
    setTimeout(() => {
      this.setData({ isCultivating: false });
      this.processCultivationResult(gongfa, category);
    }, 2000);
  },

  findLevelInfoByExp(totalExp) {
    let accumulatedExp = 0;
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const currentLevel = LEVEL_SYSTEM[i];
      if (currentLevel.expToNext === Infinity) {
        return currentLevel;
      }
      if (totalExp < accumulatedExp + currentLevel.expToNext) {
        return currentLevel;
      }
      accumulatedExp += currentLevel.expToNext;
    }
    return LEVEL_SYSTEM[LEVEL_SYSTEM.length - 1];
  },
  
  calculateTotalExpForAll() {
    const cultivations = wx.getStorageSync('userCultivations') || { body: [], mind: [], skill: [], wealth: [] };
    const bodyExp = this.calculateTotalExpForCategory(cultivations.body);
    const mindExp = this.calculateTotalExpForCategory(cultivations.mind);
    const skillExp = this.calculateTotalExpForCategory(cultivations.skill);
    const wealthExp = this.calculateTotalExpForCategory(cultivations.wealth);
    return bodyExp + mindExp + skillExp + wealthExp;
  },

  getRealmName(levelName) {
    if (levelName.includes('初期') || levelName.includes('中期') || levelName.includes('后期')) {
        return levelName.substring(0, 2);
    }
    if (levelName.includes('层')) return '练气';
    return levelName;
  },

  closeLevelUp() {
    const animation = wx.createAnimation({ duration: 300, timingFunction: 'ease' });
    animation.scale(0.5).opacity(0).step();
    this.setData({ levelUpAnimation: animation.export() });
    
    setTimeout(() => {
      this.setData({ showLevelUp: false });
      wx.setTabBarBadge({ index: 1, text: ' ' }); 
      setTimeout(() => { wx.removeTabBarBadge({ index: 1 }); }, 500);
    }, 300);
  },

  navigateToSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },

  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
})