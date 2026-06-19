// utils/event-bus.js
// 轻量级事件总线：用于解耦服务间的横向通信（pub-sub 模式）
//
// 【设计目的】
//   解决"某个行为触发后，多个上游业务需要联动"的场景。
//   例如：practiceService.doPractice() 完成后，
//         - dailyTaskService 需要检查"今日宜练"是否完成
//         - 未来 signInService 可能需要"连续签到+1"
//         - 未来 achievementService 可能需要"成就进度+1"
//         - 未来 statService 可能需要"统计埋点"
//   如果没有事件总线，每个新增订阅方都要改 doPractice，强耦合。
//   用事件总线后，doPractice 只 emit 一声，各订阅方独立监听，零侵入。
//
// 【使用约定】
//   事件命名：'<domain>.<verb>' 形式，全小写、点分
//     例如: 'practice.completed'、'chat.message.sent'、'user.level.up'
//   emit 失败保护：单个 handler 抛错不影响其他 handler
//   单例：整个小程序共享一个总线实例
//
// 【典型用法】
//   // 订阅
//   const EventBus = require('./utils/event-bus');
//   EventBus.on('practice.completed', (data) => { ... });
//
//   // 发送
//   EventBus.emit('practice.completed', { gongfaId, category, exp });
//
//   // 取消订阅（可选，on() 会返回 unsubscribe 函数）
//   const unsubscribe = EventBus.on('practice.completed', handler);
//   unsubscribe();
class EventBus {
  constructor() {
    // { eventName: [handler1, handler2, ...] }
    this._listeners = Object.create(null);
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名（建议 '<domain>.<verb>' 形式）
   * @param {function} handler - 处理函数 (data) => void
   * @returns {function} unsubscribe - 调用可取消订阅
   */
  on(event, handler) {
    if (typeof event !== 'string' || !event) {
      console.warn('[EventBus] on() 事件名必须是非空字符串');
      return () => {};
    }
    if (typeof handler !== 'function') {
      console.warn('[EventBus] on() handler 必须是函数');
      return () => {};
    }
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
    // 返回 unsubscribe 函数，便于在合适时机解绑
    return () => this.off(event, handler);
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名
   * @param {function} handler - 之前注册的处理函数
   */
  off(event, handler) {
    const list = this._listeners[event];
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
    // 清理空数组，避免内存泄漏
    if (list.length === 0) {
      delete this._listeners[event];
    }
  }

  /**
   * 触发事件
   * 同一个事件的 handler 按注册顺序依次执行
   * 单个 handler 抛错会被 try-catch 吞掉，不影响其他 handler
   * @param {string} event - 事件名
   * @param {*} data - 传给 handler 的数据
   */
  emit(event, data) {
    const list = this._listeners[event];
    if (!list || list.length === 0) return;
    // 复制一份后再迭代：避免 handler 内部 off() 同一事件时影响本轮遍历
    const snapshot = list.slice();
    snapshot.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        // 单个 handler 失败不影响其他订阅者
        console.error(`[EventBus] handler for "${event}" threw:`, e);
      }
    });
  }

  /**
   * 清空所有订阅（仅用于测试）
   */
  clear() {
    this._listeners = Object.create(null);
  }

  /**
   * 获取某事件当前订阅者数量（用于调试/测试）
   * @param {string} event - 事件名
   * @returns {number}
   */
  listenerCount(event) {
    const list = this._listeners[event];
    return list ? list.length : 0;
  }
}

// 全局单例：整个小程序进程共享一个 EventBus 实例
// 微信小程序运行时是单例的（每个 App 实例），require 缓存保证模块级单例
module.exports = new EventBus();
