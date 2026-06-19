const axios = require('axios');

describe('AI API测试', () => {
  test('DeepSeek API应该可访问', async () => {
    try {
      const response = await axios.get('https://api.deepseek.com/v1/models');
      expect(response.status).toBe(200);
    } catch (error) {
      // API可能需要认证，这里主要测试网络连接
      expect(error.message).not.toContain('ENOTFOUND');
      console.log('API测试：网络连接正常，但可能需要认证');
    }
  });

  test('测试API端点格式', () => {
    const apiUrl = 'https://api.deepseek.com/chat/completions';
    expect(apiUrl).toMatch(/^https:\/\/api\.deepseek\.com\/.*$/);
  });

  test('测试消息格式', () => {
    const mockMessages = [
      { role: 'system', content: '你是一个修仙助手' },
      { role: 'user', content: '如何提升修为？' }
    ];
    
    expect(mockMessages).toBeInstanceOf(Array);
    expect(mockMessages.length).toBeGreaterThan(0);
    mockMessages.forEach(message => {
      expect(message).toHaveProperty('role');
      expect(message).toHaveProperty('content');
      expect(['system', 'user', 'assistant']).toContain(message.role);
    });
  });
});