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

  // --- 【修改点 1】加载历史时过滤系统消息 ---
  initHistory() {
    // 获取最近 20 条，但可能包含 system 消息
    const history = ChatService.getHistory(50); // 多取一点，防止过滤后不够
    
    // 过滤掉 role 为 'system' 的消息，只显示 user 和 assistant
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
    
    // 延迟滚动到底部，确保渲染完成
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

  // --- 【修改点 2】优化滚动逻辑 ---
  // 使用 setData 回调和 nextTick 确保滚动生效
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

    // 4. 调用 AI
    const requestMsgs = MemoryService.buildRequestMessages(text);
    let fullContent = '';

    AIService.sendMessageStream(
      requestMsgs,
      (chunk) => {
        fullContent += chunk;
        this.updateAiMessage(aiMsgId, fullContent, true);
      },
      () => {
        ChatService.saveMessage('assistant', fullContent);
        this.updateAiMessage(aiMsgId, fullContent, false);
        this.setData({ isResponding: false });
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
      this.scrollToBottom(); // 添加消息后立即滚动
    });
  },

  // --- 【修改点 3】AI 打字过程中自动滚动 ---
  updateAiMessage(id, content, isLoading) {
    const list = this.data.msgList;
    const target = list.find(m => m.id === id);
    if (target) {
      target.content = content;
      target.isLoading = isLoading;
      
      this.setData({ msgList: list }, () => {
        // 只有在 isLoading (打字中) 的时候，才需要频繁滚动
        // 这样当 AI 回复很长时，屏幕会自动往上顶，始终显示最新一行
        if (isLoading) {
           this.scrollToBottom();
        }
      });
    }
  }
})