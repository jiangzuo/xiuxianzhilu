const app = getApp();
const ChatService = require('../../services/chat.service');
const MemoryService = require('../../services/memory.service');
const AIService = require('../../services/ai.service');
const UserService = require('../../services/user.service');

Page({
  data: {
    // 布局相关
    statusBarHeight: 0,
    navBarHeight: 44, 
    keyboardHeight: 0,
    isIphoneX: false,
    
    // 数据相关
    msgList: [],
    inputText: '',
    scrollToViewId: '', // 滚动锚点
    
    // 状态
    isFocus: false,
    isResponding: false,
    
    // 计数器 (用于触发记忆分析)
    msgCount: 0 
  },

  onLoad() {
    // 1. 系统信息适配
    const sys = wx.getSystemInfoSync();
    const isIphoneX = sys.safeArea.top > 20;
    this.setData({ 
      statusBarHeight: sys.statusBarHeight,
      isIphoneX: isIphoneX
    });

    // 2. 加载历史
    this.initHistory();
  },

  // 页面卸载时触发记忆整理
  onUnload() {
    MemoryService.checkAndUpdateMemory();
  },

  // --- 加载历史 ---
  initHistory() {
    // 获取最近 50 条，过滤掉 system 消息
    const history = ChatService.getHistory(50);
    const visibleHistory = history.filter(msg => msg.role !== 'system');
    
    // 截取最近 20 条显示
    const displayList = visibleHistory.slice(-20);

    // 时间格式化
    displayList.forEach(msg => {
      const d = new Date(msg.timestamp);
      msg.timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
      msg.showTime = true; 
    });
    
    this.setData({ msgList: displayList });
    
    // 延迟滚动到底部
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
    this.setData({ 
      keyboardHeight: e.detail.height,
    });
    this.scrollToBottom();
  },

  onInputBlur() {
    this.setData({ 
      keyboardHeight: 0,
      isFocus: false 
    });
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

  // --- 发送逻辑 ---

  sendMessage() {
    const text = this.data.inputText.trim();
    // 防止为空或正在回复中
    if (!text || this.data.isResponding) return;

    // 1. 清空输入框
    this.setData({ inputText: '' });

    // 2. 上屏用户消息
    const userMsg = ChatService.saveMessage('user', text);
    this.appendMessage(userMsg);

    // 3. AI 占位
    this.setData({ isResponding: true });
    const aiMsgId = Date.now();
    const aiMsgPlaceholder = {
      id: aiMsgId,
      role: 'assistant',
      content: '...', // 思考中...
      isLoading: true
    };
    this.appendMessage(aiMsgPlaceholder);

    // 4. 组装 Prompt
    const requestMsgs = MemoryService.buildRequestMessages(text);
    let fullContent = '';

    // 5. 发送流式请求
    AIService.sendMessageStream(
      requestMsgs,
      (chunk) => {
        // 收到数据块
        fullContent += chunk;
        this.updateAiMessage(aiMsgId, fullContent, true);
      },
      () => {
        // 完成
        ChatService.saveMessage('assistant', fullContent);
        this.updateAiMessage(aiMsgId, fullContent, false);
        this.setData({ isResponding: false });
        
        // 【新增】对话结束，尝试触发后台记忆整理
        // 这里只是检查是否满足条件(比如满10条)，满足则触发，不阻塞UI
        MemoryService.checkAndUpdateMemory(); 
      }
    );
  },

  appendMessage(msg) {
    const list = this.data.msgList;
    const d = new Date();
    msg.timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
    msg.showTime = true;
    
    list.push(msg);
    this.setData({ msgList: list }, () => {
      this.scrollToBottom();
    });
  },

  updateAiMessage(id, content, isLoading) {
    const list = this.data.msgList;
    const target = list.find(m => m.id === id);
    if (target) {
      target.content = content;
      target.isLoading = isLoading;
      
      this.setData({ msgList: list }, () => {
        // 打字过程中持续滚动
        if (isLoading) {
           this.scrollToBottom();
        }
      });
    }
  }
})