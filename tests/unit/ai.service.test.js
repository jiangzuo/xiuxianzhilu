const AIService = require('../../services/ai.service');
const SecretManager = require('../../utils/secret');

// 模拟微信API
const mockRequestTask = {
  onChunkReceived: jest.fn(),
  abort: jest.fn()
};

// 模拟wx.request
global.wx = {
  request: jest.fn(() => mockRequestTask),
  // 【新增】模拟 wx.getNetworkType，避免 NetworkUtils.checkNetworkStatus() 报错
  getNetworkType: jest.fn(({ success }) => {
    success && success({ networkType: 'wifi', isConnected: true });
  }),
  // 【新增】getStorageSync / setStorageSync（getDeviceId 用到）
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn()
};

describe('AI服务测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 【修复测试隔离】某些回归测试会覆盖 wx.request，必须在每个用例前重置
    global.wx.request = jest.fn(() => mockRequestTask);
    // 重置 getStorageSync 的 mock 返回值
    global.wx.getStorageSync.mockReturnValue(null);
  });

  test('sendMessageStream方法应该存在', () => {
    expect(AIService.sendMessageStream).toBeDefined();
  });

  test('当API Key缺失时应该调用错误回调', () => {
    // 模拟SecretManager.getApiKey返回空
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue(null);
    
    const mockOnError = jest.fn();
    AIService.sendMessageStream([], () => {}, () => {}, mockOnError);
    
    expect(mockOnError).toHaveBeenCalledWith('API Key 缺失');
  });

  test('当API Key存在时应该调用wx.request', async () => {
    // 模拟SecretManager.getApiKey返回API Key
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const mockMessages = [{ role: 'user', content: '测试消息' }];
    const mockOnStream = jest.fn();
    const mockOnFinish = jest.fn();
    const mockOnError = jest.fn();

    // 【关键】必须 await，否则 wx.request 的调用在微任务里，断言时还没执行
    await AIService.sendMessageStream(mockMessages, mockOnStream, mockOnFinish, mockOnError);

    // 验证 wx.request 被以正确参数调用（包含新加的 thinking、user_id、timeout）
    expect(wx.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      enableChunked: true,
      timeout: 30000,
      data: expect.objectContaining({
        messages: mockMessages,
        stream: true
      })
    }));
  });

  test('当网络请求失败时应该调用错误回调', async () => {
    // 模拟SecretManager.getApiKey返回API Key
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const mockOnError = jest.fn();

    await AIService.sendMessageStream([], () => {}, () => {}, mockOnError);

    // 取出 wx.request 调用时传入的 fail 回调
    const failCallback = wx.request.mock.calls[0][0].fail;
    const mockError = new Error('网络错误');
    failCallback(mockError);

    // 新行为：onError 被包装为 { message, originalError }
    expect(mockOnError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.any(String),
      originalError: mockError
    }));
  });

  // ===== 以下是本次重构新增的回归测试 =====

  test('【回归 #3】500 错误重试时必须透传 options', (done) => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    // 第一次请求：返回 500
    // 第二次请求：mock 也得返回新 task，但我们要验证它带上了原 options
    const mockTask1 = { onChunkReceived: jest.fn(), abort: jest.fn() };
    const mockTask2 = { onChunkReceived: jest.fn(), abort: jest.fn() };
    global.wx.request = jest.fn()
      .mockReturnValueOnce(mockTask1)
      .mockReturnValueOnce(mockTask2);

    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();
    const options = { scene: 'review', model: 'deepseek-v4-pro' };

    // 必须 await，让 wx.request 调用完成
    (async () => {
      await AIService.sendMessageStream(
        [{ role: 'user', content: 'test' }],
        onStream, onFinish, onError, 0, options
      );

      // 取出第一次请求的 success 回调，模拟 500 错误
      const success1 = wx.request.mock.calls[0][0].success;
      success1({ statusCode: 500, header: {} });

      // 等待 1s 后 scheduleRetry 触发
      setTimeout(() => {
        // 验证第二次请求带上原 options（model 应该是 deepseek-v4-pro）
        expect(wx.request).toHaveBeenCalledTimes(2);
        const secondCallData = wx.request.mock.calls[1][0].data;
        expect(secondCallData.model).toBe('deepseek-v4-pro');
        done();
      }, 1100);
    })();
  });

  test('【回归 #3】超时重试时也必须透传 options', (done) => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const mockTask1 = { onChunkReceived: jest.fn(), abort: jest.fn() };
    const mockTask2 = { onChunkReceived: jest.fn(), abort: jest.fn() };
    global.wx.request = jest.fn()
      .mockReturnValueOnce(mockTask1)
      .mockReturnValueOnce(mockTask2);

    const options = { scene: 'memory' };

    (async () => {
      await AIService.sendMessageStream(
        [{ role: 'user', content: 't' }],
        () => {}, () => {}, () => {}, 0, options
      );

      // 触发 fail 回调（模拟 timeout）
      const fail1 = wx.request.mock.calls[0][0].fail;
      fail1({ errMsg: 'request:fail timeout' });

      setTimeout(() => {
        expect(wx.request).toHaveBeenCalledTimes(2);
        const secondCallData = wx.request.mock.calls[1][0].data;
        // memory scene 应该使用 deepseek-v4-pro
        expect(secondCallData.model).toBe('deepseek-v4-pro');
        done();
      }, 1100);
    })();
  });

  test('【回归 #2】SSE 跨 chunk 拼接：半行 JSON 不会被丢失', async () => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const onStream = jest.fn();
    const onFinish = jest.fn();
    await AIService.sendMessageStream(
      [{ role: 'user', content: 't' }],
      onStream, onFinish, () => {}
    );

    // 取出 onChunkReceived 回调
    const onChunk = mockRequestTask.onChunkReceived.mock.calls[0][0];

    // 模拟两个完整 chunk
    const encoder = new TextEncoder();
    const arr1 = encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n');
    const arr2 = encoder.encode('data: {"choices":[{"delta":{"content":"好"}}]}\n');

    onChunk({ data: arr1.buffer });
    onChunk({ data: arr2.buffer });

    expect(onStream).toHaveBeenCalledWith('你');
    expect(onStream).toHaveBeenCalledWith('好');
  });

  test('【回归 #2】SSE 跨 chunk 拼接：JSON 被切断在 chunk 边界时也能恢复', async () => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const onStream = jest.fn();
    const onFinish = jest.fn();
    await AIService.sendMessageStream(
      [{ role: 'user', content: 't' }],
      onStream, onFinish, () => {}
    );

    const onChunk = mockRequestTask.onChunkReceived.mock.calls[0][0];
    const encoder = new TextEncoder();

    // 模拟 SSE 行为：JSON 被切断在两个 chunk 之间
    // chunk1: 'data: {"choices":[{"delta":{"con' （半截）
    // chunk2: 'tent":"拼接测试"}}]}\ndata: [DONE]\n'（续上 + DONE）
    const arr1 = encoder.encode('data: {"choices":[{"delta":{"con');
    const arr2 = encoder.encode('tent":"拼接测试"}}]}\ndata: [DONE]\n');

    onChunk({ data: arr1.buffer });
    // 第一个 chunk 后应该没有触发 onStream（因为解析失败，半行被放入 buffer）
    expect(onStream).not.toHaveBeenCalled();

    onChunk({ data: arr2.buffer });
    // 第二个 chunk 后 buffer 拼接完成，应触发一次 onStream
    expect(onStream).toHaveBeenCalledWith('拼接测试');
  });

  test('【回归】abort() 方法应该能阻止后续 chunk 处理', async () => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    // 【关键】必须 await，返回值才不会是 undefined
    const task = await AIService.sendMessageStream(
      [{ role: 'user', content: 't' }],
      onStream, onFinish, onError
    );

    // 验证返回对象有 abort 方法
    expect(typeof task.abort).toBe('function');

    // 调用 abort 不应抛错
    expect(() => task.abort()).not.toThrow();

    // 之后再有 chunk 进来，不应该触发 onStream
    // 这就间接验证了 aborted 状态被正确设置
    const onChunk = mockRequestTask.onChunkReceived.mock.calls[0][0];
    const encoder = new TextEncoder();
    const arr = encoder.encode('data: {"choices":[{"delta":{"content":"不应输出"}}]}\n');
    onChunk({ data: arr.buffer });

    expect(onStream).not.toHaveBeenCalled();
  });

  test('【回归】onFinish 只触发一次（防多次触发）', async () => {
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');

    const onStream = jest.fn();
    const onFinish = jest.fn();
    const onError = jest.fn();

    await AIService.sendMessageStream(
      [{ role: 'user', content: 't' }],
      onStream, onFinish, onError
    );

    const onChunk = mockRequestTask.onChunkReceived.mock.calls[0][0];
    const encoder = new TextEncoder();

    // 连续两个 chunk 都包含 [DONE]（异常情况，但能验证防护）
    const arr1 = encoder.encode('data: [DONE]\n');
    const arr2 = encoder.encode('data: [DONE]\n');

    onChunk({ data: arr1.buffer });
    onChunk({ data: arr2.buffer });

    // 就算 [DONE] 出现多次，onFinish 也只触发一次
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});