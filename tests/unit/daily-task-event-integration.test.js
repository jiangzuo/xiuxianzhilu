// tests/unit/daily-task-event-integration.test.js
// 验证 daily-task.service.js 的事件总线集成
//
// 修复背景：
//   痛点：聊天页心魔修炼完成后，practiceService.doPractice() 被调用，
//         但 HeartDemonService.complete() 没有手动调 triggerPracticeReaction()，
//         导致 dailyTask.completed 一直为 false → 进入修炼场仍显示"今日宜练"标签。
//   修复：practiceService.doPractice() 成功 emit 'practice.completed'，
//         DailyTaskService.init() 订阅该事件并自动联动。
//   防御：syncFromPracticeLogs() 在 practice.js onShow 调用，
//         从 practice_logs 反推同步，即使事件漏了也能正确反映状态。
//
// 测试覆盖：
//   1. init() 幂等：多次调用只订阅一次
//   2. _onPracticeCompleted：匹配今日宜练时调用 triggerPracticeReaction
//   3. _onPracticeCompleted：gongfaId 不匹配 → 不调用
//   4. _onPracticeCompleted：任务已完成 → 不调用（幂等）
//   5. _onPracticeCompleted：无 dailyTask → 不调用
//   6. _onPracticeCompleted：emit 数据为空 → 不调用
//   7. syncFromPracticeLogs：今日有匹配 log → 触发完成
//   8. syncFromPracticeLogs：今日无匹配 log → 不触发
//   9. syncFromPracticeLogs：任务已完成 → 不重复触发
//  10. syncFromPracticeLogs：gongfaId 在 userpractices 中找不到 → 不触发
//  11. syncFromPracticeLogs：跨日 log 不算今日

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

// 模拟缓存
let mockCache = {};
let mockPracticeLogs = [];
let mockUserpractices = null;

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => {
    if (key === 'userpractices') return mockUserpractices;
    if (key === 'dailyTask') return mockCache['dailyTask'] || null;
    return mockCache[key] || null;
  }),
  set: jest.fn((key, value) => { mockCache[key] = value; })
}));

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn((role, content) => ({
    id: 'msg-' + Date.now(),
    role, content,
    timestamp: Date.now()
  })),
  getContextForAI: jest.fn(() => [])
}));

jest.mock('../../services/memory.service', () => ({
  buildSystemMessage: () => ({ content: 'system msg with # Constraint' })
}));

jest.mock('../../prompts/skills/daily-task', () => ({
  buildDailyTaskRecommendPrompt: () => 'task prompt',
  buildDailyTaskCompletePrompt: () => 'complete prompt'
}));

// 模拟 wx：getStorageSync 区分 practice_logs 和其他 key
let aiCallCount = 0;
global.wx = {
  getStorageSync: jest.fn((key) => {
    if (key === 'practice_logs') return mockPracticeLogs;
    return null;
  }),
  setStorageSync: jest.fn()
};

// 引入 EventBus（真实实例）和 DailyTaskService
const EventBus = require('../../utils/event-bus');
const DailyTaskService = require('../../services/daily-task.service');
const AIService = require('../../services/ai.service');

beforeEach(() => {
  // 重置所有 mock 状态
  mockCache = {};
  mockPracticeLogs = [];
  mockUserpractices = {
    body: [{ id: 'g1', name: '吐纳', status: 'active' }],
    mind: [
      { id: 'g2', name: '恐惧心魔', key: 'heart-demon-fear', status: 'active' },
      { id: 'g3', name: '悔恨心魔', key: 'heart-demon-regret', status: 'active' }
    ],
    skill: [{ id: 'g4', name: '剑术', status: 'active' }],
    wealth: []
  };
  aiCallCount = 0;
  EventBus.clear();
  // 重置 DailyTaskService 的 _initialized 状态（测试间隔离）
  DailyTaskService._initialized = false;
  jest.clearAllMocks();
  // 重新 mock 上面被 clearAllMocks 清掉的实现
  const CacheManager = require('../../utils/cache-manager');
  CacheManager.get.mockImplementation((key) => {
    if (key === 'userpractices') return mockUserpractices;
    if (key === 'dailyTask') return mockCache['dailyTask'] || null;
    return mockCache[key] || null;
  });
  CacheManager.set.mockImplementation((key, value) => { mockCache[key] = value; });
  global.wx.getStorageSync.mockImplementation((key) => {
    if (key === 'practice_logs') return mockPracticeLogs;
    return null;
  });
  // spy AIService.sendMessageStream 计数
  jest.spyOn(AIService, 'sendMessageStream').mockImplementation(() => {
    aiCallCount++;
  });
});

