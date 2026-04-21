// services/user.service.js 用户管理逻辑
const Cache = require('../utils/cache-manager');
const practiceService = require('./practice.service');

const UserService = {
  /**
   * 获取用户基础信息 (如果不存在则初始化)
   */
  getUserProfile() {
    let profile = Cache.get('userProfile');
    if (!profile) {
      profile = {
        nickName: '主人',
        joinDate: Date.now()
      };
      Cache.set('userProfile', profile);
    }
    return profile;
  },

  /**
   * 更新用户基础信息
   */
  updateProfile(data) {
    const profile = this.getUserProfile();
    const newProfile = { ...profile, ...data };
    Cache.set('userProfile', newProfile);
    return newProfile;
  },

  /**
   * 获取日期标签
   */
  _getDateLabel(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "今日";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  /**
   * 构建用户档案 (用于心魔修炼等场景)
   */
  buildUserArchive() {
    const practice = require('./practice.service');
    const profile = this.getUserProfile();
    const levelInfo = practice.getCurrentLevelInfo();
    const attrs = practice.calculateAttributes();
    const logs = practice.getRecentLogs(5);
    const memory = Cache.get('deepMemory') || { 
      basic: {}, goals: [], interests: [], difficulties: [], summary: "" 
    };

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

    let recentLogStr = "近期暂无修炼。";
    if (logs.length > 0) {
      recentLogStr = logs.map(l => 
        `[${this._getDateLabel(l.timestamp)}] 习得《${l.action}》 (修为+${l.exp})`
      ).join('\n');
    }

    const cultData = practice.getpracticeData();
    const allGongfas = [
      ...cultData.body, ...cultData.mind, ...cultData.skill, ...cultData.wealth
    ].filter(item => item.count > 0);
    
    let gongfaStatsStr = "尚无修炼功法。";
    if (allGongfas.length > 0) {
      const topGongfas = allGongfas.sort((a, b) => b.count - a.count).slice(0, 20);
      gongfaStatsStr = topGongfas.map(g => `- 《${g.name}》：已炼 ${g.count} 次`).join('\n');
    }

    const softInfoStr = `
- 目标：${(memory.goals || []).join('、') || '暂无'}
- 喜好：${(memory.interests || []).join('、') || '暂无'}
- 当前心魔/困难：${(memory.difficulties || []).join('、') || '暂无'}
`.trim();

    return {
      hard_info_text: hardInfoStr,
      recent_activity_log: recentLogStr,
      practice_stats: gongfaStatsStr,
      soft_info_text: softInfoStr,
      rolling_summary: memory.summary || "暂无前情"
    };
  }
};

module.exports = UserService;