// services/heart-demon.service.js 心魔修炼服务
const AIService = require('./ai.service');
const ChatService = require('./chat.service');
const UserService = require('./user.service');
const MemoryService = require('./memory.service');
const practiceService = require('./practice.service');
// 【P2 新增】引入缓存读取（用于修为加成前查原始修为）
const Cache = require('../utils/cache-manager');
// 【P2 新增】引入今日宜练服务，用于修为加成查询
// 心魔完成时如果匹配今日宜练，修为翻倍（与修炼场页面逻辑一致）
const DailyTaskService = require('./daily-task.service');
const { HEART_DEMON_COMMON } = require('../prompts/skills/heart-demon/heart-demon');
const { HEART_DEMON_FEAR } = require('../prompts/skills/heart-demon/fear');
const { HEART_DEMON_REGRET } = require('../prompts/skills/heart-demon/regret');

// 【P2 新增】心魔 session 持久化配置
// 目的：用户退出聊天页（或小程序被回收）后，重新进入时能恢复未完成的心魔修炼
// TTL：24 小时。超过则视为过期自动丢弃，避免"昨天的悔恨今天被恢复"的诡异体验
const SESSION_KEY = 'heart_demon_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const HeartDemonService = {
  _currentType: null,
  _roundCount: 0,
  _currentGongfaId: null,
  _sessionStartRound: 0,
  _sessionStartMsgId: null,
  // 【P2 修复】保存当前推演的 task 引用，便于 abortCurrent() 调用
  // 修复前：AIService.sendMessageStream 是 async 函数，HeartDemonService 的同步接口
  //         拿不到 abort 句柄，推演过程中用户无法主动中止
  // 修复后：内部保存 task 引用，调用方可以通过 abortCurrent() 中止
  _currentTask: null,

  // ====== 【P2 新增】Session 持久化 ======
  // 关键：状态变更时立即 _saveSession()，保证任何时刻 Service 状态与 Storage 一致
  // 读取方：chat.js onLoad 调用 tryRestore()

  /**
   * 将当前 session 状态写入 Storage
   * @private
   */
  _saveSession() {
    // 仅在有活动 session 时保存（_currentType 非空）
    if (!this._currentType) {
      this._clearSession();
      return;
    }
    wx.setStorageSync(SESSION_KEY, {
      currentType: this._currentType,
      roundCount: this._roundCount,
      currentGongfaId: this._currentGongfaId,
      sessionStartMsgId: this._sessionStartMsgId,
      savedAt: Date.now()
    });
  },

  /**
   * 清除 session（完成修炼或主动放弃时调用）
   * @private
   */
  _clearSession() {
    try {
      wx.removeStorageSync(SESSION_KEY);
    } catch (e) {
      // 静默：Storage 清理失败不应影响主流程
    }
  },

  /**
   * 尝试从 Storage 恢复 session
   * @returns {Object|null} 恢复的 session 信息（含 roundCount），失败/过期返回 null
   *
   * 调用方在 chat.js onLoad 中：
   *   const restored = HeartDemonService.tryRestore();
   *   if (restored) { 恢复 selectedDemonType + FSM }
   */
  tryRestore() {
    let saved;
    try {
      saved = wx.getStorageSync(SESSION_KEY);
    } catch (e) {
      return null;
    }
    if (!saved || !saved.currentType) return null;

    // TTL 检查：超过 24 小时视为过期
    if (Date.now() - (saved.savedAt || 0) > SESSION_TTL_MS) {
      this._clearSession();
      return null;
    }

    // 恢复内存状态
    this._currentType = saved.currentType;
    this._roundCount = saved.roundCount || 0;
    this._currentGongfaId = saved.currentGongfaId || null;
    this._sessionStartMsgId = saved.sessionStartMsgId || null;

    return {
      currentType: this._currentType,
      roundCount: this._roundCount,
      ageMs: Date.now() - saved.savedAt  // 距上次保存多久（用于 toast 提示）
    };
  },

  getDemonPrompt(type) {
    if (type === 'fear') {
      return HEART_DEMON_FEAR;
    } else if (type === 'regret') {
      return HEART_DEMON_REGRET;
    }
    return '';
  },

  buildSystemMessage(type) {
    const demonPrompt = this.getDemonPrompt(type);
    const userArchive = UserService.buildUserArchive();

    let content = HEART_DEMON_COMMON
      .replace('{hard_info_text}', userArchive.hard_info_text)
      .replace('{recent_activity_log}', userArchive.recent_activity_log)
      .replace('{practice_stats}', userArchive.practice_stats)
      .replace('{soft_info_text}', userArchive.soft_info_text)
      .replace('{rolling_summary}', userArchive.rolling_summary);

    content = content + '\n\n' + demonPrompt;

    return { role: 'system', content };
  },

  _buildContext(type) {
    // 获取本次会话的消息（从 start 保存的消息之后，最多20条）
    const allHistory = ChatService.getDemonContextForAI(type, 20);
    const demonHistory = this._sessionStartMsgId
      ? allHistory.filter(msg => msg.id >= this._sessionStartMsgId)
      : allHistory;
    console.log('[HeartDemon] 历史对话条数:', demonHistory.length);
    
    const rounds = [];
    let currentRound = null;
    
    demonHistory.forEach(msg => {
      if (msg.role === 'user') {
        if (currentRound) {
          rounds.push(currentRound);
        }
        currentRound = { user: msg.content };
      } else if (msg.role === 'assistant' && currentRound) {
        currentRound.assistant = msg.content;
        rounds.push(currentRound);
        currentRound = null;
      }
    });
    
    const historyRoundCount = rounds.length;
    
    const historyStr = rounds.map((round) => {
      return `用户：${round.user}\n系统：${round.assistant || ''}`;
    }).join('\n\n');

    return { historyStr, historyRoundCount };
  },

  start(type, userMsg, onStream, onFinish, onError) {
    // 【P2 修复】不再内部 saveMessage
    // 原因：ChatFlowService 已经 saveMessage 过 user msg 并触发了 onUserMsg 回调
    //       原代码在内部再 saveMessage 一次，导致：
    //         1) chat history 中出现 2 条相同的 "心魔修炼-后悔" 消息
    //         2) onUserMsg 回调和 HeartDemonService 的 saveMessage 不同步
    // 修复：userMsg 由 ChatFlowService 传入（已 saveMessage 过）
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: 'HeartDemonService.start: 缺少 userMsg 参数' });
      return;
    }

    this._currentType = type;
    this._roundCount = 0;
    this._sessionStartRound = 0;
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';

    // 记录当前修炼的功法ID
    const data = practiceService.getpracticeData();
    const mindList = data.mind || [];
    const key = type === 'fear' ? 'heart-demon-fear' : 'heart-demon-regret';
    const gongfa = mindList.find(item => item.key === key);
    this._currentGongfaId = gongfa ? gongfa.id : null;

    // 【P2 修复】使用传入的 userMsg.id 作为 session 起点
    this._sessionStartMsgId = userMsg.id;
    const userContent = userMsg.content;  // "心魔修炼-恐惧" 或 "心魔修炼-后悔"

    this._roundCount += 1;
    // 【P2 修复】状态变更后立即持久化，保证后续 Page 销毁/重建能恢复
    this._saveSession();
    const { historyStr } = this._buildContext(type);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userContent}\n【当前轮次】：第${this._roundCount}轮`;

    const messages = [
      this.buildSystemMessage(type),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    // 【P2 修复】保存 task 引用到 Service 内部，便于 HeartDemonService.abortCurrent() 调用
    // 修复前：AIService.sendMessageStream 是 async 函数，返回 Promise<{abort}>
    //         同步调用方拿不到 abort 句柄，推演过程中用户无法主动中止
    // 修复后：HeartDemonService 内部保存 task 引用，调用方可以通过 abortCurrent() 中止
    //        保持同步接口，避免改动 chat-flow.service.js 的所有 5 个 start 方法
    this._currentTask = AIService.sendMessageStream(
      messages,
      (chunk) => {
        // 【P2 修复】对外 onStream 传单 chunk（与 AIService.sendMessageStream 语义一致）
        // 原因：外部 ChatFlowService 会用 fullContent += chunk 累加，如果传累积内容会导致内容重复拼接
        fullAiContent += chunk;
        if (onStream) onStream(chunk);
      },
      () => {
        // 【P2 修复】不再内部 saveMessage
        // 原因：ChatFlowService 的 onFinish 回调会负责 ChatService.saveMessage('assistant', ...)
        //       原来内部 + 外部双重保存，导致聊天记录出现 2 条相同的 AI 消息
        this._currentTask = null;  // 任务完成，清空引用
        if (onFinish) onFinish(fullAiContent);
      },
      (err) => {
        console.error('[HeartDemon] AI调用失败', err);
        this._currentTask = null;  // 任务失败，清空引用
        if (onError) onError(err);
      },
      0,
      { scene: 'heartDemon' }
    );
  },

  /**
   * 【P2 修复】中止当前心魔推演
   * 用途：用户在推演中想取消时调用（例如想"中途退出"）
   * 注意：调用后 onFinish/onError 都不会被触发（因为 taskRef.aborted = true），
   *       所以 Page 状态需要外部主动重置
   * 边界：当前没有 abort 按钮，此方法暂时未被调用；保留接口以备未来需要
   */
  abortCurrent() {
    if (this._currentTask && typeof this._currentTask.then === 'function') {
      // task 是 Promise<{abort}>，等 resolve 后再 abort
      this._currentTask.then(task => {
        if (task && typeof task.abort === 'function') task.abort();
      }).catch(() => { /* ignore */ });
    } else if (this._currentTask && typeof this._currentTask.abort === 'function') {
      // task 已经是 {abort} 对象
      this._currentTask.abort();
    }
    this._currentTask = null;
  },

  sendMessage(userInput, userMsg, onStream, onFinish, onError) {
    // 【P2 修复】不再内部 saveMessage，userMsg 由 ChatFlowService 传入
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: 'HeartDemonService.sendMessage: 缺少 userMsg 参数' });
      return;
    }
    if (!this._currentType) {
      if (onError) onError({ message: '未在心魔修炼模式' });
      return;
    }

    const category = this._currentType === 'fear' ? 'demon_fear' : 'demon_regret';

    this._roundCount += 1;
    // 【P2 修复】状态变更后立即持久化
    this._saveSession();
    const currentRound = this._roundCount;

    const { historyStr } = this._buildContext(this._currentType);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userInput}\n【当前轮次】：第${currentRound}轮`;

    const messages = [
      this.buildSystemMessage(this._currentType),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    // 【P2 修复】保存 task 引用到 Service 内部
    this._currentTask = AIService.sendMessageStream(
      messages,
      (chunk) => {
        // 【P2 修复】对外 onStream 传单 chunk（与 AIService.sendMessageStream 语义一致）
        fullAiContent += chunk;
        if (onStream) onStream(chunk);
      },
      () => {
        // 【P2 修复】不再内部 saveMessage，由 ChatFlowService.onFinish 统一管理
        this._currentTask = null;  // 任务完成，清空引用
        if (onFinish) onFinish(fullAiContent);
      },
      (err) => {
        console.error('[HeartDemon] AI调用失败', err);
        this._currentTask = null;  // 任务失败，清空引用
        if (onError) onError(err);
      },
      0,
      { scene: 'heartDemon' }
    );
  },

  complete(userMsg, onStream, onFinish, onError) {
    // 【P2 修复】不再内部 saveMessage，userMsg 由 ChatFlowService 传入
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: 'HeartDemonService.complete: 缺少 userMsg 参数' });
      return;
    }
    if (!this._currentType) {
      if (onError) onError({ message: '未在心魔修炼模式' });
      return;
    }

    const category = this._currentType === 'fear' ? 'demon_fear' : 'demon_regret';
    const typeName = this._currentType === 'fear' ? '恐惧' : '后悔';
    const userContent = userMsg.content;  // "完成心魔修炼-恐惧" 或 "完成心魔修炼-后悔"

    this._roundCount += 1;
    const currentRound = this._roundCount;

    const { historyStr } = this._buildContext(this._currentType);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userContent}\n【当前轮次】：第${currentRound}轮`;

    const messages = [
      this.buildSystemMessage(this._currentType),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    // 【P2 修复】保存 task 引用到 Service 内部
    this._currentTask = AIService.sendMessageStream(
      messages,
      (chunk) => {
        // 【P2 修复】对外 onStream 传单 chunk（与 AIService.sendMessageStream 语义一致）
        fullAiContent += chunk;
        if (onStream) onStream(chunk);
      },
      () => {
        // 【P2 修复】不再内部 saveMessage，由 ChatFlowService.onFinish 统一管理

        // 调用统一的修炼完成方法，更新真实数据
        let practiceResult = null;
        if (this._currentGongfaId) {
          // 【P2 修复】修为加成：先取原始修为，再问今日宜练是否加成
          // 与修炼场页面逻辑保持一致：chat-flow 也走 DailyTaskService.getBonusExp
          // 修为归一化集中管理，未来加新触发点也不用各自实现
          const userpractices = Cache.get('userpractices') || {};
          const mindList = userpractices.mind || [];
          const mindItem = mindList.find(g => g.id === this._currentGongfaId);
          const baseExp = (mindItem && mindItem.exp) || 10;
          const finalExp = DailyTaskService.getBonusExp(this._currentGongfaId, baseExp);
          practiceResult = practiceService.doPractice(this._currentGongfaId, 'mind', finalExp);
        }

        this._currentType = null;
        this._roundCount = 0;
        this._currentGongfaId = null;
        this._currentTask = null;  // 任务完成，清空引用
        // 【P2 修复】完成修炼成功，清除持久化 session
        // 原因：session 已结束，下次进入页面不应自动恢复
        this._clearSession();
        MemoryService.forceUpdateMemory();
        if (onFinish) onFinish(fullAiContent, practiceResult);
      },
      (err) => {
        console.error('[HeartDemon] 完成修炼失败', err);
        this._currentTask = null;  // 任务失败，清空引用
        if (onError) onError(err);
      },
      0,
      { scene: 'heartDemon' }
    );
  },

  isInMode() {
    return this._currentType !== null;
  },

  getCurrentType() {
    return this._currentType;
  }
};

module.exports = HeartDemonService;