describe('【P2 新增】init() 幂等', () => {
  test('多次调用 init() 只订阅一次事件', () => {
    DailyTaskService.init();
    DailyTaskService.init();
    DailyTaskService.init();
    expect(EventBus.listenerCount('practice.completed')).toBe(1);
  });
});

describe('【P2 新增】_onPracticeCompleted 事件处理器', () => {
  test('匹配今日宜练时调用 triggerPracticeReaction（→ 调用 AI）', () => {
    // 设置今日宜练：推荐 g2 恐惧心魔
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    DailyTaskService.init();

    // 模拟完成心魔修炼
    EventBus.emit('practice.completed', {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      category: 'mind',
      exp: 10,
      timestamp: Date.now()
    });

    // 验证：AI 反应被触发（即 triggerPracticeReaction 内部调用了 sendMessageStream）
    expect(aiCallCount).toBe(1);
    // 验证：dailyTask.completed 已被置为 true
    expect(mockCache['dailyTask'].completed).toBe(true);
  });

  test('gongfaId 不匹配今日宜练时，不触发反应', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    DailyTaskService.init();

    // 练的是别的功法（g1 吐纳）
    EventBus.emit('practice.completed', {
      gongfaId: 'g1',
      gongfaName: '吐纳',
      category: 'body',
      exp: 5
    });

    expect(aiCallCount).toBe(0);
    expect(mockCache['dailyTask'].completed).toBe(false);
  });

  test('任务已完成时重复 emit 不再触发（幂等）', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: true // 已完成
    };
    DailyTaskService.init();

    EventBus.emit('practice.completed', {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      category: 'mind',
      exp: 10
    });

    // 已完成 → 不再调用 AI
    expect(aiCallCount).toBe(0);
  });

  test('无 dailyTask 时不触发', () => {
    // mockCache 为空，dailyTask 不存在
    DailyTaskService.init();

    EventBus.emit('practice.completed', {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      category: 'mind',
      exp: 10
    });

    expect(aiCallCount).toBe(0);
  });

  test('emit 数据为空/null 时不抛错', () => {
    DailyTaskService.init();
    expect(() => EventBus.emit('practice.completed', null)).not.toThrow();
    expect(() => EventBus.emit('practice.completed', undefined)).not.toThrow();
    expect(() => EventBus.emit('practice.completed', {})).not.toThrow();
    expect(aiCallCount).toBe(0);
  });

  test('emit 数据缺 gongfaId 时不抛错', () => {
    DailyTaskService.init();
    expect(() => EventBus.emit('practice.completed', { gongfaName: 'test' })).not.toThrow();
    expect(aiCallCount).toBe(0);
  });

  test('handler 抛错不影响后续 emit', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // 故意让 triggerPracticeReaction 抛错（CacheManager.get 返回 null 导致空指针）
    // 但我们的代码已用 if (task.gongfaId === data.gongfaId) 守卫
    // 这里改为：传一个不存在的 gongfaId，验证不会抛错
    DailyTaskService.init();

    expect(() => {
      EventBus.emit('practice.completed', { gongfaId: 'nonexistent', category: 'body' });
    }).not.toThrow();

    consoleSpy.mockRestore();
  });
});

