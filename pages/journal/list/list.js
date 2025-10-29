// pages/journal/list/list.js
const { MOOD_MAP } = require('../../../utils/mood-data.js');
Page({
  data: {
    journals: [],
    moodMap: MOOD_MAP,
  },
  onShow() {
    this.loadJournals();
  },
  loadJournals() {
    const journals = wx.getStorageSync('userJournals') || [];
    const processedJournals = journals.map(item => ({
      ...item,
      displayTime: this.formatTime(item.timestamp)
    }));
    processedJournals.sort((a, b) => b.timestamp - a.timestamp);
    this.setData({ journals: processedJournals });
  },
  navigateToEdit() {
    wx.navigateTo({ url: '/pages/journal/edit/edit' });
    //wx.showToast({ title: '编辑功能维护中', icon: 'none' });
  },
  onJournalTap(event) {
    wx.showToast({ title: '暂不支持查看详情', icon: 'none' });
  },
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}年${month}月${day}日 ${hours}:${minutes}`;
  },
})