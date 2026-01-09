// services/cultivation.service.js
const Cache = require('../utils/cache-manager');
const { LEVEL_SYSTEM } = require('../utils/level-data');
// 注意：这里不引入 ChatService 避免循环引用，只负责写 Storage

const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

const CultivationService = {
  // ... (getCultivationData, calculateCategoryExp, calculateAttributes 保持不变) ...
  getCultivationData() {
    let data = Cache.get('userCultivations');
    if (!data || typeof data !== 'object') {
      data = { body: [], mind: [], skill: [], wealth: [] };
      // 初始化默认功法
      data.body.push({ id: uuid(), name: '散步 30分钟', exp: 5, count: 0, totalExpEarned: 0 });
      Cache.set('userCultivations', data);
    }
    // 容错
    ['body', 'mind', 'skill', 'wealth'].forEach(k => { if(!data[k]) data[k] = []; });
    return data;
  },

  calculateCategoryExp(list) {
    if (!list) return 0;
    return list.reduce((sum, item) => sum + (item.totalExpEarned || 0), 0);
  },

  calculateAttributes() {
    const data = this.getCultivationData();
    const bodyExp = this.calculateCategoryExp(data.body);
    const mindExp = this.calculateCategoryExp(data.mind);
    const skillExp = this.calculateCategoryExp(data.skill);
    const wealthExp = this.calculateCategoryExp(data.wealth);
    return {
      shouYuan: (80 + (bodyExp / 1000) + (mindExp / 1000)).toFixed(2),
      tiZhi: (50 + (bodyExp / 500)).toFixed(2),
      xinJing: (50 + (mindExp / 500)).toFixed(2),
      zhiHui: (50 + (skillExp / 500)).toFixed(2),
      caiFu: (50 + (wealthExp / 500)).toFixed(2),
      totalExp: bodyExp + mindExp + skillExp + wealthExp
    };
  },

  getCurrentLevelInfo() {
    const { totalExp } = this.calculateAttributes();
    let accumulatedExp = 0;
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const level = LEVEL_SYSTEM[i];
      if (level.expToNext === Infinity) {
        return { ...level, levelName: level.name, currentExp: 0, expPercentage: '100%' };
      }
      if (totalExp < accumulatedExp + level.expToNext) {
        const currentExp = totalExp - accumulatedExp;
        const percentage = Math.min((currentExp / level.expToNext) * 100, 100).toFixed(1);
        return {
          ...level,
          levelName: level.name,
          currentExp,
          expPercentage: percentage + '%'
        };
      }
      accumulatedExp += level.expToNext;
    }
    const max = LEVEL_SYSTEM[LEVEL_SYSTEM.length - 1];
    return { ...max, levelName: max.name, expPercentage: '100%' };
  },

  // --- 【新增】获取最近修炼日志 ---
  getRecentLogs(limit = 10) {
    const logs = wx.getStorageSync('practice_logs') || [];
    return logs.slice(0, limit);
  },

  // --- 【核心】执行修炼 ---
  doPractice(gongfaId, category, expGain = null) {
    const data = this.getCultivationData();
    const list = data[category];
    const index = list.findIndex(item => item.id === gongfaId);

    if (index === -1) return { success: false, msg: '功法不存在' };

    const item = list[index];
    const finalExp = expGain !== null ? expGain : item.exp;

    // 1. 更新数据
    item.count = (item.count || 0) + 1;
    item.totalExpEarned = (item.totalExpEarned || 0) + finalExp;
    data[category][index] = item;
    Cache.set('userCultivations', data);

    // 2. 【新增】写入详细日志
    this._addLog(item.name, category, finalExp);

    return {
      success: true,
      addedExp: finalExp,
      gongfaName: item.name,
      newCount: item.count
    };
  },

  /**
   * 内部方法：添加日志
   */
  _addLog(actionName, type, exp) {
    let logs = wx.getStorageSync('practice_logs') || [];
    const now = new Date();
    
    const newLog = {
      timestamp: now.getTime(),
      action: actionName,
      type: type,
      exp: exp
    };

    logs.unshift(newLog);
    if (logs.length > 50) logs = logs.slice(0, 50); // 只保留最近50条
    wx.setStorageSync('practice_logs', logs);
  }
};

module.exports = CultivationService;