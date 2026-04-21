// services/chat.service.js 聊天页面逻辑
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
   * @param {string} content 消息内容
   * @param {string} category 分类：'normal' | 'demon_fear' | 'demon_regret'
   */
  saveMessage(role, content, category = 'normal') {
    let history = wx.getStorageSync(CHAT_STORAGE_KEY) || [];
    
    const newMsg = {
      id: Date.now(),
      role: role,
      content: content,
      category: category,
      timestamp: Date.now()
    };

    history.push(newMsg);

    if (history.length > 500) history = history.slice(-500);

    wx.setStorageSync(CHAT_STORAGE_KEY, history);
    return newMsg;
  },

  /**
   * 获取指定类型的心魔上下文
   * @param {string} type 'fear' | 'regret'
   * @param {number} limit 限制条数
   */
  getDemonContextForAI(type, limit = 20) {
    const history = this.getHistory(0);
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';
    
    const demonHistory = history
      .filter(msg => msg.category === category)
      .slice(-limit);
    
    return demonHistory;
  },

  clearHistory() {
    wx.removeStorageSync(CHAT_STORAGE_KEY);
  }
};

module.exports = ChatService;