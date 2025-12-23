// pages/journal/edit/edit.js
const { MOOD_MAP } = require('../mood-data.js');
const app = getApp();

const moodListForData = Object.keys(MOOD_MAP).map(key => ({
  key: key,
  ...MOOD_MAP[key]
}));

Page({
  data: {
    pageClass: '',
    
    // 【核心新增】
    statusBarHeight: 0, 

    content: '',
    moodList: moodListForData, 
    selectedMood: 'happy',
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

  // 【核心新增】返回上一页的方法
  navigateBack() {
    wx.navigateBack();
  },

  onContentChange(event) {
    this.setData({ content: event.detail.value });
  },

  onMoodSelect(event) {
    const { moodKey } = event.currentTarget.dataset;
    this.setData({ selectedMood: moodKey });
  },

  onSaveJournal() {
    if (this.data.content.trim().length === 0) {
      wx.showToast({ title: '感悟内容不能为空', icon: 'none' });
      return;
    }
    const journals = wx.getStorageSync('userJournals') || [];
    const newJournal = {
      id: this.uuid(),
      content: this.data.content,
      mood: this.data.selectedMood,
      timestamp: Date.now()
    };
    journals.push(newJournal);
    wx.setStorageSync('userJournals', journals);
    wx.showToast({
      title: '保存成功',
      icon: 'success',
      duration: 1500,
      mask: true,
      complete: () => {
        setTimeout(() => { wx.navigateBack(); }, 1500);
      }
    });
  },

  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
})