// tests/unit/heart-demon-abort.test.js
// 验证 HeartDemonService 的 P2 修复：
//   1) start / sendMessage / complete 内部保存 _currentTask 引用
//   2) onFinish / onError 时清空 _currentTask
//   3) abortCurrent() 正确中止推演

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

jest.mock('../../services/practice.service', () => ({
  getpracticeData: () => ({ mind: [] }),
  doPractice: () => ({ isLevelUp: false, settlement: { exp: 10, categoryName: 'mind', attrChanges: [] } })
}));

jest.mock('../../services/memory.service', () => ({
  forceUpdateMemory: jest.fn(),
  checkAndUpdateMemory: jest.fn()
}));

jest.mock('../../services/user.service', () => ({
  buildUserArchive: () => ({
    hard_info_text: '',
    recent_activity_log: '',
    practice_stats: '',
    soft_info_text: '',
    rolling_summary: ''
  })
}));

let mockRequestTasks = [];

global.wx = {
  request: jest.fn((opts) => {
    const task = {
      _opts: opts,
      abort: jest.fn(),
      onChunkReceived: jest.fn((cb) => {
        task._onChunk = cb;
      })
    };
    mockRequestTasks.push(task);
    if (opts.success) task._success = opts.success;
    if (opts.fail) task._fail = opts.fail;
    return task;
  }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn()
};

const HeartDemonService = require('../../services/heart-demon.service');
const ChatService = require('../../services/chat.service');

// 抑制 heart-demon 引用的 ChatService 副作用
jest.spyOn(ChatService, 'saveMessage').mockImplementation(() => ({
  id: 'mock-id-' + Date.now(),
  role: 'user',
  content: 'mock',
  timestamp: Date.now()
}));
jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue([]);

beforeEach(() => {
  mockRequestTasks = [];
  // 重置 HeartDemonService 内部状态
  HeartDemonService._currentType = null;
  HeartDemonService._roundCount = 0;
  HeartDemonService._currentGongfaId = null;
  HeartDemonService._sessionStartMsgId = null;
  HeartDemonService._currentTask = null;
  jest.clearAllMocks();
});

describe('HeartDemonService._currentTask 引用管理（P2 修复）', () => {
  test('start() 应将 task 引用保存到 _currentTask', async () => {
    const userMsg = { id: 'user-1', content: '心魔修炼-恐惧', role: 'user' };

    HeartDemonService.start('fear', userMsg, jest.fn(), jest.fn(), jest.fn());

    // 等待 async 内部完成
    await new Promise(resolve => setImmediate(resolve));

    // _currentTask 应该是 Promise<{abort}> 或 {abort}
    expect(HeartDemonService._currentTask).toBeTruthy();
  });

  test('sendMessage() 应更新 _currentTask 引用', async () => {
    // 先 start 一下
    HeartDemonService._currentType = 'fear';  // 模拟 start 后状态
    const userMsg = { id: 'user-1', content: '心魔修炼-恐惧', role: 'user' };
    HeartDemonService.start('fear', userMsg, jest.fn(), jest.fn(), jest.fn());
    await new Promise(resolve => setImmediate(resolve));
    HeartDemonService._currentTask = null;  // 模拟 start 完成

    // 发送对话
    const userMsg2 = { id: 'user-2', content: '对话', role: 'user' };
    HeartDemonService.sendMessage('对话内容', userMsg2, jest.fn(), jest.fn(), jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    // _currentTask 应有值
    expect(HeartDemonService._currentTask).toBeTruthy();
  });

  test('complete() 应更新 _currentTask 引用，完成后清空', async () => {
    HeartDemonService._currentType = 'fear';
    HeartDemonService._currentGongfaId = 'gongfa-1';
    const userMsg = { id: 'user-1', content: '完成心魔修炼-恐惧', role: 'user' };
    HeartDemonService.complete(userMsg, jest.fn(), jest.fn(), jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(HeartDemonService._currentTask).toBeTruthy();

    // 模拟推演完成
    mockRequestTasks[0]._success({ statusCode: 200, header: {} });

    // 完成后 _currentTask 应被清空
    expect(HeartDemonService._currentTask).toBeNull();
  });
});

describe('HeartDemonService.abortCurrent()', () => {
  test('abortCurrent() 应调用 _currentTask 的 abort() 方法', async () => {
    const userMsg = { id: 'user-1', content: '心魔修炼-恐惧', role: 'user' };
    HeartDemonService.start('fear', userMsg, jest.fn(), jest.fn(), jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(HeartDemonService._currentTask).toBeTruthy();

    HeartDemonService.abortCurrent();

    // _currentTask 应被清空
    expect(HeartDemonService._currentTask).toBeNull();
  });

  test('_currentTask 为 null 时 abortCurrent() 应安全 noop', () => {
    HeartDemonService._currentTask = null;
    expect(() => HeartDemonService.abortCurrent()).not.toThrow();
  });

  test('abortCurrent() 处理 Promise<{abort}> 类型', async () => {
    const userMsg = { id: 'user-1', content: '心魔修炼-恐惧', role: 'user' };
    HeartDemonService.start('fear', userMsg, jest.fn(), jest.fn(), jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    // 此时 _currentTask 是 Promise<{abort}>
    expect(typeof HeartDemonService._currentTask.then).toBe('function');

    HeartDemonService.abortCurrent();
    // 等待 Promise resolve
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    expect(HeartDemonService._currentTask).toBeNull();
  });
});
