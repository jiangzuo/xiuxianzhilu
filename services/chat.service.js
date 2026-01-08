// services/chat.service.js
const CHAT_STORAGE_KEY = 'chat_history_v1';

const ChatService = {
  getHistory(limit = 0) {
    let history = wx.getStorageSync(CHAT_STORAGE_KEY) || [];
    if (limit > 0 && history.length > limit) {
      return history.slice(-limit);
    }
    return history;
  },

  getContextForAI(limit = 10) {
    // 获取全部记录，包括 system 事件
    return this.getHistory(limit);
  },

  /**
   * 保存消息
   * @param {string} role 'user' | 'assistant' | 'system'
   */
  saveMessage(role, content) {
    let history = wx.getStorageSync(CHAT_STORAGE_KEY) || [];
    
    const newMsg = {
      id: Date.now(),
      role: role,
      content: content,
      timestamp: Date.now()
    };

    history.push(newMsg);

    if (history.length > 500) history = history.slice(-500);

    wx.setStorageSync(CHAT_STORAGE_KEY, history);
    return newMsg;
  },
  
  clearHistory() {
    wx.removeStorageSync(CHAT_STORAGE_KEY);
  }
};

module.exports = ChatService;