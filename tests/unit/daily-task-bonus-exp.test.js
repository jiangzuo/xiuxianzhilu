// tests/unit/daily-task-bonus-exp.test.js
// 验证 DailyTaskService.getBonusExp() 的修为加成逻辑
//
// 修复背景：
//   痛点：聊天页心魔修炼完成时，修为没有像修炼场那样翻倍
//   原因：heart-demon.service.js complete() 直接调 doPractice(gongfaId, 'mind')
//         没有传 finalExp，也没有"是否今日宜练"的判断
//   修复：抽离 getBonusExp(gongfaId, baseExp) 集中管理修为加成
//         修炼场 + 聊天页心魔都走同一份逻辑
//
// 测试覆盖：
//   1. 匹配今日宜练 + 未完成 → 翻倍
//   2. 匹配今日宜练 + 已完成 → 不翻倍
//   3. 不匹配今日宜练 → 不翻倍
//   4. 无 dailyTask → 不翻倍
//   5. baseExp 为 0 → 返回 0
//   6. baseExp 为 undefined/null → 安全返回 0
//   7. 状态变化后的多次调用结果正确
//   8. 集成：doPractice 实际写入的修为是翻倍后的

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

let mockCache = {};

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => mockCache[key] || null),
  set: jest.fn((key, value) => { mockCache[key] = value; })
}));

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn(),
  getContextForAI: jest.fn(() => [])
}));

jest.mock('../../services/memory.service', () => ({
  buildSystemMessage: () => ({ content: 'system' })
}));

jest.mock('../../prompts/skills/daily-task', () => ({
  buildDailyTaskRecommendPrompt: () => 'rp',
  buildDailyTaskCompletePrompt: () => 'cp'
}));

global.wx = {
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn()
};

const DailyTaskService = require('../../services/daily-task.service');
const EventBus = require('../../utils/event-bus');
const AIService = require('../../services/ai.service');

beforeEach(() => {
  mockCache = {};
  EventBus.clear();
  DailyTaskService._initialized = false;
  jest.clearAllMocks();
  const CacheManager = require('../../utils/cache-manager');
  CacheManager.get.mockImplementation((key) => mockCache[key] || null);
  CacheManager.set.mockImplementation((key, value) => { mockCache[key] = value; });
  // 阻止 AIService.sendMessageStream 真实调用 wx.request
  jest.spyOn(AIService, 'sendMessageStream').mockImplementation(() => {});
});

describe('【P2 新增】getBonusExp 修为加成', () => {
  test('匹配今日宜练 + 未完成 → 修为翻倍', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('g2', 10)).toBe(20);
  });

  test('匹配今日宜练 + 已完成 → 不翻倍', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: true
    };
    expect(DailyTaskService.getBonusExp('g2', 10)).toBe(10);
  });

  test('不匹配今日宜练 → 不翻倍', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('other-id', 10)).toBe(10);
  });

  test('无 dailyTask 缓存 → 不抛错且不翻倍', () => {
    // mockCache 为空
    expect(DailyTaskService.getBonusExp('any-id', 10)).toBe(10);
  });

  test('baseExp 为 0 → 返回 0（不变成 NaN）', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('g2', 0)).toBe(0);
  });

  test('baseExp 为 undefined → 安全返回 0', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('g2', undefined)).toBe(0);
  });

  test('baseExp 为 null → 安全返回 0', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('g2', null)).toBe(0);
  });

  test('修为值非整数（5.5）也正确翻倍', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    expect(DailyTaskService.getBonusExp('g2', 5.5)).toBe(11);
  });

  test('状态变化后的多次调用结果正确', () => {
    // 第一次：未完成 → 翻倍
    mockCache['dailyTask'] = { gongfaId: 'g2', completed: false };
    expect(DailyTaskService.getBonusExp('g2', 10)).toBe(20);

    // 标记为完成
    mockCache['dailyTask'] = { gongfaId: 'g2', completed: true };
    expect(DailyTaskService.getBonusExp('g2', 10)).toBe(10);

    // 清空任务
    mockCache['dailyTask'] = null;
    expect(DailyTaskService.getBonusExp('g2', 10)).toBe(10);
  });

  test('纯查询，不修改任何状态', () => {
    mockCache['dailyTask'] = { gongfaId: 'g2', completed: false };
    const before = JSON.stringify(mockCache['dailyTask']);
    DailyTaskService.getBonusExp('g2', 10);
    const after = JSON.stringify(mockCache['dailyTask']);
    expect(after).toBe(before);
  });
});

describe('【P2 新增】getBonusExp 集成验证：doPractice 实际写入翻倍修为', () => {
  test('practiceService.doPractice 接收 getBonusExp 后的值会写入翻倍 log', () => {
    mockCache['dailyTask'] = { gongfaId: 'g1', gongfaName: '吐纳', completed: false };
    mockCache['userpractices'] = {
      body: [
        { id: 'g1', name: '吐纳', exp: 5, count: 0, totalExpEarned: 0, status: 'active' }
      ],
      mind: [], skill: [], wealth: []
    };

    const practiceService = require('../../services/practice.service');
    const baseExp = 5;
    const finalExp = DailyTaskService.getBonusExp('g1', baseExp);

    expect(finalExp).toBe(10); // 5 * 2

    // 模拟 storage 写入
    const logStorage = [];
    global.wx.getStorageSync.mockImplementation((key) => {
      if (key === 'practice_logs') return logStorage;
      return null;
    });
    global.wx.setStorageSync.mockImplementation((key, value) => {
      if (key === 'practice_logs') {
        // 模拟 storage 行为：写入到 logStorage
        const newLog = value[value.length - 1];
        logStorage.push(newLog);
      }
    });

    const result = practiceService.doPractice('g1', 'body', finalExp);

    expect(result.success).toBe(true);
    // 修为确实按 10 写入
    expect(mockCache['userpractices'].body[0].totalExpEarned).toBe(10);
  });

  test('完成今日宜练后再次调用 getBonusExp 返回原值（不翻倍）', () => {
    mockCache['dailyTask'] = { gongfaId: 'g1', gongfaName: '吐纳', completed: false };

    // 第一次：翻倍
    expect(DailyTaskService.getBonusExp('g1', 5)).toBe(10);

    // 模拟完成事件
    DailyTaskService.triggerPracticeReaction('g1', '吐纳', 10, 'body');
    // 手动更新 dailyTask.completed（因为 triggerPracticeReaction 内部已 set）
    expect(mockCache['dailyTask'].completed).toBe(true);

    // 第二次：不翻倍
    expect(DailyTaskService.getBonusExp('g1', 5)).toBe(5);
  });
});
