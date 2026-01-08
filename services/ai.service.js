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
  sendMessageStream(messages, onStream, onFinish) {
    const apiKey = SecretManager.getApiKey();
    if (!apiKey) {
      if (onStream) onStream("【系统错误】灵力链接中断（Key无效）");
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
        stream: true, // 开启流式
        temperature: 1.3, // 让器灵更活泼
        frequency_penalty: 0.5// 重复度惩罚
      },
      enableChunked: true, // 小程序必开
      success: (res) => {
        // console.log('连接成功', res);
      },
      fail: (err) => {
        console.error('连接失败', err);
        if (onStream) onStream("（器灵似乎掉线了...）");
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