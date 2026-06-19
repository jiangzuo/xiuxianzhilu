// tests/unit/chat-flow.test.js
// 验证消息顺序：用户消息必须在 AI 消息之前 appendMessage
// 验证心魔流程：userMsg 正确传递 + AI 消息单一保存

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn((role, content, category) => ({
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    role, content, category: category || 'normal',
    timestamp: Date.now()
  })),
  getHistory: jest.fn(() => [])
}));
jest.mock('../../services/memory.service', () => ({
  buildRequestMessages: jest.fn((text) => [{ role: 'user', content: text }])
}));
jest.mock('../../services/ai.service', () => ({
  sendMessageStream: jest.fn((msgs, onStream, onFinish, onError) => {
    // 模拟同步触发 stream chunk + finish
    setTimeout(() => onStream('AI回复1'), 0);
    setTimeout(() => onFinish('AI完整回复'), 10);
    return { abort: jest.fn() };
  })
}));
jest.mock('../../services/heart-demon.service', () => ({
  start: jest.fn((type, userMsg, onStream, onFinish, onError) => {
    // 模拟心魔启动：先校验 userMsg，再模拟流式输出
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: '缺少 userMsg' });
      return { abort: jest.fn() };
    }
    setTimeout(() => onStream('心魔chunk1'), 0);
    setTimeout(() => onFinish('心魔完整回复'), 10);
    return { abort: jest.fn() };
  }),
  sendMessage: jest.fn((userInput, userMsg, onStream, onFinish, onError) => {
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: '缺少 userMsg' });
      return { abort: jest.fn() };
    }
    setTimeout(() => onStream('心魔对话chunk'), 0);
    setTimeout(() => onFinish('心魔对话完整回复'), 10);
    return { abort: jest.fn() };
  }),
  complete: jest.fn((userMsg, onStream, onFinish, onError) => {
    if (!userMsg || !userMsg.id) {
      if (onError) onError({ message: '缺少 userMsg' });
      return { abort: jest.fn() };
    }
    setTimeout(() => onStream('心魔完成chunk'), 0);
    setTimeout(() => onFinish('心魔完成完整回复', { isLevelUp: false }), 10);
    return { abort: jest.fn() };
  })
}));
jest.mock('../../services/daily-task.service', () => ({
  generateRecommendation: jest.fn()
}));

const ChatFlowService = require('../../services/chat-flow.service');
const HeartDemonService = require('../../services/heart-demon.service');
const ChatService = require('../../services/chat.service');

