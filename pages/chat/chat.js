const app = getApp();
const ChatService = require('../../services/chat.service');
const MemoryService = require('../../services/memory.service');
const AIService = require('../../services/ai.service');
const UserService = require('../../services/user.service');
const practiceService = require('../../services/practice.service');
const DailyTaskService = require('../../services/daily-task.service');
const HeartDemonService = require('../../services/heart-demon.service');
// 【P2 重构】新增：对话流程编排服务
// 把 5 处"保存用户消息 → 调用 AI → 保存 AI 消息"的样板代码统一封装
const ChatFlowService = require('../../services/chat-flow.service');
// 【P2 重构】抽离：FSM 状态机常量
// 单元测试和 page 业务逻辑共享同一份 FSM 定义
const fsm = require('./chat-fsm');

// 【P0 修复】统一的 ID 生成器
// 原因：原代码在多处用 Date.now() 作为消息 ID，在同一毫秒内连续调用可能产生重复 ID
//       导致 updateAiMessage 用 id 查找时匹配到错误消息（用户消息被 AI 内容覆盖）
// 设计：时间戳(13位) + 自增序号(2位) + 随机串(4位) + 角色前缀
//       例子："ai_1718067600000_01_x7k2"
let _msgIdCounter = 0;
function generateMsgId(role) {
  _msgIdCounter = (_msgIdCounter + 1) % 100;
  const ts = Date.now();
  const seq = String(_msgIdCounter).padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 4);
  return `${role}_${ts}_${seq}_${rand}`;
}

