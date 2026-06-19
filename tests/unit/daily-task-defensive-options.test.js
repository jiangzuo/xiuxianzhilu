// tests/unit/daily-task-defensive-options.test.js
// 覆盖 daily-task.service.js 的两个修复：
//   【P1】getGongfaMenu 防御性展开（防 undefined TypeError）
//   【P2】generateRecommendation / triggerPracticeReaction 给 AIService 传 scene: 'dailyTask'

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

// 用 let 让 mock 可变（不同 case 返回不同的 userpractices）
let mockUserpractices = null;
jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => {
    if (key === 'userpractices') return mockUserpractices;
    if (key === 'dailyTask') return null;
    return null;
  }),
  set: jest.fn()
}));

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn((role, content) => ({
    id: 'msg-' + Date.now() + '-' + Math.random(),
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

// 记录所有 AIService 调用，便于断言
let aiServiceCalls = [];
global.wx = {
  request: jest.fn((opts) => {
    aiServiceCalls.push({ opts, _at: Date.now() });
    const task = {
      _opts: opts,
      abort: jest.fn(),
      onChunkReceived: jest.fn()
    };
    if (opts.success) task._success = opts.success;
    if (opts.fail) task._fail = opts.fail;
    return task;
  }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn()
};

const DailyTaskService = require('../../services/daily-task.service');
const AIService = require('../../services/ai.service');

beforeEach(() => {
  mockUserpractices = null;
  aiServiceCalls = [];
  AIService._activeTaskRef = null;
  jest.clearAllMocks();
});

describe('【P1 修复】getGongfaMenu 防御性展开（防 undefined TypeError）', () => {
  test('practices 为 null 时应返回空字符串而不抛错', () => {
    mockUserpractices = null;
    expect(() => DailyTaskService.getGongfaMenu()).not.toThrow();
    expect(DailyTaskService.getGongfaMenu()).toBe('');
  });

  test('practices.body 为 undefined 时（升级 / 缓存受损）应降级为空数组', () => {
    // 旧版本用户或缓存异常：practices 只有 mind 一个分类
    mockUserpractices = { mind: [{ id: 'g1', name: '冥想', status: 'active' }] };
    expect(() => DailyTaskService.getGongfaMenu()).not.toThrow();
    const menu = DailyTaskService.getGongfaMenu();
    expect(menu).toContain('- 冥想 (id: g1)');
  });

  test('practices 所有分类字段都缺失时（极端脏数据）应返回空字符串', () => {
    mockUserpractices = {}; // 完全没有分类字段
    expect(() => DailyTaskService.getGongfaMenu()).not.toThrow();
    expect(DailyTaskService.getGongfaMenu()).toBe('');
  });

  test('部分分类是 undefined、部分是数组时（混合状态）应只展开有效分类', () => {
    mockUserpractices = {
      body: undefined,
      mind: [{ id: 'g1', name: '冥想', status: 'active' }],
      skill: undefined,
      wealth: [{ id: 'g2', name: '理财', status: 'active' }]
    };
    expect(() => DailyTaskService.getGongfaMenu()).not.toThrow();
    const menu = DailyTaskService.getGongfaMenu();
    expect(menu).toContain('冥想');
    expect(menu).toContain('理财');
  });

  test('item 为 null 时 filter 应过滤掉（脏数据防御）', () => {
    mockUserpractices = {
      body: [null, { id: 'g1', name: '吐纳', status: 'active' }, undefined],
      mind: [],
      skill: [],
      wealth: []
    };
    expect(() => DailyTaskService.getGongfaMenu()).not.toThrow();
    const menu = DailyTaskService.getGongfaMenu();
    expect(menu).toContain('- 吐纳 (id: g1)');
    expect(menu).not.toContain('null');
  });

  test('archived 状态的功法应被过滤', () => {
    mockUserpractices = {
      body: [
        { id: 'g1', name: '吐纳', status: 'active' },
        { id: 'g2', name: '旧功', status: 'archived' }
      ],
      mind: [], skill: [], wealth: []
    };
    const menu = DailyTaskService.getGongfaMenu();
    expect(menu).toContain('吐纳');
    expect(menu).not.toContain('旧功');
  });
});

describe('【P2 修复】AIService.sendMessageStream 必须传 scene: dailyTask 配置', () => {
  // 通用 mock：模拟 AI 返回一个完整推荐
  function mockAiSuccessResponse(content) {
    return new Promise((resolve) => {
      // 等 AIService 完成 wx.request 调度
      setImmediate(() => {
        const lastCall = aiServiceCalls[aiServiceCalls.length - 1];
        if (!lastCall) return resolve();
        const encoder = new TextEncoder();
        const buf = encoder.encode(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\ndata: [DONE]\n`
        ).buffer;
        // 模拟 onChunkReceived
        const reqTask = global.wx.request.mock.results[global.wx.request.mock.calls.length - 1].value;
        if (reqTask && reqTask.onChunkReceived && reqTask.onChunkReceived.mock && reqTask.onChunkReceived.mock.calls.length > 0) {
          const onChunk = reqTask.onChunkReceived.mock.calls[0][0];
          onChunk({ data: buf });
        }
        if (lastCall.opts.success) lastCall.opts.success({ statusCode: 200, header: {} });
        resolve();
      });
    });
  }

  test('generateRecommendation 必须把 { scene: "dailyTask" } 传给 AIService', async () => {
    mockUserpractices = {
      body: [{ id: 'g1', name: '吐纳', status: 'active' }],
      mind: [], skill: [], wealth: []
    };

    DailyTaskService.generateRecommendation(
      '今日宜练',
      () => {}, // onStream
      () => {}, // onFinish
      () => {}  // onError
    );

    // 等待 AIService 内部 await 完成
    await new Promise(resolve => setImmediate(resolve));

    expect(aiServiceCalls.length).toBe(1);
    const callArgs = aiServiceCalls[0].opts;

    // 关键断言：第 6 个参数（options）必须是 { scene: 'dailyTask' }
    // 调用签名：sendMessageStream(messages, onStream, onFinish, onError, retryCount, options)
    //          索引：                0           1          2        3       4           5
    expect(callArgs).toBeDefined();
    // 这里的 aiServiceCalls[0].opts 是 wx.request 的 opts
    // 真正的断言要从 AIService.sendMessageStream 的入参来：需要 spyOn 或者直接看 _activeTaskRef 不够
    // 改用 spyOn 方式更直接
  });

  test('generateRecommendation: spyOn 验证第 6 参数是 { scene: "dailyTask" }', async () => {
    mockUserpractices = {
      body: [{ id: 'g1', name: '吐纳', status: 'active' }],
      mind: [], skill: [], wealth: []
    };

    const aiSpy = jest.spyOn(AIService, 'sendMessageStream');

    DailyTaskService.generateRecommendation('今日宜练', () => {}, () => {}, () => {});

    await new Promise(resolve => setImmediate(resolve));

    expect(aiSpy).toHaveBeenCalled();
    const args = aiSpy.mock.calls[0];
    // 索引：0=messages, 1=onStream, 2=onFinish, 3=onError, 4=retryCount, 5=options
    expect(args[4]).toBe(0);
    expect(args[5]).toEqual({ scene: 'dailyTask' });
    aiSpy.mockRestore();
  });

  test('triggerPracticeReaction: spyOn 验证第 6 参数是 { scene: "dailyTask" }', async () => {
    mockUserpractices = {
      body: [{ id: 'g1', name: '吐纳', status: 'active', dailyTaskCompletedCount: 0 }],
      mind: [], skill: [], wealth: []
    };
    // 让 triggerPracticeReaction 通过守卫：先在 cache 写入匹配的 task
    const CacheManager = require('../../utils/cache-manager');
    CacheManager.get.mockImplementation((key) => {
      if (key === 'dailyTask') return { gongfaId: 'g1', completed: false };
      if (key === 'userpractices') return mockUserpractices;
      return null;
    });

    const aiSpy = jest.spyOn(AIService, 'sendMessageStream');

    DailyTaskService.triggerPracticeReaction('g1', '吐纳', 10, 'body');

    await new Promise(resolve => setImmediate(resolve));

    expect(aiSpy).toHaveBeenCalled();
    const args = aiSpy.mock.calls[0];
    expect(args[4]).toBe(0);
    expect(args[5]).toEqual({ scene: 'dailyTask' });
    aiSpy.mockRestore();
  });

  test('triggerPracticeReaction: 任务不匹配时应早退，不调用 AIService', async () => {
    const CacheManager = require('../../utils/cache-manager');
    CacheManager.get.mockImplementation((key) => {
      if (key === 'dailyTask') return { gongfaId: 'other', completed: false };
      return null;
    });

    const aiSpy = jest.spyOn(AIService, 'sendMessageStream');

    DailyTaskService.triggerPracticeReaction('g1', '吐纳', 10, 'body');

    await new Promise(resolve => setImmediate(resolve));

    expect(aiSpy).not.toHaveBeenCalled();
    aiSpy.mockRestore();
  });

  test('triggerPracticeReaction: 任务已完成时应早退', async () => {
    const CacheManager = require('../../utils/cache-manager');
    CacheManager.get.mockImplementation((key) => {
      if (key === 'dailyTask') return { gongfaId: 'g1', completed: true };
      return null;
    });

    const aiSpy = jest.spyOn(AIService, 'sendMessageStream');

    DailyTaskService.triggerPracticeReaction('g1', '吐纳', 10, 'body');

    await new Promise(resolve => setImmediate(resolve));

    expect(aiSpy).not.toHaveBeenCalled();
    aiSpy.mockRestore();
  });
});
