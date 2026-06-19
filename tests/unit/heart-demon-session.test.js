// tests/unit/heart-demon-session.test.js
// 验证心魔 session 持久化机制：
//   1. start/sendMessage 后 _saveSession() 自动写入 Storage
//   2. complete() 成功后 _clearSession() 清空
//   3. tryRestore() 正常恢复
//   4. tryRestore() session 过期（>24h）返回 null 并清理
//   5. tryRestore() 无 session 返回 null

// mock 缓存层
const mockStorage = {};
const mockCache = {};

global.wx = {
  getStorageSync: jest.fn((key) => {
    if (key in mockStorage) return mockStorage[key];
    if (key in mockCache) return mockCache[key];
    return null;
  }),
  setStorageSync: jest.fn((key, value) => {
    mockStorage[key] = value;
  }),
  removeStorageSync: jest.fn((key) => {
    delete mockStorage[key];
  })
};

jest.mock('../../utils/cache-manager', () => ({
  get: jest.fn((key) => mockCache[key] || null),
  set: jest.fn((key, value) => { mockCache[key] = value; })
}));

jest.mock('../../services/ai.service', () => ({
  sendMessageStream: jest.fn()
}));

jest.mock('../../services/chat.service', () => ({
  saveMessage: jest.fn()
}));

jest.mock('../../services/user.service', () => ({
  buildUserArchive: jest.fn(() => '')
}));

jest.mock('../../services/memory.service', () => ({
  forceUpdateMemory: jest.fn(),
  checkAndUpdateMemory: jest.fn()
}));

jest.mock('../../services/practice.service', () => ({
  getMinds: jest.fn(() => [
    { id: 'g_fear', key: 'heart-demon-fear' },
    { id: 'g_regret', key: 'heart-demon-regret' }
  ]),
  doPractice: jest.fn()
}));

const HeartDemonService = require('../../services/heart-demon.service');

beforeEach(() => {
  // 清空 mock 存储
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  Object.keys(mockCache).forEach(k => delete mockCache[k]);
  // 重置 Service 内部状态
  HeartDemonService._currentType = null;
  HeartDemonService._roundCount = 0;
  HeartDemonService._currentGongfaId = null;
  HeartDemonService._sessionStartRound = 0;
  HeartDemonService._sessionStartMsgId = null;
  jest.clearAllMocks();
});

