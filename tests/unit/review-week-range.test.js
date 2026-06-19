// tests/unit/review-week-range.test.js
// 验证两个 P2 修复：
//   1. 时空悖论：AI 总结范围改为【上周一 0 点, 本周一 0 点)
//   2. UTC 时区炸弹：用 +T00:00:00 强制本地时间解析
//
// 场景：今天是周一，用户在"上周"练功了 5 天
// 修复前：AI 总结只看"本周一 0 点"以来 → 0 条记录 → 总结为空
//         或者用户周一中午练功一次 → AI 总结只有 1 条
// 修复后：AI 总结上周完整 5 天数据
//
// 场景：用户在周一凌晨 0-8 点练功（北京时区）
// 修复前：new Date("2026-06-08") 解析为 UTC 零点
//         → 北京时区下 weekStartTime 比实际周一 0 点晚 8 小时
//         → 周一 0-8 点的记录被过滤
// 修复后：+T00:00:00 强制本地解析 → 周一 0-8 点的记录被包含

const mockCache = {};
let mockPracticeLogs = [];
let mockAIServiceCalls = [];

// 模拟"今天是 2026-06-15 周一 10:00"（北京时区）
// 这样的设定：
//   本周一 = 2026-06-15
//   上周一 = 2026-06-08
//   上周范围 = [2026-06-08 00:00, 2026-06-15 00:00)（北京时区）
const MOCK_NOW = new Date(2026, 5, 15, 10, 0, 0).getTime();

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => mockCache[key] || null),
  set: jest.fn((key, value) => { mockCache[key] = value; }),
  remove: jest.fn((key) => { delete mockCache[key] })
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
  removeStorageSync: jest.fn((key) => { delete mockCache[key] })
};

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

