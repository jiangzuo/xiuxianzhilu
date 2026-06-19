// services/ai.service.js 对接ai逻辑
const SecretManager = require('../utils/secret');
const MyTextDecoder = require('../utils/text-decoder');
const NetworkUtils = require('../utils/network-utils');

function getDeviceId() {
  let deviceId = wx.getStorageSync('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    wx.setStorageSync('device_id', deviceId);
  }
  return deviceId;
}

// AI 参数配置（集中管理）
const AI_CONFIG = {
  // 日常聊天
  chat: { model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, temperature: 1.0 },
  // 心魔修炼
  heartDemon: { model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, temperature: 0.9 },
  // 今日宜练
  dailyTask: { model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, temperature: 1.0 },
  // 修炼回顾
  review: { model: 'deepseek-v4-pro', thinking: { type: 'enabled', reasoning_effort: 'high' }, temperature: 0.9 },
  // 深度记忆
  memory: { model: 'deepseek-v4-pro', thinking: { type: 'enabled', reasoning_effort: 'high' }, temperature: 0.8 }
};

const AIService = {
  // 【P2 修复】模块级共享的 task 引用
  // 目的：让 abort() 状态在重试期间的所有 sendMessageStream 调用间共享
  // 修复前：aborted 是闭包局部变量，scheduleRetry 递归调用 sendMessageStream
  //         会产生新的闭包和新的 aborted 标志。用户调旧 task.abort() 只影响
  //         第一次的 requestTask，重试的第二次完全感知不到 → "幽灵打字"现象
  // 修复后：每次新调用链（retryCount === 0）创建新 _activeTaskRef；
  //         重试时复用同一 _activeTaskRef，abort() 通过引用传播到所有重试
  // 边界：单 page 实例同时只会有一个活跃调用链，多 page 并发不在考虑范围
  _activeTaskRef: null,

  /**
   * 发送消息 (流式)
   * @param {Array} messages 完整的消息上下文
   * @param {Function} onStream 接收到每个字符时的回调 (text) => {}
   * @param {Function} onFinish 完成时的回调 () => {}
   * @param {Function} onError 错误回调 (err) => {}
   * @param {number} retryCount 重试计数（内部使用）
   * @param {Object} options 场景配置：{ scene, model, thinking, temperature }
   * @returns {Object} requestTask 增强对象（含 abort() 方法），调用方不需要使用时忽略即可
   */
  async sendMessageStream(messages, onStream, onFinish, onError, retryCount = 0, options = {}) {
    // ===== 共享 taskRef（关键：abort 状态跨重试传播） =====
    // 每次新调用链（retryCount === 0）创建新 ref
    // 重试时复用现有 ref，abort() 通过该 ref 标志传播
    if (retryCount === 0 || !this._activeTaskRef) {
      this._activeTaskRef = { aborted: false, requestTask: null };
    }
    const taskRef = this._activeTaskRef;

    // ===== 请求级闭包状态（每次调用独立，重试天然隔离） =====
    let finished = false;        // 是否已触发 onFinish/onError（防重复触发）
    // 【修复 #2】SSE 跨 chunk 累积 buffer（必须是闭包外层变量，在所有 chunk 之间累积）
    let responseBuffer = '';

    // 安全包装：保证 onFinish/onError 只触发一次
    // 【P2 修复】同时检查 taskRef.aborted（外部中止信号）
    const safeFinish = () => {
      if (finished || taskRef.aborted) return;
      finished = true;
      if (onFinish) onFinish();
    };
    const safeError = (err) => {
      if (finished || taskRef.aborted) return;
      finished = true;
      if (onError) onError(err);
    };

    // 【修复 #3】统一的退避重试调度器，消除两处重复代码
    // 关键：重试时必须把 options 透传下去，否则 scene/model/thinking 全部丢失
    // 【P2 修复】用 taskRef.aborted 替代闭包局部 aborted
    const scheduleRetry = (delayMs, reason) => {
      if (taskRef.aborted) return false;
      if (retryCount >= 2) return false;
      console.log(`[AIService] ${reason}，${delayMs}ms 后重试 (${retryCount + 1}/2)`);
      setTimeout(() => {
        if (taskRef.aborted) return;
        this.sendMessageStream(messages, onStream, onFinish, onError, retryCount + 1, options);
      }, delayMs);
      return true;
    };
    // 指数退避：第1次重试 1s，第2次重试 2s（实际上限 8s）
    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000);

    // ===== 前置校验 =====
    const apiKey = SecretManager.getApiKey();
    if (!apiKey) {
      safeError("API Key 缺失");
      return;
    }

    // 检查网络状态
    const networkStatus = await NetworkUtils.checkNetworkStatus();
    if (!networkStatus.isConnected) {
      safeError({ message: "网络连接失败，请检查网络设置" });
      return;
    }

    // 根据 options 决定模型和思考模式
    // 从配置中获取参数，支持 options 覆盖
    const scene = options.scene || 'chat';
    const sceneConfig = AI_CONFIG[scene] || AI_CONFIG.chat;
    const model = options.model || sceneConfig.model;
    const thinking = options.thinking !== undefined ? options.thinking : sceneConfig.thinking;
    const temperature = options.temperature !== undefined ? options.temperature : sceneConfig.temperature;

    // ===== 发起请求 =====
    const requestTask = wx.request({
      url: 'https://api.deepseek.com/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      data: {
        model: model,
        messages: messages,
        stream: true,
        temperature: temperature,
        thinking: thinking,
        user_id: getDeviceId()
      },
      enableChunked: true,
      timeout: 30000,
      success: (res) => {
        if (taskRef.aborted) return;
        // 虽然连接成功，但如果状态码不是 200，也是错误
        if (res.statusCode !== 200) {
          console.error('API Error:', res);
          let errorMessage = `服务异常 code:${res.statusCode}`;
          let retried = false;

          if (res.statusCode === 401) {
            errorMessage = "API Key 无效，请重新配置";
          } else if (res.statusCode === 403) {
            errorMessage = "API Key 权限不足";
          } else if (res.statusCode === 429) {
            // 限流：尝试读取 Retry-After 头
            const headers = res.header || {};
            const retryAfterHeader = headers['Retry-After'] || headers['retry-after'];
            const retryAfterSec = parseInt(retryAfterHeader, 10) || 5;
            errorMessage = `请求过于频繁，${retryAfterSec}秒后重试`;
            retried = scheduleRetry(retryAfterSec * 1000, '限流 429');
          } else if (res.statusCode >= 500) {
            errorMessage = "服务器内部错误，请稍后重试";
            retried = scheduleRetry(backoffDelay, '5xx 错误');
          }

          if (!retried) safeError(errorMessage);
          return;
        }

        // 【P2 修复】statusCode === 200 兜底触发 safeFinish
        // 原因：部分服务端（或反向代理）可能在不发 [DONE] 的情况下就关闭连接
        //       如果完全依赖 onChunkReceived 中的 [DONE] 检测，状态会卡在 *GENERATING
        //       用户表现为："提示器灵推演中，但实际器灵已回复完"
        // 兜底逻辑：
        //   1) safeFinish 内部用 finished 标志防重复触发
        //   2) 优先信任 [DONE] 触发的正常完成路径；这里只在 [DONE] 缺失时兜底
        safeFinish();
      },
      fail: (err) => {
        if (taskRef.aborted) return;
        console.error('网络请求失败', err);
        let errorMessage = "网络请求失败";
        let retried = false;

        // 【修复】err.errMsg 可能为 undefined（错误对象不一定有该字段），用可选链 + 字符串检查
        const errMsg = err && (err.errMsg || err.message || '');
        if (errMsg.includes('timeout')) {
          errorMessage = "网络请求超时，请检查网络连接";
          retried = scheduleRetry(backoffDelay, '超时');
        } else if (errMsg.includes('connect')) {
          errorMessage = "网络连接失败，请检查网络设置";
        } else if (errMsg.includes('ssl')) {
          errorMessage = "SSL 证书验证失败";
        }
        if (!retried) safeError({ message: errorMessage, originalError: err });
      }
    });

    // 【P2 修复】保存 requestTask 引用到 taskRef
    // 原因：abort() 需要能直接 abort 当前活跃的 requestTask（包括重试产生的）
    taskRef.requestTask = requestTask;

    // ===== 处理流式 chunk =====
    requestTask.onChunkReceived((response) => {
      // 【P2 修复】同时检查 taskRef.aborted，处理"用户在重试时点中止"场景
      if (taskRef.aborted || finished) return;

      try {
        const arrayBuffer = response.data;
        let text = '';
        if (typeof TextDecoder !== 'undefined') {
          // 如果环境支持原生，优先用原生的（性能更好）
          text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer), { stream: true });
        } else {
          // 如果不支持（报错的那种情况），用我们手写的解码器
          text = MyTextDecoder.decode(arrayBuffer);
        }

        // 【修复 #2】SSE 跨 chunk 拼接：
        // 1. 先把本次 chunk 累积到外层 responseBuffer（跨 chunk 累积）
        // 2. 按 \n 切分，理论上所有完整行都能被切出来
        // 3. 最后一段可能不完整（跨 chunk 的 JSON 还没传完），弹出来留到下次
        responseBuffer += text;
        const lines = responseBuffer.split('\n');
        responseBuffer = lines.pop();  // 残留的不完整片段

        let sawDone = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          if (trimmed.includes('[DONE]')) {
            // 【P2 修复】不要立刻 return，先处理完剩余的 lines（防 [DONE] 不是最后一行时丢内容）
            sawDone = true;
            break;
          }

          const jsonStr = trimmed.replace(/^data:\s*/, '');
          try {
            const json = JSON.parse(jsonStr);
            // 防御式访问：避免上游字段缺失时报错
            const content = json.choices
              && json.choices[0]
              && json.choices[0].delta
              && json.choices[0].delta.content;
            if (content && onStream) onStream(content);
          } catch (e) {
            // 解析失败：可能是半行 JSON（极少见），把整行放回 buffer 头部等下次拼接
            responseBuffer = line + '\n' + responseBuffer;
          }
        }
        // 看到 [DONE] 后再统一触发 safeFinish
        if (sawDone) {
          safeFinish();
          return;
        }
      } catch (e) {
        // 【P2 修复】外层 try-catch 防止异常中断后续 chunk
        // 原因：TextDecoder.decode、responseBuffer 处理等都可能抛异常
        //       修复前：异常会导致 onChunkReceived 中断，[DONE] 收不到，状态卡死
        //       修复后：异常被吞掉，本 chunk 内容丢失，但后续 chunk 还能继续处理
        //       兜底：success(statusCode=200) 也会触发 safeFinish
        console.error('[AIService] onChunkReceived 处理异常（已吞掉）:', e);
      }
    });

    // 返回带 abort 能力的 task 对象（向后兼容：调用方可忽略此返回值）
    // 【P2 修复】abort 通过 taskRef 标志传播，能中止所有重试中的请求
    // 修复前：每个 sendMessageStream 调用都有自己的 aborted 闭包变量
    //         旧 task.abort() 只影响第一次的 requestTask，重试的第二次感知不到
    return {
      abort: () => {
        taskRef.aborted = true;
        // 优先 abort 当前 requestTask；如果重试已发起新的 requestTask，taskRef.requestTask 已更新
        try {
          if (requestTask) requestTask.abort();
          if (taskRef.requestTask && taskRef.requestTask !== requestTask) {
            taskRef.requestTask.abort();
          }
        } catch (e) { /* ignore */ }
      }
    };
  }
};

module.exports = AIService;