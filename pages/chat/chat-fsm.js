// pages/chat/chat-fsm.js
// 【P2 重构】将 FSM 常量抽到独立模块
// 原因：
//   1) 单元测试需要单独 require 这些常量
//   2) FSM 定义与 page 业务逻辑解耦，演进更容易

// 主状态：对话流程
const CHAT_STATES = {
  IDLE: 'IDLE',                              // 空闲
  NORMAL_GENERATING: 'NORMAL_GENERATING',    // 日常 AI 推演中
  DAILY_TASK_RECOMMENDING: 'DAILY_TASK_RECOMMENDING',  // 今日宜练推荐中
  DEMON_IDLE: 'DEMON_IDLE',                  // 心魔模式空闲
  DEMON_GENERATING: 'DEMON_GENERATING',      // 心魔 AI 推演中
  SETTLEMENT: 'SETTLEMENT',                  // 结算弹窗展示中
  LEVEL_UP: 'LEVEL_UP'                       // 升级弹窗展示中
};

// 状态转换白名单
const CHAT_TRANSITIONS = {
  IDLE: [
    'NORMAL_GENERATING',
    'DAILY_TASK_RECOMMENDING',
    'DEMON_IDLE'
  ],
  NORMAL_GENERATING: [
    'IDLE',
    'SETTLEMENT'
  ],
  DAILY_TASK_RECOMMENDING: [
    'IDLE'
  ],
  DEMON_IDLE: [
    'DEMON_GENERATING',
    'SETTLEMENT',
    'LEVEL_UP'
  ],
  DEMON_GENERATING: [
    'DEMON_IDLE',
    'SETTLEMENT',
    'LEVEL_UP'
  ],
  SETTLEMENT: [
    'IDLE'
  ],
  LEVEL_UP: [
    'IDLE'
  ]
};

// 派生标志（纯函数）
function isAIBusyState(s) {
  return s === 'NORMAL_GENERATING'
      || s === 'DAILY_TASK_RECOMMENDING'
      || s === 'DEMON_GENERATING';
}
function isDemonState(s) {
  return s === 'DEMON_IDLE' || s === 'DEMON_GENERATING';
}

/**
 * 检查状态转换是否合法
 * @param {string} from 源状态
 * @param {string} to 目标状态
 * @returns {boolean}
 */
function canTransition(from, to) {
  if (from === to) {
    // 【P2 修复】相同状态：仅终态（IDLE/SETTLEMENT/LEVEL_UP）允许幂等
    // 原因：用户双击"开始"按钮时，第二次 onStartDemon 会触发 DEMON_IDLE → DEMON_IDLE
    //       原来的"全允许幂等"会让双击通过，导致：
    //         1) HeartDemonService.start 被调用 2 次（重复保存 user msg）
    //         2) 两个 AI 流式任务并发运行（消息拼接混乱）
    // 终态（IDLE/SETTLEMENT/LEVEL_UP）是用户主动关闭/退出的目标，幂等是合理的
    const TERMINAL_STATES = ['IDLE', 'SETTLEMENT', 'LEVEL_UP'];
    return TERMINAL_STATES.includes(from);
  }
  const allowed = CHAT_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

module.exports = {
  CHAT_STATES,
  CHAT_TRANSITIONS,
  isAIBusyState,
  isDemonState,
  canTransition
};