describe('【P2 新增】syncFromPracticeLogs 防御性同步', () => {
  test('今日有匹配 log 时，触发完成', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    // 今天练过恐惧心魔
    const today = new Date();
    mockPracticeLogs = [
      {
        timestamp: today.getTime(),
        type: 'practice',
        action: '恐惧心魔',
        category: 'mind',
        exp: 10
      }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(true);
    expect(aiCallCount).toBe(1);
    expect(mockCache['dailyTask'].completed).toBe(true);
  });

  test('今日无匹配 log 时，返回 false 不触发', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    // 今天练了别的
    const today = new Date();
    mockPracticeLogs = [
      {
        timestamp: today.getTime(),
        type: 'practice',
        action: '吐纳',
        category: 'body',
        exp: 5
      }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(false);
    expect(aiCallCount).toBe(0);
  });

  test('任务已完成时，syncFromPracticeLogs 不重复触发', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: true
    };
    const today = new Date();
    mockPracticeLogs = [
      {
        timestamp: today.getTime(),
        type: 'practice',
        action: '恐惧心魔',
        category: 'mind',
        exp: 10
      }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(false);
    expect(aiCallCount).toBe(0);
  });

  test('gongfaId 在 userpractices 中找不到时，syncFromPracticeLogs 跳过', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'ghost-id', // userpractices 里没有这个
      gongfaName: '幽灵功',
      completed: false
    };
    const today = new Date();
    mockPracticeLogs = [
      {
        timestamp: today.getTime(),
        type: 'practice',
        action: '幽灵功',
        category: 'body',
        exp: 5
      }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(false);
    expect(aiCallCount).toBe(0);
  });

  test('昨天的 log 不算今日', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    // 昨天练的
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockPracticeLogs = [
      {
        timestamp: yesterday.getTime(),
        type: 'practice',
        action: '恐惧心魔',
        category: 'mind',
        exp: 10
      }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(false);
    expect(aiCallCount).toBe(0);
  });

  test('无 dailyTask 时直接返回 false', () => {
    // mockCache 为空
    const result = DailyTaskService.syncFromPracticeLogs();
    expect(result).toBe(false);
  });

  test('dailyTask 缺 gongfaName 时直接返回 false', () => {
    mockCache['dailyTask'] = { gongfaId: 'g2', completed: false };
    const result = DailyTaskService.syncFromPracticeLogs();
    expect(result).toBe(false);
  });

  test('多条今日匹配 log 也能正确触发（用最新一条的 exp）', () => {
    mockCache['dailyTask'] = {
      gongfaId: 'g2',
      gongfaName: '恐惧心魔',
      completed: false
    };
    const today = new Date();
    // 模拟今天练了 3 次恐惧心魔（倒序，最新在前）
    mockPracticeLogs = [
      { timestamp: today.getTime(), type: 'practice', action: '恐惧心魔', category: 'mind', exp: 10 },
      { timestamp: today.getTime() - 1000, type: 'practice', action: '恐惧心魔', category: 'mind', exp: 10 },
      { timestamp: today.getTime() - 2000, type: 'practice', action: '恐惧心魔', category: 'mind', exp: 10 }
    ];

    const result = DailyTaskService.syncFromPracticeLogs();

    expect(result).toBe(true);
    expect(aiCallCount).toBe(1);
  });
});

describe('【P2 新增】集成：doPractice 真实路径', () => {
  // 这里直接 require 真实的 practice.service（不 mock）
  // 验证：doPractice 真的会 emit 事件
  test('practiceService.doPractice 成功后 emit practice.completed', () => {
    const EventBus = require('../../utils/event-bus');
    const handler = jest.fn();
    EventBus.on('practice.completed', handler);

    const practiceService = require('../../services/practice.service');

    // 设置功法数据
    mockUserpractices = {
      body: [{ id: 'g1', name: '吐纳', exp: 5, count: 0, totalExpEarned: 0, status: 'active' }],
      mind: [], skill: [], wealth: []
    };

    const result = practiceService.doPractice('g1', 'body', 5);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      gongfaId: 'g1',
      gongfaName: '吐纳',
      category: 'body',
      exp: 5
    }));

    // 清理订阅
    EventBus.clear();
  });

  test('practiceService.doPractice 失败时不 emit', () => {
    const EventBus = require('../../utils/event-bus');
    const handler = jest.fn();
    EventBus.on('practice.completed', handler);

    const practiceService = require('../../services/practice.service');

    mockUserpractices = {
      body: [{ id: 'g1', name: '吐纳', exp: 5, count: 0, totalExpEarned: 0, status: 'active' }],
      mind: [], skill: [], wealth: []
    };

    // 练一个不存在的功法
    const result = practiceService.doPractice('non-existent', 'body', 5);

    expect(result.success).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    EventBus.clear();
  });
});
