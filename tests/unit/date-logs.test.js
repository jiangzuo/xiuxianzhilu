// tests/unit/date-logs.test.js
// 验证三个时间相关修复：
//   1. user.service.js 渲染"近期机缘"时过滤 type === 'practice'（修复《undefined》）
//   2. practice.service.js getRecentLogsInDays() 只返回最近 N 天
//   3. review.service.js getWeekStart() 时分秒归零（修复周一凌晨漏算）

// 通用 mock：缓存层
const mockCache = {};
jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => mockCache[key] || null),
  set: jest.fn((key, value) => { mockCache[key] = value; }),
  remove: jest.fn((key) => { delete mockCache[key]; })
}));

// mock 一个简单的 practiceLogs 存储
let mockPracticeLogs = [];
global.wx = {
  getStorageSync: jest.fn((key) => {
    if (key === 'practice_logs') return mockPracticeLogs;
    if (key === 'userProfile') return mockCache['userProfile'] || null;
    return mockCache[key] || null;
  }),
  setStorageSync: jest.fn((key, value) => {
    if (key === 'practice_logs') mockPracticeLogs = value;
    else mockCache[key] = value;
  }),
  removeStorageSync: jest.fn((key) => { delete mockCache[key]; })
};

const UserService = require('../../services/user.service');
const ReviewService = require('../../services/review.service');

beforeEach(() => {
  // 清理 mock 状态
  Object.keys(mockCache).forEach(k => delete mockCache[k]);
  mockPracticeLogs = [];
  jest.clearAllMocks();
});

describe('getWeekStart 时分秒归零（P2 Bug 修复）', () => {
  test('周三 10:00 应返回本周一（日期正确）', () => {
    // 2026-06-10 是周三
    const wed = new Date(2026, 5, 10, 10, 0, 0).getTime();
    expect(ReviewService.getWeekStart(wed)).toBe('2026-06-08');
  });

  test('周日 10:00 应返回本周一（前推 6 天）', () => {
    // 2026-06-14 是周日
    const sun = new Date(2026, 5, 14, 10, 0, 0).getTime();
    expect(ReviewService.getWeekStart(sun)).toBe('2026-06-08');
  });

  test('周一 0:00 整点应返回当天', () => {
    const mon = new Date(2026, 5, 8, 0, 0, 0).getTime();
    expect(ReviewService.getWeekStart(mon)).toBe('2026-06-08');
  });

  test('周一 5:00 应返回当天（不再回退一天）', () => {
    // 【P2 修复】原 bug：时分秒没归零，周一早上返回的 monday 可能是上周日的某个时间
    // 修复后：周一 0-23 任意时刻，都应返回本周一 0 点的日期字符串
    const monEarly = new Date(2026, 5, 8, 5, 30, 0).getTime();
    expect(ReviewService.getWeekStart(monEarly)).toBe('2026-06-08');
  });

  test('不修改入参的 Date 对象（无副作用）', () => {
    const date = new Date(2026, 5, 10, 10, 0, 0);
    const originalTs = date.getTime();
    ReviewService.getWeekStart(date.getTime());
    expect(date.getTime()).toBe(originalTs);  // 入参 date 不应被污染
  });
});

