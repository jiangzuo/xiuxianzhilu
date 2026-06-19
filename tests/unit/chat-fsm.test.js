// tests/unit/chat-fsm.test.js
// FSM 状态机单元测试
// 覆盖：
//   1) 7 个状态常量
//   2) 派生标志 isAIBusyState / isDemonState
//   3) canTransition 白名单检查
//   4) 关键状态机的合法/非法跳转
//   5) 守门员（_setChatState 风格）的幂等、拒绝、合法路径

const fsm = require('../../pages/chat/chat-fsm');

describe('ChatFSM - 状态常量', () => {
  test('应定义 7 个状态', () => {
    expect(Object.keys(fsm.CHAT_STATES)).toHaveLength(7);
  });

  test('所有状态值应该是字符串', () => {
    Object.values(fsm.CHAT_STATES).forEach(v => {
      expect(typeof v).toBe('string');
    });
  });

  test('应包含所有关键状态', () => {
    expect(fsm.CHAT_STATES.IDLE).toBe('IDLE');
    expect(fsm.CHAT_STATES.NORMAL_GENERATING).toBe('NORMAL_GENERATING');
    expect(fsm.CHAT_STATES.DAILY_TASK_RECOMMENDING).toBe('DAILY_TASK_RECOMMENDING');
    expect(fsm.CHAT_STATES.DEMON_IDLE).toBe('DEMON_IDLE');
    expect(fsm.CHAT_STATES.DEMON_GENERATING).toBe('DEMON_GENERATING');
    expect(fsm.CHAT_STATES.SETTLEMENT).toBe('SETTLEMENT');
    expect(fsm.CHAT_STATES.LEVEL_UP).toBe('LEVEL_UP');
  });
});

describe('ChatFSM - 派生标志', () => {
  test('isAIBusyState 正确', () => {
    expect(fsm.isAIBusyState('NORMAL_GENERATING')).toBe(true);
    expect(fsm.isAIBusyState('DAILY_TASK_RECOMMENDING')).toBe(true);
    expect(fsm.isAIBusyState('DEMON_GENERATING')).toBe(true);
    // 非 busy 态
    expect(fsm.isAIBusyState('IDLE')).toBe(false);
    expect(fsm.isAIBusyState('DEMON_IDLE')).toBe(false);
    expect(fsm.isAIBusyState('SETTLEMENT')).toBe(false);
    expect(fsm.isAIBusyState('LEVEL_UP')).toBe(false);
  });

  test('isDemonState 正确', () => {
    expect(fsm.isDemonState('DEMON_IDLE')).toBe(true);
    expect(fsm.isDemonState('DEMON_GENERATING')).toBe(true);
    // 非心魔态
    expect(fsm.isDemonState('IDLE')).toBe(false);
    expect(fsm.isDemonState('NORMAL_GENERATING')).toBe(false);
    expect(fsm.isDemonState('DAILY_TASK_RECOMMENDING')).toBe(false);
    expect(fsm.isDemonState('SETTLEMENT')).toBe(false);
    expect(fsm.isDemonState('LEVEL_UP')).toBe(false);
  });
});