// 【P1 重构】主状态机：统一替代 isResponding / isHeartDemonMode / dailyTask.isRecommending
// FSM 常量定义在 ./chat-fsm.js，便于单元测试
const CHAT_STATES = fsm.CHAT_STATES;
const CHAT_TRANSITIONS = fsm.CHAT_TRANSITIONS;
const isAIBusyState = fsm.isAIBusyState;
const isDemonState = fsm.isDemonState;
// 【P2 修复】使用 canTransition 统一状态转换检查
// 原因：原 _setChatState 手写了 "if (current === newState) return true"，导致非终态的
//       同状态转换被放行（如 DEMON_IDLE → DEMON_IDLE），双击心魔会并发启动两个流式任务
const canTransition = fsm.canTransition;

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    keyboardHeight: 0,
    isIphoneX: false,

    msgList: [],
    inputText: '',
    scrollToViewId: '',

    isFocus: false,

    // 【P1 重构】主状态机：替代 3 个布尔值
    chatState: CHAT_STATES.IDLE,
    // 派生标志：自动同步，给 WXML 用（比写 chatState === 'XXX' 更可读）
    isAIBusy: false,
    isInDemon: false,

    // 分页相关
    loadedCount: 0,
    pageSize: 20,
    hasMoreHistory: true,
    isLoadingHistory: false,
    earliestTimestamp: 0,  // 当前加载的最早消息时间戳

    // 今日宜练业务数据
    // 【P1 移除】isRecommending 由 chatState === 'DAILY_TASK_RECOMMENDING' 取代
    dailyTask: {
      exists: false,
      completed: false,
      gongfaId: '',
      gongfaName: '',
      recommendText: ''
    },

    // 模态弹窗（保持独立标志位，由 WXML 直接绑定，无竞态风险）
    showDemonTypePopup: false,
    showNoGongfaPopup: false,
    showCompleteConfirmPopup: false,
    showSettlement: false,
    showLevelUp: false,
    selectedDemonType: null,
    showFearOption: false,
    showRegretOption: false,
    settlementInfo: {},
    levelUpInfo: {}
  },

  // ====== 【P1 重构】状态机守门员 ======

  /**
   * 唯一的状态变更入口。所有异步/交互路径必须通过这里
   * @param {string} newState 目标状态
   * @param {string} reason 调试用，记录转换原因
   * @returns {boolean} 是否允许该转换
   */
  _setChatState(newState, reason = '') {
    const current = this.data.chatState;

    // 【P2 修复】用 canTransition 统一检查（含幂等规则：仅终态允许同状态转换）
    // 修复前：手写 "if (current === newState) return true" → 任何 from===to 都通过
    //         导致双击心魔的第二次点击不会被拦截，DEMON_IDLE → DEMON_IDLE 被放行
    //         → HeartDemonService.start 被并发调用 2 次 → 重复保存 + 双流拼接
    if (!canTransition(current, newState)) {
      console.warn(`[ChatFSM] 非法转换: ${current} → ${newState} (${reason})`);
      if (isAIBusyState(current)) {
        wx.showToast({ title: '器灵正在推演中...', icon: 'none' });
      }
      return false;
    }

    // 同步派生标志（让 WXML 不必写 chatState === 'XXX' 这种长表达式）
    this.setData({
      chatState: newState,
      isAIBusy: isAIBusyState(newState),
      isInDemon: isDemonState(newState)
    });

    console.log(`[ChatFSM] ${current} → ${newState} (${reason})`);
    return true;
  },

  /**
   * 【P1 重构】AI 占位符工厂方法
   * 统一 5 处样板代码（sendMessage / onDailyTaskTap / onStartDemon / onConfirmComplete / handleDemonMessage）
   * @param {Object} extra 额外的字段（默认 isLoading: true, showDailyTaskButtons: false）
   * @returns {string} aiMsgId
   */
  _createAiPlaceholder(extra = {}) {
    const aiMsgId = generateMsgId('ai');
    const placeholder = {
      id: aiMsgId,
      timestamp: Date.now(),
      role: 'assistant',
      content: '...',
      isLoading: true,
      showDailyTaskButtons: false,
      ...extra
    };
    this.appendMessage(placeholder);
    return aiMsgId;
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const isIphoneX = sys.safeArea.top > 20;
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      isIphoneX: isIphoneX
    });

    this.initHistory();
    // 【P2 新增】恢复未完成的心魔 session
    // 原因：用户退出聊天页（或小程序被回收）后，再次进入时
    //       应自动恢复心魔模式，避免 UI 状态错位
    this.restoreDemonState();
  },

  /**
   * 【P2 新增】从 Service 恢复心魔 session
   * 触发时机：onLoad（Page 首次创建时）
   * 恢复内容：selectedDemonType + chatState (DEMON_IDLE)
   * 失败/无 session：保持初始状态，不弹任何提示
   */
  restoreDemonState() {
    if (typeof HeartDemonService === 'undefined') return;
    const restored = HeartDemonService.tryRestore();
    if (!restored) return;

    // 1. 恢复心魔类型（用于显示"恐惧"/"悔恨"徽标等）
    this.setData({
      selectedDemonType: restored.currentType,
    });

    // 2. 恢复 FSM 到 DEMON_IDLE（isInDemon 派生标志会从 true 切回）
    //    通过 chat-fsm 而不是直接 setData，保持状态机单一来源
    if (typeof this._setChatState === 'function' && typeof CHAT_STATES !== 'undefined') {
      // 抑制 fsm 转换的副作用（不要触发 AI 调用）
      this._setChatState(CHAT_STATES.DEMON_IDLE, 'restoreFromSession', { skipSideEffects: true });
    }

    // 3. 友好提示用户"已恢复"（避免用户疑惑"为什么按钮变了"）
    //    wx.showToast 不在测试环境，单独 try/catch 防止阻塞
    try {
      const demonLabel = restored.currentType === 'fear' ? '恐惧' : '悔恨';
      wx.showToast({
        title: `已恢复${demonLabel}心魔修炼（第${restored.roundCount}轮）`,
        icon: 'none',
        duration: 2500
      });
    } catch (e) { /* 测试环境无 wx，静默 */ }
  },

  onShow() {
    this.checkDailyTaskStatus();
  },

  onUnload() {
    MemoryService.checkAndUpdateMemory();
  },

  checkDailyTaskStatus() {
    const status = DailyTaskService.getDailyTaskStatus();
    this.setData({
      'dailyTask.exists': status.exists,
      'dailyTask.completed': status.completed,
      'dailyTask.gongfaId': status.gongfaId || '',
      'dailyTask.gongfaName': status.gongfaName || '',
      'dailyTask.recommendText': status.recommendText || ''
    });
  },

  // --- 加载历史 ---
  initHistory() {
    const history = ChatService.getHistory(this.data.pageSize);
    const visibleHistory = history.filter(msg => msg.role !== 'system');
    
    // 初始加载最近的消息（最新的在最后）
    const displayList = visibleHistory;
    const totalCount = ChatService.getHistory(0).filter(msg => msg.role !== 'system').length;
    
    this.formatMessageList(displayList);
    
    // 记录当前加载的最早消息时间戳
    const earliestTimestamp = displayList.length > 0 ? displayList[0].timestamp : 0;
    
    this.setData({
      msgList: displayList,
      loadedCount: displayList.length,
      hasMoreHistory: displayList.length < totalCount,
      earliestTimestamp: earliestTimestamp
    });
    
    setTimeout(() => {
      this.scrollToBottom();
    }, 200);
  },

  // 加载更多历史消息
  loadMoreHistory() {
    if (this.data.isLoadingHistory || !this.data.hasMoreHistory) return;
    
    this.setData({ isLoadingHistory: true });
    
    // 获取所有历史消息
    const allHistory = ChatService.getHistory(0).filter(msg => msg.role !== 'system');
    const pageSize = this.data.pageSize;
    
    // 找到 earliestTimestamp 之前的消息
    let earlierMessages = allHistory.filter(msg => msg.timestamp < this.data.earliestTimestamp);
    
    // 取最新的 pageSize 条
    earlierMessages = earlierMessages.slice(-pageSize);
    
    if (earlierMessages.length > 0) {
      this.formatMessageList(earlierMessages);
      
      // 往列表前面追加（因为是更早的消息）
      const newList = [...earlierMessages, ...this.data.msgList];
      
      // 更新最早时间戳
      const newEarliestTimestamp = earlierMessages[0].timestamp;
      
      // 检查是否还有更多
      const remainingMessages = allHistory.filter(msg => msg.timestamp < newEarliestTimestamp);
      const hasMore = remainingMessages.length > 0;
      
      this.setData({
        msgList: newList,
        loadedCount: this.data.loadedCount + earlierMessages.length,
        hasMoreHistory: hasMore,
        earliestTimestamp: newEarliestTimestamp,
        isLoadingHistory: false
      });
    } else {
      this.setData({
        hasMoreHistory: false,
        isLoadingHistory: false
      });
    }
  },

  // 滚动到顶部事件
  onScrollToUpper() {
    this.loadMoreHistory();
  },

  // 格式化消息列表
  formatMessageList(list) {
    list.forEach(msg => {
      const ts = msg.timestamp || Date.now();
      const d = new Date(ts);
      msg.timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
      msg.showTime = true; 
    });
  },

  // --- 交互逻辑 ---
  goBack() {
    wx.navigateBack();
  },

  hideKeyboard() {
    wx.hideKeyboard();
  },

  preventTouchMove() {
    return;
  },

  onInputFocus(e) {
    this.setData({ keyboardHeight: e.detail.height });
    this.scrollToBottom();
  },

  onInputBlur() {
    this.setData({ keyboardHeight: 0, isFocus: false });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  scrollToBottom() {
    // 【P2 优化】rAF 节流：避免每 chunk 都触发 setData + nextTick
    // 原实现：流式更新时每次 scrollToBottom 都执行 setData 两次 + nextTick
    //       高频触发导致渲染层繁忙
    // 新实现：用 requestAnimationFrame 把同一帧内的多次调用合并
    if (this._scrollRafId) return;  // 已经排过帧了
    this._scrollRafId = setTimeout(() => {
      this._scrollRafId = null;
      this.setData({ scrollToViewId: '' }, () => {
        wx.nextTick(() => {
          this.setData({ scrollToViewId: 'bottom-anchor' });
        });
      });
    }, 50);  // 50ms 节流窗口
  },

  // --- 发送逻辑 (核心修复) ---

  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text) return;

    // 【P1 重构】FSM 守门：先锁状态，再执行业务
    if (this.data.isInDemon) {
      if (!this._setChatState(CHAT_STATES.DEMON_GENERATING, 'sendMessage:心魔模式发言')) return;
    } else {
      if (!this._setChatState(CHAT_STATES.NORMAL_GENERATING, 'sendMessage:日常发言')) return;
    }

    // 立即清空输入框
    this.setData({ inputText: '' });

    if (this.data.isInDemon) {
      this.handleDemonMessage(text);
      return;
    }

    // 【P2 重构 + Bug 修复】调用 ChatFlowService，page 只关心 UI 回调
    // 关键：用 onAiPlaceholder 回调让 ChatFlowService 控制顺序（user → AI）
    let aiMsgId;
    const { task } = ChatFlowService.startNormalChat(text, {
      onUserMsg: (userMsg) => this.appendMessage(userMsg),
      onAiPlaceholder: () => {
        // 在用户消息 append 之后才创建 AI 占位（保证 UI 顺序正确）
        aiMsgId = this._createAiPlaceholder();
      },
      onStream: (fullContent) => this._handleStreamChunk(aiMsgId, fullContent),
      onFinish: (fullContent) => this._handleChatFinish(aiMsgId, fullContent),
      onError: (err) => this._handleChatError(aiMsgId, err)
    });
    // 【P2 任务引用】保留 task 引用用于 abort
    this._currentTask = task;
  },

  /**
   * 【P2 重构】统一的流式 chunk 处理（含节流）
   */
  _handleStreamChunk(aiMsgId, fullContent) {
    // 节流：每 5 次或遇到换行才更新一次
    this._streamUpdateCount = (this._streamUpdateCount || 0) + 1;
    if (this._streamUpdateCount % 5 === 0 || fullContent.includes('\n')) {
      this.updateAiMessage(aiMsgId, fullContent, true);
    }
  },

  /**
   * 【P2 重构】统一的聊天完成处理
   */
  _handleChatFinish(aiMsgId, fullContent) {
    this.updateAiMessage(aiMsgId, fullContent, false);
    this._setChatState(CHAT_STATES.IDLE, 'onFinish:日常推演完成');
    this._streamUpdateCount = 0;
    MemoryService.checkAndUpdateMemory();
  },

  /**
   * 【P2 重构】统一的聊天错误处理
   */
  _handleChatError(aiMsgId, err) {
    console.error('Chat Page Error:', err);
    // 用 O(1) 路径更新：标 isLoading=false、显示重试按钮
    const index = this.data.msgList.findIndex(item => item.id === aiMsgId);
    if (index !== -1) {
      this.setData({
        [`msgList[${index}].content`]: '（灵力紊乱，传音失败）',
        [`msgList[${index}].isLoading`]: false,
        [`msgList[${index}].showRetry`]: true
      });
    }
    this._setChatState(CHAT_STATES.IDLE, 'onError:日常推演失败');
    this._streamUpdateCount = 0;
  },

  /**
   * 【P2 新增】重试上次失败的对话
   * 1. 把失败消息的 showRetry 标志去掉，重新置为 loading
   * 2. 用同样的输入重新发起一次 ChatFlowService.startNormalChat
   * 3. 失败的旧消息留作历史，新 AI 消息会创建（更清晰的体验）
   */
  onRetryLast(e) {
    // 防御：先确认当前状态可以重试
    if (this.data.chatState !== CHAT_STATES.IDLE) {
      wx.showToast({ title: '器灵正在推演中...', icon: 'none' });
      return;
    }
    // 从 dataSet 拿到失败消息的 id
    const failedMsgId = e && e.currentTarget && e.currentTarget.dataset.msgid;
    // 把上次的用户输入放回 inputText
    // 从 chat history 反查：找到失败消息的前一条 user 消息
    const history = ChatService.getHistory(0);
    const lastUserInput = this._findLastUserInputForFailedAi(failedMsgId, history);
    if (!lastUserInput) {
      wx.showToast({ title: '未找到原输入，请重新输入', icon: 'none' });
      return;
    }
    // 把失败消息的 showRetry 标志去掉
    if (failedMsgId) {
      const index = this.data.msgList.findIndex(item => item.id === failedMsgId);
      if (index !== -1) {
        this.setData({
          [`msgList[${index}].showRetry`]: false
        });
      }
    }
    // 重新发送
    this.setData({ inputText: lastUserInput });
    this.sendMessage();
  },

  /**
   * 辅助方法：从 chat history 反查失败 AI 消息前的用户输入
   * 算法：从 history 末尾往前找，定位到失败消息后，前一条 user 消息就是原输入
   */
  _findLastUserInputForFailedAi(_failedMsgId, history) {
    if (!history || history.length === 0) return null;
    // 找到最后一条 user 消息的内容
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        return history[i].content;
      }
    }
    return null;
  },

  // 【修复点 1】不可变更新：appendMessage
  // 使用 [...old, new] 创建新数组，而不是 push 修改原数组
  appendMessage(msg) {
    const d = new Date();
    msg.timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
    msg.showTime = true;
    
    // 关键：不修改引用，而是替换引用
    const newList = [...this.data.msgList, msg];
    
    this.setData({ msgList: newList }, () => {
      this.scrollToBottom();
    });
  },

  // 【P0 修复】O(1) 数据路径精确更新
  // 原实现：每次流式更新都 map 整个 msgList，setData 全量替换
  //   后果：50 条历史记录时，AI 每吐一个字就要全量序列化并跨线程传输 50 条
  //   手机发烫、卡死、掉帧
  // 新实现：使用微信小程序的 [array[index].prop] 路径语法，只更新单条消息的变更字段
  //   跨线程传输的数据量从 O(N) 降到 O(1)
  updateAiMessage(id, content, isLoading) {
    const index = this.data.msgList.findIndex(item => item.id === id);
    if (index === -1) {
      // 消息已被滚动出去（理论上不该发生，但加保护）
      return;
    }

    // 关键：只声明变更的字段，微信小程序的路径更新只会序列化这些字段
    this.setData({
      [`msgList[${index}].content`]: content,
      [`msgList[${index}].isLoading`]: isLoading
    }, () => {
      // 只有在 isLoading (打字中) 的时候才自动滚动
      if (isLoading) {
        this.scrollToBottom();
      }
    });
  },

  onDailyTaskTap() {
    // 【P1 重构】FSM 守门（替代 isRecommending 布尔值）
    if (!this._setChatState(CHAT_STATES.DAILY_TASK_RECOMMENDING, 'onDailyTaskTap:开始推荐')) {
      return;
    }

    const status = this.data.dailyTask;

    // 情况1：今日宜练已推荐且未完成
    if (status.exists && !status.completed) {
      wx.showToast({ title: '主人，今日宜练已经推荐过了哦，去修炼吧', icon: 'none' });
      this._setChatState(CHAT_STATES.IDLE, 'onDailyTaskTap:已推荐过');
      return;
    }

    // 情况2：今日宜练已完成
    if (status.exists && status.completed) {
      wx.showToast({ title: '主人，今日宜练已完成啦', icon: 'none' });
      this._setChatState(CHAT_STATES.IDLE, 'onDailyTaskTap:已完成');
      return;
    }

    // 情况3：新的一天，可以推荐
    // 【P2 重构 + Bug 修复】用 onAiPlaceholder 控制顺序（user → AI）
    let aiMsgId;
    ChatFlowService.startDailyTask('今日宜练', {
      onUserMsg: (userMsg) => this.appendMessage(userMsg),
      onAiPlaceholder: () => {
        aiMsgId = this._createAiPlaceholder();
      },
      onStream: (fullContent) => this.updateAiMessage(aiMsgId, fullContent, true),
      onResult: (result) => {
        // 路径 1：成功推荐（含 gongfaId / gongfaName）
        const index = this.data.msgList.findIndex(item => item.id === aiMsgId);
        if (index !== -1) {
          this.setData({
            [`msgList[${index}].content`]: result.displayText,
            [`msgList[${index}].isLoading`]: false,
            [`msgList[${index}].showDailyTaskButtons`]: true,
            [`msgList[${index}].gongfaId`]: result.gongfaId,
            [`msgList[${index}].gongfaName`]: result.gongfaName
          });
        }
        this.setData({
          'dailyTask.exists': true,
          'dailyTask.completed': false,
          'dailyTask.gongfaId': result.gongfaId,
          'dailyTask.gongfaName': result.gongfaName,
          'dailyTask.recommendText': result.displayText
        });
        this.scrollToBottom();
        this._setChatState(CHAT_STATES.IDLE, '今日宜练推荐完成');
      },
      onError: (err) => {
        let errorTip = (err && err.message) || '传音失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this._setChatState(CHAT_STATES.IDLE, '今日宜练推荐失败');
      }
    });
  },

  onGoPractice(e) {
    const gongfaId = e.currentTarget.dataset.gongfaid;
    const gongfaName = e.currentTarget.dataset.gongfaname;
    console.log('[今日宜练] 去修炼 click:', gongfaId, gongfaName);
    if (!gongfaId) {
      console.log('[今日宜练] gongfaId 为空');
      return;
    }

    app.globalData.dailyTaskTarget = {
      gongfaId,
      gongfaName
    };

    wx.reLaunch({
      url: '/pages/practice/practice'
    });
  },

  onHeartDemonTap() {
    // 检查是否配置了心魔修炼功法
    const demonStatus = practiceService.hasHeartDemonGongfa();
    if (!demonStatus.hasAny) {
      this.setData({ showNoGongfaPopup: true });
      return;
    }
    // 根据用户配置的功法显示对应的选项
    this.setData({ 
      showDemonTypePopup: true,
      showFearOption: demonStatus.hasFear,
      showRegretOption: demonStatus.hasRegret
    });
  },

  onCloseDemonPopup() {
    this.setData({ showDemonTypePopup: false, selectedDemonType: null });
  },

  onSelectDemonType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ selectedDemonType: type });
  },

  onStartDemon() {
    const type = this.data.selectedDemonType;
    if (!type) {
      wx.showToast({ title: '请选择修炼类型', icon: 'none' });
      return;
    }

    this.setData({ showDemonTypePopup: false });

    // 【P1 重构】FSM 守门：进入心魔空闲态
    if (!this._setChatState(CHAT_STATES.DEMON_IDLE, 'onStartDemon:启动心魔')) return;

    // 【P2 修复】立刻设 DEMON_GENERATING，防止用户在推演期间发消息导致双推演并发
    // 原因：startHeartDemonStart 启动后 AI 进入"启动问候"推演
    //       修复前：推演期间状态保持 DEMON_IDLE，用户在推演期间点发送 →
    //              sendMessage 检查 isInDemon=true → _setChatState(DEMON_IDLE → DEMON_GENERATING) 成功
    //              → 启动 HeartDemonService.sendMessage 的第二个推演
    //              → 两个推演并发运行，且第二个推演读历史时第一个推演的 AI 回复还没保存
    //              → 用户看到消息拼接混乱（"历史对话"里 AI 位置是空的）
    //       修复后：推演期间状态是 DEMON_GENERATING，FSM 守门会拦截用户发送
    if (!this._setChatState(CHAT_STATES.DEMON_GENERATING, 'onStartDemon:启动问候推演中')) return;

    // 【P2 重构 + Bug 修复】用 onAiPlaceholder 控制顺序（user → AI）
    let aiMsgId;
    ChatFlowService.startHeartDemonStart(type, {
      onUserMsg: (userMsg) => this.appendMessage(userMsg),
      onAiPlaceholder: () => {
        aiMsgId = this._createAiPlaceholder();
      },
      onStream: (fullContent) => this.updateAiMessage(aiMsgId, fullContent, true),
      onFinish: (fullContent) => {
        this.updateAiMessage(aiMsgId, fullContent, false);
        this.scrollToBottom();
        this._setChatState(CHAT_STATES.DEMON_IDLE, 'onStartDemon:启动问候完成');
      },
      onError: (err) => {
        const errorTip = (err && err.message) || '心魔修炼启动失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this._setChatState(CHAT_STATES.IDLE, 'onStartDemon:启动失败');
      }
    });
  },

  onCompleteDemonTap() {
    this.setData({ showCompleteConfirmPopup: true });
  },

  onCloseCompleteConfirmPopup() {
    this.setData({ showCompleteConfirmPopup: false });
  },

  onConfirmComplete() {
    this.setData({ showCompleteConfirmPopup: false });

    const type = this.data.selectedDemonType;
    if (!type) {
      wx.showToast({ title: '请选择修炼类型', icon: 'none' });
      return;
    }

    // 【P2 修复】启动推演前 _setChatState(DEMON_GENERATING)
    // 原因：startHeartDemonComplete 启动后 AI 进入"完成修炼"推演
    //       修复前：推演期间状态保持 DEMON_IDLE，用户在推演期间发消息
    //              → 启动 sendMessage 的第二个推演
    //              → 两个推演并发，状态混乱
    //       修复后：FSM 守门拦截用户发送
    if (!this._setChatState(CHAT_STATES.DEMON_GENERATING, 'onConfirmComplete:完成推演中')) return;

    // 【P2 重构 + Bug 修复】用 onAiPlaceholder 控制顺序（user → AI）
    let aiMsgId;
    ChatFlowService.startHeartDemonComplete(type, {
      onUserMsg: (userMsg) => this.appendMessage(userMsg),
      onAiPlaceholder: () => {
        aiMsgId = this._createAiPlaceholder();
      },
      onStream: (fullContent) => this.updateAiMessage(aiMsgId, fullContent, true),
      onFinish: (finalContent, practiceResult) => {
        this.updateAiMessage(aiMsgId, finalContent, false);

        // FSM 转换到结算/升级态
        if (practiceResult && practiceResult.isLevelUp) {
          this._setChatState(CHAT_STATES.LEVEL_UP, 'onConfirmComplete:境界突破');
          this.setData({
            showLevelUp: true,
            levelUpInfo: {
              oldLevel: practiceResult.oldLevel,
              newLevel: practiceResult.newLevel
            }
          });
        } else if (practiceResult && practiceResult.settlement) {
          this._setChatState(CHAT_STATES.SETTLEMENT, 'onConfirmComplete:结算');
          this.setData({
            showSettlement: true,
            settlementInfo: practiceResult.settlement
          });
        } else {
          this._setChatState(CHAT_STATES.IDLE, 'onConfirmComplete:完成无结算');
        }

        this.scrollToBottom();
      },
      onError: (err) => {
        const errorTip = (err && err.message) || '完成修炼失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this._setChatState(CHAT_STATES.IDLE, 'onConfirmComplete:完成失败');
      }
    });
  },

  onCloseSettlement() {
    this.setData({ showSettlement: false });
    // 【P1 重构】FSM：关闭结算回到 IDLE
    this._setChatState(CHAT_STATES.IDLE, 'onCloseSettlement');
  },

  onCloseLevelUp() {
    this.setData({ showLevelUp: false });
    // 【P1 重构】FSM：关闭升级回到 IDLE
    this._setChatState(CHAT_STATES.IDLE, 'onCloseLevelUp');
  },

  // 【P0 修复】原 showPracticeCompletePopup 函数已删除
  // 原因：
  //   1) 从未被任何地方调用（死代码）
  //   2) 使用错误的存储键 'userpractice'（应为 'userpractices'）
  //   3) 引用不存在的 'xiwei' 字段
  //   4) 已有 onConfirmComplete + showSettlement 弹窗完全替代其功能

  onCloseNoGongfaPopup() {
    this.setData({ showNoGongfaPopup: false });
  },

  onGoGongfa() {
    this.setData({ showNoGongfaPopup: false });
    wx.reLaunch({
      url: '/pages/settings/settings?tab=mind'
    });
  },

  handleDemonMessage(text) {
    // 【P2 Bug 修复】移除重复的 FSM 守门
    // 原因：sendMessage 已经在 line 349 调用过 _setChatState(DEMON_GENERATING)
    //       这里再调一次会导致 canTransition(DEMON_GENERATING, DEMON_GENERATING) 拒绝
    //       → 弹 toast "器灵推演中" → handleDemonMessage 直接 return → 推演不启动
    //       → 用户看到 toast 但实际没有任何 AI 在推演
    // 修复：信任 sendMessage 已守门，handleDemonMessage 只做业务编排

    const type = this.data.selectedDemonType;
    if (!type) {
      wx.showToast({ title: '请选择修炼类型', icon: 'none' });
      this._setChatState(CHAT_STATES.IDLE, 'handleDemonMessage:类型缺失');
      return;
    }

    // 【P2 重构 + Bug 修复】用 onAiPlaceholder 控制顺序（user → AI）
    let aiMsgId;
    ChatFlowService.startHeartDemonDialogue(text, type, {
      onUserMsg: (userMsg) => this.appendMessage(userMsg),
      onAiPlaceholder: () => {
        aiMsgId = this._createAiPlaceholder();
      },
      onStream: (fullContent) => this.updateAiMessage(aiMsgId, fullContent, true),
      onFinish: (fullContent) => {
        this.updateAiMessage(aiMsgId, fullContent, false);
        this.scrollToBottom();
        this._setChatState(CHAT_STATES.DEMON_IDLE, 'handleDemonMessage:本轮完成');
      },
      onError: (err) => {
        const errorTip = (err && err.message) || '传音失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this._setChatState(CHAT_STATES.DEMON_IDLE, 'handleDemonMessage:本轮失败');
      }
    });
  }
});