describe('getRecentLogsInDays 时间窗口过滤', () => {
  // 引入 practice.service（在 mock 之后）
  const practiceService = require('../../services/practice.service');

  test('返回 7 天内的记录（按今天 0 点对齐）', () => {
    // 假设今天是 2026-06-13
    const realDateNow = Date.now;
    const realDate = Date;
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) {
          return new realDate(2026, 5, 13, 14, 0, 0);
        }
        return new realDate(...args);
      }
      static now() {
        return new realDate(2026, 5, 13, 14, 0, 0).getTime();
      }
    };

    // 写入 10 条历史记录：3 条在 7 天内，7 条在 7 天外
    const oneDay = 86400000;
    const now = new realDate(2026, 5, 13, 14, 0, 0).getTime();
    mockPracticeLogs = [
      { timestamp: now, type: 'practice', action: '今天练功', exp: 5 },
      { timestamp: now - 2 * oneDay, type: 'practice', action: '前天', exp: 5 },
      { timestamp: now - 6 * oneDay, type: 'practice', action: '6天前', exp: 5 },
      { timestamp: now - 7 * oneDay, type: 'practice', action: '7天前', exp: 5 },  // 7 天整应该不算
      { timestamp: now - 8 * oneDay, type: 'practice', action: '8天前', exp: 5 },
      { timestamp: now - 30 * oneDay, type: 'practice', action: '30天前', exp: 5 }
    ];

    const logs = practiceService.getRecentLogsInDays(7, 30);
    // 起点：今天 0 点 - 6 天 = 7 个日历日
    // 包含：今天、前天、6天前；7天整（now - 7*day）应该是 0 点时间戳，恰好 >= 起点，应包含
    // 8天前和 30天前应排除
    const actions = logs.map(l => l.action);
    expect(actions).toContain('今天练功');
    expect(actions).toContain('前天');
    expect(actions).toContain('6天前');
    expect(actions).not.toContain('8天前');
    expect(actions).not.toContain('30天前');

    global.Date = realDate;
    global.Date.now = realDateNow;
  });

  test('limit 参数生效', () => {
    const realDate = Date;
    const oneDay = 86400000;
    const now = new realDate(2026, 5, 13, 14, 0, 0).getTime();
    mockPracticeLogs = Array.from({ length: 50 }, (_, i) => ({
      timestamp: now - i * 1000,  // 每秒一条，都在 7 天内
      type: 'practice',
      action: `练功${i}`,
      exp: 5
    }));

    const logs = practiceService.getRecentLogsInDays(7, 10);
    expect(logs.length).toBe(10);
  });
});

describe('buildUserArchive 过滤 type === practice（P2 Bug 修复：消除《undefined》）', () => {
  test('只取 type === "practice" 的记录', () => {
    // 准备 4 条异构日志
    const oneDay = 86400000;
    const now = Date.now();
    mockPracticeLogs = [
      { timestamp: now, type: 'practice', action: '散步', exp: 10 },
      { timestamp: now - 1000, type: 'levelup', oldLevelName: '凡人', newLevelName: '练气' },
      { timestamp: now - 2000, type: 'ai_review', content: '本周回顾...' },
      { timestamp: now - 3000, type: 'practice', action: '冥想', exp: 5 }
    ];
    // 初始化 userProfile（避免 buildUserArchive 走到 joinDate 计算异常）
    mockCache['userProfile'] = { nickName: '主人', joinDate: now - 7 * oneDay };
    mockCache['deepMemory'] = { basic: {}, goals: [], interests: [], difficulties: [], summary: '' };

    const archive = UserService.buildUserArchive();

    // 关键断言：recent_activity_log 中不应该出现《undefined》
    expect(archive.recent_activity_log).not.toMatch(/《undefined》/);
    expect(archive.recent_activity_log).not.toMatch(/修为\+undefined/);

    // 应该只出现 practice 类型的 action
    expect(archive.recent_activity_log).toMatch(/《散步》/);
    expect(archive.recent_activity_log).toMatch(/《冥想》/);
    // 不应该出现 levelup / ai_review 的内容
    expect(archive.recent_activity_log).not.toMatch(/凡人/);
    expect(archive.recent_activity_log).not.toMatch(/本周回顾/);

    // 应该只渲染 2 条（practice 类型）
    const lines = archive.recent_activity_log.split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(2);
  });

  test('当没有任何 practice 记录时显示"近期暂无修炼"', () => {
    mockPracticeLogs = [
      { timestamp: Date.now(), type: 'levelup', oldLevelName: '凡人', newLevelName: '练气' }
    ];
    mockCache['userProfile'] = { nickName: '主人', joinDate: Date.now() - 7 * 86400000 };
    mockCache['deepMemory'] = { basic: {}, goals: [], interests: [], difficulties: [], summary: '' };

    const archive = UserService.buildUserArchive();
    expect(archive.recent_activity_log).toBe('近期暂无修炼。');
  });

  test('7 天窗口生效：8 天前的记录不显示', () => {
    const oneDay = 86400000;
    const now = Date.now();
    mockPracticeLogs = [
      { timestamp: now, type: 'practice', action: '今天练功', exp: 5 },
      { timestamp: now - 8 * oneDay, type: 'practice', action: '8天前练功', exp: 5 }
    ];
    mockCache['userProfile'] = { nickName: '主人', joinDate: now - 30 * oneDay };
    mockCache['deepMemory'] = { basic: {}, goals: [], interests: [], difficulties: [], summary: '' };

    const archive = UserService.buildUserArchive();
    expect(archive.recent_activity_log).toMatch(/今天练功/);
    expect(archive.recent_activity_log).not.toMatch(/8天前练功/);
  });
});
