// tests/unit/chat-onshow-reload.test.js
// 验证 chat.js onShow 在切回页面时能从 Storage 增量加载"在 chat 之外产生的新消息"
// 场景：practice 页面 triggerPracticeReaction 保存了 AI 夸奖消息到 Storage
//       用户通过 tab bar 切回 chat → onShow → _reloadNewMessages → 把新消息追加到 msgList

// 关键：必须在 require chat.js 之前先 mock getApp / Page / wx 等全局

// 1. mock getApp（chat.js 顶部就调用了 getApp()）
global.getApp = () => ({
  globalData: {
    fontLoaded: true,
    fontCallbacks: []
  },
  onFontReady: (cb) => { if (typeof cb === 'function') cb(); }
});

// 2. mock Page（chat.js 末尾调用 Page({...})），捕获配置
let capturedPageConfig = null;
global.Page = (config) => { capturedPageConfig = config; };

// 3. mock wx（chat.js 间接使用的 services 内部会读 wx）
global.wx = {
  getSystemInfoSync: () => ({ statusBarHeight: 20, safeArea: { top: 30 } }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn(),
  showToast: jest.fn(),
  nextTick: (cb) => setTimeout(cb, 0)
};

// 4. mock 所有 chat.js 顶部 require 的 service
jest.mock('../../services/chat.service', () => ({
  getHistory: jest.fn(() => []),
  getContextForAI: jest.fn(() => []),
  saveMessage: jest.fn((role, content) => ({
    id: 'msg-' + Date.now() + '-' + Math.random(),
    role, content, timestamp: Date.now()
  }))
}));
jest.mock('../../services/memory.service', () => ({
  checkAndUpdateMemory: jest.fn(),
  buildRequestMessages: jest.fn(() => []),
  buildSystemMessage: () => ({ content: 'sys' })
}));
jest.mock('../../services/ai.service', () => ({
  sendMessageStream: jest.fn(() => ({ abort: jest.fn() }))
}));
jest.mock('../../services/user.service', () => ({}));
jest.mock('../../services/practice.service', () => ({
  hasHeartDemonGongfa: () => ({ hasAny: false })
}));
jest.mock('../../services/daily-task.service', () => ({
  getDailyTaskStatus: () => ({ exists: false })
}));
jest.mock('../../services/heart-demon.service', () => ({
  tryRestore: () => null
}));

// 5. mock chat-fsm（chat.js 引入）
jest.mock('../../pages/chat/chat-fsm', () => ({
  CHAT_STATES: { IDLE: 'IDLE' },
  CHAT_TRANSITIONS: {},
  isAIBusyState: () => false,
  isDemonState: () => false,
  canTransition: () => true
}));

// 关键：必须在所有 mock 设置完成后才 require
require('../../pages/chat/chat.js');

const ChatService = require('../../services/chat.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// 辅助：构造一个 page 实例（模拟微信 Page 运行时）
// 把 capturedPageConfig 中的所有方法合并到 page 上，这样 this.xxx() 能正确调用
function makePage(extra = {}) {
  // 关键：mock setData 让它在调用时同步触发回调
  // 原因：_reloadNewMessages 把 scrollToBottom 放在 setData 的第二个参数（callback）里
  //       微信原生 setData 会在数据更新完成后异步触发 callback
  //       测试环境需要 mock 这个行为，否则 callback 内的断言不执行
  const setDataMock = jest.fn((data, callback) => {
    if (typeof callback === 'function') callback();
  });
  const page = {
    data: {
      msgList: [],
      dailyTask: { exists: false, completed: false, gongfaId: '', gongfaName: '', recommendText: '' },
      ...(extra.data || {})
    },
    setData: setDataMock,
    checkDailyTaskStatus: jest.fn(),
    scrollToBottom: jest.fn(),
    formatMessageList: (list) => list.forEach(m => { m.timeStr = '12:00'; m.showTime = true; }),
    ...(extra.methods || {}),
    ...extra
  };
  // 把 page config 的所有方法挂到 page 上（onShow / _reloadNewMessages 等）
  Object.keys(capturedPageConfig).forEach((key) => {
    if (typeof capturedPageConfig[key] === 'function' && !(key in page)) {
      page[key] = capturedPageConfig[key];
    }
  });
  return page;
}

describe('【P1 修复】chat.js onShow 增量加载"在 chat 之外产生的新消息"', () => {
  test('onShow 必须调用 _reloadNewMessages', () => {
    expect(typeof capturedPageConfig.onShow).toBe('function');
    expect(typeof capturedPageConfig._reloadNewMessages).toBe('function');

    const page = makePage();
    ChatService.getHistory.mockReturnValue([]);

    page.onShow();

    expect(page.checkDailyTaskStatus).toHaveBeenCalled();
    // 没有新消息时，setData 不应被调用（避免无谓渲染）
    expect(page.setData).not.toHaveBeenCalled();
  });

  test('Storage 里有新消息（时间戳 > msgList 末尾）时应追加到 msgList', () => {
    const oldMsg = { id: 'old1', role: 'assistant', content: '旧消息', timestamp: 1000 };
    const newMsg1 = { id: 'new1', role: 'user', content: '今日宜练', timestamp: 2000 };
    const newMsg2 = { id: 'new2', role: 'assistant', content: 'AI 夸奖', timestamp: 3000 };

    const page = makePage({ data: { msgList: [oldMsg], dailyTask: {} } });

    // 模拟 Storage 返回：旧消息 + 两条新消息 + 一条 system（应被过滤）
    ChatService.getHistory.mockReturnValue([
      oldMsg, newMsg1, newMsg2,
      { id: 'sys1', role: 'system', content: '系统', timestamp: 2500 }
    ]);

    page._reloadNewMessages();

    // 关键断言：setData 被调用，msgList 追加了 new1 和 new2
    expect(page.setData).toHaveBeenCalledTimes(1);
    const setDataArg = page.setData.mock.calls[0][0];
    expect(setDataArg.msgList).toHaveLength(3);
    expect(setDataArg.msgList[0]).toBe(oldMsg);
    expect(setDataArg.msgList[1].id).toBe('new1');
    expect(setDataArg.msgList[2].id).toBe('new2');
    // system 消息应被过滤
    expect(setDataArg.msgList.find(m => m.role === 'system')).toBeUndefined();

    // 滚动到底部
    expect(page.scrollToBottom).toHaveBeenCalled();

    // formatMessageList 应被调用（为新消息生成 timeStr）
    expect(newMsg1.timeStr).toBe('12:00');
    expect(newMsg2.timeStr).toBe('12:00');
  });

  test('Storage 里没有时间戳更新的消息时不应触发 setData', () => {
    const page = makePage({
      data: {
        msgList: [{ id: 'a', role: 'user', content: 'x', timestamp: 5000 }],
        dailyTask: {}
      }
    });

    // Storage 里的消息时间戳都比 msgList 末尾小
    ChatService.getHistory.mockReturnValue([
      { id: 'a', role: 'user', content: 'x', timestamp: 5000 },
      { id: 'b', role: 'assistant', content: 'y', timestamp: 3000 }
    ]);

    page._reloadNewMessages();

    expect(page.setData).not.toHaveBeenCalled();
  });

  test('msgList 为空时（lastTimestamp=0）应加载所有非 system 消息', () => {
    const page = makePage({ data: { msgList: [], dailyTask: {} } });

    ChatService.getHistory.mockReturnValue([
      { id: 'm1', role: 'user', content: 'a', timestamp: 100 },
      { id: 'm2', role: 'assistant', content: 'b', timestamp: 200 },
      { id: 'sys', role: 'system', content: 'sys', timestamp: 50 }
    ]);

    page._reloadNewMessages();

    expect(page.setData).toHaveBeenCalledTimes(1);
    const msgList = page.setData.mock.calls[0][0].msgList;
    expect(msgList).toHaveLength(2);
    expect(msgList[0].id).toBe('m1');
    expect(msgList[1].id).toBe('m2');
  });

  test('消息没有 timestamp 字段时应降级为 0，不抛错', () => {
    const page = makePage({
      data: {
        msgList: [{ id: 'a', role: 'user', content: 'x' }], // 缺 timestamp
        dailyTask: {}
      }
    });

    ChatService.getHistory.mockReturnValue([
      { id: 'a', role: 'user', content: 'x' }, // 也没 timestamp
      { id: 'b', role: 'assistant', content: 'y', timestamp: 9999 }
    ]);

    expect(() => page._reloadNewMessages()).not.toThrow();
    // b 的时间戳 9999 > 0，所以会被追加
    expect(page.setData).toHaveBeenCalledTimes(1);
    expect(page.setData.mock.calls[0][0].msgList).toHaveLength(2);
  });
});
