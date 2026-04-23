const app = getApp();
const ChatService = require('../../services/chat.service');
const MemoryService = require('../../services/memory.service');
const AIService = require('../../services/ai.service');
const UserService = require('../../services/user.service');
const practiceService = require('../../services/practice.service');
const DailyTaskService = require('../../services/daily-task.service');
const HeartDemonService = require('../../services/heart-demon.service');

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
    isResponding: false,

    // 分页相关
    loadedCount: 0,
    pageSize: 20,
    hasMoreHistory: true,
    isLoadingHistory: false,
    earliestTimestamp: 0,  // 当前加载的最早消息时间戳

    dailyTask: {
      exists: false,
      completed: false,
      gongfaId: '',
      gongfaName: '',
      recommendText: '',
      isRecommending: false
    },

    isHeartDemonMode: false,
    showDemonTypePopup: false,
    showNoGongfaPopup: false,
    showCompleteConfirmPopup: false,
    selectedDemonType: null,
    showFearOption: false,
    showRegretOption: false,
    showSettlement: false,
    showLevelUp: false,
    settlementInfo: {},
    levelUpInfo: {}
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const isIphoneX = sys.safeArea.top > 20;
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      isIphoneX: isIphoneX
    });

    this.initHistory();
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
    this.setData({ scrollToViewId: '' }, () => {
      wx.nextTick(() => {
        this.setData({ scrollToViewId: 'bottom-anchor' });
      });
    });
  },

  // --- 发送逻辑 (核心修复) ---

  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.isResponding) return;

    this.setData({ inputText: '' });

    if (this.data.isHeartDemonMode) {
      this.handleDemonMessage(text);
      return;
    }

    // 1. 上屏用户消息
    const userMsg = ChatService.saveMessage('user', text);
    this.appendMessage(userMsg);

    // 2. AI 占位
    this.setData({ isResponding: true });
    
    // 【修复点 2】统一 Schema：补全 timestamp，防止历史记录加载报错
    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      timestamp: aiMsgId, 
      role: 'assistant',
      content: '...', 
      isLoading: true
    };
    this.appendMessage(aiMsgPlaceholder);

    // 3. 准备请求
    const requestMsgs = MemoryService.buildRequestMessages(text);
    let fullContent = '';
    let updateCount = 0; // 用于节流计数

    // 4. 发送流式请求
    AIService.sendMessageStream(
      requestMsgs,
      
      // onStream (接收数据)
      (chunk) => {
        fullContent += chunk;
        updateCount++;
        
        // 【修复点 4】节流渲染：每 5 次数据包才更新一次 UI
        // 解决高频 setData 导致的手机发烫和掉帧问题
        if (updateCount % 5 === 0 || chunk.includes('\n')) {
             this.updateAiMessage(aiMsgId, fullContent, true);
        }
      },
      
      // onFinish (成功完成)
      () => {
        // 最后一次强制更新，确保内容完整
        ChatService.saveMessage('assistant', fullContent);
        this.updateAiMessage(aiMsgId, fullContent, false);
        
        this.setData({ isResponding: false });
        MemoryService.checkAndUpdateMemory();
      },
      
      // onError (失败兜底) 【修复点 3】
      // 必须接住 Service 抛出的错误，否则按钮会一直转圈锁死
      (err) => {
        console.error('Chat Page Error:', err);
        const errorTip = "（灵力紊乱，传音失败，请点击重试）";
        // 移除 loading 状态，显示错误提示
        this.updateAiMessage(aiMsgId, errorTip, false);
        this.setData({ isResponding: false });
      }
    );
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

  // 【修复点 1】不可变更新：updateAiMessage
  // 使用 map 生成新数组，而不是 find + 修改对象属性
  updateAiMessage(id, content, isLoading) {
    const newList = this.data.msgList.map(item => {
      if (item.id === id) {
        // 返回一个新的对象，而不是修改旧对象
        return { 
          ...item, 
          content: content,
          isLoading: isLoading
        };
      }
      return item;
    });

    this.setData({ msgList: newList }, () => {
      // 只有在 isLoading (打字中) 的时候才自动滚动
      if (isLoading) {
         this.scrollToBottom();
      }
    });
  },

  onDailyTaskTap() {
    if (this.data.dailyTask.isRecommending) return;

    const status = this.data.dailyTask;

    // 情况1：今日宜练已推荐且未完成
    if (status.exists && !status.completed) {
      wx.showToast({
        title: '主人，今日宜练已经推荐过了哦，去修炼吧',
        icon: 'none'
      });
      return;
    }

    // 情况2：今日宜练已完成
    if (status.exists && status.completed) {
      wx.showToast({
        title: '主人，今日宜练已完成啦',
        icon: 'none'
      });
      return;
    }

    // 情况3：新的一天，可以推荐
    this.setData({ 'dailyTask.isRecommending': true });

    const userMsg = ChatService.saveMessage('user', '今日宜练');
    this.appendMessage(userMsg);

    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      timestamp: aiMsgId,
      role: 'assistant',
      content: '...',
      isLoading: true,
      showDailyTaskButtons: false
    };
    this.appendMessage(aiMsgPlaceholder);

    DailyTaskService.generateRecommendation(
      '今日宜练',
      (chunk) => {
        this.updateAiMessage(aiMsgId, chunk, true);
      },
      (result) => {
        const finalContent = result.displayText;
        
        ChatService.saveMessage('assistant', finalContent);

        const newList = this.data.msgList.map(item => {
          if (item.id === aiMsgId) {
            return {
              ...item,
              content: finalContent,
              isLoading: false,
              showDailyTaskButtons: true,
              gongfaId: result.gongfaId,
              gongfaName: result.gongfaName
            };
          }
          return item;
        });

        this.setData({
          msgList: newList,
          'dailyTask.isRecommending': false,
          'dailyTask.exists': true,
          'dailyTask.completed': false,
          'dailyTask.gongfaId': result.gongfaId,
          'dailyTask.gongfaName': result.gongfaName,
          'dailyTask.recommendText': result.displayText
        });

        this.scrollToBottom();
      },
      (error) => {
        let errorTip = error.message || '传音失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this.setData({ 'dailyTask.isRecommending': false });
      }
    );
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

    this.setData({ showDemonTypePopup: false, isHeartDemonMode: true });

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: `心魔修炼-${type === 'fear' ? '恐惧' : '后悔'}`,
      timestamp: Date.now()
    };
    this.appendMessage(userMsg);

    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      timestamp: aiMsgId,
      role: 'assistant',
      content: '...',
      isLoading: true
    };
    this.appendMessage(aiMsgPlaceholder);

    HeartDemonService.start(
      type,
      (content) => {
        this.updateAiMessage(aiMsgId, content, true);
      },
      (finalContent) => {
        this.updateAiMessage(aiMsgId, finalContent, false);
        this.setData({ 'dailyTask.isRecommending': false });
        this.scrollToBottom();
      },
      (error) => {
        let errorTip = error.message || '心魔修炼启动失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
      }
    );
  },

  onCompleteDemonTap() {
    this.setData({ showCompleteConfirmPopup: true });
  },

  onCloseCompleteConfirmPopup() {
    this.setData({ showCompleteConfirmPopup: false });
  },

  onConfirmComplete() {
    this.setData({ showCompleteConfirmPopup: false });

    const typeName = this.data.selectedDemonType === 'fear' ? '恐惧' : '后悔';
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: `完成心魔修炼-${typeName}`,
      timestamp: Date.now()
    };
    this.appendMessage(userMsg);

    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      timestamp: aiMsgId,
      role: 'assistant',
      content: '...',
      isLoading: true
    };
    this.appendMessage(aiMsgPlaceholder);

    HeartDemonService.complete(
      (content) => {
        this.updateAiMessage(aiMsgId, content, true);
      },
      (finalContent, practiceResult) => {
        this.updateAiMessage(aiMsgId, finalContent, false);
        this.setData({ isHeartDemonMode: false });

        // 根据修炼结果显示对应的弹窗
        if (practiceResult && practiceResult.isLevelUp) {
          // 显示升级/突破弹窗
          this.setData({
            showLevelUp: true,
            levelUpInfo: {
              oldLevel: practiceResult.oldLevel,
              newLevel: practiceResult.newLevel
            }
          });
        } else if (practiceResult && practiceResult.settlement) {
          // 显示结算弹窗
          this.setData({
            showSettlement: true,
            settlementInfo: practiceResult.settlement
          });
        }

        this.scrollToBottom();
      },
      (error) => {
        let errorTip = error.message || '完成修炼失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
        this.setData({ isHeartDemonMode: false });
      }
    );
  },

  onCloseSettlement() {
    this.setData({ showSettlement: false });
  },

  onCloseLevelUp() {
    this.setData({ showLevelUp: false });
  },

  showPracticeCompletePopup() {
    wx.showModal({
      title: '修炼完成',
      content: '恭喜！本次心魔修炼获得修为 +10',
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        const practice = wx.getStorageSync('userpractice') || {};
        practice.xiwei = (practice.xiwei || 0) + 10;
        wx.setStorageSync('userpractice', practice);
      }
    });
  },

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
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    this.appendMessage(userMsg);

    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      timestamp: aiMsgId,
      role: 'assistant',
      content: '...',
      isLoading: true
    };
    this.appendMessage(aiMsgPlaceholder);

    HeartDemonService.sendMessage(
      text,
      (content) => {
        this.updateAiMessage(aiMsgId, content, true);
      },
      (finalContent) => {
        this.updateAiMessage(aiMsgId, finalContent, false);
        this.scrollToBottom();
      },
      (error) => {
        let errorTip = error.message || '传音失败';
        this.updateAiMessage(aiMsgId, errorTip, false);
      }
    );
  }
});