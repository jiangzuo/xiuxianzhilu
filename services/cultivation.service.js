// services/cultivation.service.js
const Cache = require('../utils/cache-manager');
const { LEVEL_SYSTEM } = require('../utils/level-data');

// 辅助：生成UUID
const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

const CultivationService = {
  /**
   * 获取所有修炼数据 (包含初始化逻辑)
   */
  getCultivationData() {
    let data = Cache.get('userCultivations');
    
    // 如果缓存不存在，或者数据结构不对，则进行初始化
    if (!data || typeof data !== 'object') {
      data = { body: [], mind: [], skill: [], wealth: [] };
      
      // 【修改点】默认初始化一个“散步30分钟”的功法
      // 对应 gongfa-data.js 中：散步(神行术) -> 30分钟 -> 5 exp
      data.body.push({ 
        id: uuid(), 
        name: '散步 30分钟', 
        exp: 5, 
        count: 0, 
        totalExpEarned: 0 
      });
      
      Cache.set('userCultivations', data);
    }

    // 容错处理：防止旧用户缺少某个分类字段
    if (!data.body) data.body = [];
    if (!data.mind) data.mind = [];
    if (!data.skill) data.skill = [];
    if (!data.wealth) data.wealth = [];

    return data;
  },

  /**
   * 计算某分类的总经验
   */
  calculateCategoryExp(list) {
    if (!list) return 0;
    return list.reduce((sum, item) => sum + (item.totalExpEarned || 0), 0);
  },

  /**
   * 计算五维属性
   */
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

   /**
   * 获取当前境界信息
   */
  getCurrentLevelInfo() {
    const { totalExp } = this.calculateAttributes();
    let accumulatedExp = 0;
    
    for (let i = 0; i < LEVEL_SYSTEM.length; i++) {
      const level = LEVEL_SYSTEM[i];
      if (level.expToNext === Infinity) {
        // 【修复 1】这里改为 expPercentage
        return { ...level, currentExp: 0, expPercentage: '100%' };
      }
      
      if (totalExp < accumulatedExp + level.expToNext) {
        const currentExp = totalExp - accumulatedExp;
        const percentage = Math.min((currentExp / level.expToNext) * 100, 100).toFixed(1);
        return {
          ...level,
          currentExp,
          // 【修复 2】这里改为 expPercentage，与 WXML 对应
          expPercentage: percentage + '%' 
        };
      }
      accumulatedExp += level.expToNext;
    }
    // 【修复 3】保底返回也要改
    return { ...LEVEL_SYSTEM[LEVEL_SYSTEM.length - 1], expPercentage: '100%' };
  },

  /**
   * 执行修炼
   * @param {string} gongfaId 功法ID
   * @param {string} category 分类(body, mind...)
   * @param {number} expGain 额外指定的经验值(可选)
   */
  doPractice(gongfaId, category, expGain = null) {
    const data = this.getCultivationData();
    
    // 安全检查：确保分类存在
    if (!data[category]) return { success: false, msg: '修仙路径异常' };

    const list = data[category];
    const index = list.findIndex(item => item.id === gongfaId);

    if (index === -1) return { success: false, msg: '功法不存在或已归隐' };

    const item = list[index];
    const finalExp = expGain !== null ? expGain : item.exp;

    // 1. 更新功法数据
    item.count = (item.count || 0) + 1;
    item.totalExpEarned = (item.totalExpEarned || 0) + finalExp;
    
    // 2. 写入缓存 (内存+异步磁盘)
    data[category][index] = item;
    Cache.set('userCultivations', data);

    return {
      success: true,
      addedExp: finalExp,
      gongfaName: item.name,
      newCount: item.count
    };
  }
};

module.exports = CultivationService;