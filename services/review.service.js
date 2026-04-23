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

    // 检查本周是否有修炼记录，如果没有则不发送 AI
    const weekData = this.getWeekPracticeData();
    if (weekData.practiceCount === 0) {
      console.log('[ReviewService] 本周没有修炼记录，跳过 AI 回顾');
      if (onComplete) onComplete();
      return;
    }

    isGenerating = true;
    console.log('[ReviewService] 开始生成 AI 回顾...');

    // 准备本周数据
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
      }
    );
  },

  /**
   * 获取本周修炼数据
   */
  getWeekPracticeData() {
    const logs = wx.getStorageSync('practice_logs') || [];
    const weekStart = this.getWeekStart(Date.now());
    const weekStartTime = new Date(weekStart).getTime();

    // 筛选本周修炼记录
    const weekLogs = logs.filter(log => 
      log.type === 'practice' && log.timestamp >= weekStartTime
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
      gongfaDetails
    };
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
   */
  getWeekStart(timestamp) {
    const date = new Date(timestamp);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
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
