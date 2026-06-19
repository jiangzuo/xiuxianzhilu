// tests/unit/ai.service-success-fallback.test.js
// 验证 ai.service.js 的两个 P2 修复：
//   1) success(statusCode=200) 兜底触发 safeFinish（修复"服务端不发 [DONE] 导致状态卡死"）
//   2) onChunkReceived 外层 try-catch 防止异常中断后续 chunk 处理

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
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
  setStorageSync: jest.fn()
};

const AIService = require('../../services/ai.service');

beforeEach(() => {
  mockRequestTasks = [];
  // 重置模块级 _activeTaskRef
  AIService._activeTaskRef = null;
  jest.clearAllMocks();
});

// 辅助：构造 SSE chunk 的 arrayBuffer
function makeSseChunk(text) {
  const encoder = new TextEncoder();
  return {
    data: encoder.encode(text).buffer
  };
}

describe('AIService success 兜底触发 safeFinish（P2 修复）', () => {
  test('服务端不发 [DONE] 但发完整数据流，success 应兜底触发 onFinish', async () => {
    // 场景：服务端关闭连接前没发 [DONE] 标记
    // 修复前：onChunkReceived 处理完所有数据但没收到 [DONE]，safeFinish 不触发，状态卡死
    // 修复后：success(statusCode=200) 兜底调用 safeFinish

    const onFinish = jest.fn();
    const onStream = jest.fn();
    const onError = jest.fn();

    AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, onError,
      0, { scene: 'chat' }
    );

    // 等待 async 内部完成
    await new Promise(resolve => setImmediate(resolve));

    expect(mockRequestTasks.length).toBe(1);
    const task = mockRequestTasks[0];

    // 1. 模拟收到一个正常的 chunk（不含 [DONE]）
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
    expect(onStream).toHaveBeenCalledWith('hello');
    expect(onFinish).not.toHaveBeenCalled(); // 此时还没收到 [DONE]

    // 2. 模拟服务端关闭连接，没发 [DONE]
    task._success({ statusCode: 200, header: {} });

    // 3. 验证 onFinish 被成功兜底触发
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('服务端发 [DONE] 走正常路径时，success 兜底不应重复触发 onFinish', async () => {
    const onFinish = jest.fn();
    const onStream = jest.fn();

    AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, jest.fn(),
      0, { scene: 'chat' }
    );

    await new Promise(resolve => setImmediate(resolve));

    const task = mockRequestTasks[0];

    // 1. 正常数据 chunk
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
    // 2. [DONE] 标记
    task._onChunk(makeSseChunk('data: [DONE]\n\n'));

    expect(onFinish).toHaveBeenCalledTimes(1);

    // 3. 模拟 success 兜底调用
    task._success({ statusCode: 200, header: {} });

    // 关键：safeFinish 内部有 finished 防重复，onFinish 不应被再次调用
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('statusCode=500 错误路径不应触发 success 兜底', async () => {
    const onFinish = jest.fn();
    const onError = jest.fn();

    AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      jest.fn(), onFinish, onError,
      0, { scene: 'chat' }
    );

    await new Promise(resolve => setImmediate(resolve));

    const task = mockRequestTasks[0];

    // 模拟 500 错误（走重试路径，最多 2 次重试）
    task._success({ statusCode: 500, header: {} });

    // 等待重试发生（1s 后第一次重试）
    await new Promise(resolve => setTimeout(resolve, 1100));

    // 第一次重试（mockRequestTasks[1]）也 500
    if (mockRequestTasks[1]) {
      mockRequestTasks[1]._success({ statusCode: 500, header: {} });
    }

    // 等待第二次重试（2s 后）
    await new Promise(resolve => setTimeout(resolve, 2100));

    // 第二次重试（mockRequestTasks[2]）也 500
    if (mockRequestTasks[2]) {
      mockRequestTasks[2]._success({ statusCode: 500, header: {} });
    }

    // 重试耗尽，应触发 safeError
    expect(onError).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });
});

describe('AIService onChunkReceived 外层 try-catch（P2 修复）', () => {
  test('chunk 处理异常不应中断后续 chunk', async () => {
    // 场景：某个 chunk 处理时抛异常（模拟网络异常、buffer overflow 等）
    // 修复前：onChunkReceived 中断，[DONE] 收不到，状态卡死
    // 修复后：异常被吞掉，本 chunk 内容丢失，后续 chunk 继续处理

    const onFinish = jest.fn();
    const onStream = jest.fn();
    const onError = jest.fn();

    AIService.sendMessageStream(
      [{ role: 'user', content: 'test' }],
      onStream, onFinish, onError,
      0, { scene: 'chat' }
    );

    await new Promise(resolve => setImmediate(resolve));

    const task = mockRequestTasks[0];

    // 1. 正常 chunk
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
    expect(onStream).toHaveBeenCalledWith('hello');

    // 2. 构造一个让 Uint8Array 抛异常的非法数据
    //    new Uint8Array(undefined) 会抛 TypeError
    expect(() => {
      task._onChunk({ data: undefined });
    }).not.toThrow();  // 外层 try-catch 应该吞掉异常

    // 3. 第三次 chunk 应该正常处理
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"foo"}}]}\n\n'));

    // 关键：异常被吞掉，后续 chunk 继续处理
    expect(onStream).toHaveBeenCalledWith('hello');
    expect(onStream).toHaveBeenCalledWith('foo');

    // 4. 兜底 success 触发
    task._success({ statusCode: 200, header: {} });

    // onFinish 兜底触发
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
