// tests/unit/chat-onstartdemon-fsm.test.js
// 验证 onStartDemon 和 onConfirmComplete 在推演期间状态是 DEMON_GENERATING
//
// 场景：用户在 AI 推演期间发"来了"消息
// 修复前：推演期间状态是 DEMON_IDLE → 用户发送成功 → 启动第二个推演
//        → 两个推演并发，第二个推演读历史时第一个 AI 回复还没保存 → 上下文丢失
// 修复后：推演期间状态是 DEMON_GENERATING → 用户发送被 FSM 拦截
//        → 弹"器灵推演中"toast → 等推演完成后再发送

const fsm = require('../../pages/chat/chat-fsm');
const { CHAT_STATES, canTransition, isAIBusyState } = fsm;

/**
 * 模拟 chat.js 的 _setChatState：基于 canTransition 拒绝非法转换
 */
function simulatedSetChatState(current, newState) {
  if (!canTransition(current, newState)) {
    return false;  // 拒绝
  }
  return true;  // 接受
}

/**
 * 模拟 chat.js 的 onStartDemon 状态转换序列（修复后）
 */
function onStartDemonStateSequence() {
  const states = [];
  // 1) _setChatState(DEMON_IDLE) - 进入心魔模式
  if (simulatedSetChatState(states[states.length - 1] || 'IDLE', CHAT_STATES.DEMON_IDLE)) {
    states.push(CHAT_STATES.DEMON_IDLE);
  }
  // 2) _setChatState(DEMON_GENERATING) - 启动推演前再次设置
  if (simulatedSetChatState(states[states.length - 1], CHAT_STATES.DEMON_GENERATING)) {
    states.push(CHAT_STATES.DEMON_GENERATING);
  }
  return states;
}

/**
 * 模拟修复前（无第二次 _setChatState）的 onStartDemon
 */
function onStartDemonStateSequenceOld() {
  return [CHAT_STATES.DEMON_IDLE];  // 推演期间状态
}

/**
 * 模拟修复后的 onConfirmComplete
 */
function onConfirmCompleteStateSequence() {
  const states = [CHAT_STATES.DEMON_IDLE];  // 进入 onConfirmComplete 时
  if (simulatedSetChatState(states[states.length - 1], CHAT_STATES.DEMON_GENERATING)) {
    states.push(CHAT_STATES.DEMON_GENERATING);
  }
  return states;
}

/**
 * 模拟修复前的 onConfirmComplete（无任何 _setChatState）
 */
function onConfirmCompleteStateSequenceOld() {
  return [CHAT_STATES.DEMON_IDLE];  // 推演期间状态
}

/**
 * 模拟 sendMessage 在某状态下尝试转换
 */
function simulateSendMessage(currentState, isInDemon) {
  const targetState = isInDemon ? CHAT_STATES.DEMON_GENERATING : CHAT_STATES.NORMAL_GENERATING;
  return simulatedSetChatState(currentState, targetState);
}

describe('onStartDemon 推演期间状态管理（P2 修复）', () => {
  test('修复后：推演期间状态是 DEMON_GENERATING（FSM 能拦截用户发送）', () => {
    const states = onStartDemonStateSequence();
    expect(states).toContain(CHAT_STATES.DEMON_GENERATING);
  });

  test('修复后：推演期间用户发送消息应被 FSM 拦截', () => {
    const states = onStartDemonStateSequence();
    const duringStreamState = states[states.length - 1];  // DEMON_GENERATING

    // 用户在推演期间发"来了"：isInDemon=true
    const sent = simulateSendMessage(duringStreamState, true);

    // 修复后：FSM 拦截（因为 DEMON_GENERATING 不是终态）
    expect(sent).toBe(false);
  });

  test('修复后：推演完成后用户可以正常发消息', () => {
    let states = onStartDemonStateSequence();
    // 推演完成，状态回到 DEMON_IDLE
    states.push(CHAT_STATES.DEMON_IDLE);

    const afterStreamState = states[states.length - 1];  // DEMON_IDLE
    const sent = simulateSendMessage(afterStreamState, true);

    // 修复后：FSM 放行（DEMON_IDLE → DEMON_GENERATING 合法）
    expect(sent).toBe(true);
  });

  test('【回归】修复前行为：推演期间状态是 DEMON_IDLE（用户能误发）', () => {
    // 验证修复前的 bug 现象：推演期间用户能成功发送
    const states = onStartDemonStateSequenceOld();
    const duringStreamState = states[states.length - 1];  // DEMON_IDLE

    const sent = simulateSendMessage(duringStreamState, true);

    // 修复前：FSM 放行（DEMON_IDLE → DEMON_GENERATING 合法）
    // 这就是 bug 根因！
    expect(sent).toBe(true);
  });
});

