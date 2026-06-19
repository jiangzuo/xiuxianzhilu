// services/daily-task.service.js 今日宜练功能
const CacheManager = require('../utils/cache-manager');
const AIService = require('./ai.service');
const ChatService = require('./chat.service');
const MemoryService = require('./memory.service');
// 【P2 新增】引入事件总线：订阅 'practice.completed' 自动联动今日宜练
// 解决痛点：聊天页心魔修炼完成、签到页、分享页等任何"调 doPractice"的地方
//          都能自动触发今日宜练完成判定，无需在每个调用方重复 triggerPracticeReaction
const EventBus = require('../utils/event-bus');
const { buildDailyTaskRecommendPrompt, buildDailyTaskCompletePrompt } = require('../prompts/skills/daily-task');

const DailyTaskService = {
  /**
   * 初始化：订阅事件总线
   * 【P2 新增】在 app.js onLaunch 调用一次
   * 防重复订阅：用 _initialized 标志保证多次调用也只注册一次
   * 【P2 新增】防御性兜底：syncFromPracticeLogs() 也需要在 practice.js onShow 调用
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
    // 绑定 this 上下文，确保 handler 内部 this 指向 DailyTaskService
    this._onPracticeCompletedHandler = (data) => this._onPracticeCompleted(data);
    EventBus.on('practice.completed', this._onPracticeCompletedHandler);
    console.log('[DailyTask] 事件订阅已初始化（practice.completed）');
  },

  /**
   * 内部方法：处理 'practice.completed' 事件
   * 触发时机：practiceService.doPractice() 成功 emit 时
   * 行为：如果本次修炼的 gongfaId 匹配今日宜练推荐，且未完成 → 触发完成反应
   * @param {Object} data - { gongfaId, gongfaName, category, exp, timestamp }
   */
  _onPracticeCompleted(data) {
    if (!data || !data.gongfaId) return;
    const task = CacheManager.get('dailyTask') || {};

    // 匹配今日宜练 + 未完成 → 触发完成反应
    // 注：triggerPracticeReaction 内部自带 completed 守卫，幂等
    if (task.gongfaId === data.gongfaId && !task.completed) {
      console.log('[DailyTask] 事件触发：检测到今日宜练完成', {
        gongfaId: data.gongfaId,
        gongfaName: data.gongfaName
      });
      this.triggerPracticeReaction(
        data.gongfaId,
        data.gongfaName,
        data.exp,
        data.category
      );
    }
  },

  /**
   * 【P2 新增】从修炼日志反推同步今日宜练状态（防御性兜底）
   * 使用场景：practice.completed 事件因某些原因未触发（如订阅晚于 emit、跨进程等）
   *          在 practice.js onShow 时调用，确保即使事件丢了也能正确反映状态
   * 实现：扫今天的 practice_logs，如果今日宜练的 gongfaName 已有记录 → 标记完成
   * @returns {boolean} 是否触发了同步（true = 发现匹配并已标记完成）
   */
  syncFromPracticeLogs() {
    const task = CacheManager.get('dailyTask') || {};
    // 无任务 / 已完成 → 不需要兜底
    if (!task.gongfaId || task.completed) return false;
    if (!task.gongfaName) return false;

    // 今天 0 点（本地时区）
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const logs = wx.getStorageSync('practice_logs') || [];
    // 今天的修炼记录（按 action 名称匹配）
    // 注：log.action 是功法名称（gongfa.name），不是 ID
    //     dailyTask.gongfaName 是 AI 推荐时填入的功法名称
    //     二者由 AI 推荐时保证一致；用户改名的情况暂不考虑
    const todayLogs = logs.filter(l =>
      l.type === 'practice' &&
      l.timestamp >= startOfToday &&
      l.action === task.gongfaName
    );

    if (todayLogs.length === 0) return false;

    // 找到匹配记录：按今天最后一次匹配的 exp 触发
    // 防御性：分类查找一次，确保功法还在 userpractices 中
    const category = this.getCategoryByGongfaId(task.gongfaId);
    if (!category) return false;

    const matchedLog = todayLogs[0]; // 最新的匹配
    console.log('[DailyTask] 防御性同步：practice_logs 中已存在今日宜练记录', {
      gongfaId: task.gongfaId,
      exp: matchedLog.exp,
      logCount: todayLogs.length
    });

    this.triggerPracticeReaction(
      task.gongfaId,
      task.gongfaName,
      matchedLog.exp,
      category
    );
    return true;
  },

  /**
   * 【P2 新增】获取今日宜练加成后的修为
   * 使用场景：所有调用 doPractice() 的地方（修炼场、聊天页心魔、未来签到页等）
   *          在传入 exp 之前先问"这个功法今天是不是宜练？加成后是多少？"
   * 行为：gongfaId 匹配今日宜练 + 未完成 → 修为翻倍；否则原值返回
   * 副作用：纯查询，不修改任何状态
   *
   * 调用约定（重要）：
   *   调用方应传入"该功法的原始修为"，即 userpractices 里 item.exp
   *   不要先把别的逻辑的"加成后值"再传进来，否则会叠加错误
   *
   * @param {string} gongfaId - 功法 ID
   * @param {number} baseExp - 该功法的原始修为（item.exp）
   * @returns {number} 加成后的修为（baseExp 或 baseExp*2）
   */
  getBonusExp(gongfaId, baseExp) {
    const task = CacheManager.get('dailyTask') || {};
    if (task.gongfaId === gongfaId && !task.completed) {
      return (baseExp || 0) * 2;
    }
    return baseExp || 0;
  },

  /**
   * 获取功法菜单（数据预处理）
   */
  getGongfaMenu() {
    const practices = CacheManager.get('userpractices');
    if (!practices) return [];

    const allGongfas = [
      ...practices.body,
      ...practices.mind,
      ...practices.skill,
      ...practices.wealth
    ].filter(item => item.status !== 'archived');

    return allGongfas.map(item =>
      `- ${item.name} (id: ${item.id})`
    ).join('\n');
  },

  /**
   * 获取今日任务状态
   */
  getDailyTaskStatus() {
    const task = CacheManager.get('dailyTask') || {};
    const today = new Date().setHours(0, 0, 0, 0);
    const taskDate = task.recommendedAt ? new Date(task.recommendedAt).setHours(0, 0, 0, 0) : null;

    if (!taskDate || taskDate < today) {
      return { exists: false };
    }

    return {
      exists: true,
      completed: task.completed || false,
      gongfaId: task.gongfaId,
      gongfaName: task.gongfaName,
      recommendText: task.recommendText
    };
  },

  /**
   * 解析AI响应，提取自然语言和JSON
   */
  parseRecommendationResponse(aiResponse) {
    const parts = aiResponse.split(/___TASK_DATA___/);
    const displayText = parts[0].trim();
    
    let gongfaId = null;
    let gongfaName = null;
    
    if (parts[1]) {
      try {
        const jsonStr = parts[1].replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonData = JSON.parse(jsonStr);
        gongfaId = jsonData.id;
        gongfaName = jsonData.name;
      } catch (e) {
        console.error('[DailyTask] JSON解析失败', e);
      }
    }

    return {
      displayText: displayText,
      gongfaId,
      gongfaName
    };
  },

  /**
   * 生成今日宜练推荐
   * @param {string} userInput - 用户输入（如"今日宜练"或"换一个"）
   */
  generateRecommendation(userInput, onStream, onFinish, onError) {
    const gongfaMenu = this.getGongfaMenu();

    if (!gongfaMenu) {
      if (onError) onError({ type: 'no_gongfa', message: '主人还没有编入修炼功法呢，先去功法阁获取吧' });
      return;
    }

    const systemMsgObj = MemoryService.buildSystemMessage();
    const taskPrompt = buildDailyTaskRecommendPrompt(gongfaMenu);
    const systemWithTask = systemMsgObj.content.replace('# Constraint', `${taskPrompt}\n\n# Constraint`);

    let historyObjs = ChatService.getContextForAI(10);
    if (historyObjs.length > 0) {
      const lastMsg = historyObjs[historyObjs.length - 1];
      if (lastMsg.role === 'user' && lastMsg.content === userInput) {
        historyObjs.pop();
      }
    }

    const historyStr = historyObjs.map(msg => {
      const roleName = msg.role === 'user' ? '主人' : '器灵';
      return `${roleName}：${msg.content}`;
    }).join('\n');

    const userContent = `记忆（上下文）：\n${historyStr}\n\n[当前] 主人：${userInput}`;
    const messages = [
      { role: 'system', content: systemWithTask },
      { role: 'user', content: userContent }
    ];

    let fullContent = '';

    // 【P2 修复】filter 提取到闭包外，便于测试和复用
    // 原因：onStream 需要稳定地只显示 display 部分，截断 ___TASK_DATA___/```json 之后的内容
    const filterForDisplay = (content) => {
      return content.split(/___TASK_DATA___|```json/)[0].trim();
    };

    // 【P2 修复】onStream 签名改为 (displayContent, deltaChunk)
    // 修复前：只传 filter 后的累积字符串（displayContent）
    //         → 上层 chat-flow.service.js 误以为是 delta chunk，再次累加
    //         → 流式内容重复累积（"今"→"今今日"→"今今日今日适合"）
    //         → onResult 触发时被一次性 displayText 替换 → 用户看到"内容闪烁/消失"
    // 修复后：传 (displayContent, deltaChunk)
    //         → displayContent 是 filter 后的累积字符串（用于显示）
    //         → deltaChunk 是原始 delta（用于其他需要 delta 的场景，如打字机动画）
    //         → 与 _streamChat 的 (fullContent, deltaChunk) 契约保持一致
    AIService.sendMessageStream(
      messages,
      (chunk) => {
        fullContent += chunk;
        if (onStream) onStream(filterForDisplay(fullContent), chunk);
      },
      () => {
        const result = this.parseRecommendationResponse(fullContent);

        if (!result.gongfaId) {
          if (onError) onError({ type: 'parse_error', message: '无法解析功法信息' });
          return;
        }

        const taskData = {
          gongfaId: result.gongfaId,
          gongfaName: result.gongfaName,
          recommendText: result.displayText,
          recommendedAt: Date.now(),
          completed: false
        };

        CacheManager.set('dailyTask', taskData);

        if (onFinish) onFinish(result);
      },
      (err) => {
        console.error('[DailyTask] AI调用失败', err);
        if (onError) onError({ type: 'ai_error', message: '传音失败，请重试' });
      }
    );
  },

  /**
   * 触发修炼完成后的AI反应
   */
  triggerPracticeReaction(gongfaId, gongfaName, exp, category) {
    const task = CacheManager.get('dailyTask') || {};

    if (task.gongfaId !== gongfaId || task.completed) {
      return;
    }

    task.completed = true;
    CacheManager.set('dailyTask', task);

    const practices = CacheManager.get('userpractices') || {};
    if (practices[category]) {
      const item = practices[category].find(i => i.id === gongfaId);
      if (item) {
        item.dailyTaskCompletedCount = (item.dailyTaskCompletedCount || 0) + 1;
        CacheManager.set('userpractices', practices);
      }
    }

    const systemMsgObj = MemoryService.buildSystemMessage();
    const taskPrompt = buildDailyTaskCompletePrompt(gongfaName);
    const systemWithTask = systemMsgObj.content.replace('# Constraint', `${taskPrompt}\n\n# Constraint`);

    let historyObjs = ChatService.getContextForAI(5);
    const historyStr = historyObjs.map(msg => {
      const roleName = msg.role === 'user' ? '主人' : '器灵';
      return `${roleName}：${msg.content}`;
    }).join('\n');

    const userContent = `记忆（上下文）：\n${historyStr}\n\n[当前] 主人：完成了今日宜练`;

    const messages = [
      { role: 'system', content: systemWithTask },
      { role: 'user', content: userContent }
    ];

    let aiResponse = '';

    AIService.sendMessageStream(
      messages,
      (chunk) => { aiResponse += chunk; },
      () => {
        if (aiResponse.trim()) {
          ChatService.saveMessage('assistant', aiResponse.trim());
          console.log('[DailyTask] 夸奖消息已保存:', aiResponse.trim());
        }
      },
      (err) => {
        console.error('[DailyTask] 夸奖消息生成失败', err);
      }
    );
  },

  /**
   * 根据gongfaId获取分类
   */
  getCategoryByGongfaId(gongfaId) {
    const practices = CacheManager.get('userpractices');
    if (!practices) return null;

    const categories = ['body', 'mind', 'skill', 'wealth'];
    for (const category of categories) {
      const found = practices[category]?.find(item => item.id === gongfaId);
      if (found) return category;
    }
    return null;
  }
};

module.exports = DailyTaskService;