describe('ChatFSM - canTransition 守门', () => {
  test('IDLE 可以转换到 3 个入口态', () => {
    expect(fsm.canTransition('IDLE', 'NORMAL_GENERATING')).toBe(true);
    expect(fsm.canTransition('IDLE', 'DAILY_TASK_RECOMMENDING')).toBe(true);
    expect(fsm.canTransition('IDLE', 'DEMON_IDLE')).toBe(true);
  });

  test('IDLE 非法转换应被拒绝', () => {
    // IDLE 不能直接跳到 SETTLEMENT（必须经过 DEMON_IDLE → SETTLEMENT）
    expect(fsm.canTransition('IDLE', 'SETTLEMENT')).toBe(false);
    expect(fsm.canTransition('IDLE', 'LEVEL_UP')).toBe(false);
    expect(fsm.canTransition('IDLE', 'DEMON_GENERATING')).toBe(false);
  });

  test('AI 生成中应拒绝新业务', () => {
    // 【P2 修复】NORMAL_GENERATING 同状态不再是幂等的（防双击）
    expect(fsm.canTransition('NORMAL_GENERATING', 'NORMAL_GENERATING')).toBe(false);
    expect(fsm.canTransition('NORMAL_GENERATING', 'DAILY_TASK_RECOMMENDING')).toBe(false);
    expect(fsm.canTransition('NORMAL_GENERATING', 'DEMON_IDLE')).toBe(false);

    // DAILY_TASK_RECOMMENDING 中也不能切其他业务
    expect(fsm.canTransition('DAILY_TASK_RECOMMENDING', 'NORMAL_GENERATING')).toBe(false);
    expect(fsm.canTransition('DAILY_TASK_RECOMMENDING', 'DEMON_IDLE')).toBe(false);

    // DEMON_GENERATING 中也不能发正常消息
    expect(fsm.canTransition('DEMON_GENERATING', 'NORMAL_GENERATING')).toBe(false);
  });

  test('所有 *_GENERATING 都能回到 IDLE（错误恢复路径）', () => {
    expect(fsm.canTransition('NORMAL_GENERATING', 'IDLE')).toBe(true);
    expect(fsm.canTransition('DAILY_TASK_RECOMMENDING', 'IDLE')).toBe(true);
    // DEMON_GENERATING 错误时回 DEMON_IDLE（不是 IDLE），让用户继续操作心魔
    expect(fsm.canTransition('DEMON_GENERATING', 'DEMON_IDLE')).toBe(true);
  });

  test('心魔完成路径', () => {
    // 心魔启动问候（DEMON_IDLE）→ 用户发言（DEMON_GENERATING）→ 完成（DEMON_IDLE）→ 完成确认（SETTLEMENT/LEVEL_UP）
    expect(fsm.canTransition('DEMON_IDLE', 'DEMON_GENERATING')).toBe(true);
    expect(fsm.canTransition('DEMON_GENERATING', 'DEMON_IDLE')).toBe(true);
    expect(fsm.canTransition('DEMON_GENERATING', 'SETTLEMENT')).toBe(true);
    expect(fsm.canTransition('DEMON_GENERATING', 'LEVEL_UP')).toBe(true);
    expect(fsm.canTransition('DEMON_IDLE', 'SETTLEMENT')).toBe(true);
    expect(fsm.canTransition('DEMON_IDLE', 'LEVEL_UP')).toBe(true);
  });

  test('终态只能回到 IDLE', () => {
    expect(fsm.canTransition('SETTLEMENT', 'IDLE')).toBe(true);
    expect(fsm.canTransition('SETTLEMENT', 'NORMAL_GENERATING')).toBe(false);
    expect(fsm.canTransition('SETTLEMENT', 'DEMON_IDLE')).toBe(false);
    expect(fsm.canTransition('LEVEL_UP', 'IDLE')).toBe(true);
    expect(fsm.canTransition('LEVEL_UP', 'NORMAL_GENERATING')).toBe(false);
  });

  test('幂等：仅终态（IDLE/SETTLEMENT/LEVEL_UP）允许同状态转换', () => {
    // 【P2 修复】重构 canTransition 后，仅终态允许同状态转换
    // 原因：NORMAL_GENERATING/DEMON_GENERATING 等非终态的幂等会
    //       让双击"开始"等场景通过 FSM 检查，导致并发任务
    const TERMINAL_STATES = ['IDLE', 'SETTLEMENT', 'LEVEL_UP'];
    Object.values(fsm.CHAT_STATES).forEach(s => {
      const isTerminal = TERMINAL_STATES.includes(s);
      expect(fsm.canTransition(s, s)).toBe(isTerminal);
    });
  });

  test('幂等：终态（IDLE/SETTLEMENT/LEVEL_UP）允许同状态', () => {
    // 终态是用户主动关闭/退出的目标，多次"关闭"操作应保持幂等
    expect(fsm.canTransition('IDLE', 'IDLE')).toBe(true);
    expect(fsm.canTransition('SETTLEMENT', 'SETTLEMENT')).toBe(true);
    expect(fsm.canTransition('LEVEL_UP', 'LEVEL_UP')).toBe(true);
  });

  test('幂等：非终态禁止同状态（防双击并发）', () => {
    // NORMAL_GENERATING 中再发一次"正常消息"应被 FSM 拒绝
    expect(fsm.canTransition('NORMAL_GENERATING', 'NORMAL_GENERATING')).toBe(false);
    // DEMON_GENERATING 中再发一次"心魔消息"应被 FSM 拒绝
    expect(fsm.canTransition('DEMON_GENERATING', 'DEMON_GENERATING')).toBe(false);
    // DAILY_TASK_RECOMMENDING 中再触发一次"今日宜练"应被拒绝
    expect(fsm.canTransition('DAILY_TASK_RECOMMENDING', 'DAILY_TASK_RECOMMENDING')).toBe(false);
    // DEMON_IDLE 中再触发一次"启动心魔"应被拒绝
    expect(fsm.canTransition('DEMON_IDLE', 'DEMON_IDLE')).toBe(false);
  });

  test('双击启动心魔：第二次应被 FSM 拒绝', () => {
    // 模拟场景：用户双击"开始"按钮，第二次 onStartDemon 触发 DEMON_IDLE → DEMON_IDLE
    // 修复后应被 FSM 拒绝，避免 HeartDemonService.start 被调用 2 次
    const gk = (() => {
      let s = 'IDLE';
      return {
        set: (n) => { if (fsm.canTransition(s, n)) { s = n; return true; } return false; },
        get: () => s
      };
    })();
    expect(gk.set('DEMON_IDLE')).toBe(true);
    // 第二次同样转换应被拒绝
    expect(gk.set('DEMON_IDLE')).toBe(false);
  });

  test('未知状态应被拒绝', () => {
    expect(fsm.canTransition('UNKNOWN_STATE', 'IDLE')).toBe(false);
    expect(fsm.canTransition('IDLE', 'UNKNOWN_STATE')).toBe(false);
  });
});

