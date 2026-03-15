const AIService = require('../../services/ai.service');
const SecretManager = require('../../utils/secret');

// 模拟微信API
const mockRequestTask = {
  onChunkReceived: jest.fn(),
  abort: jest.fn()
};

// 模拟wx.request
global.wx = {
  request: jest.fn(() => mockRequestTask)
};

describe('AI服务测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('当API Key存在时应该调用wx.request', () => {
    // 模拟SecretManager.getApiKey返回API Key
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');
    
    const mockMessages = [{ role: 'user', content: '测试消息' }];
    const mockOnStream = jest.fn();
    const mockOnFinish = jest.fn();
    const mockOnError = jest.fn();
    
    AIService.sendMessageStream(mockMessages, mockOnStream, mockOnFinish, mockOnError);
    
    expect(wx.request).toHaveBeenCalledWith({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key'
      },
      data: {
        model: 'deepseek-chat',
        messages: mockMessages,
        stream: true,
        temperature: 1.3
      },
      enableChunked: true,
      success: expect.any(Function),
      fail: expect.any(Function)
    });
  });

  test('当网络请求失败时应该调用错误回调', () => {
    // 模拟SecretManager.getApiKey返回API Key
    jest.spyOn(SecretManager, 'getApiKey').mockReturnValue('test-api-key');
    
    const mockOnError = jest.fn();
    
    AIService.sendMessageStream([], () => {}, () => {}, mockOnError);
    
    // 调用fail回调
    const failCallback = wx.request.mock.calls[0][0].fail;
    const mockError = new Error('网络错误');
    failCallback(mockError);
    
    expect(mockOnError).toHaveBeenCalledWith(mockError);
  });
});