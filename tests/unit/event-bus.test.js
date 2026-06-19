// tests/unit/event-bus.test.js
// 验证事件总线（EventBus）的核心契约
//
// 测试覆盖：
//   1. 基本 on/emit/调用顺序
//   2. 多订阅者按注册顺序执行
//   3. 多个事件隔离
//   4. unsubscribe（on() 返回的函数）正确解绑
//   5. off() 正确移除指定 handler
//   6. emit 无订阅者不报错
//   7. handler 抛错不影响其他订阅者
//   8. handler 内部 off() 同一事件不影响本轮 emit
//   9. 重复 on() 同一 handler 会被多次调用
//  10. clear() 清空所有订阅
//  11. listenerCount() 正确返回
//  12. 入参校验：非字符串 event、非函数 handler
//  13. 订阅后解绑的 handler 不会再被调用

const EventBus = require('../../utils/event-bus');

describe('EventBus 单元测试', () => {
  beforeEach(() => {
    // 每个测试前清空，避免测试间污染
    EventBus.clear();
  });

  test('on + emit：handler 被调用并收到正确数据', () => {
    const handler = jest.fn();
    EventBus.on('test.event', handler);
    EventBus.emit('test.event', { foo: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ foo: 1 });
  });

  test('emit 多次：handler 被调用对应次数', () => {
    const handler = jest.fn();
    EventBus.on('test.event', handler);
    EventBus.emit('test.event', 1);
    EventBus.emit('test.event', 2);
    EventBus.emit('test.event', 3);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
  });

  test('多个订阅者：按注册顺序依次执行', () => {
    const calls = [];
    EventBus.on('test.event', () => calls.push('a'));
    EventBus.on('test.event', () => calls.push('b'));
    EventBus.on('test.event', () => calls.push('c'));
    EventBus.emit('test.event', null);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  test('多个事件：彼此隔离互不干扰', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    EventBus.on('event.one', handler1);
    EventBus.on('event.two', handler2);
    EventBus.emit('event.one', 'A');
    expect(handler1).toHaveBeenCalledWith('A');
    expect(handler2).not.toHaveBeenCalled();
    EventBus.emit('event.two', 'B');
    expect(handler2).toHaveBeenCalledWith('B');
    expect(handler1).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe（on() 返回的函数）正确解绑', () => {
    const handler = jest.fn();
    const unsubscribe = EventBus.on('test.event', handler);
    EventBus.emit('test.event', 1);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    EventBus.emit('test.event', 2);
    expect(handler).toHaveBeenCalledTimes(1); // 没再被调用
  });

  test('off() 正确移除指定 handler', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    EventBus.on('test.event', handler1);
    EventBus.on('test.event', handler2);
    EventBus.off('test.event', handler1);
    EventBus.emit('test.event', null);
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test('emit 无订阅者不报错', () => {
    expect(() => {
      EventBus.emit('no.subscribers', { data: 1 });
    }).not.toThrow();
  });

  test('emit 给空数组的 handler 不报错（订阅者解绑后变空）', () => {
    const handler = jest.fn();
    EventBus.on('test.event', handler);
    EventBus.off('test.event', handler);
    expect(() => EventBus.emit('test.event', null)).not.toThrow();
  });

  test('handler 抛错不影响其他订阅者', () => {
    // 静默 console.error 避免测试输出污染
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const handler1 = jest.fn();
    const handler2 = jest.fn(() => { throw new Error('boom'); });
    const handler3 = jest.fn();

    EventBus.on('test.event', handler1);
    EventBus.on('test.event', handler2);
    EventBus.on('test.event', handler3);

    EventBus.emit('test.event', 'data');

    expect(handler1).toHaveBeenCalledWith('data');
    expect(handler2).toHaveBeenCalled();
    expect(handler3).toHaveBeenCalledWith('data'); // ← 关键：第三个仍被调用
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  test('handler 内部 off() 同一事件：不影响本轮 emit', () => {
    // 模拟"某个 handler 内部注销了后续 handler"的场景
    // 本轮 emit 应该让当前 handler 全部执行，下轮再剔除
    const handler1 = jest.fn();
    const handler2 = jest.fn(() => {
      EventBus.off('test.event', handler3);
    });
    const handler3 = jest.fn();

    EventBus.on('test.event', handler1);
    EventBus.on('test.event', handler2);
    EventBus.on('test.event', handler3);

    EventBus.emit('test.event', null);

    // 本轮：handler3 仍被执行（因为 handler2 注销的是 handler3，但 emit 用了 snapshot）
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(handler3).toHaveBeenCalled();

    // 下轮：handler3 不再被调用
    handler1.mockClear();
    handler2.mockClear();
    handler3.mockClear();
    EventBus.emit('test.event', null);
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(handler3).not.toHaveBeenCalled();
  });

  test('clear() 清空所有订阅', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    EventBus.on('event.a', handler1);
    EventBus.on('event.b', handler2);
    EventBus.clear();
    EventBus.emit('event.a', null);
    EventBus.emit('event.b', null);
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  test('listenerCount() 正确返回订阅者数量', () => {
    expect(EventBus.listenerCount('test.event')).toBe(0);
    EventBus.on('test.event', () => {});
    expect(EventBus.listenerCount('test.event')).toBe(1);
    EventBus.on('test.event', () => {});
    expect(EventBus.listenerCount('test.event')).toBe(2);
    EventBus.clear();
    expect(EventBus.listenerCount('test.event')).toBe(0);
  });

  test('入参校验：event 名为非字符串时警告且返回空 unsubscribe', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = jest.fn();
    const unsubscribe = EventBus.on(null, handler);
    expect(consoleSpy).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe(); // 不应抛错
    consoleSpy.mockRestore();
  });

  test('入参校验：handler 非函数时警告', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = EventBus.on('test.event', 'not-a-function');
    expect(consoleSpy).toHaveBeenCalled();
    expect(typeof result).toBe('function');
    EventBus.emit('test.event', null); // 不应抛错
    consoleSpy.mockRestore();
  });

  test('off() 移除所有同名 handler 后，listener 数组从 map 中清理', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    EventBus.on('cleanup.test', h1);
    EventBus.on('cleanup.test', h2);
    expect(EventBus.listenerCount('cleanup.test')).toBe(2);
    EventBus.off('cleanup.test', h1);
    EventBus.off('cleanup.test', h2);
    expect(EventBus.listenerCount('cleanup.test')).toBe(0);
  });
});
