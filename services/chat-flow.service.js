// services/chat-flow.service.js
// 【P2 重构】对话流程编排服务
// 职责：把 chat.js 中 5 处重复的"保存用户消息 → 调用 AI → 保存 AI 消息"流程统一封装
// 优势：
//   1) chat.js 不再直接依赖 AIService / MemoryService
//   2) 5 处样板代码（save user + call AI + save assistant）合并为 4 个语义清晰的方法
//   3) 每个方法返回 abortable task，外部可主动中止
//   4) 单元测试更容易（不需要拉起整个 Page）
//
// 【P3 重构】ID 编排集中化：
//   关键变更：user msg id 和 ai placeholder id 都在 ChatFlowService 内部用
//   ChatService.generateId() 统一生成，Page 层只接收，不再自生成。
//   onAiPlaceholder 回调签名变更为 onAiPlaceholder(aiMsgId)

const ChatService = require('./chat.service');
const MemoryService = require('./memory.service');
const AIService = require('./ai.service');
const HeartDemonService = require('./heart-demon.service');
const DailyTaskService = require('./daily-task.service');

const ChatFlowService = {
  // ===== 内部工具：通用的"流式对话"封装 =====

  /**
   * 通用流式对话流程
   * @private
   * @param {Object} opts
   * @param {string} opts.userContent - 用户消息内容
   * @param {string} opts.userCategory - 用户消息分类（'normal' | 'demon_fear' | 'demon_regret'）
   * @param {Array} opts.requestMsgs - 已构建好的请求消息数组
   * @param {Object} opts.aiOptions - AIService 的 options（scene / model 等）
   * @param {Object} opts.callbacks - { onUserMsg, onAiPlaceholder, onStream, onFinish, onError }
   *   关键顺序：onUserMsg 先调用 → onAiPlaceholder 后调用（确保 UI 中用户消息在上、AI 在下）
   *   【P3 重构】onAiPlaceholder 现在接收 aiMsgId 参数：callbacks.onAiPlaceholder(aiMsgId)
   * @returns {Object} { task, userMsg, aiMsgId } - task 可调用 abort() 中止
   */
  _streamChat({ userContent, userCategory, requestMsgs, aiOptions, callbacks }) {
    // 【P3 重构】在调用 saveMessage 前用统一生成器产生 user 消息 id
    // 目的：保证 Page 层和 Storage 层的 id 一致（消除双轨制）
    const userMsgId = ChatService.generateId('user');

    // 1. 持久化用户消息（带 externalId，让 id 等于上面生成的 userMsgId）
    const userMsg = ChatService.saveMessage('user', userContent, userCategory, userMsgId);
    // 2. 先通知 page 上屏用户消息（顺序关键：必须先于 AI 占位）
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);

    // 【P3 重构】统一生成 ai 占位 id（在 AI 调用前，调用方无需等待也能拿到）
    const aiMsgId = ChatService.generateId('ai');
    // 3. 再通知 page 创建 AI 占位（保证 msgList 顺序为 [user, AI, ...]）
    //    【P3】签名变更：onAiPlaceholder(aiMsgId) 把 id 透传出去
    if (callbacks.onAiPlaceholder) callbacks.onAiPlaceholder(aiMsgId);

    // 4. 流式调用 AI
    let fullContent = '';
    const task = AIService.sendMessageStream(
      requestMsgs,
      (chunk) => {
        fullContent += chunk;
        if (callbacks.onStream) callbacks.onStream(fullContent, chunk);
      },
      () => {
        // 成功后持久化 AI 消息（用同一个 aiMsgId，Page 占位与 Storage 记录 id 完全一致）
        ChatService.saveMessage('assistant', fullContent, userCategory, aiMsgId);
        if (callbacks.onFinish) callbacks.onFinish(fullContent);
      },
      (err) => {
        // 失败：aiMsgId 不会写入 storage（避免占位未填但 storage 已有空消息）
        if (callbacks.onError) callbacks.onError(err);
      },
      0,
      aiOptions
    );

    return { task, userMsg, aiMsgId };
  },

  // ===== 公开方法 =====

  /**
   * 1. 普通对话流程
   * @param {string} text - 用户输入
   * @param {Object} callbacks - { onUserMsg, onAiPlaceholder(aiMsgId), onStream, onFinish, onError }
   * @returns {Object} { task, userMsg, aiMsgId }
   */
  startNormalChat(text, callbacks) {
    return this._streamChat({
      userContent: text,
      userCategory: 'normal',
      requestMsgs: MemoryService.buildRequestMessages(text),
      aiOptions: { scene: 'chat' },
      callbacks
    });
  },

  /**
   * 2. 今日宜练推荐流程
   * 注意：今日宜练有自己的 onResult 回调（含 gongfaId / gongfaName）
   *       所以这里不复用 _streamChat，而是单独实现
   * 【P3 重构】同样预生成 aiMsgId 透传给 page，保证 ID 一致
   * @param {string} userInput - 用户的输入（一般固定为"今日宜练"）
   * @param {Object} callbacks - { onUserMsg, onAiPlaceholder(aiMsgId), onStream, onResult, onError }
   * @returns {Object} { task, userMsg, aiMsgId }
   */
  startDailyTask(userInput, callbacks) {
    const userMsgId = ChatService.generateId('user');
    const userMsg = ChatService.saveMessage('user', userInput, 'normal', userMsgId);
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);
    // 【P3 重构】先于 AI 流式输出前调用 onAiPlaceholder(aiMsgId)，确保 UI 顺序 + ID 一致
    const aiMsgId = ChatService.generateId('ai');
    if (callbacks.onAiPlaceholder) callbacks.onAiPlaceholder(aiMsgId);

    // 【P2 修复】不再累加 fullContent
    // 原因：DailyTaskService.generateRecommendation 内部已 filter 并累积，传 (displayContent, deltaChunk)
    // 修复前：误把 displayContent 当 delta chunk 累加 → "今"→"今今日"→"今今日今日适合" 重复累积
    // 修复后：直接传 displayContent 给 page，契约与 _streamChat 保持一致
    const task = DailyTaskService.generateRecommendation(
      userInput,
      (displayContent, deltaChunk) => {
        if (callbacks.onStream) callbacks.onStream(displayContent, deltaChunk);
      },
      (result) => {
        // result = { displayText, gongfaId, gongfaName }
        // 【P3 重构】用同一个 aiMsgId 写入 storage
        ChatService.saveMessage('assistant', result.displayText, 'normal', aiMsgId);
        if (callbacks.onResult) callbacks.onResult(result);
      },
      (err) => {
        if (callbacks.onError) callbacks.onError(err);
      }
    );

    return { task, userMsg, aiMsgId };
  },

  /**
   * 3. 心魔修炼启动流程（启动问候）
   * @param {string} type - 'fear' | 'regret'
   * @param {Object} callbacks - { onUserMsg, onAiPlaceholder(aiMsgId), onStream, onFinish, onError }
   * @returns {Object} { task, userMsg, aiMsgId }
   */
  startHeartDemonStart(type, callbacks) {
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';
    const content = `心魔修炼-${type === 'fear' ? '恐惧' : '后悔'}`;

    const userMsgId = ChatService.generateId('user');
    const userMsg = ChatService.saveMessage('user', content, category, userMsgId);
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);
    const aiMsgId = ChatService.generateId('ai');
    if (callbacks.onAiPlaceholder) callbacks.onAiPlaceholder(aiMsgId);

    let fullContent = '';
    // 【P2 修复】必须把 userMsg 传给 HeartDemonService.start
    // 原因：start 签名是 start(type, userMsg, onStream, onFinish, onError)
    //       漏传 userMsg 会导致参数错位 → 进入错误分支 → 错误对象被当作 chunk 拼接
    const task = HeartDemonService.start(
      type,
      userMsg,
      (chunk) => {
        // 【P2 修复】HeartDemonService 的 onStream 现已统一为传单 chunk
        fullContent += chunk;
        if (callbacks.onStream) callbacks.onStream(fullContent, chunk);
      },
      (fullAiContent) => {
        // 【P3 重构】用同一个 aiMsgId 写入 storage
        ChatService.saveMessage('assistant', fullAiContent, category, aiMsgId);
        if (callbacks.onFinish) callbacks.onFinish(fullAiContent);
      },
      (err) => {
        if (callbacks.onError) callbacks.onError(err);
      }
    );

    return { task, userMsg, aiMsgId };
  },

  /**
   * 4. 心魔对话流程（每轮发言）
   * @param {string} text - 用户在心魔模式下的发言
   * @param {string} type - 'fear' | 'regret'
   * @param {Object} callbacks - { onUserMsg, onAiPlaceholder(aiMsgId), onStream, onFinish, onError }
   * @returns {Object} { task, userMsg, aiMsgId }
   */
  startHeartDemonDialogue(text, type, callbacks) {
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';

    const userMsgId = ChatService.generateId('user');
    const userMsg = ChatService.saveMessage('user', text, category, userMsgId);
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);
    const aiMsgId = ChatService.generateId('ai');
    if (callbacks.onAiPlaceholder) callbacks.onAiPlaceholder(aiMsgId);

    let fullContent = '';
    // 【P2 修复】必须把 userMsg 传给 HeartDemonService.sendMessage
    // 原因：sendMessage 签名是 sendMessage(userInput, userMsg, onStream, onFinish, onError)
    //       漏传 userMsg 会导致参数错位
    const task = HeartDemonService.sendMessage(
      text,
      userMsg,
      (chunk) => {
        fullContent += chunk;
        if (callbacks.onStream) callbacks.onStream(fullContent, chunk);
      },
      (fullAiContent) => {
        // 【P3 重构】用同一个 aiMsgId 写入 storage
        ChatService.saveMessage('assistant', fullAiContent, category, aiMsgId);
        if (callbacks.onFinish) callbacks.onFinish(fullAiContent);
      },
      (err) => {
        if (callbacks.onError) callbacks.onError(err);
      }
    );

    return { task, userMsg, aiMsgId };
  },

  /**
   * 5. 心魔完成结算流程
   * @param {string} type - 'fear' | 'regret'
   * @param {Object} callbacks - { onUserMsg, onAiPlaceholder(aiMsgId), onStream, onFinish, onError }
   * @returns {Object} { task, userMsg, aiMsgId }
   */
  startHeartDemonComplete(type, callbacks) {
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';
    const content = `完成心魔修炼-${type === 'fear' ? '恐惧' : '后悔'}`;

    const userMsgId = ChatService.generateId('user');
    const userMsg = ChatService.saveMessage('user', content, category, userMsgId);
    if (callbacks.onUserMsg) callbacks.onUserMsg(userMsg);
    const aiMsgId = ChatService.generateId('ai');
    if (callbacks.onAiPlaceholder) callbacks.onAiPlaceholder(aiMsgId);

    let fullContent = '';
    // 【P2 修复】必须把 userMsg 传给 HeartDemonService.complete
    const task = HeartDemonService.complete(
      userMsg,
      (chunk) => {
        fullContent += chunk;
        if (callbacks.onStream) callbacks.onStream(fullContent, chunk);
      },
      (finalContent, practiceResult) => {
        // 【P3 重构】用同一个 aiMsgId 写入 storage
        ChatService.saveMessage('assistant', finalContent, category, aiMsgId);
        if (callbacks.onFinish) callbacks.onFinish(finalContent, practiceResult);
      },
      (err) => {
        if (callbacks.onError) callbacks.onError(err);
      }
    );

    return { task, userMsg, aiMsgId };
  }
};

module.exports = ChatFlowService;