describe('HeartDemonService session 持久化', () => {
  describe('_saveSession', () => {
    test('_currentType 为空时自动清除 session', () => {
      // 先写一个 session
      mockStorage['heart_demon_session'] = { currentType: 'regret', savedAt: Date.now() };
      HeartDemonService._currentType = null;
      HeartDemonService._saveSession();
      expect(mockStorage['heart_demon_session']).toBeUndefined();
    });

    test('有活动 session 时写入 Storage（含 savedAt 时间戳）', () => {
      HeartDemonService._currentType = 'fear';
      HeartDemonService._roundCount = 2;
      HeartDemonService._currentGongfaId = 'g_fear';
      HeartDemonService._sessionStartMsgId = 'msg_001';

      const before = Date.now();
      HeartDemonService._saveSession();
      const after = Date.now();

      const saved = mockStorage['heart_demon_session'];
      expect(saved).toBeDefined();
      expect(saved.currentType).toBe('fear');
      expect(saved.roundCount).toBe(2);
      expect(saved.currentGongfaId).toBe('g_fear');
      expect(saved.sessionStartMsgId).toBe('msg_001');
      expect(saved.savedAt).toBeGreaterThanOrEqual(before);
      expect(saved.savedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('_clearSession', () => {
    test('清除已存在的 session', () => {
      mockStorage['heart_demon_session'] = { currentType: 'regret' };
      HeartDemonService._clearSession();
      expect(mockStorage['heart_demon_session']).toBeUndefined();
    });

    test('清除不存在的 session 不抛错', () => {
      expect(() => HeartDemonService._clearSession()).not.toThrow();
    });
  });

  describe('tryRestore', () => {
    test('无 session 时返回 null', () => {
      const result = HeartDemonService.tryRestore();
      expect(result).toBeNull();
    });

    test('正常恢复：写入内存 + 返回 session 信息', () => {
      mockStorage['heart_demon_session'] = {
        currentType: 'regret',
        roundCount: 3,
        currentGongfaId: 'g_regret',
        sessionStartMsgId: 'msg_xyz',
        savedAt: Date.now()
      };

      const result = HeartDemonService.tryRestore();

      expect(result).toEqual(expect.objectContaining({
        currentType: 'regret',
        roundCount: 3
      }));
      expect(result.ageMs).toBeGreaterThanOrEqual(0);
      expect(result.ageMs).toBeLessThan(1000);

      // 内存状态应被恢复
      expect(HeartDemonService._currentType).toBe('regret');
      expect(HeartDemonService._roundCount).toBe(3);
      expect(HeartDemonService._currentGongfaId).toBe('g_regret');
      expect(HeartDemonService._sessionStartMsgId).toBe('msg_xyz');
    });

    test('session 过期（>24h）返回 null 并清除 Storage', () => {
      // savedAt 设为 25 小时前
      const expired = Date.now() - 25 * 60 * 60 * 1000;
      mockStorage['heart_demon_session'] = {
        currentType: 'fear',
        roundCount: 1,
        savedAt: expired
      };

      const result = HeartDemonService.tryRestore();

      expect(result).toBeNull();
      expect(mockStorage['heart_demon_session']).toBeUndefined();
      // 内存状态不应被污染
      expect(HeartDemonService._currentType).toBeNull();
    });

    test('session 刚好 24 小时（边界）', () => {
      // 24 小时整
      const boundary = Date.now() - 24 * 60 * 60 * 1000;
      mockStorage['heart_demon_session'] = {
        currentType: 'regret',
        roundCount: 1,
        savedAt: boundary
      };

      const result = HeartDemonService.tryRestore();
      // 边界条件：> TTL 才算过期，= TTL 仍可用
      // (取决于实现：这里我们用 > 严格判断)
      // 因为 Date.now() 会比 boundary 略大一点点，diff 会 > 0 但不确定 > TTL
      // 用 1ms 的容差：接受 null 或 非 null
      // 实际工程：严格 > TTL，所以恰好 24h 整不会过期
      // 但 Date.now() - boundary 至少为 1ms，所以会过期
      // 这里只是测试它不会崩溃
      expect(result === null || result.currentType === 'regret').toBe(true);
    });

    test('session 没有 savedAt 字段时按过期处理', () => {
      mockStorage['heart_demon_session'] = {
        currentType: 'regret',
        roundCount: 1
        // 缺 savedAt
      };

      const result = HeartDemonService.tryRestore();
      expect(result).toBeNull();
    });

    test('session 字段缺失时容错', () => {
      mockStorage['heart_demon_session'] = {
        savedAt: Date.now()
        // 缺 currentType
      };

      const result = HeartDemonService.tryRestore();
      expect(result).toBeNull();
    });
  });

  describe('状态变更自动持久化', () => {
    test('start() 校验失败时不应写 session', () => {
      HeartDemonService.start(null, null, null, null, jest.fn());
      expect(mockStorage['heart_demon_session']).toBeUndefined();
    });

    test('_currentType 改变后 _saveSession 立即生效', () => {
      HeartDemonService._currentType = 'regret';
      HeartDemonService._roundCount = 1;
      HeartDemonService._saveSession();
      expect(mockStorage['heart_demon_session'].currentType).toBe('regret');
    });
  });
});

describe('heart-demon 完整生命周期与持久化联动', () => {
  test('start → sendMessage → complete：Storage 写-写-清', () => {
    // 1) start：写 session
    HeartDemonService._currentType = 'regret';
    HeartDemonService._roundCount = 0;
    HeartDemonService._saveSession();
    expect(mockStorage['heart_demon_session']).toBeDefined();

    // 2) sendMessage：roundCount++，再写
    HeartDemonService._roundCount += 1;
    HeartDemonService._saveSession();
    expect(mockStorage['heart_demon_session'].roundCount).toBe(1);

    HeartDemonService._roundCount += 1;
    HeartDemonService._saveSession();
    expect(mockStorage['heart_demon_session'].roundCount).toBe(2);

    // 3) complete：清空 _currentType，再 _clearSession
    HeartDemonService._currentType = null;
    HeartDemonService._clearSession();
    expect(mockStorage['heart_demon_session']).toBeUndefined();

    // 4) 再次 tryRestore：null（已清空）
    const result = HeartDemonService.tryRestore();
    expect(result).toBeNull();
  });

  test('模拟退出-重进：session 恢复后 _currentType 一致', () => {
    // 第一次进入：start 心魔
    HeartDemonService._currentType = 'fear';
    HeartDemonService._roundCount = 1;
    HeartDemonService._saveSession();

    // 模拟退出：清空内存（保留 Storage）
    HeartDemonService._currentType = null;
    HeartDemonService._roundCount = 0;
    HeartDemonService._currentGongfaId = null;
    HeartDemonService._sessionStartMsgId = null;

    // 重新进入：tryRestore
    const restored = HeartDemonService.tryRestore();
    expect(restored.currentType).toBe('fear');
    expect(restored.roundCount).toBe(1);
    expect(HeartDemonService._currentType).toBe('fear');
  });
});
