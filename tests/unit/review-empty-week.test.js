// tests/unit/review-empty-week.test.js
// 验证：上周无修炼记录时也调用 AI 总结（保留用户要求的"无修炼也发 AI"逻辑）
//
// 修复背景：
//   review.service.js 原代码检查 weekData.practiceCount === 0 时直接 return
//   → 用户上周没练功就没有 AI 鼓励
//   用户要求："如果用户最近修炼记录为空，也进行发送"
//   修复后：去掉拦截逻辑，practiceCount === 0 也调用 AI
//           → buildReviewContent 中显示"暂无修炼记录"
//           → AI 根据 prompt 中"如果是第一天开始修炼，给予鼓励和引导"输出鼓励内容
//
// 【2026-06-13 P2 修复】数据范围改为"上周"：
//   修复前：getWeekPracticeData() 拉"本周一 0 点"以来
//   修复后：getLastWeekPracticeData() 拉【上周一 0 点, 本周一 0 点)
//   → "无修炼也发 AI"的语义仍然保留，只是数据窗口变为上周

const mockCache = {};
let mockPracticeLogs = [];
let mockAIServiceCalls = [];

// 模拟"今天是 2026-06-15 周一 10:00"（北京时区）
const MOCK_NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => mockCache[key] || null),
  set: jest.fn((key, value) => { mockCache[key] = value; }),
  remove: jest.fn((key) => { delete mockCache[key]; })
}));

global.wx = {
  getStorageSync: jest.fn((key) => {
    if (key === 'practice_logs') return mockPracticeLogs;
    return mockCache[key] || null;
  }),
  setStorageSync: jest.fn((key, value) => {
    if (key === 'practice_logs') mockPracticeLogs = value;
    else mockCache[key] = value;
  }),
  removeStorageSync: jest.fn((key) => { delete mockCache[key]; })
});

// Mock Date 固定到周一 10:00
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(MOCK_NOW);
    } else {
      super(...args);
    }
  }
  static now() {
    return MOCK_NOW;
  }
};

jest.mock('../../services/ai.service', () => ({
  sendMessageStream: jest.fn((messages, onStream, onFinish, onError) => {
    mockAIServiceCalls.push({ messages });
    setImmediate(() => {
      if (onFinish) onFinish();
    });
  })
}));

jest.mock('../../services/user.service', () => ({
  buildUserArchive: () => ({
    hard_info_text: '主人',
    recent_activity_log: '近期暂无修炼。',
    practice_stats: '总修为 0 点',
    soft_info_text: '性格坚韧',
    rolling_summary: '尚无'
  })
}));

const AIService = require('../../services/ai.service');
const ReviewService = require('../../services/review.service');

beforeEach(() => {
  Object.keys(mockCache).forEach(k => delete mockCache[k]);
  mockPracticeLogs = [];
  mockAIServiceCalls = [];
  jest.clearAllMocks();
});

afterAll(() => {
  global.Date = RealDate;
});

describe('【保留逻辑】上周无修炼也发 AI 总结', () => {
  test('上周无记录时仍调用 AIService.sendMessageStream', async () => {
    // 上周完全没练功
    mockPracticeLogs = [];

    const onComplete = jest.fn();
    ReviewService.checkAndGenerateWeeklyReview(onComplete);

    await new Promise(resolve => setImmediate(resolve));

    // 关键断言：practiceCount=0 仍调用 AI
    expect(AIService.sendMessageStream).toHaveBeenCalled();
    expect(mockAIServiceCalls.length).toBe(1);
    expect(onComplete).toHaveBeenCalled();
  });

  test('上周无记录时 prompt 中显示"暂无修炼记录"', async () => {
    mockPracticeLogs = [];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    expect(mockAIServiceCalls.length).toBe(1);
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('暂无修炼记录');
    expect(userMsg.content).toContain('0');
  });

  test('上周 3 条记录：AIService 正常调用，prompt 显示明细', async () => {
    const lastWeekMonday = new Date(2026, 5, 8, 10, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekMonday, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 86400000, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 2 * 86400000, type: 'practice', action: '冥想', exp: 3 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    expect(mockAIServiceCalls.length).toBe(1);
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
    expect(userMsg.content).toContain('冥想');
    expect(userMsg.content).toContain('13');  // 5+5+3
  });

  test('3 周前的记录不属于"上周"范围', async () => {
    // 3 周前的记录 → 不在"上周"（上周一~本周一）范围内
    const threeWeeksAgo = MOCK_NOW - 21 * 86400000;
    mockPracticeLogs = [
      { timestamp: threeWeeksAgo, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 3 周前的记录不在上周范围 → prompt 显示"暂无修炼记录"
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('暂无修炼记录');
  });
});

describe('【回归】周锁 + 内存锁', () => {
  test('【回归】同一周重复触发仍被周锁拦截（无 AI 调用）', async () => {
    mockPracticeLogs = [];
    // 模拟本周一已生成过回顾
    mockCache['lastWeeklyReviewWeekStart'] = ReviewService.getWeekStart(MOCK_NOW);

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 周锁：本周一已生成过 → 跳过 AI
    expect(AIService.sendMessageStream).not.toHaveBeenCalled();
  });

  test('【回归】内存锁：isGenerating=true 时跳过', async () => {
    mockPracticeLogs = [];

    // 第一次调用（同步开始，AI 推演异步进行中）
    ReviewService.checkAndGenerateWeeklyReview();

    // 立即第二次调用（isGenerating 仍为 true）
    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 内存锁：第二次调用应被拦截，只调用一次 AI
    expect(AIService.sendMessageStream).toHaveBeenCalledTimes(1);
  });
});