describe('onConfirmComplete 推演期间状态管理（P2 修复）', () => {
  test('修复后：完成修炼推演期间状态是 DEMON_GENERATING', () => {
    const states = onConfirmCompleteStateSequence();
    expect(states).toContain(CHAT_STATES.DEMON_GENERATING);
  });

  test('修复后：完成修炼推演期间用户发消息应被 FSM 拦截', () => {
    const states = onConfirmCompleteStateSequence();
    const duringStreamState = states[states.length - 1];

    const sent = simulateSendMessage(duringStreamState, true);
    expect(sent).toBe(false);
  });

  test('【回归】修复前：完成修炼推演期间用户能误发（双推演并发）', () => {
    const states = onConfirmCompleteStateSequenceOld();
    const duringStreamState = states[states.length - 1];

    const sent = simulateSendMessage(duringStreamState, true);
    expect(sent).toBe(true);
  });
});

describe('状态机状态机路径完整性检查', () => {
  test('DEMON_IDLE → DEMON_GENERATING 是合法转换', () => {
    expect(canTransition(CHAT_STATES.DEMON_IDLE, CHAT_STATES.DEMON_GENERATING)).toBe(true);
  });

  test('DEMON_GENERATING → DEMON_IDLE 是合法转换（推演完成回到空闲）', () => {
    expect(canTransition(CHAT_STATES.DEMON_GENERATING, CHAT_STATES.DEMON_IDLE)).toBe(true);
  });

  test('DEMON_GENERATING → DEMON_GENERATING 是非法转换（FSM 拦截）', () => {
    expect(canTransition(CHAT_STATES.DEMON_GENERATING, CHAT_STATES.DEMON_GENERATING)).toBe(false);
  });

  test('isAIBusyState 应在 DEMON_GENERATING 时为 true', () => {
    expect(isAIBusyState(CHAT_STATES.DEMON_GENERATING)).toBe(true);
  });
});

describe('双推演并发防护：完整状态机路径', () => {
  test('场景：用户在 onStartDemon 推演期间发消息应被拦截', () => {
    // 1) 用户在 IDLE 状态点"开始心魔修炼"
    //    _setChatState(IDLE → DEMON_IDLE) ✓
    let current = CHAT_STATES.DEMON_IDLE;

    // 2) 修复后立即 _setChatState(DEMON_IDLE → DEMON_GENERATING) ✓
    expect(canTransition(current, CHAT_STATES.DEMON_GENERATING)).toBe(true);
    current = CHAT_STATES.DEMON_GENERATING;

    // 3) AI 推演中，用户在"来了"输入框中点发送
    //    isInDemon=true（DEMON_GENERATING 是心魔态）
    //    目标：_setChatState(DEMON_GENERATING → DEMON_GENERATING)
    const canSend = canTransition(current, CHAT_STATES.DEMON_GENERATING);

    // 4) 修复后：FSM 拒绝，用户看到 toast
    expect(canSend).toBe(false);

    // 5) AI 推演完成，onFinish 触发 _setChatState(DEMON_GENERATING → DEMON_IDLE) ✓
    expect(canTransition(current, CHAT_STATES.DEMON_IDLE)).toBe(true);
    current = CHAT_STATES.DEMON_IDLE;

    // 6) 用户再次点发送
    const canSend2 = canTransition(current, CHAT_STATES.DEMON_GENERATING);
    expect(canSend2).toBe(true);  // FSM 放行
  });
});
