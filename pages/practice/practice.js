// pages/practice/practice.js (最终大头部固定版 - 重构版)
import Dialog from '@vant/weapp/dialog/dialog';
import Notify from '@vant/weapp/notify/notify';
const app = getApp();
// 【引入 Service】
const CultivationService = require('../../services/cultivation.service');

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    notifyTop: 0,
    
    // 弹窗相关
    showCustomDialog: false,
    dialogTitle: '',
    dialogMessage: '',
    tempCultivationData: null,
    
    // 数据源
    activeTab: 'body',
    userCultivations: { body: [], mind: [], skill: [], wealth: [] },
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
    levelUpAnimation: {},
     // 【新增】结算弹窗相关数据
     showSettlement: false, // 控制弹窗显示
     settlementInfo: {      // 弹窗显示的内容
       exp: 0,
       categoryName: '',
       attrChanges: []      // 属性变化列表 [{label: '寿元', val: 0.005}, ...]
     },
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
    // 【核心修改】只负责刷新数据，不负责计算
    this.refreshData();
  },

  /**
   * 【核心重构】刷新页面数据
   * 从 Service 获取最新的功法列表和经验统计
   */
  refreshData() {
    // 1. 获取列表数据
    const cultivations = CultivationService.getCultivationData();
    
    // 2. 获取各类总经验 (简单计算或让Service提供)
    const totalExpMap = {
      body: CultivationService.calculateCategoryExp(cultivations.body),
      mind: CultivationService.calculateCategoryExp(cultivations.mind),
      skill: CultivationService.calculateCategoryExp(cultivations.skill),
      wealth: CultivationService.calculateCategoryExp(cultivations.wealth),
    };

    this.setData({ 
      userCultivations: cultivations,
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
      tempCultivationData: { gongfa, category } 
    });
  },

  onDialogConfirm() {
    const { gongfa, category } = this.data.tempCultivationData;
    this.setData({ isCultivating: true });
    
    // 模拟修炼过程
    setTimeout(() => {
      this.setData({ isCultivating: false });
      this.processCultivationResult(gongfa, category);
    }, 2000);
  },

  /**
   * 【核心重构】处理修炼结果
   * 调用 Service 执行业务逻辑，页面只负责展示结果
   */
  processCultivationResult(gongfa, category) {
    // 1. 记录修炼前的等级 (用于判断升级)
    const oldLevelInfo = CultivationService.getCurrentLevelInfo();

    // 2. 调用 Service 执行修炼 (核心写操作)
    const result = CultivationService.doPractice(gongfa.id, category);

    if (result.success) { 
      // 3. 刷新界面数据
      this.refreshData();

      // 4. 判断升级
      const newLevelInfo = CultivationService.getCurrentLevelInfo();
      if (newLevelInfo.level > oldLevelInfo.level) {
        // --- 触发升级弹窗 ---
        const breakthroughDesc = newLevelInfo.breakthroughDesc || this.data.levelUpInfo.description;
        this.setData({
          'levelUpInfo.levelName': newLevelInfo.name,
          'levelUpInfo.description': breakthroughDesc,
          showLevelUp: true
        });
        
        // 播放升级动画
        const animation = wx.createAnimation({ duration: 400, timingFunction: 'ease' });
        wx.nextTick(() => {
          animation.scale(1).opacity(1).step();
          this.setData({ levelUpAnimation: animation.export() });
        });
      } else {
         // 【修改】不再调用 Notify，而是显示结算弹窗
         this.showSettlementModal(result.addedExp, category);
        }
      } else {
        wx.showToast({ title: '修炼数据异常', icon: 'none' });
      }
    },
  
    // 【新增】显示结算弹窗
    showSettlementModal(addedExp, category) {
      // 1. 计算属性增量 (根据 Service 里的公式反推)
      // 公式参考：寿元=Exp/1000, 其他五维=Exp/500
      const changes = [];
      
      // 公共公式
      const attrIncrement = (addedExp / 500).toFixed(2); // 属性增加量
      const lifeIncrement = (addedExp / 1000).toFixed(3); // 寿元增加量
  
      if (category === 'body') {
        changes.push({ label: '寿元', val: lifeIncrement });
        changes.push({ label: '体质', val: attrIncrement });
      } else if (category === 'mind') {
        changes.push({ label: '寿元', val: lifeIncrement });
        changes.push({ label: '心境', val: attrIncrement });
      } else if (category === 'skill') {
        changes.push({ label: '智慧', val: attrIncrement });
      } else if (category === 'wealth') {
        changes.push({ label: '财富', val: attrIncrement });
      }
  
      // 2. 设置数据并显示
      this.setData({
        showSettlement: true,
        settlementInfo: {
          exp: addedExp,
          categoryName: this.data.categoryMap[category],
          attrChanges: changes
        }
      });
    },
  
    // 【新增】关闭结算弹窗
    closeSettlement() {
      this.setData({ showSettlement: false });
    },
  // --- 升级弹窗关闭逻辑 (保持不变) ---
  closeLevelUp() {
    const animation = wx.createAnimation({ duration: 300, timingFunction: 'ease' });
    animation.scale(0.5).opacity(0).step();
    this.setData({ levelUpAnimation: animation.export() });
    
    setTimeout(() => {
      this.setData({ showLevelUp: false });
      // 移除 TabBar 红点逻辑 (如果之前有的话)
      // wx.removeTabBarBadge({ index: 1 }); 
    }, 300);
  },

  navigateToSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  }
})