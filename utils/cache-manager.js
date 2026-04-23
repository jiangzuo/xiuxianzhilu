// utils/cache-manager.js
let _memCache = {
  userProfile: null,
  userpractices: null,
  // 【新增】AI 深度记忆 (软数据)
  deepMemory: {
    basic: { name: "", age: "", gender: "", job: "" }, 
    goals: [],        // 目标 (如: 考研)
    interests: [],    // 喜好
    difficulties: [], // 困难/心魔
    summary: ""       // 【核心】滚动摘要 (前情提要)
  }
};

const CacheManager = {
  init() {
    try {
      console.log('【Cache】开始初始化...');
      _memCache.userProfile = wx.getStorageSync('userProfile') || null;
      _memCache.userpractices = wx.getStorageSync('userpractices') || null;
      
      // 初始化深度记忆
      _memCache.deepMemory = wx.getStorageSync('deepMemory') || {
        basic: {}, 
        goals: [], 
        interests: [], 
        difficulties: [], 
        summary: "暂无前情提要。"
      };

      // 初始化今日宜练
      _memCache.dailyTask = wx.getStorageSync('dailyTask') || null;
    } catch (e) {
      console.error('【Cache】初始化失败', e);
    }
  },

  get(key) {
    if (_memCache[key] === undefined) return null;
    try {
      return JSON.parse(JSON.stringify(_memCache[key]));
    } catch (e) {
      return _memCache[key];
    }
  },

  set(key, value) {
    _memCache[key] = value;
    wx.setStorage({
      key: key,
      data: value,
      fail: (err) => console.error(`【Cache】写入 ${key} 失败`, err)
    });
  }
};

module.exports = CacheManager;