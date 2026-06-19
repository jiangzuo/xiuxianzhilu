// tests/unit/ai.service-abort-retry.test.js
// 验证 ai.service.js 的 abort 状态能跨重试传播（P2 Bug 修复：幽灵打字现象）
//
// 场景：第一次请求 500 → scheduleRetry → 用户在重试期间点 abort()
// 修复前：旧 task.abort() 只影响第一次的 requestTask，重试的第二次完全感知不到
//         → 第二次的 onChunkReceived 继续触发 onStream → "幽灵打字"
// 修复后：abort() 通过 _activeTaskRef.aborted 标志传播，所有重试都感知到

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

let mockRequestTasks = [];
let mockRequestHandlers = {};

global.wx = {
  request: jest.fn((opts) => {
    const task = {
      _opts: opts,
      abort: jest.fn(),
      onChunkReceived: jest.fn((cb) => {
        // 模拟微信 onChunkReceived 注册回调
        task._onChunk = cb;
      })
    };
    mockRequestTasks.push(task);
    // 保存 handlers 供测试触发回调
    if (opts.success) task._success = opts.success;
    if (opts.fail) task._fail = opts.fail;
    return task;
  }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn()
};

const AIService = require('../../services/ai.service');

beforeEach(() => {
  mockRequestTasks = [];
  mockRequestHandlers = {};
  // 重置模块级 _activeTaskRef
  AIService._activeTaskRef = null;
  jest.clearAllMocks();
});

// 辅助：等待 setTimeout 队列清空
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('AIService abort 状态跨重试传播（P2 Bug 修复）', () => {
  test('abort() 应能中止正在重试的第二次请求', async () => {
    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    // 1) 第一次调用（sendMessageStream 是 async，需 await）
    const task1 = await AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, onError,
      0, { scene: 'chat' }
    );
    await flushPromises();

    // 第一次 requestTask 应该被注册
    expect(mockRequestTasks).toHaveLength(1);
    const firstTask = mockRequestTasks[0];

    // 2) 模拟第一次 500 错误 → 触发 scheduleRetry
    firstTask._success({ statusCode: 500, header: {} });

    // scheduleRetry 用 setTimeout(..., backoffDelay) 触发
    // 等待 backoffDelay (1s) + 一点余量
    await wait(1100);

    // 第二次 requestTask 应该被注册（重试成功发起）
    expect(mockRequestTasks).toHaveLength(2);
    const secondTask = mockRequestTasks[1];
    expect(secondTask).not.toBe(firstTask);

    // 3) 用户在重试期间点 abort() → 调 task1.abort()
    // 修复前：只 abort firstTask，secondTask 不知道
    // 修复后：通过 _activeTaskRef.aborted 标志传播，secondTask 也会被识别为已中止
    task1.abort();

    // 关键断言：firstTask.abort() 应被调用
    expect(firstTask.abort).toHaveBeenCalled();

    // 4) 模拟第二次成功 chunk 推送
    // 修复后：onChunkReceived 应检查 _activeTaskRef.aborted，不再触发 onStream
    const chunkResponse = {
      data: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"幽灵打字"}}]}\n\n').buffer
    };
    secondTask._onChunk(chunkResponse);

    // 关键断言：幽灵打字的 onStream 不应被调用
    expect(onStream).not.toHaveBeenCalled();
  });

  test('模块级 _activeTaskRef 在新调用链开始时重置', async () => {
    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    // 第一次调用
    const task1 = await AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, onError,
      0, {}
    );
    await flushPromises();

    const firstTaskRef = AIService._activeTaskRef;
    expect(firstTaskRef).toBeDefined();
    expect(firstTaskRef.aborted).toBe(false);

    // 模拟完成（不重试）
    firstTaskRef.requestTask._success({ statusCode: 200, header: {} });

    // 第二次调用：retryCount=0 应触发 _activeTaskRef 重置
    const task2 = await AIService.sendMessageStream(
      [{ role: 'user', content: 'test2' }],
      onStream, onFinish, onError,
      0, {}
    );
    await flushPromises();

    const secondTaskRef = AIService._activeTaskRef;
    expect(secondTaskRef).not.toBe(firstTaskRef);   // 应该是新对象
    expect(secondTaskRef.aborted).toBe(false);
  });

  test('重试期间（retryCount=1）复用同一 _activeTaskRef', async () => {
    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    // 第一次调用（retryCount=0）
    await AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, onError,
      0, {}
    );
    await flushPromises();

    const firstTaskRef = AIService._activeTaskRef;

    // 模拟 500 → scheduleRetry
    firstTaskRef.requestTask._success({ statusCode: 500, header: {} });
    await wait(1100);

    // 第二次调用（retryCount=1）应复用 firstTaskRef
    expect(AIService._activeTaskRef).toBe(firstTaskRef);
  });

  test('task1.abort() 后第二次 onFinish 不应触发', async () => {
    const onFinish = jest.fn();

    const task1 = await AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      jest.fn(), onFinish, jest.fn(),
      0, {}
    );
    await flushPromises();

    // 500 → 重试
    mockRequestTasks[0]._success({ statusCode: 500, header: {} });
    await wait(1100);

    expect(mockRequestTasks).toHaveLength(2);

    // 用户 abort
    task1.abort();

    // 第二次 onSuccess（200 状态码）应被忽略
    if (mockRequestTasks[1]._success) {
      mockRequestTasks[1]._success({ statusCode: 200, header: {} });
    }

    // onFinish 不应被触发（因为 taskRef.aborted 阻止了 safeFinish）
    expect(onFinish).not.toHaveBeenCalled();
  });

  test('未 abort 时第二次重试正常推流', async () => {
    const onStream = jest.fn();
    const onFinish = jest.fn();

    await AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, jest.fn(),
      0, {}
    );
    await flushPromises();

    // 500 → 重试
    mockRequestTasks[0]._success({ statusCode: 500, header: {} });
    await wait(1100);

    expect(mockRequestTasks).toHaveLength(2);

    // 第二次成功推流（不 abort）
    const secondTask = mockRequestTasks[1];
    const chunkResponse = {
      data: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"正常流"}}]}\n\n').buffer
    };
    secondTask._onChunk(chunkResponse);

    // 正常推流应工作
    expect(onStream).toHaveBeenCalledWith('正常流');
  });
});
