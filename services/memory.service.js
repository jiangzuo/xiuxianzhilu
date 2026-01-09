const CultivationService = require('./cultivation.service');
const ChatService = require('./chat.service');
const Cache = require('../utils/cache-manager');
const UserService = require('./user.service');
const AIService = require('./ai.service');
const { SYSTEM_PROMPT, ARCHIVIST_PROMPT } = require('../utils/prompt-template');

// 【生产配置】每累计 10 条有效对话触发一次后台分析
const CONTEXT_LIMIT = 6; 

const MemoryService = {
  
  _getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "今日";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // ==========================================
  // 1. 组装发送给 Chat 的数据 (读记忆)
  // ==========================================
  buildSystemMessage() {
    // --- A. 获取硬数据 ---
    const profile = UserService.getUserProfile();
    const levelInfo = CultivationService.getCurrentLevelInfo();
    const attrs = CultivationService.calculateAttributes();
    const logs = CultivationService.getRecentLogs(5); 
    
    // --- B. 获取软数据 ---
    const memory = Cache.get('deepMemory') || { 
      basic: {}, goals: [], interests: [], difficulties: [], summary: "" 
    };
    
    // 1. 格式化基础信息
    const name = memory.basic.name || profile.nickName;
    const gender = memory.basic.gender || "性别未知";
    const job = memory.basic.job || "职业未知";
    const age = memory.basic.age || "年龄未知";
    const joinDays = Math.floor((Date.now() - (profile.joinDate || Date.now())) / (1000 * 60 * 60 * 24)) + 1;

    const hardInfoStr = `
【道号】：${name}
【根骨】：性别[${gender}]，年龄[${age}]，职业[${job}]
【仙途】：入宗 ${joinDays} 天，境界【${levelInfo.levelName}】
【五维】：寿元${attrs.shouYuan}, 体质${attrs.tiZhi}, 心境${attrs.xinJing}, 智慧${attrs.zhiHui}, 财富${attrs.caiFu}
`.trim();

    // 2. 格式化近期机缘
    let recentLogStr = "近期暂无修炼。";
    if (logs.length > 0) {
      recentLogStr = logs.map(l => 
        `[${this._getDateLabel(l.timestamp)}] 习得《${l.action}》 (修为+${l.exp})`
      ).join('\n');
    }

    // 3. 格式化本命功法 (Top 20)
    const cultData = CultivationService.getCultivationData();
    const allGongfas = [
      ...cultData.body, ...cultData.mind, ...cultData.skill, ...cultData.wealth
    ].filter(item => item.count > 0);
    
    let gongfaStatsStr = "尚无修炼功法。";
    if (allGongfas.length > 0) {
      const topGongfas = allGongfas.sort((a, b) => b.count - a.count).slice(0, 20);
      gongfaStatsStr = topGongfas.map(g => `- 《${g.name}》：已炼 ${g.count} 次`).join('\n');
    }

    // 4. 格式化道心画像
    const softInfoStr = `
- 目标：${(memory.goals || []).join('、') || '暂无'}
- 喜好：${(memory.interests || []).join('、') || '暂无'}
- 当前心魔/困难：${(memory.difficulties || []).join('、') || '暂无'}
`.trim();

    // --- C. 模板替换 ---
    let content = SYSTEM_PROMPT
      .replace('{hard_info_text}', hardInfoStr)
      .replace('{recent_activity_log}', recentLogStr)
      .replace('{cultivation_stats}', gongfaStatsStr)
      .replace('{soft_info_text}', softInfoStr)
      .replace('{rolling_summary}', memory.summary || "暂无前情");

    return { role: 'system', content: content };
  },

  buildRequestMessages(newQuery) {
    const systemMsg = this.buildSystemMessage();
    let historyObjs = ChatService.getContextForAI(10); // 聊天上下文取最近10条
    
    // 去重逻辑
    if (historyObjs.length > 0) {
      const lastMsg = historyObjs[historyObjs.length - 1];
      if (lastMsg.role === 'user' && lastMsg.content === newQuery) {
        historyObjs.pop(); 
      }
    }

    const historyStr = historyObjs.map(msg => {
       const roleName = msg.role === 'user' ? '主人' : '器灵';
       return `${roleName}：${msg.content}`;
    }).join('\n');

    const finalContent = `
记忆（上下文）：
${historyStr}

[当前] 主人：${newQuery}
`;
    return [ systemMsg, { role: 'user', content: finalContent } ];
  },

  // ==========================================
  // 2. 后台分析 (写记忆)
  // ==========================================

  async checkAndUpdateMemory() {
    const history = ChatService.getHistory(0);
    
    // 过滤系统消息，只计算有效对话条数
    const chatOnly = history.filter(m => m.role === 'user' || m.role === 'assistant');
    const chatLen = chatOnly.length;

    // 满足阈值倍数时触发
    if (chatLen > 0 && chatLen % CONTEXT_LIMIT === 0) {
      // 取最近的 N 条混合记录（包含系统消息有助于AI理解背景）
      const recentChat = history.slice(-CONTEXT_LIMIT); 
      this._runAnalysisTask(recentChat);
    }
  },

  async _runAnalysisTask(recentChat) {
    const currentMemory = Cache.get('deepMemory') || { basic:{}, goals:[] };
    
    const chatText = recentChat.map(m => `${m.role}:${m.content}`).join('\n');
    
    const promptContent = ARCHIVIST_PROMPT
      .replace('{current_memory_json}', JSON.stringify(currentMemory))
      .replace('{recent_history}', chatText);

    let aiResponse = "";
    
    // 静默调用 AI
    AIService.sendMessageStream(
      [{ role: 'user', content: promptContent }], 
      (chunk) => { aiResponse += chunk; }, 
      () => { this._updateLocalMemory(aiResponse); }
    );
  },

  _updateLocalMemory(jsonString) {
    try {
      // JSON 清洗逻辑
      let cleanJson = jsonString.replace(/```json/g, '').replace(/```/g, '');
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      
      if (firstBrace === -1 || lastBrace === -1) return;
      
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      const newInsights = JSON.parse(cleanJson);

      let memory = Cache.get('deepMemory') || { basic:{}, goals:[], interests:[], difficulties:[], summary:"" };

      // 合并逻辑
      if (newInsights.basic) memory.basic = { ...memory.basic, ...newInsights.basic };
      if (newInsights.summary) memory.summary = newInsights.summary;
      
      const updateList = (oldList, newList, limit) => {
        let merged = [...new Set([...(oldList || []), ...(newList || [])])];
        if (merged.length > limit) merged = merged.slice(-limit);
        return merged;
      };

      if (newInsights.goals) memory.goals = updateList(memory.goals, newInsights.goals, 5);
      if (newInsights.interests) memory.interests = updateList(memory.interests, newInsights.interests, 5);
      if (newInsights.difficulties) memory.difficulties = updateList(memory.difficulties, newInsights.difficulties, 3);

      Cache.set('deepMemory', memory);
      console.log('✅ 记忆已静默更新');
      
    } catch (e) {
      // 静默失败，不打扰用户，但在开发版可以保留这个 error 以便排查
      console.error('记忆解析微小错误(可忽略)', e);
    }
  }
};

module.exports = MemoryService;