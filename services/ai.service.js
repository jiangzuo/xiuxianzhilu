// services/ai.service.js
const SecretManager = require('../utils/secret');
const MyTextDecoder = require('../utils/text-decoder'); 

const AIService = {
  /**
   * 发送消息 (流式)
   * @param {Array} messages 完整的消息上下文
   * @param {Function} onStream 接收到每个字符时的回调 (text) => {}
   * @param {Function} onFinish 完成时的回调 () => {}
   */
  sendMessageStream(messages, onStream, onFinish, onError) {
    const apiKey = SecretManager.getApiKey();
    if (!apiKey) {
      if (onError) onError("API Key 缺失");
      return;
    }

    const requestTask = wx.request({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: {
        model: "deepseek-chat",
        messages: messages,
        stream: true, 
        temperature: 1.3 
      },
      enableChunked: true, 
      success: (res) => {
        // 虽然连接成功，但如果状态码不是 200，也是错误
        if (res.statusCode !== 200) {
            console.error('API Error:', res);
            if (onError) onError(`服务异常 code:${res.statusCode}`);
        }
      },
      fail: (err) => {
        console.error('网络请求失败', err);
        // 【核心修改】触发错误回调
        if (onError) onError(err);
      }
    });

    // --- 处理流式数据 ---
    requestTask.onChunkReceived((response) => {
      const arrayBuffer = response.data;
      const uint8Array = new Uint8Array(arrayBuffer);
      let text = '';
      if (typeof TextDecoder !== 'undefined') {
        // 如果环境支持原生，优先用原生的（性能更好）
        text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer), { stream: true });
      } else {
        // 如果不支持（报错的那种情况），用我们手写的解码器
        text = MyTextDecoder.decode(arrayBuffer);
      }
      
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.includes('[DONE]')) {
          if (onFinish) onFinish();
          return;
        }
        
        const jsonStr = line.replace(/^data: /, '');
        try {
          const json = JSON.parse(jsonStr);
          const content = json.choices[0].delta.content;
          if (content && onStream) {
            onStream(content);
          }
        } catch (e) {
          // 忽略 ping 等心跳包
        }
      }
    });

    return requestTask;
  }
};

module.exports = AIService;