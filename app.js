// app.js (字体回调改造版)
const CacheManager = require('./utils/cache-manager');
const MemoryService = require('./services/memory.service');
const AIService = require('./services/ai.service');
// 【P2 新增】引入今日宜练服务并初始化事件订阅
// 初始化后，今日宜练会自动响应任何 doPractice() 调用（包括心魔修炼、签到等未来场景）
const DailyTaskService = require('./services/daily-task.service');

App({
  globalData: {
    fontLoaded: false,
    // 【修复】改用事件数组（pub-sub），避免单变量被覆盖或被 + 拼接为字符串
    fontCallbacks: []
  },

  /**
   * 【新增】对外的字体就绪监听 API
   * - 字体已就绪：立即同步执行回调
   * - 字体未就绪：推入数组，字体加载完成后统一触发
   * @param {Function} callback 字体就绪后要执行的回调
   */
  onFontReady(callback) {
    if (typeof callback !== 'function') return;
    if (this.globalData.fontLoaded) {
      try { callback(); } catch (e) { console.error('【onFontReady】同步执行回调失败', e); }
    } else {
      this.globalData.fontCallbacks.push(callback);
    }
  },

  /**
   * 【新增】内部方法：触发所有已注册的字体就绪回调
   * 先清空数组再触发，避免回调内部再次注册时出现重复触发
   */
  _triggerFontCallbacks() {
    const callbacks = this.globalData.fontCallbacks;
    // 先清空，再触发。防止某个回调内部再调用 onFontReady 导致重复入队
    this.globalData.fontCallbacks = [];
    callbacks.forEach(cb => {
      try { cb(); } catch (e) { console.error('【onFontReady】回调执行失败', e); }
    });
  },

  onLaunch() {
    // 1. 【核心新增】初始化内存缓存
    // 必须在 App 启动最开始调用，确保后续页面能直接从内存读取数据
    CacheManager.init();

    // 2. 记录登录时间
    this.recordLoginDate();

    // 3. 加载自定义字体
    this.loadCustomFont();

    // 4. 【P2 新增】初始化事件订阅
    //    今日宜练订阅 'practice.completed'，让任何 doPractice() 调用都能联动
    DailyTaskService.init();
  },

  recordLoginDate() {
    const today = new Date().toDateString();
    const lastLoginDate = wx.getStorageSync('lastLoginDate');
    if (lastLoginDate !== today) {
      wx.setStorageSync('lastLoginDate', today);
    }
  },


  loadCustomFont() {
    const that = this;
    console.log('【app.js】: 开始从 Base64 数据直接加载字体...');

    require.async('pkg_assets/font-data.js')
      .then(module => {
        const fontBase64 = module.fontBase64;

        // 容错：如果 font-data.js 文件为空，或者内容格式不对，这里会出错
        if (!fontBase64 || typeof fontBase64 !== 'string') {
            console.error('【app.js】: fontBase64 数据异常，请检查 pkg_assets/font-data.js 文件内容。');
            // 标记为已完成 + 触发所有回调（即使字体未真正加载，页面也能继续走流程，避免卡死）
            that.globalData.fontLoaded = true;
            that._triggerFontCallbacks();
            return;
        }

        const fontSrc = `data:font/truetype;base64,${fontBase64}`;

        wx.loadFontFace({
          family: 'LishuFont',
          source: `url("${fontSrc}")`,
          global: true,
          success: () => {
            console.log('【app.js】: 字体分包加载成功！');
            // 顺序：先标记 fontLoaded，再触发回调
            // 这样回调内如果再调用 onFontReady，会走"立即执行"分支而非重复入队
            that.globalData.fontLoaded = true;
            that._triggerFontCallbacks();
          },
          fail: (err) => {
            console.error('【app.js】: loadFontFace 失败', err);
            that.globalData.fontLoaded = true;
            that._triggerFontCallbacks();
          }
        });
      })
      .catch(err => {
        console.error('【app.js】: 异步加载字体分包失败', err);
        // 标记为已完成 + 触发所有回调，防止 Splash 页卡住
        that.globalData.fontLoaded = true;
        that._triggerFontCallbacks();
      });
  }
})