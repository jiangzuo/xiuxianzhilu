const app = getApp();
const ChatService = require('../../services/chat.service');
const MemoryService = require('../../services/memory.service');
const AIService = require('../../services/ai.service');
const UserService = require('../../services/user.service');
const DailyTaskService = require('../../services/daily-task.service');

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

    dailyTask: {
      exists: false,
      completed: false,
      gongfaId: '',
      gongfaName: '',
      recommendText: '',
      isRecommending: false
    }
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
    const history = ChatService.getHistory(50);
    const visibleHistory = history.filter(msg => msg.role !== 'system');
    const displayList = visibleHistory.slice(-20);

    displayList.forEach(msg => {
      // 容错：防止旧数据没有 timestamp 导致报错
      const ts = msg.timestamp || Date.now();
      const d = new Date(ts);
      msg.timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
      msg.showTime = true; 
    });
    
    this.setData({ msgList: displayList });
    
    setTimeout(() => {
      this.scrollToBottom();
    }, 200);
  },

  // --- 交互逻辑 ---
  goBack() {
    wx.navigateBack();
  },

  hideKeyboard() {
    wx.hideKeyboard();
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
  }
})