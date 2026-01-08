// services/memory.service.js
const CultivationService = require('./cultivation.service');
const ChatService = require('./chat.service');
const UserService = require('./user.service'); // 假设你有这个获取昵称
const { SYSTEM_PROMPT } = require('../utils/prompt-template');

const MemoryService = {
  /**
   * 辅助：计算相对日期 (今日/昨日/前日)
   */
  _getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    
    const diff = (today - target) / (1000 * 60 * 60 * 24);
    
    if (diff === 0) return "今日";
    if (diff === 1) return "昨日";
    if (diff === 2) return "前日";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  /**
   * 组装 System Prompt (严格匹配你的 JSON 格式)
   */
  buildSystemMessage() {
    // 1. 获取各类数据
    const profile = UserService.getUserProfile(); // 需确保 UserService 能返回 joinDate
    const levelInfo = CultivationService.getCurrentLevelInfo();
    const attrs = CultivationService.calculateAttributes();
    const rawLogs = CultivationService.getRecentLogs(8); // 取最近8条

    // 2. 计算入宗天数
    const joinDays = Math.floor((Date.now() - (profile.joinDate || Date.now())) / (1000 * 60 * 60 * 24)) + 1;

    // 3. 格式化 recent_activity
    const formattedLogs = rawLogs.map(log => ({
      date: this._getDateLabel(log.timestamp),
      action: log.action,
      type: log.type,
      exp: log.exp
    }));

    // 4. 组装最终 JSON 对象
    const userJson = {
      user_profile: {
        nickname: profile.nickName || "道友",
        gender: profile.gender === 1 ? "男" : (profile.gender === 2 ? "女" : "未知"),
        current_level: levelInfo.levelName,
        join_days: `${joinDays}day`,
        total_val: attrs.totalExp // 总修为
      },
      attributes: {
        body_cultivation: { val: parseFloat(attrs.tiZhi), label: "体修" },
        mind_cultivation: { val: parseFloat(attrs.xinJing), label: "心修" },
        skill_cultivation: { val: parseFloat(attrs.zhiHui), label: "术修" },
        wealth_cultivation: { val: parseFloat(attrs.caiFu), label: "财修" }
      },
      "最近3天修炼": {
         formattedLogs
      }
    };

    // 5. 替换模板
    // 注意：这里用 JSON.stringify(userJson, null, 2) 让格式更漂亮，AI 更容易读
    const content = SYSTEM_PROMPT.replace('{user_profile_json}', JSON.stringify(userJson, null, 2));

    return { role: 'system', content: content };
  },

  /**
   * 组装聊天上下文 (格式化为 [HH:MM] 角色：内容)
   */
  _formatHistoryString(history) {
    return history.map(msg => {
      const date = new Date(msg.timestamp);
      const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      let roleName = "";
      if (msg.role === 'user') roleName = "主人";
      else if (msg.role === 'assistant') roleName = "器灵";
      else if (msg.role === 'system') return `[${timeStr}]【系统事件】：${msg.content}`; // 特殊处理系统事件
      
      return `[${timeStr}] ${roleName}：${msg.content}`;
    }).join('\n');
  },

  /**
   * 构建最终请求消息数组
   * 注意：为了让 AI 理解这种纯文本格式的上下文，
   * 我们通常把格式化后的 history 作为一个 user 消息告诉 AI，或者直接放在 system prompt 里。
   * 这里采用：System (含Json) + User (含History string + 新问题)
   */
  buildRequestMessages(newQuery) {
    const systemMsg = this.buildSystemMessage();
    const historyObjs = ChatService.getContextForAI(10); // 获取对象数组
    if (historyObjs.length > 0) {
      const lastMsg = historyObjs[historyObjs.length - 1];
      if (lastMsg.role === 'user' && lastMsg.content === newQuery) {
        // 移除最后一条（也就是当前这条）
        historyObjs.pop(); 
      }
    }
    // 把历史记录转换成你要求的字符串格式
    const historyStr = this._formatHistoryString(historyObjs);

    // 我们需要告诉 AI：这是之前的记忆
    // 技巧：把 History 拼在 User 的最新提问前面，或者单独发一条 System
    // 这里选择拼在 User 前面，这是处理 Context 最稳妥的方式
    const finalContent = `
记忆（上下文）：
${historyStr}

[${new Date().getHours()}:${new Date().getMinutes()}] 主人：${newQuery}
`;

    // 最终只发送两条：1. System(人设+JSON) 2. User(历史+新问题)
    // 这样做比发一堆 messages 数组更符合你要求的“文本格式”控制
    return [
      systemMsg,
      { role: 'user', content: finalContent }
    ];
  }
};

module.exports = MemoryService;