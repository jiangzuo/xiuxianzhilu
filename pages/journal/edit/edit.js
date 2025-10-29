// pages/journal/edit/edit.js
const { MOOD_MAP } = require('../../../utils/mood-data.js');

// 【核心优化】在 Page 定义外部，提前处理好数据
const moodListForData = Object.keys(MOOD_MAP).map(key => ({
  key: key,
  ...MOOD_MAP[key]
}));

Page({
  data: {
    content: '',
    // 【核心优化】直接在 data 中初始化 moodList
    moodList: moodListForData, 
    selectedMood: 'happy',
  },

  // 【核心优化】onLoad 函数现在是空的，不再执行 setData
  onLoad(options) {
    // onLoad is now empty
  },

  onContentChange(event) {
    this.setData({ content: event.detail });
  },

  onMoodSelect(event) {
    const { moodKey } = event.currentTarget.dataset;
    this.setData({ selectedMood: moodKey });
  },

  onSaveJournal() {
    // ... (此函数内容保持不变)
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