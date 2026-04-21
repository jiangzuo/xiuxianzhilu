// services/ai.service.js 对接ai逻辑
const SecretManager = require('../utils/secret');
const MyTextDecoder = require('../utils/text-decoder');
const NetworkUtils = require('../utils/network-utils'); 

const AIService = {
  /**
   * 发送消息 (流式)
   * @param {Array} messages 完整的消息上下文
   * @param {Function} onStream 接收到每个字符时的回调 (text) => {}
   * @param {Function} onFinish 完成时的回调 () => {}
   */
  async sendMessageStream(messages, onStream, onFinish, onError, retryCount = 0) {
    const apiKey = SecretManager.getApiKey();
    if (!apiKey) {
      if (onError) onError("API Key 缺失");
      return;
    }

    // 检查网络状态
    const networkStatus = await NetworkUtils.checkNetworkStatus();
    if (!networkStatus.isConnected) {
      if (onError) onError({ message: "网络连接失败，请检查网络设置" });
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
      timeout: 30000, // 添加超时设置
      success: (res) => {
        // 虽然连接成功，但如果状态码不是 200，也是错误
        if (res.statusCode !== 200) {
            console.error('API Error:', res);
            let errorMessage = `服务异常 code:${res.statusCode}`;
            if (res.statusCode === 401) {
              errorMessage = "API Key 无效，请重新配置";
            } else if (res.statusCode === 403) {
              errorMessage = "API Key 权限不足";
            } else if (res.statusCode === 429) {
              errorMessage = "API 请求过于频繁，请稍后重试";
            } else if (res.statusCode >= 500) {
              errorMessage = "服务器内部错误，请稍后重试";
              // 对于服务器内部错误，可以尝试重试
              if (retryCount < 2) {
                console.log(`请求失败，正在重试... (${retryCount + 1}/2)`);
                setTimeout(() => {
                  this.sendMessageStream(messages, onStream, onFinish, onError, retryCount + 1);
                }, 1000);
                return;
              }
            }
            if (onError) onError(errorMessage);
        }
      },
      fail: (err) => {
        console.error('网络请求失败', err);
        let errorMessage = "网络请求失败";
        if (err.errMsg.includes('timeout')) {
          errorMessage = "网络请求超时，请检查网络连接";
          // 对于超时错误，可以尝试重试
          if (retryCount < 2) {
            console.log(`请求超时，正在重试... (${retryCount + 1}/2)`);
            setTimeout(() => {
              this.sendMessageStream(messages, onStream, onFinish, onError, retryCount + 1);
            }, 1000);
            return;
          }
        } else if (err.errMsg.includes('connect')) {
          errorMessage = "网络连接失败，请检查网络设置";
        } else if (err.errMsg.includes('ssl')) {
          errorMessage = "SSL 证书验证失败";
        }
        // 【核心修改】触发错误回调
        if (onError) onError({ message: errorMessage, originalError: err });
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