// pages/practice/practice.js
import Dialog from '@vant/weapp/dialog/dialog';
import Notify from '@vant/weapp/notify/notify';
const { LEVEL_SYSTEM } = require('../../utils/level-data.js');

Page({
  data: {
    activeTab: 'body',
    userCultivations: { body: [], mind: [], skill: [], wealth: [] },
    totalExpMap: { body: 0, mind: 0, skill: 0, wealth: 0 },
    categoryMap: {
      body: '体修', mind: '心修', skill: '技修', wealth: '财修'
    },
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
      // 保留一个默认的通用描述，以防万一
      description: '你的修为有了新的精进，对大道的理解更深了一层。' 
    },
    levelUpAnimation: {},
  },

  onShow() {
    // 【核心新增】
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
  
  calculateTotalExpForCategory(list) {
    if (!list) return 0;
    return list.reduce((sum, item) => sum + (item.exp * (item.count || 0)), 0);
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  onCultivate(event) {
    const { gongfa, category } = event.currentTarget.dataset;

    Dialog.confirm({
      title: '确认修炼',
      message: `是否要完成一次【${gongfa.name}】的修炼？`,
      confirmButtonClass: 'custom-confirm-button',
      cancelButtonClass: 'custom-cancel-button',
    }).then(() => {
      this.setData({ isCultivating: true });
      setTimeout(() => {
        this.setData({ isCultivating: false });
        this.processCultivationResult(gongfa, category);
      }, 2000);
    }).catch(() => {});
  },

  processCultivationResult(gongfa, category) {
    const oldTotalExp = this.calculateTotalExpForAll();
    const cultivations = this.data.userCultivations;
    const gongfaIndex = cultivations[category].findIndex(item => item.id === gongfa.id);
    
    if (gongfaIndex !== -1) {
      cultivations[category][gongfaIndex].count = (cultivations[category][gongfaIndex].count || 0) + 1;
    }
    
    wx.setStorageSync('userCultivations', cultivations);
    const newTotalExp = oldTotalExp + gongfa.exp;

    const oldLevelInfo = this.findLevelInfoByExp(oldTotalExp);
    const newLevelInfo = this.findLevelInfoByExp(newTotalExp);
    
    if (newLevelInfo.level > oldLevelInfo.level) {
      // 检查新境界是否有专属的突破描述
      const breakthroughDesc = newLevelInfo.breakthroughDesc || this.data.levelUpInfo.description;

      this.setData({
        'levelUpInfo.levelName': newLevelInfo.name,
        'levelUpInfo.realm': this.getRealmName(newLevelInfo.name),
        'levelUpInfo.description': breakthroughDesc, // 使用获取到的专属文案
        showLevelUp: true
      });
      
      const animation = wx.createAnimation({ duration: 400, timingFunction: 'ease' });
      wx.nextTick(() => {
        animation.scale(1).opacity(1).step();
        this.setData({ levelUpAnimation: animation.export() });
      });
    } else {
      Notify({
        type: 'success',
        message: `恭喜！获得 ${gongfa.exp} 点修为，对${this.data.categoryMap[category]}有所精进。`
      });
    }
    this.loadUserCultivations();
  },

  findLevelInfoByExp(totalExp) {
    let accumulatedExp = 0;
    // 从 level 0 (凡人) 开始循环
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const currentLevel = LEVEL_SYSTEM[i];
      // Infinity 代表最高级，直接返回
      if (currentLevel.expToNext === Infinity) {
        return currentLevel;
      }
      if (totalExp < accumulatedExp + currentLevel.expToNext) {
        return currentLevel;
      }
      accumulatedExp += currentLevel.expToNext;
    }
    return LEVEL_SYSTEM[LEVEL_SYSTEM.length - 1]; // 正常情况下不会执行到这里
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
    // 优先匹配更长的境界名
    if (levelName.includes('初期') || levelName.includes('中期') || levelName.includes('后期')) {
        return levelName.substring(0, 2); // 取前两个字，如 "筑基", "结丹"
    }
    if (levelName.includes('层')) return '练气';
    return levelName;
  },

  closeLevelUp() {
    // 动画退出
    const animation = wx.createAnimation({ duration: 300, timingFunction: 'ease' });
    animation.scale(0.5).opacity(0).step();
    this.setData({ levelUpAnimation: animation.export() });
    
    setTimeout(() => {
      this.setData({ showLevelUp: false });
      // 刷新 TabBar Badge 以触发'我'的页面 onShow
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