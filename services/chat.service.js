// services/chat.service.js 聊天页面逻辑
const CHAT_STORAGE_KEY = 'chat_history_v1';

// 【P3 重构】统一的 ID 生成器（下沉自原 chat.js 的 generateMsgId）
// 背景：原 P0 修复在 chat.js 里加了 generateMsgId 防"同毫秒重复 ID"，
//       但只覆盖了 Page 层 AI 占位符，ChatService 仍是 Date.now()，
//       形成"Page 字符串 ID / Service 数字 ID"双轨制。
// 目的：消除双轨制，所有"消息"概念的 ID 都从这一处产生。
// 格式："{role}_{timestamp}_{seq}_{rand}"，例 "user_1718067600000_01_x7k2"
//   - role：'user' | 'assistant' | 'system' | 'msg'(默认)
//   - timestamp：Date.now() 毫秒
//   - seq：模块级自增计数器 0-99 循环，防同毫秒碰撞
//   - rand：4 字符 base36 后缀，兜底防 seq 撞车（碰撞率 ≈ 1/(100*36^4)）
// 关键约束：所有"消息"概念的 ID 必须经由此函数，**禁止**在任何调用点直接 Date.now() 生成
let _msgIdCounter = 0;
function generateId(role = 'msg') {
  _msgIdCounter = (_msgIdCounter + 1) % 100;
  const ts = Date.now();
  const seq = String(_msgIdCounter).padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 4);
  return `${role}_${ts}_${seq}_${rand}`;
}

const ChatService = {
  // 【P3 重构】暴露 ID 生成器给 Page / chat-flow / heart-demon 等其他模块复用
  // 用途：UI 占位符（Page 层）、Storage 持久化（Service 层）共享同一份 ID
  generateId,

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
   * @param {string|null} externalId 可选；外部已生成的 ID（让 Page 占位符与 Storage 记录 ID 完全一致）
   *                                不传则自动用 generateId(role) 生成
   * @returns {Object} 新消息（id 字段保证全局唯一字符串）
   */
  saveMessage(role, content, category = 'normal', externalId = null) {
    let history = wx.getStorageSync(CHAT_STORAGE_KEY) || [];
    
    const newMsg = {
      // 【P3 重构】支持外部传入 ID（消除 Page / Storage 双 ID 系统）
      id: externalId || generateId(role),
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
   * @param {number} limit 默认限制条数为 20 条
   */
  getDemonContextForAI(type, limit = 20) {
    const history = this.getHistory(0);
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';
    
    const demonHistory = limit > 0 
      ? history.filter(msg => msg.category === category).slice(-limit)
      : [];
    
    return demonHistory;
  },

  clearHistory() {
    wx.removeStorageSync(CHAT_STORAGE_KEY);
  }
};

module.exports = ChatService;
