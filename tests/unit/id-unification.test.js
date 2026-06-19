// tests/unit/id-unification.test.js
// 【P3 重构】验证"Page / Service 双轨制 ID"修复后的不变量
// 三个核心不变量：
//   1) 所有消息 ID 都从 ChatService.generateId 产生（统一来源）
//   2) 同毫秒连调 generateId 不能产生重复
//   3) saveMessage 传入 externalId 时，storage 中的 id 必须等于 externalId（Page/Storage ID 一致）
//   4) 心魔 _buildContext 在字符串 ID 场景下不再误过滤 AI 历史

// 【P3】需要 wx mock 才能 require chat.service
global.wx = {
  getStorageSync: jest.fn(() => []),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn()
};

const ChatService = require('../../services/chat.service');
const HeartDemonService = require('../../services/heart-demon.service');

describe('ID 系统统一重构 - ChatService.generateId 不变量', () => {
  beforeEach(() => {
    wx.getStorageSync.mockReset();
    wx.setStorageSync.mockReset();
    wx.getStorageSync.mockReturnValue([]);
  });

  test('generateId 必须带 role 前缀（user/ai/msg）', () => {
    const userId = ChatService.generateId('user');
    const aiId = ChatService.generateId('ai');
    const msgId = ChatService.generateId('msg');
    expect(userId.startsWith('user_')).toBe(true);
    expect(aiId.startsWith('ai_')).toBe(true);
    expect(msgId.startsWith('msg_')).toBe(true);
  });

  test('generateId 返回的格式必须是 {role}_{13位时间戳}_{2位seq}_{4位rand}', () => {
    const id = ChatService.generateId('user');
    expect(id).toMatch(/^user_\d{13}_\d{2}_[0-9a-z]{4}$/);
  });

  test('同毫秒连调 200 次 generateId 不能产生重复（计数器 + 随机双重去重）', () => {
    const ids = new Set();
    for (let i = 0; i < 200; i++) {
      ids.add(ChatService.generateId('user'));
    }
    expect(ids.size).toBe(200);
  });

  test('generateId 暴露在 ChatService.generateId 上（供 chat-flow / heart-demon 复用）', () => {
    expect(typeof ChatService.generateId).toBe('function');
  });
});

describe('ID 系统统一重构 - saveMessage(externalId) 透传', () => {
  beforeEach(() => {
    wx.getStorageSync.mockReset();
    wx.setStorageSync.mockReset();
    wx.getStorageSync.mockReturnValue([]);
  });

  test('saveMessage 不传 externalId 时，生成新 id', () => {
    const msg = ChatService.saveMessage('user', 'hello', 'normal');
    expect(msg.id).toMatch(/^user_/);
  });

  test('saveMessage 传入 externalId 时，storage 中的 id 必须等于 externalId', () => {
    const externalId = 'user_test_001_unique';
    const msg = ChatService.saveMessage('user', 'hello', 'normal', externalId);
    expect(msg.id).toBe(externalId);
    // 验证 setStorageSync 写入的也是这个 id（mock 不做 JSON 序列化，直接拿对象）
    const written = wx.setStorageSync.mock.calls[0][1];
    expect(Array.isArray(written)).toBe(true);
    expect(written[0].id).toBe(externalId);
  });

  test('saveMessage role=ai 配合 externalId 时，存储的 role/id 都要正确', () => {
    const externalId = 'ai_1718067600000_99_test';
    const msg = ChatService.saveMessage('assistant', 'response', 'demon_fear', externalId);
    expect(msg.id).toBe(externalId);
    expect(msg.role).toBe('assistant');
    expect(msg.category).toBe('demon_fear');
  });
});