describe('问题 1 修复：AI 总结上周完整数据', () => {
  test('上周练功 5 天的数据应全部包含在 AI 总结中', async () => {
    // 上周一 10:00 到上周日 22:00 都有练功
    const oneDay = 86400000;
    const lastWeekMonday = new Date(2026, 5, 8, 10, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekMonday, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 1 * oneDay, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 2 * oneDay, type: 'practice', action: '冥想', exp: 3 },
      { timestamp: lastWeekMonday + 3 * oneDay, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 4 * oneDay, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    expect(mockAIServiceCalls.length).toBe(1);
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');

    // 上周 5 条记录应全部包含
    expect(userMsg.content).toContain('吐纳');
    expect(userMsg.content).toContain('冥想');
    expect(userMsg.content).toContain('23');  // 5+5+5+5+3
  });

  test('修复前 bug 场景：上周的记录在修复前会被忽略', async () => {
    // 上周日练功一次
    const lastWeekSunday = new Date(2026, 5, 14, 15, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekSunday, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 修复后：上周日的记录应被包含
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
    expect(userMsg.content).not.toContain('暂无修炼记录');
  });

  test('本周一的记录不应包含（边界是 [上周一, 本周一)）', async () => {
    // 本周一 0:00 整点练功（边界外）
    const thisMonday = new Date(2026, 5, 15, 0, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: thisMonday, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 本周一的记录不应包含
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('暂无修炼记录');
  });

  test('上周日的 23:59 记录应包含（边界内）', async () => {
    // 上周日 23:59 练功
    const lastWeekSundayLateNight = new Date(2026, 5, 14, 23, 59, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekSundayLateNight, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
  });
});

describe('问题 2 修复：UTC 时区炸弹（+T00:00:00 强制本地解析）', () => {
  test('周一凌晨 6:00（本地）打卡应被包含（修复前会被过滤）', async () => {
    // 上周一 6:00 北京时间练功
    // 修复前：new Date("2026-06-08") 解析为 UTC 0:00 = 北京 8:00
    //         → 北京 6:00 的 timestamp < weekStartTime → 被过滤
    // 修复后：+T00:00:00 强制本地 0:00 → 北京 6:00 包含
    const lastWeekMonday6am = new Date(2026, 5, 8, 6, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekMonday6am, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    // 验证调用了 AI
    expect(mockAIServiceCalls.length).toBe(1);
    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
    expect(userMsg.content).not.toContain('暂无修炼记录');
  });

  test('周一凌晨 0:01 打卡应被包含（边界检查）', async () => {
    // 上周一 0:01 北京时间
    const lastWeekMonday0_01am = new Date(2026, 5, 8, 0, 1, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekMonday0_01am, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
  });

  test('上周日 23:59:59 打卡应被包含（边界内）', async () => {
    // 上周日 23:59:59 北京时间
    const lastWeekSundayEnd = new Date(2026, 5, 14, 23, 59, 59).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekSundayEnd, type: 'practice', action: '吐纳', exp: 5 }
    ];

    ReviewService.checkAndGenerateWeeklyReview();

    await new Promise(resolve => setImmediate(resolve));

    const userMsg = mockAIServiceCalls[0].messages.find(m => m.role === 'user');
    expect(userMsg.content).toContain('吐纳');
  });
});

describe('getLastWeekStart 计算正确性', () => {
  test('周一调用：上周一 = 本周一 - 7 天', () => {
    // 今天 2026-06-15（周一）→ 上周一 = 2026-06-08
    expect(ReviewService.getLastWeekStart(MOCK_NOW)).toBe('2026-06-08');
  });

  test('周三调用：上周一仍是上周一', () => {
    const wedNoon = new Date(2026, 5, 17, 12, 0, 0).getTime();
    // 2026-06-17 周三 → 本周一 2026-06-15 → 上周一 2026-06-08
    expect(ReviewService.getLastWeekStart(wedNoon)).toBe('2026-06-08');
  });

  test('周日调用：上周一仍是上周一', () => {
    const sunNoon = new Date(2026, 5, 21, 12, 0, 0).getTime();
    // 2026-06-21 周日 → 本周一 2026-06-15 → 上周一 2026-06-08
    expect(ReviewService.getLastWeekStart(sunNoon)).toBe('2026-06-08');
  });

  test('跨月：6 月最后一周的周三 → 上周一在 6 月', () => {
    // 2026-07-01 是周三 → 本周一 2026-06-29 → 上周一 2026-06-22
    const firstJulyWed = new Date(2026, 6, 1, 12, 0, 0).getTime();
    expect(ReviewService.getLastWeekStart(firstJulyWed)).toBe('2026-06-22');
  });

  test('跨年：1 月第一周的周三 → 上周一在去年 12 月', () => {
    // 2027-01-06 是周三 → 本周一 2027-01-04 → 上周一 2026-12-28
    const firstJanWed = new Date(2027, 0, 6, 12, 0, 0).getTime();
    expect(ReviewService.getLastWeekStart(firstJanWed)).toBe('2026-12-28');
  });
});

describe('getLastWeekPracticeData 返回值完整性', () => {
  test('返回 weekStart 和 weekEnd 字段', () => {
    const data = ReviewService.getLastWeekPracticeData();
    expect(data.weekStart).toBe('2026-06-08');
    expect(data.weekEnd).toBe('2026-06-15');
  });

  test('上周 0 条记录：practiceCount=0, totalExp=0', () => {
    mockPracticeLogs = [];
    const data = ReviewService.getLastWeekPracticeData();
    expect(data.practiceCount).toBe(0);
    expect(data.totalExp).toBe(0);
    expect(data.gongfaDetails).toEqual([]);
  });

  test('上周 3 条记录：practiceCount=3, 按 action 聚合', () => {
    const lastWeekMonday = new Date(2026, 5, 8, 10, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: lastWeekMonday, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 86400000, type: 'practice', action: '吐纳', exp: 5 },
      { timestamp: lastWeekMonday + 2 * 86400000, type: 'practice', action: '冥想', exp: 3 }
    ];
    const data = ReviewService.getLastWeekPracticeData();
    expect(data.practiceCount).toBe(3);
    expect(data.totalExp).toBe(13);

    const tuNa = data.gongfaDetails.find(g => g.name === '吐纳');
    expect(tuNa.count).toBe(2);
    expect(tuNa.exp).toBe(10);

    const mingXiang = data.gongfaDetails.find(g => g.name === '冥想');
    expect(mingXiang.count).toBe(1);
    expect(mingXiang.exp).toBe(3);
  });
});

describe('【回归】getWeekStart 时分秒归零仍然正确', () => {
  test('不同时刻调用 getLastWeekStart 返回相同结果', () => {
    const mon0am = new Date(2026, 5, 15, 0, 0, 0).getTime();
    const monNoon = new Date(2026, 5, 15, 12, 0, 0).getTime();
    const mon11pm = new Date(2026, 5, 15, 23, 59, 59).getTime();

    expect(ReviewService.getLastWeekStart(mon0am)).toBe('2026-06-08');
    expect(ReviewService.getLastWeekStart(monNoon)).toBe('2026-06-08');
    expect(ReviewService.getLastWeekStart(mon11pm)).toBe('2026-06-08');
  });
});
