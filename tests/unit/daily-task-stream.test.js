// tests/unit/daily-task-stream.test.js
// 验证 daily-task 流式回调不会重复累积（修复 onStream 契约不一致 Bug）
//
// 场景：AI 流式返回"今日宜练-XXXX___TASK_DATA___{json...}"
// 修复前：chat-flow.service.js 误把 displayContent 当 delta chunk 累加
//         → 流式内容重复累积 "今"→"今今日"→"今今日今日适合"
//         → onResult 触发时被一次性 displayText 替换 → 用户看到内容闪烁
// 修复后：onStream 签名对齐 (displayContent, deltaChunk)，不再重复累加

jest.mock('../../utils/secret', () => ({
  getApiKey: () => 'test-api-key'
}));

jest.mock('../../utils/network-utils', () => ({
  checkNetworkStatus: () => Promise.resolve({ isConnected: true })
}));

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => {
    if (key === 'userpractices') {
      return { body: [{ id: 'g1', name: '吐纳功', status: 'active' }], mind: [], skill: [], wealth: [] };
    }
    return null;
  }),
  set: jest.fn()
}));

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn((role, content) => ({
    id: 'msg-' + Date.now() + '-' + Math.random(),
    role,
    content,
    timestamp: Date.now()
  })),
  getContextForAI: jest.fn(() => [])
}));

jest.mock('../../services/memory.service', () => ({
  buildSystemMessage: () => ({ content: 'system msg with # Constraint' })
}));

jest.mock('../../prompts/skills/daily-task', () => ({
  buildDailyTaskRecommendPrompt: () => 'task prompt',
  buildDailyTaskCompletePrompt: () => 'complete prompt'
}));

let mockRequestTasks = [];

global.wx = {
  request: jest.fn((opts) => {
    const task = {
      _opts: opts,
      abort: jest.fn(),
      onChunkReceived: jest.fn((cb) => {
        task._onChunk = cb;
      })
    };
    mockRequestTasks.push(task);
    if (opts.success) task._success = opts.success;
    if (opts.fail) task._fail = opts.fail;
    return task;
  }),
  getStorageSync: jest.fn(() => null),
  setStorageSync: jest.fn()
};

const ChatFlowService = require('../../services/chat-flow.service');
const AIService = require('../../services/ai.service');

beforeEach(() => {
  mockRequestTasks = [];
  AIService._activeTaskRef = null;
  jest.clearAllMocks();
});

// 辅助：构造 SSE chunk 的 arrayBuffer
function makeSseChunk(text) {
  const encoder = new TextEncoder();
  return { data: encoder.encode(text).buffer };
}

describe('DailyTask 流式回调契约（P2 修复：避免重复累积）', () => {
  test('流式 onStream 回调累积内容应与原始 delta 一致（不重复）', async () => {
    const onStream = jest.fn();
    const onResult = jest.fn();

    ChatFlowService.startDailyTask('今日宜练', {
      onUserMsg: jest.fn(),
      onAiPlaceholder: jest.fn(),
      onStream,
      onResult,
      onError: jest.fn()
    });

    // 等待 AIService 内部 await 完成
    await new Promise(resolve => setImmediate(resolve));

    expect(mockRequestTasks.length).toBe(1);
    const task = mockRequestTasks[0];

    // 模拟 AI 流式输出："今日适合修炼吐纳___TASK_DATA__{...}"
    // 注意：每个 chunk 是 SSE 格式
    const chunks = [
      'data: {"choices":[{"delta":{"content":"今日"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"适合"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"修炼"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"吐纳"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"___TASK_DATA___"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"id\\":\\"g1\\",\\"name\\":\\"吐纳功\\"}"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    chunks.forEach(chunk => task._onChunk(makeSseChunk(chunk)));
    task._success({ statusCode: 200, header: {} });

    // 收集所有 onStream 调用
    expect(onStream).toHaveBeenCalled();
    const calls = onStream.mock.calls;

    // 修复后：onStream 第一个参数（displayContent）应该稳定地反映累积的"display"部分
    // 不应出现"今日"→"今今日"→"今今日今日适合" 这种重复累积
    const displayContents = calls.map(call => call[0]);

    // 关键断言：第 2 个 displayContent 不应包含第 1 个的全部内容 2 次
    // 修复前：displayContents[1] === "今日今日"（重复累积）
    // 修复后：displayContents[1] === "今日适合"（正常累积）
    expect(displayContents[1]).toBe('今日适合');
    expect(displayContents[2]).toBe('今日适合修炼');
    expect(displayContents[3]).toBe('今日适合修炼吐纳');

    // 收到 ___TASK_DATA___ 后，display 不再增长（被 filter 截断）
    expect(displayContents[4]).toBe('今日适合修炼吐纳');
    expect(displayContents[5]).toBe('今日适合修炼吐纳');  // JSON 部分被 filter

    // onResult 触发时的 displayText 应与最后一次 onStream 的 displayContent 一致
    expect(onResult).toHaveBeenCalled();
    const resultArg = onResult.mock.calls[0][0];
    expect(resultArg.displayText).toBe('今日适合修炼吐纳');
  });

  test('delta chunk 应是原始 delta（不是 displayContent）', async () => {
    const onStream = jest.fn();

    ChatFlowService.startDailyTask('今日宜练', {
      onUserMsg: jest.fn(),
      onAiPlaceholder: jest.fn(),
      onStream,
      onResult: jest.fn(),
      onError: jest.fn()
    });

    await new Promise(resolve => setImmediate(resolve));
    const task = mockRequestTasks[0];

    // 单个 chunk
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"今"}}]}\n\n'));
    task._onChunk(makeSseChunk('data: {"choices":[{"delta":{"content":"日"}}]}\n\n'));

    const calls = onStream.mock.calls;

    // 第二个参数应该是原始 delta chunk（"今" 和 "日"），不是 displayContent
    expect(calls[0][1]).toBe('今');
    expect(calls[1][1]).toBe('日');
  });
});