describe('心魔 _buildContext - 字符串 ID 不再误过滤 AI 历史（P0 Bug 防护）', () => {
  beforeEach(() => {
    // 重置 HeartDemonService 内部状态
    HeartDemonService._currentType = null;
    HeartDemonService._sessionStartMsgId = null;
    HeartDemonService._sessionStartTimestamp = null;
    HeartDemonService._roundCount = 0;
    HeartDemonService._currentGongfaId = null;

    wx.getStorageSync.mockReset();
    wx.setStorageSync.mockReset();
    wx.removeStorageSync.mockReset();
  });

  test('字符串 id 场景下，AI 历史不被字符串字典序误过滤', () => {
    // 模拟 storage 中混有 user/ai 字符串 id（重构后的真实场景）
    const mockHistory = [
      { id: 'user_1718067600000_01_x7k2', role: 'user', content: '心魔修炼-恐惧', timestamp: 1718067600000, category: 'demon_fear' },
      { id: 'ai_1718067605000_01_abc1', role: 'assistant', content: '你害怕什么？', timestamp: 1718067605000, category: 'demon_fear' },
      { id: 'user_1718067610000_01_x7k3', role: 'user', content: '我怕失败', timestamp: 1718067610000, category: 'demon_fear' },
      { id: 'ai_1718067615000_02_abc2', role: 'assistant', content: '失败并不可怕', timestamp: 1718067615000, category: 'demon_fear' }
    ];
    // 模拟 getDemonContextForAI 返回这些数据
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(mockHistory);

    // 设置 session 起点为第一条 user 消息
    HeartDemonService._sessionStartMsgId = 'user_1718067600000_01_x7k2';
    HeartDemonService._sessionStartTimestamp = 1718067600000;

    const { historyStr } = HeartDemonService._buildContext('fear');
    // 关键断言：AI 的回复必须出现在历史里，不能被字典序过滤
    expect(historyStr).toContain('你害怕什么？');
    expect(historyStr).toContain('失败并不可怕');
    expect(historyStr).toContain('我怕失败');
  });

  test('长会话（>20 条）时，用 _sessionStartTimestamp 兜底正确过滤', () => {
    // 起始消息不在 20 条窗口内
    const recent20 = Array.from({ length: 20 }, (_, i) => ({
      id: `msg_${2000 + i}_${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
      timestamp: 2000 + i,
      category: 'demon_fear'
    }));
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(recent20);

    // 模拟长会话：起始消息 id 在 storage 中但不在 20 条窗口里
    HeartDemonService._sessionStartMsgId = 'user_xxx_001';  // 不在 recent20 中
    HeartDemonService._sessionStartTimestamp = 1000;  // 早于窗口起点

    const { historyStr } = HeartDemonService._buildContext('fear');
    // 起始消息早于窗口，所以窗口内所有消息都应被包含
    expect(historyStr).toContain('m0');
    expect(historyStr).toContain('m19');
  });

  test('旧 storage 兼容：只有 sessionStartMsgId 没有 sessionStartTimestamp 时，用 find 兜底', () => {
    const mockHistory = [
      { id: 'user_old_001', role: 'user', content: '起始', timestamp: 5000, category: 'demon_fear' },
      { id: 'ai_old_001', role: 'assistant', content: '回应', timestamp: 5500, category: 'demon_fear' }
    ];
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(mockHistory);

    // 旧 storage 场景：只有 msgId 没有 timestamp
    HeartDemonService._sessionStartMsgId = 'user_old_001';
    HeartDemonService._sessionStartTimestamp = null;

    const { historyStr } = HeartDemonService._buildContext('fear');
    // 兜底 find 应该能查到，AI 历史应保留
    expect(historyStr).toContain('起始');
    expect(historyStr).toContain('回应');
  });

  test('无 sessionStartMsgId 时返回全量 history（不抛错）', () => {
    const mockHistory = [
      { id: 'user_1', role: 'user', content: 'msg1', timestamp: 1000, category: 'demon_fear' },
      { id: 'ai_1', role: 'assistant', content: 'reply1', timestamp: 1500, category: 'demon_fear' }
    ];
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(mockHistory);

    HeartDemonService._sessionStartMsgId = null;
    HeartDemonService._sessionStartTimestamp = null;

    const { historyStr } = HeartDemonService._buildContext('fear');
    expect(historyStr).toContain('msg1');
    expect(historyStr).toContain('reply1');
  });
});

describe('心魔 session 持久化 - 兼容旧 storage 缺字段', () => {
  beforeEach(() => {
    HeartDemonService._currentType = null;
    HeartDemonService._sessionStartMsgId = null;
    HeartDemonService._sessionStartTimestamp = null;
    HeartDemonService._roundCount = 0;

    wx.getStorageSync.mockReset();
    wx.setStorageSync.mockReset();
    wx.removeStorageSync.mockReset();
  });

  test('tryRestore 时旧 storage 没有 sessionStartTimestamp 字段，应不报错', () => {
    // 模拟老格式的 storage（无 sessionStartTimestamp）
    const oldSaved = {
      currentType: 'fear',
      roundCount: 3,
      currentGongfaId: 'g1',
      sessionStartMsgId: 'user_xxx_001',
      // 注意：没有 sessionStartTimestamp
      savedAt: Date.now() - 1000
    };
    wx.getStorageSync.mockReturnValue(oldSaved);

    const restored = HeartDemonService.tryRestore();
    expect(restored).toBeTruthy();
    expect(restored.currentType).toBe('fear');
    expect(HeartDemonService._sessionStartMsgId).toBe('user_xxx_001');
    // 关键：缺字段时应该是 null，不能是 undefined 触发 find 报错
    expect(HeartDemonService._sessionStartTimestamp).toBeNull();
  });
});

describe('【P0 防护】心魔 _buildContext 必须不再因字符串字典序过滤 AI 历史', () => {
  // 这是一个回归测试，对应 bug 报告里的 P0 场景：
  //   报告主张：_buildContext 用 msg.id >= startMsgId 过滤，AI 字符串 id 小于 user 字符串 id，
  //             会把全部 AI 历史过滤掉，导致心魔金鱼脑。
  //   重构后：用 timestamp 比较 + _sessionStartTimestamp 冗余字段，应该能正确保留 AI 历史。
  // 任何对此重构的"善意回退"都会让这个测试失败。

  beforeEach(() => {
    HeartDemonService._currentType = null;
    HeartDemonService._sessionStartMsgId = null;
    HeartDemonService._sessionStartTimestamp = null;
    HeartDemonService._roundCount = 0;
    HeartDemonService._currentGongfaId = null;
    wx.getStorageSync.mockReset();
    wx.setStorageSync.mockReset();
    wx.removeStorageSync.mockReset();
  });

  test('完整心魔会话：4 条消息（2 user + 2 ai），_buildContext 必须返回全部 4 条', () => {
    const t0 = 1718067600000;
    const fullSession = [
      // 心魔启动的 user 消息（session 起点）
      { id: `user_${t0}_01_xxxx`, role: 'user', content: '心魔修炼-恐惧', timestamp: t0, category: 'demon_fear' },
      // AI 启动问候
      { id: `ai_${t0 + 100}_01_aaaa`, role: 'assistant', content: '你最近在害怕什么？', timestamp: t0 + 100, category: 'demon_fear' },
      // 用户第 1 轮回复
      { id: `user_${t0 + 200}_01_yyyy`, role: 'user', content: '我害怕在众人面前出丑', timestamp: t0 + 200, category: 'demon_fear' },
      // AI 第 1 轮回复
      { id: `ai_${t0 + 300}_02_bbbb`, role: 'assistant', content: '出丑之后，最坏的结果是什么？', timestamp: t0 + 300, category: 'demon_fear' }
    ];
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(fullSession);

    // 模拟 start() 设置的 session 起点
    HeartDemonService._sessionStartMsgId = fullSession[0].id;
    HeartDemonService._sessionStartTimestamp = t0;

    const { historyStr, historyRoundCount } = HeartDemonService._buildContext('fear');

    // 【P0 防护】AI 的两轮回复必须都出现，不能被字符串字典序误过滤
    expect(historyStr).toContain('你最近在害怕什么？');
    expect(historyStr).toContain('出丑之后，最坏的结果是什么？');
    expect(historyStr).toContain('我害怕在众人面前出丑');
    // 2 个完整 user→ai 轮次
    expect(historyRoundCount).toBe(2);
  });

  test('防御：即使有人"善意"回退到字符串 id 比较，AI 历史仍会丢（这个测试应一直通过）', () => {
    // 本测试是反向断言：如果 _buildContext 用 msg.id >= startMsgId 字符串比较，
    // 'ai_' < 'user_' 会导致 AI 全部被过滤。本测试断言当前实现 **不会** 出现这种情况。
    // 一旦实现回退到字符串 id 比较，本测试会自动失败（AI 内容不在 historyStr 中）。
    const t0 = 1718067600000;
    const items = [
      { id: `user_${t0}_01_xxxx`, role: 'user', content: '起始', timestamp: t0, category: 'demon_fear' },
      { id: `ai_${t0 + 100}_01_aaaa`, role: 'assistant', content: 'AI回复_关键内容', timestamp: t0 + 100, category: 'demon_fear' }
    ];
    jest.spyOn(ChatService, 'getDemonContextForAI').mockReturnValue(items);
    HeartDemonService._sessionStartMsgId = items[0].id;
    HeartDemonService._sessionStartTimestamp = t0;

    const { historyStr } = HeartDemonService._buildContext('fear');
    // 关键字符串 'AI回复_关键内容' 必须出现 → 证明 AI 没被过滤
    expect(historyStr).toContain('AI回复_关键内容');
  });
});
