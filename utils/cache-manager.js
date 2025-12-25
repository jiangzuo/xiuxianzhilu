// utils/cache-manager.js
// 单例内存缓存管理器

let _memCache = {
  userProfile: null,      // 用户基础信息
  userCultivations: null, // 功法与修炼记录
  userJournals: null,     // 日记 (分包可能用到，先预留)
  settings: null          // 其他设置
};

const CacheManager = {
  /**
   * 初始化：App启动时调用，一次性读取所有关键数据到内存
   */
  init() {
    try {
      console.log('【Cache】开始初始化内存缓存...');
      const start = Date.now();
      
      _memCache.userProfile = wx.getStorageSync('userProfile') || null;
      _memCache.userCultivations = wx.getStorageSync('userCultivations') || null;
      _memCache.userJournals = wx.getStorageSync('userJournals') || [];
      
      console.log(`【Cache】初始化完成，耗时 ${Date.now() - start}ms`);
    } catch (e) {
      console.error('【Cache】初始化失败', e);
    }
  },

  /**
   * 获取数据 (返回深拷贝，防止外部直接修改内存污染)
   * @param {string} key 
   */
  get(key) {
    if (_memCache[key] === undefined) return null;
    // 简单深拷贝，防止引用修改
    try {
      return JSON.parse(JSON.stringify(_memCache[key]));
    } catch (e) {
      return _memCache[key];
    }
  },

  /**
   * 更新数据 (同步更新内存，异步写入磁盘)
   * @param {string} key 
   * @param {any} value 
   */
  set(key, value) {
    // 1. 更新内存
    _memCache[key] = value;
    
    // 2. 异步落盘 (性能关键)
    wx.setStorage({
      key: key,
      data: value,
      fail: (err) => console.error(`【Cache】写入 ${key} 失败`, err)
    });
  },

  /**
   * 重新加载某个Key (用于特殊情况下的强制刷新)
   */
  reload(key) {
    _memCache[key] = wx.getStorageSync(key);
    return _memCache[key];
  }
};

module.exports = CacheManager;