describe('ChatFlowService - 消息顺序（P2 Bug 修复）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('startNormalChat 回调顺序：onUserMsg → onAiPlaceholder → onStream', (done) => {
    const callOrder = [];

    ChatFlowService.startNormalChat('在吗', {
      onUserMsg: (userMsg) => {
        callOrder.push('onUserMsg');
        expect(userMsg.role).toBe('user');
        expect(userMsg.content).toBe('在吗');
      },
      onAiPlaceholder: () => {
        callOrder.push('onAiPlaceholder');
      },
      onStream: (fullContent) => {
        callOrder.push('onStream');
      },
      onFinish: (fullContent) => {
        callOrder.push('onFinish');
        try {
          expect(callOrder).toEqual(['onUserMsg', 'onAiPlaceholder', 'onStream', 'onFinish']);
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startNormalChat 应该先 saveMessage user 再调用 onUserMsg', (done) => {
    const ChatService = require('../../services/chat.service');
    const order = [];

    ChatService.saveMessage.mockImplementation((role, content) => {
      order.push(`save_${role}`);
      return { id: `mock_${role}`, role, content };
    });

    ChatFlowService.startNormalChat('测试', {
      onUserMsg: () => order.push('onUserMsg'),
      onAiPlaceholder: () => order.push('onAiPlaceholder'),
      onStream: () => order.push('onStream'),
      onFinish: () => {
        order.push('onFinish');
        try {
          // 必须先 save user，再回调 page
          expect(order[0]).toBe('save_user');
          expect(order).toContain('onUserMsg');
          expect(order).toContain('onAiPlaceholder');
          expect(order.indexOf('onUserMsg')).toBeLessThan(order.indexOf('onAiPlaceholder'));
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('onAiPlaceholder 应该在 onUserMsg 之后被调用（保证 UI 顺序）', (done) => {
    let userIndex = -1, placeholderIndex = -1;
    const order = [];

    ChatFlowService.startNormalChat('test', {
      onUserMsg: () => { userIndex = order.length; order.push('user'); },
      onAiPlaceholder: () => { placeholderIndex = order.length; order.push('ai_placeholder'); },
      onStream: () => order.push('stream'),
      onFinish: () => {
        try {
          expect(userIndex).toBeGreaterThanOrEqual(0);
          expect(placeholderIndex).toBeGreaterThanOrEqual(0);
          expect(userIndex).toBeLessThan(placeholderIndex);
          done();
        } catch (e) { done(e); }
      }
    });
  });
});

describe('ChatFlowService - 心魔流程（P2 Bug 修复：userMsg 传递 + 单一保存）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('startHeartDemonStart 必须把 userMsg 传给 HeartDemonService.start', (done) => {
    ChatFlowService.startHeartDemonStart('regret', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          // 关键：HeartDemonService.start 必须收到 userMsg（不是函数）
          expect(HeartDemonService.start).toHaveBeenCalledTimes(1);
          const callArgs = HeartDemonService.start.mock.calls[0];
          expect(callArgs[0]).toBe('regret');  // type
          expect(callArgs[1]).toBeDefined();
          expect(callArgs[1].id).toBeDefined();
          expect(callArgs[1].role).toBe('user');
          expect(typeof callArgs[2]).toBe('function');  // onStream
          expect(typeof callArgs[3]).toBe('function');  // onFinish
          expect(typeof callArgs[4]).toBe('function');  // onError
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startHeartDemonStart: AI 消息只 saveMessage 1 次（无双写）', (done) => {
    const saveCalls = [];
    ChatService.saveMessage.mockImplementation((role, content) => {
      saveCalls.push({ role, content });
      return { id: `mock_${role}_${saveCalls.length}`, role, content };
    });

    ChatFlowService.startHeartDemonStart('regret', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          const userSaves = saveCalls.filter(c => c.role === 'user');
          const aiSaves = saveCalls.filter(c => c.role === 'assistant');
          expect(userSaves).toHaveLength(1);  // user 只保存 1 次
          expect(aiSaves).toHaveLength(1);    // AI 只保存 1 次（不能 2 次）
          expect(aiSaves[0].content).toBe('心魔完整回复');
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startHeartDemonDialogue 必须把 userMsg 传给 HeartDemonService.sendMessage', (done) => {
    ChatFlowService.startHeartDemonDialogue('我害怕失败', 'fear', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          expect(HeartDemonService.sendMessage).toHaveBeenCalledTimes(1);
          const callArgs = HeartDemonService.sendMessage.mock.calls[0];
          expect(callArgs[0]).toBe('我害怕失败');  // userInput
          expect(callArgs[1]).toBeDefined();
          expect(callArgs[1].id).toBeDefined();
          expect(typeof callArgs[2]).toBe('function');  // onStream
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startHeartDemonDialogue: AI 消息只 saveMessage 1 次', (done) => {
    const saveCalls = [];
    ChatService.saveMessage.mockImplementation((role, content) => {
      saveCalls.push({ role, content });
      return { id: `mock_${role}_${saveCalls.length}`, role, content };
    });

    ChatFlowService.startHeartDemonDialogue('试试', 'fear', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          const aiSaves = saveCalls.filter(c => c.role === 'assistant');
          expect(aiSaves).toHaveLength(1);
          expect(aiSaves[0].content).toBe('心魔对话完整回复');
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startHeartDemonComplete 必须把 userMsg 传给 HeartDemonService.complete', (done) => {
    ChatFlowService.startHeartDemonComplete('regret', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          expect(HeartDemonService.complete).toHaveBeenCalledTimes(1);
          const callArgs = HeartDemonService.complete.mock.calls[0];
          // 第一个参数是 userMsg（不能再是函数）
          expect(callArgs[0]).toBeDefined();
          expect(callArgs[0].id).toBeDefined();
          expect(callArgs[0].role).toBe('user');
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('startHeartDemonComplete: AI 消息只 saveMessage 1 次', (done) => {
    const saveCalls = [];
    ChatService.saveMessage.mockImplementation((role, content) => {
      saveCalls.push({ role, content });
      return { id: `mock_${role}_${saveCalls.length}`, role, content };
    });

    ChatFlowService.startHeartDemonComplete('regret', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: () => {},
      onFinish: () => {
        try {
          const aiSaves = saveCalls.filter(c => c.role === 'assistant');
          expect(aiSaves).toHaveLength(1);
          done();
        } catch (e) { done(e); }
      }
    });
  });

  test('心魔流式回调：onStream 累计内容不能重复拼接（修复 chunk 语义）', (done) => {
    // 【P2 修复】验证：HeartDemonService 现在传单 chunk，ChatFlowService 用 += 累加是正确的
    // 之前心魔传累积内容，ChatFlowService 再 += 会导致重复拼接
    const streamContents = [];
    ChatFlowService.startHeartDemonStart('regret', {
      onUserMsg: () => {},
      onAiPlaceholder: () => {},
      onStream: (fullContent) => {
        streamContents.push(fullContent);
      },
      onFinish: () => {
        try {
          // 流式回调应该逐步增长，不应出现 "心魔chunk1心魔chunk1" 这种重复
          if (streamContents.length > 0) {
            const last = streamContents[streamContents.length - 1];
            // 最后一次回调的内容不应该包含重复的子串
            expect(last).not.toMatch(/心魔chunk1.*心魔chunk1/);
          }
          done();
        } catch (e) { done(e); }
      }
    });
  });
});