describe('ChatFSM - 守门员模拟（page._setChatState 行为复现）', () => {
  // 这里复现 page 中的 _setChatState 逻辑，但用函数式写法
  // 验证关键行为：拒绝非法转换、合法转换更新 data

  function createGatekeeper() {
    let data = {
      chatState: fsm.CHAT_STATES.IDLE,
      isAIBusy: false,
      isInDemon: false
    };
    return {
      getData: () => ({ ...data }),
      setState(newState, reason = '') {
        const current = data.chatState;
        if (!fsm.canTransition(current, newState)) {
          return { ok: false, reason: `非法: ${current} → ${newState}` };
        }
        data.chatState = newState;
        data.isAIBusy = fsm.isAIBusyState(newState);
        data.isInDemon = fsm.isDemonState(newState);
        return { ok: true };
      }
    };
  }

  test('合法转换应成功', () => {
    const gk = createGatekeeper();
    const r = gk.setState(fsm.CHAT_STATES.NORMAL_GENERATING, 'test');
    expect(r.ok).toBe(true);
    expect(gk.getData().chatState).toBe('NORMAL_GENERATING');
    expect(gk.getData().isAIBusy).toBe(true);
    expect(gk.getData().isInDemon).toBe(false);
  });

  test('非法转换应被拒绝且 data 不变', () => {
    const gk = createGatekeeper();
    const before = gk.getData();
    const r = gk.setState(fsm.CHAT_STATES.SETTLEMENT, 'should fail');
    expect(r.ok).toBe(false);
    expect(gk.getData()).toEqual(before);
  });

  test('完整心魔流程', () => {
    const gk = createGatekeeper();
    expect(gk.setState('DEMON_IDLE').ok).toBe(true);
    expect(gk.getData().isInDemon).toBe(true);
    expect(gk.setState('DEMON_GENERATING').ok).toBe(true);
    expect(gk.getData().isAIBusy).toBe(true);
    expect(gk.setState('DEMON_IDLE').ok).toBe(true);
    expect(gk.getData().isAIBusy).toBe(false);
    expect(gk.setState('SETTLEMENT').ok).toBe(true);
    expect(gk.setState('IDLE').ok).toBe(true);
  });

  test('幂等：同状态调用应成功', () => {
    const gk = createGatekeeper();
    expect(gk.setState('IDLE').ok).toBe(true);
    expect(gk.setState('IDLE').ok).toBe(true);
  });
});

describe('ChatFSM - 防御性回归测试', () => {
  // 这些测试覆盖架构师分析中提到的关键 race condition 场景

  test('在 AI 生成中点击"今日宜练"应被拒绝', () => {
    // 模拟场景：用户发了日常消息后，AI 还在推演，用户狂点"今日宜练"
    const gk = (() => {
      let s = 'IDLE';
      return {
        set: (n) => { if (fsm.canTransition(s, n)) { s = n; return true; } return false; },
        get: () => s
      };
    })();
    expect(gk.set('NORMAL_GENERATING')).toBe(true);
    // 反复尝试
    expect(gk.set('DAILY_TASK_RECOMMENDING')).toBe(false);
    expect(gk.set('DAILY_TASK_RECOMMENDING')).toBe(false);
    expect(gk.get()).toBe('NORMAL_GENERATING');  // 状态没变
  });

  test('心魔模式中无法发正常消息', () => {
    const gk = (() => {
      let s = 'IDLE';
      return {
        set: (n) => { if (fsm.canTransition(s, n)) { s = n; return true; } return false; }
      };
    })();
    gk.set('DEMON_IDLE');
    // 心魔模式下用户尝试发日常消息
    expect(gk.set('NORMAL_GENERATING')).toBe(false);
  });

  test('完成心魔修炼后被错误捕获应回 DEMON_IDLE（不能困在 DEMON_GENERATING）', () => {
    const gk = (() => {
      let s = 'IDLE';
      return {
        set: (n) => { if (fsm.canTransition(s, n)) { s = n; return true; } return false; },
        get: () => s
      };
    })();
    gk.set('DEMON_IDLE');
    gk.set('DEMON_GENERATING');
    // 服务端崩溃，错误回调
    expect(gk.set('DEMON_IDLE')).toBe(true);  // 回到 DEMON_IDLE 是合法的（让用户继续操作心魔）
  });
});
