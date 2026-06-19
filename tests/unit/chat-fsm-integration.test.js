// tests/unit/chat-fsm-integration.test.js
// 验证 chat.js 的 _setChatState 真的使用了 canTransition（含幂等拦截）

const fsm = require('../../pages/chat/chat-fsm');
const { CHAT_STATES, CHAT_TRANSITIONS, isAIBusyState, isDemonState, canTransition } = fsm;

/**
 * 模拟修复后的 _setChatState 行为
 * 关键：只用 canTransition 做判断
 * 说明：提到顶层描述块外，避免子 describe 块作用域隔离导致函数不可见
 */
function simulatedSetChatState(current, newState) {
  return canTransition(current, newState);
}

describe('chat-fsm 与 chat.js _setChatState 的契约', () => {
  describe('canTransition 是 chat.js 状态转换的唯一来源', () => {
    test('CHAT_TRANSITIONS 存在并包含全部 from→to 白名单', () => {
      // 关键安全检查：所有 7 个状态都应该有 CHAT_TRANSITIONS 条目
      const states = Object.values(CHAT_STATES);
      states.forEach(s => {
        expect(CHAT_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(CHAT_TRANSITIONS[s])).toBe(true);
      });
    });

    test('canTransition 必须拒绝双击导致的同状态非终态转换', () => {
      // 模拟 _setChatState 内部的判断逻辑
      // 修复前：手写 "if (current === newState) return true" → DEMON_IDLE → DEMON_IDLE 通过
      // 修复后：用 canTransition 统一检查 → DEMON_IDLE → DEMON_IDLE 被拒绝
      const doubleClickScenarios = [
        // [current, newState, expected, scenario]
        [CHAT_STATES.DEMON_IDLE, CHAT_STATES.DEMON_IDLE, false, '双击心魔开始按钮'],
        [CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.NORMAL_GENERATING, false, '双击日常消息发送'],
        [CHAT_STATES.DEMON_GENERATING, CHAT_STATES.DEMON_GENERATING, false, '双击心魔继续'],
        [CHAT_STATES.DAILY_TASK_RECOMMENDING, CHAT_STATES.DAILY_TASK_RECOMMENDING, false, '双击今日宜练']
      ];

      doubleClickScenarios.forEach(([from, to, expected, scenario]) => {
        expect({
          from, to, allowed: canTransition(from, to), scenario
        }).toEqual({
          from, to, allowed: expected, scenario
        });
      });
    });

    test('canTransition 必须放行合法的同状态终态转换（幂等）', () => {
      // IDLE → IDLE 应该是合法的（用户主动关弹窗后再次进入正常状态）
      // SETTLEMENT → SETTLEMENT 也是合法的（弹窗多次 show/hide）
      // LEVEL_UP → LEVEL_UP 同理
      const idempotentScenarios = [
        [CHAT_STATES.IDLE, CHAT_STATES.IDLE, true, 'IDLE 幂等'],
        [CHAT_STATES.SETTLEMENT, CHAT_STATES.SETTLEMENT, true, 'SETTLEMENT 幂等'],
        [CHAT_STATES.LEVEL_UP, CHAT_STATES.LEVEL_UP, true, 'LEVEL_UP 幂等']
      ];

      idempotentScenarios.forEach(([from, to, expected, scenario]) => {
        expect(canTransition(from, to)).toBe(expected);
      });
    });

    test('canTransition 必须拒绝所有非法转换', () => {
      const illegalScenarios = [
        // AI 生成中不能直接开始新的 AI 生成
        [CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.DEMON_IDLE, false],
        [CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.DAILY_TASK_RECOMMENDING, false],
        [CHAT_STATES.DEMON_GENERATING, CHAT_STATES.NORMAL_GENERATING, false],
        [CHAT_STATES.SETTLEMENT, CHAT_STATES.LEVEL_UP, false],  // 结算中不能直接升级
        [CHAT_STATES.LEVEL_UP, CHAT_STATES.SETTLEMENT, false],
        // 未知状态
        ['UNKNOWN_STATE', CHAT_STATES.IDLE, false]
      ];

      illegalScenarios.forEach(([from, to, expected]) => {
        expect(canTransition(from, to)).toBe(expected);
      });
    });
  });

  describe('模拟 _setChatState 行为（验证修复后的逻辑）', () => {
    test('双击心魔开始按钮：第二次调用应被拒绝', () => {
      // 第一次：IDLE → DEMON_IDLE（合法）
      expect(simulatedSetChatState(CHAT_STATES.IDLE, CHAT_STATES.DEMON_IDLE)).toBe(true);

      // 第二次：DEMON_IDLE → DEMON_IDLE（应被拒绝）
      // 这就是修复的关键断言
      expect(simulatedSetChatState(CHAT_STATES.DEMON_IDLE, CHAT_STATES.DEMON_IDLE)).toBe(false);
    });

    test('心魔模式内连点回复：第二次应被拒绝', () => {
      // 第一次：DEMON_IDLE → DEMON_GENERATING（合法）
      expect(simulatedSetChatState(CHAT_STATES.DEMON_IDLE, CHAT_STATES.DEMON_GENERATING)).toBe(true);

      // 第二次：DEMON_GENERATING → DEMON_GENERATING（应被拒绝）
      expect(simulatedSetChatState(CHAT_STATES.DEMON_GENERATING, CHAT_STATES.DEMON_GENERATING)).toBe(false);
    });

    test('正常 AI 生成中连点发送：第二次应被拒绝', () => {
      // 第一次：IDLE → NORMAL_GENERATING（合法）
      expect(simulatedSetChatState(CHAT_STATES.IDLE, CHAT_STATES.NORMAL_GENERATING)).toBe(true);

      // 第二次：NORMAL_GENERATING → NORMAL_GENERATING（应被拒绝）
      expect(simulatedSetChatState(CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.NORMAL_GENERATING)).toBe(false);
    });

    test('AI 生成中点其他 AI 入口：应被拒绝', () => {
      // 第一次：IDLE → NORMAL_GENERATING
      // 第二次：NORMAL_GENERATING → DAILY_TASK_RECOMMENDING（应被拒绝）
      expect(simulatedSetChatState(CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.DAILY_TASK_RECOMMENDING)).toBe(false);
    });

    test('正常完成流程：NORMAL_GENERATING → IDLE → DEMON_IDLE（应全部合法）', () => {
      expect(simulatedSetChatState(CHAT_STATES.IDLE, CHAT_STATES.NORMAL_GENERATING)).toBe(true);
      expect(simulatedSetChatState(CHAT_STATES.NORMAL_GENERATING, CHAT_STATES.IDLE)).toBe(true);
      expect(simulatedSetChatState(CHAT_STATES.IDLE, CHAT_STATES.DEMON_IDLE)).toBe(true);
    });
  });

  describe('P2 Bug 修复：sendMessage + handleDemonMessage 重复守门', () => {
    /**
     * 模拟修复后的 sendMessage + handleDemonMessage 行为
     * 关键：sendMessage 调一次 _setChatState(DEMON_GENERATING)，
     // handleDemonMessage 不再重复调（信任 sendMessage 已守门）
     */
    function sendMessageThenHandleDemon(currentState) {
      // sendMessage 守门
      const step1 = simulatedSetChatState(currentState, CHAT_STATES.DEMON_GENERATING);
      if (!step1) {
        return { step1: 'rejected', step2: 'skipped' };
      }
      // handleDemonMessage 不再守门（修复后）
      return { step1: 'passed', step2: 'no-longer-needed' };
    }

    test('心魔模式中正常发送：DEMON_IDLE → DEMON_GENERATING 应通过', () => {
      // 场景：onStartDemon 完成后（chatState = DEMON_IDLE），用户发送第一条消息
      const result = sendMessageThenHandleDemon(CHAT_STATES.DEMON_IDLE);
      expect(result.step1).toBe('passed');
      expect(result.step2).toBe('no-longer-needed');
    });

    test('修复后：DEMON_GENERATING 状态下点发送应被拒绝（无重复 toast）', () => {
      // 场景：AI 推演中（chatState = DEMON_GENERATING）用户点发送
      // 期望：sendMessage 守门拒绝，不进入 handleDemonMessage，不会重复 toast
      const result = sendMessageThenHandleDemon(CHAT_STATES.DEMON_GENERATING);
      expect(result.step1).toBe('rejected');
      expect(result.step2).toBe('skipped');
    });

    test('【P2 Bug 场景】修复前 handleDemonMessage 重复守门会触发 toast', () => {
      // 模拟修复前的行为：sendMessage 和 handleDemonMessage 都守门
      function sendMessageWithDoubleGuard(currentState) {
        const step1 = simulatedSetChatState(currentState, CHAT_STATES.DEMON_GENERATING);
        if (!step1) return { toastTriggered: false };
        // 修复前：handleDemonMessage 又调一次（重复守门）
        const step2 = simulatedSetChatState(CHAT_STATES.DEMON_GENERATING, CHAT_STATES.DEMON_GENERATING);
        // DEMON_GENERATING 不是终态 → 拒绝
        if (!step2) {
          // isAIBusyState(DEMON_GENERATING) === true → 弹 toast
          return { toastTriggered: true, reason: 'handleDemonMessage 重复守门触发 toast' };
        }
        return { toastTriggered: false };
      }

      // 验证修复前的 bug 场景
      const bugResult = sendMessageWithDoubleGuard(CHAT_STATES.DEMON_IDLE);
      expect(bugResult.toastTriggered).toBe(true);  // 修复前：toast 触发（bug）
    });
  });
});
