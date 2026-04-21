// pages/profile/profile.js
const app = getApp();
const practiceService = require('../../services/practice.service');
const ImportExportService = require('../../services/import-export.service');
const { QUOTES_LIBRARY } = require('../../utils/level-data.js');
const GREETINGS = require('../../utils/greetings.js');

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

    // --- 导入导出数据 ---
    showImportExportPopup: false,
    showImportPopup: false,
    showConfirmPopup: false,
    importData: '',
    parsedImportData: null,

    // --- 器灵话语数据 ---
    spiritMessage: '',
    showSpiritMessage: false
  },
  // 【新增】跳转到器灵聊天页
  navigateToChat() {
    wx.navigateTo({
      url: '/pages/chat/chat',
      fail: (err) => {
        console.error('跳转失败，请检查 app.json 是否配置了页面', err);
      }
    });
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
    this.startSpiritMessageLoop();
  },

  refreshData() {
    const levelInfo = practiceService.getCurrentLevelInfo();
    const attributes = practiceService.calculateAttributes();
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

  // --- 导入导出相关方法 ---

  // 显示导入导出选择弹窗
  showImportExportPopup() {
    this.setData({
      showImportExportPopup: true
    });
  },

  // 关闭导入导出选择弹窗
  closeImportExportPopup() {
    this.setData({
      showImportExportPopup: false
    });
  },

  // 导出数据
  onExportData() {
    try {
      const jsonString = ImportExportService.exportData();
      wx.setClipboardData({
        data: jsonString,
        success: () => {
          wx.showToast({
            title: '导出成功，已复制到剪贴板',
            icon: 'success',
            duration: 2000
          });
          this.closeImportExportPopup();
        },
        fail: () => {
          wx.showToast({
            title: '导出失败，请重试',
            icon: 'none',
            duration: 2000
          });
        }
      });
    } catch (error) {
      wx.showToast({
        title: '导出失败：' + error.message,
        icon: 'none',
        duration: 2000
      });
    }
  },

  // 显示导入数据弹窗
  showImportPopup() {
    this.setData({
      showImportExportPopup: false,
      showImportPopup: true,
      importData: ''
    });
  },

  // 关闭导入数据弹窗
  closeImportPopup() {
    this.setData({
      showImportPopup: false
    });
  },

  // 输入导入数据
  onImportDataInput(e) {
    this.setData({
      importData: e.detail.value
    });
  },

  // 确认导入数据
  onConfirmImport() {
    const { importData } = this.data;
    if (!importData) {
      wx.showToast({
        title: '请粘贴导出的数据',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    try {
      // 解析JSON
      const parsedData = JSON.parse(importData);
      
      // 验证数据
      ImportExportService.validateImportData(parsedData);
      
      // 保存解析后的数据
      this.setData({
        parsedImportData: parsedData
      });
      
      // 显示自定义确认弹窗
      this.setData({
        showConfirmPopup: true
      });
    } catch (error) {
      wx.showToast({
        title: '数据格式错误：' + error.message,
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 关闭确认覆盖弹窗
  closeConfirmPopup() {
    this.setData({
      showConfirmPopup: false
    });
  },

  // 确认导入数据
  onConfirmImportData() {
    const { parsedImportData } = this.data;
    
    try {
      // 执行导入（使用已解析的数据）
      ImportExportService.importData(parsedImportData);
      wx.showToast({
        title: '导入成功',
        icon: 'success',
        duration: 2000
      });
      this.closeImportPopup();
      this.closeConfirmPopup();
      // 刷新页面数据
      this.refreshData();
    } catch (error) {
      wx.showToast({
        title: '导入失败：' + error.message,
        icon: 'none',
        duration: 3000
      });
      this.closeConfirmPopup();
    }
  },

  // --- 器灵话语相关方法 ---

  // 启动器灵话语循环
  startSpiritMessageLoop() {
    this.showSpiritMessage();
    this.startMessageTimer();
  },

  // 显示器灵话语
  showSpiritMessage() {
    const message = this.getRandomGreeting();
    this.setData({
      spiritMessage: message,
      showSpiritMessage: true
    });

    // 5秒后隐藏
    setTimeout(() => {
      this.setData({ showSpiritMessage: false });
    }, 10000);
  },

  // 启动定时器（30-60秒随机间隔）
  startMessageTimer() {
    const randomInterval = Math.floor(Math.random() * 30000) + 30000; // 30000-60000ms
    setTimeout(() => {
      // 检查页面是否仍然显示
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage.route === 'pages/profile/profile') {
        this.showSpiritMessage();
        this.startMessageTimer();
      }
    }, randomInterval);
  },

  // 根据时间筛选话术
  getRandomGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toDateString();
    const lastLoginDate = wx.getStorageSync('lastLoginDate');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    let messageCategories = [];

    // 判断是否很久没登录
    const isLongAbsent = lastLoginDate && lastLoginDate !== today && lastLoginDate !== yesterdayStr;

    // 添加时间相关话术
    if (hour >= 5 && hour < 9) {
      messageCategories.push(...GREETINGS.morning);
    } else if (hour >= 11 && hour < 13) {
      messageCategories.push(...GREETINGS.noon);
    } else if (hour >= 17 && hour < 20) {
      messageCategories.push(...GREETINGS.evening);
    } else if (hour >= 23 || hour < 5) {
      messageCategories.push(...GREETINGS.night);
    }

    // 添加日常话术
    messageCategories.push(...GREETINGS.default);

    // 添加引导修炼话术
    messageCategories.push(...GREETINGS.guide);

    // 添加关怀话术
    messageCategories.push(...GREETINGS.care);

    // 如果很久没登录，添加挽回话术
    if (isLongAbsent) {
      messageCategories.push(...GREETINGS.long_absent);
    }

    // 随机选择一条
    const randomIndex = Math.floor(Math.random() * messageCategories.length);
    return messageCategories[randomIndex];
  },

  // 页面卸载时清理定时器
  onUnload() {
    this.stopMessageTimer();
  },

  // 停止定时器
  stopMessageTimer() {
    // 定时器会在页面卸载后自然停止，这里可以添加清理逻辑
  }
})