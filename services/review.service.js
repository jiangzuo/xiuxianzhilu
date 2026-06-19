// services/review.service.js 修炼回顾服务
const Cache = require('../utils/cache-manager');
const AIService = require('./ai.service');
const UserService = require('./user.service');
const { SYSTEM_PROMPT } = require('../prompts/system.prompt');
const { REVIEW_PROMPT } = require('../prompts/skills/review.prompt');

// 防重复锁（内存锁）
let isGenerating = false;

// 最大记录数
const MAX_RECORDS = 2000;

// 页大小
const PAGE_SIZE = 50;

const ReviewService = {
  /**
   * 获取所有记录（修炼+突破+AI回顾），统一按时间倒序
   * @param {number} page 页码（从1开始）
   * @param {number} pageSize 每页数量
   * @returns {Array} 记录列表
   */
  getAllRecords(page = 1, pageSize = PAGE_SIZE) {
    const logs = wx.getStorageSync('practice_logs') || [];
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return logs.slice(start, end);
  },

  /**
   * 获取所有记录总数
   */
  getTotalCount() {
    const logs = wx.getStorageSync('practice_logs') || [];
    return logs.length;
  },

  /**
   * 是否有更多数据
   */
  hasMoreData(page = 1, pageSize = PAGE_SIZE) {
    const total = this.getTotalCount();
    return page * pageSize < total;
  },

  /**
   * 写入突破记录
   * @param {string} oldLevelName 旧境界名称
   * @param {string} newLevelName 新境界名称
   */
  addLevelUpRecord(oldLevelName, newLevelName) {
    const logs = wx.getStorageSync('practice_logs') || [];
    const newLog = {
      timestamp: Date.now(),
      type: 'levelup',
      oldLevelName: oldLevelName,
      newLevelName: newLevelName
    };
    logs.unshift(newLog);
    wx.setStorageSync('practice_logs', logs);
  },

  /**
   * 检查并生成 AI 回顾（本周首次进入时）
   * 内部有防重复锁机制
   * @param {Function} onComplete 完成回调
   */
  checkAndGenerateWeeklyReview(onComplete) {
    if (isGenerating) {
      console.log('[ReviewService] 正在生成中，跳过');
      if (onComplete) onComplete();
      return;
    }

    const now = Date.now();
    const currentWeekStart = this.getWeekStart(now);
    const lastWeekStart = wx.getStorageSync('lastWeeklyReviewWeekStart') || '';

    // 判断是否在同一周
    if (currentWeekStart === lastWeekStart && lastWeekStart !== '') {
      console.log('[ReviewService] 本周已生成过回顾，跳过');
      if (onComplete) onComplete();
      return;
    }

    // 准备"上周"数据
    // 【P2 修复】去掉"本周没有修炼记录则不发送 AI"的拦截
    // 原因：用户希望无修炼也调用 AI 总结，让 AI 引导/鼓励用户开始修炼
    //       当前 REVIEW_PROMPT 已包含"如果是第一天开始修炼，给予鼓励和引导"的逻辑
    //       → 即使 gongfaDetails 为空，buildReviewContent 会显示"暂无修炼记录"
    //       → AI 自然会输出鼓励性内容
    // 保留：周锁（lastWeeklyReviewWeekStart）防止同一周重复发送
    // 【P2 修复】数据范围改为"上周"（上周一 0 点 ~ 本周一 0 点）
    // 修复前拉"本周一以来的数据" → 周一触发时空空如也
    const weekData = this.getLastWeekPracticeData();

    isGenerating = true;
    console.log('[ReviewService] 开始生成 AI 回顾...', {
      practiceCount: weekData.practiceCount,
      totalExp: weekData.totalExp,
      weekRange: `${weekData.weekStart} ~ ${weekData.weekEnd}`
    });

    // 构建 AI 回顾内容（场景提示词）
    const reviewContent = this.buildReviewContent(weekData);

    // 构建消息：系统提示词 + 场景提示词
    // 先用用户档案数据替换 SYSTEM_PROMPT 中的占位符
    const userArchive = UserService.buildUserArchive();
    let systemContent = SYSTEM_PROMPT
      .replace('{hard_info_text}', userArchive.hard_info_text || '暂无')
      .replace('{recent_activity_log}', userArchive.recent_activity_log || '暂无')
      .replace('{practice_stats}', userArchive.practice_stats || '暂无')
      .replace('{soft_info_text}', userArchive.soft_info_text || '暂无')
      .replace('{rolling_summary}', userArchive.rolling_summary || '暂无');

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: reviewContent }
    ];

    // 调用 AI
    let aiResponse = '';
    AIService.sendMessageStream(
      messages,
      (chunk) => { aiResponse += chunk; },
      () => {
        // 完成
        isGenerating = false;
        this.saveAIReview(aiResponse, currentWeekStart, weekData);
        wx.setStorageSync('lastWeeklyReviewWeekStart', currentWeekStart);
        console.log('[ReviewService] AI 回顾生成完成');
        if (onComplete) onComplete();
      },
      (err) => {
        // 失败
        isGenerating = false;
        console.error('[ReviewService] AI 回顾生成失败', err);
        if (onComplete) onComplete();
      },
      0,
      { scene: 'review' }
    );
  },

  /**
   * 获取"上周"修炼数据
   * 【P2 修复】数据范围从"本周"改为"上周"
   * 原因（原 bug "时空悖论"）：
   *   修复前 getWeekPracticeData() 拉的是"本周一 0 点"以来的数据
   *   → 周一早上触发时本周还没数据，AI 总结为空
   *   → 等到周一中午用户练功一次，AI 总结的"本周"只有 1 条数据
   *   → 上周（周一到周日）的全部数据被忽略
   * 修复：拉【上周一 0 点, 本周一 0 点) 范围
   *       → 周一触发时正好总结上周完整一周的数据
   *       → 符合用户直觉
   * 【P2 修复】时区安全：用 +T00:00:00 强制本地时间解析
   * 原因（原 bug "UTC 时区炸弹"）：
   *   new Date("2026-06-08") 在 V8/JSCore 中按 ISO 8601 解析为 UTC 零点
   *   → 北京时区下 weekStartTime 比实际"周一 0 点"晚 8 小时
   *   → 周一 0:00-7:59 之间的记录全部被过滤
   * 修复：new Date(dateStr + "T00:00:00") 强制按本地时间解析
   */
  getLastWeekPracticeData() {
    const logs = wx.getStorageSync('practice_logs') || [];
    const lastWeekStartStr = this.getLastWeekStart(Date.now());
    const thisWeekStartStr = this.getWeekStart(Date.now());

    // 【P2 修复】加 T00:00:00 后缀，强制本地时间解析（修复 UTC 时区炸弹）
    const lastWeekStartTime = new Date(lastWeekStartStr + 'T00:00:00').getTime();
    const thisWeekStartTime = new Date(thisWeekStartStr + 'T00:00:00').getTime();

    // 筛选上周修炼记录：[上周一 0 点, 本周一 0 点)
    const weekLogs = logs.filter(log =>
      log.type === 'practice' &&
      log.timestamp >= lastWeekStartTime &&
      log.timestamp < thisWeekStartTime
    );

    // 统计总修为
    let totalExp = 0;
    const gongfaMap = {};

    weekLogs.forEach(log => {
      totalExp += (log.exp || 0);
      if (gongfaMap[log.action]) {
        gongfaMap[log.action].count++;
        gongfaMap[log.action].exp += (log.exp || 0);
      } else {
        gongfaMap[log.action] = {
          name: log.action,
          count: 1,
          exp: log.exp || 0
        };
      }
    });

    const gongfaDetails = Object.values(gongfaMap);

    return {
      totalExp,
      practiceCount: weekLogs.length,
      gongfaDetails,
      // 【P2 修复】返回周范围，便于调试和测试
      weekStart: lastWeekStartStr,
      weekEnd: thisWeekStartStr
    };
  },

  /**
   * 【已废弃】获取"本周"修炼数据
   * 保留此方法仅为向后兼容，新逻辑请使用 getLastWeekPracticeData()
   * @deprecated since 2026-06-13，请使用 getLastWeekPracticeData()
   */
  getWeekPracticeData() {
    console.warn('[ReviewService] getWeekPracticeData() 已废弃，请使用 getLastWeekPracticeData()');
    return this.getLastWeekPracticeData();
  },

  /**
   * 构建 AI 回顾内容（场景提示词）
   */
  buildReviewContent(weekData) {
    const practiceDetails = weekData.gongfaDetails
      .map(g => `${g.name} ${g.count}次 共${g.exp}点`)
      .join('\n');

    return REVIEW_PROMPT
      .replace('{totalExp}', weekData.totalExp)
      .replace('{practiceDetails}', practiceDetails || '暂无修炼记录');
  },

  /**
   * 保存 AI 回顾到日志
   */
  saveAIReview(content, weekStart, stats) {
    const logs = wx.getStorageSync('practice_logs') || [];
    const newLog = {
      timestamp: Date.now(),
      type: 'ai_review',
      content: content,
      weekStart: weekStart,
      stats: stats
    };
    logs.unshift(newLog);
    wx.setStorageSync('practice_logs', logs);
  },

  /**
   * 获取本周一日期字符串
   * 【P2 修复】时分秒必须归零，否则周一凌晨的修炼记录会漏算进"本周"
   * 原 bug：date.setDate(diff) 保留了原始时分秒，导致 weekStartTime 比周一 0 点晚 0-23 小时
   *        → 周一 0:00 - 9:59 之间的记录全部被过滤掉
   */
  getWeekStart(timestamp) {
    const date = new Date(timestamp);
    // 先把时分秒毫秒全归零（用 clone 避免修改原 date）
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    // 然后调整到本周一（周一为一周第一天，周日=0 时回退 6 天）
    const day = date.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  },

  /**
   * 获取"上周一"日期字符串
   * 【P2 新增】用于 AI 回顾的数据范围起点
   * 实现：本周一 - 7 天 = 上周一
   * 注意：用 +T00:00:00 解析保持本地时区（避免 UTC 偏移 8 小时）
   */
  getLastWeekStart(timestamp) {
    const thisWeekStartStr = this.getWeekStart(timestamp);
    // 解析本周一时间戳（本地时区）
    const thisWeekStartTime = new Date(thisWeekStartStr + 'T00:00:00').getTime();
    // 上周一 = 本周一 - 7 天
    const lastWeekStartTime = thisWeekStartTime - 7 * 24 * 3600 * 1000;
    const lastWeekStartDate = new Date(lastWeekStartTime);
    return `${lastWeekStartDate.getFullYear()}-${String(lastWeekStartDate.getMonth() + 1).padStart(2, '0')}-${String(lastWeekStartDate.getDate()).padStart(2, '0')}`;
  },

  /**
   * 清理超量数据
   */
  cleanOldRecords() {
    const logs = wx.getStorageSync('practice_logs') || [];
    if (logs.length > MAX_RECORDS) {
      const trimmedLogs = logs.slice(0, MAX_RECORDS);
      wx.setStorageSync('practice_logs', trimmedLogs);
      console.log(`[ReviewService] 已清理超量数据，保留 ${MAX_RECORDS} 条`);
    }
  }
};

module.exports = ReviewService;
