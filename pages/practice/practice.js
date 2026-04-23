// pages/practice/practice.js (最终大头部固定版 - 重构版)
import Dialog from '@vant/weapp/dialog/dialog';
import Notify from '@vant/weapp/notify/notify';
const app = getApp();
// 【引入 Service】
const practiceService = require('../../services/practice.service');
const DailyTaskService = require('../../services/daily-task.service');

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    notifyTop: 0,
    
    // 弹窗相关
    showCustomDialog: false,
    dialogTitle: '',
    dialogMessage: '',
    temppracticeData: null,
    
    // 数据源
    activeTab: 'body',
    userpractices: { body: [], mind: [], skill: [], wealth: [] },
    totalExpMap: { body: 0, mind: 0, skill: 0, wealth: 0 },
    
    // 静态配置
    categoryMap: { body: '体修', mind: '心修', skill: '术修', wealth: '财修' },
    categoryIconMap: { 
      body: 'gongfa-book-icon1.png', 
      mind: 'gongfa-book-icon2.png', 
      skill: 'gongfa-book-icon3.png', 
      wealth: 'gongfa-book-icon4.png' 
    },
    
    // 状态与动画
    isCultivating: false,
    showLevelUp: false,
    levelUpInfo: {
      realm: '',
      levelName: '',
      description: '你的修为有了新的精进，对大道的理解更深了一层。' 
    },
    // 结算弹窗相关数据
     showSettlement: false,
     settlementInfo: {
       exp: 0,
       categoryName: '',
       attrChanges: []
     },

    // 今日宜练相关
    isDailyTask: false,
    targetGongfaId: ''
  },
  

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 优先从 URL 参数获取
    let targetGongfaId = options.gongfaId;
    let targetGongfaName = options.gongfaName;

    // 如果没有 URL 参数，从 globalData 获取（从 chat 页面跳转过来）
    if (!targetGongfaId && app.globalData.dailyTaskTarget) {
      targetGongfaId = app.globalData.dailyTaskTarget.gongfaId;
      targetGongfaName = app.globalData.dailyTaskTarget.gongfaName;
      app.globalData.dailyTaskTarget = null;
    }

    // 如果仍然没有，从缓存读取今日宜练状态
    if (!targetGongfaId) {
      const dailyTaskStatus = DailyTaskService.getDailyTaskStatus();
      if (dailyTaskStatus.exists && !dailyTaskStatus.completed) {
        targetGongfaId = dailyTaskStatus.gongfaId;
        targetGongfaName = dailyTaskStatus.gongfaName;
      }
    }

    if (targetGongfaId) {
      const category = DailyTaskService.getCategoryByGongfaId(targetGongfaId);
      if (category) {
        this.setData({
          activeTab: category,
          isDailyTask: true,
          targetGongfaId: targetGongfaId
        });
      }
    }

    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); } 
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + applyFont : applyFont; }
  },

  onReady() {
    this.calculateHeaderHeight();
  },
  
  calculateHeaderHeight() {
    setTimeout(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select('.custom-nav').boundingClientRect(res => {
        if (res && res.height) {
          this.setData({ notifyTop: res.height });
        }
      }).exec();
    }, 100);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/practice/practice');
    }
    // 刷新页面数据
    this.refreshData();
    // 检查今日宜练状态是否过期
    this.checkDailyTaskStatus();
  },

  /**
   * 检查今日宜练状态
   * 1. 如果已过期（第二天），重置状态
   * 2. 如果已完成，保持显示但不能再次修炼
   */
  checkDailyTaskStatus() {
    const dailyTaskStatus = DailyTaskService.getDailyTaskStatus();
    
    if (!dailyTaskStatus.exists || dailyTaskStatus.completed) {
      // 今日宜练不存在或已完成，重置状态
      this.setData({
        isDailyTask: false,
        targetGongfaId: ''
      });
    } else if (dailyTaskStatus.exists && !dailyTaskStatus.completed) {
      // 今日宜练存在且未完成，检查是否需要更新 targetGongfaId
      if (!this.data.targetGongfaId) {
        const category = DailyTaskService.getCategoryByGongfaId(dailyTaskStatus.gongfaId);
        if (category) {
          this.setData({
            activeTab: category,
            isDailyTask: true,
            targetGongfaId: dailyTaskStatus.gongfaId
          });
        }
      }
    }
  },

  /**
   * 【核心重构】刷新页面数据
   * 从 Service 获取最新的功法列表和经验统计
   */
  refreshData() {
    // 1. 获取列表数据
    const practices = practiceService.getpracticeData();
    
    // 2. 获取各类总经验 (简单计算或让Service提供)
    const totalExpMap = {
      body: practiceService.calculateCategoryExp(practices.body),
      mind: practiceService.calculateCategoryExp(practices.mind),
      skill: practiceService.calculateCategoryExp(practices.skill),
      wealth: practiceService.calculateCategoryExp(practices.wealth),
    };

    this.setData({ 
      userpractices: practices,
      totalExpMap: totalExpMap
    });
  },

  // --- 交互逻辑 ---

  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  onCultivate(event) {
    const { gongfa, category } = event.currentTarget.dataset;
    this.setData({
      showCustomDialog: true,
      dialogTitle: '确认修炼',
      dialogMessage: `是否要完成一次【${gongfa.name}】的修炼？`,
      temppracticeData: { gongfa, category } 
    });
  },

  onDialogConfirm() {
    const { gongfa, category } = this.data.temppracticeData;
    this.setData({ isCultivating: true });
    
    // 模拟修炼过程
    setTimeout(() => {
      this.setData({ isCultivating: false });
      this.processpracticeResult(gongfa, category);
    }, 1500);
  },

  /**
   * 处理修炼结果
   * 调用 Service 执行业务逻辑，页面只负责展示结果
   */
  processpracticeResult(gongfa, category) {
    const isDailyTask = this.data.isDailyTask && this.data.targetGongfaId === gongfa.id;
    const baseExp = gongfa.exp || 10;
    const finalExp = isDailyTask ? baseExp * 2 : baseExp;

    let result = practiceService.doPractice(gongfa.id, category, finalExp);

    if (result.success) {
      if (isDailyTask) {
        DailyTaskService.triggerPracticeReaction(
          gongfa.id,
          gongfa.name,
          finalExp,
          category
        );

        this.setData({
          isDailyTask: false,
          targetGongfaId: ''
        });
      }

      this.refreshData();

      if (result.isLevelUp) {
        this.setData({
          showLevelUp: true,
          levelUpInfo: {
            ...result.newLevel,
            levelName: result.newLevel.name,
            description: result.newLevel.breakthroughDesc || '你的修为有了新的精进，对大道的理解更深了一层。'
          }
        });
      } else if (result.settlement) {
        this.setData({
          showSettlement: true,
          settlementInfo: result.settlement
        });
      }
    }
  },

  closeSettlement() {
    this.setData({ showSettlement: false });
  },

  closeLevelUp() {
    this.setData({ showLevelUp: false });
  },

  navigateToSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  }
})