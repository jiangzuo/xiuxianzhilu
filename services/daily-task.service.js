// services/daily-task.service.js
const CacheManager = require('../utils/cache-manager');
const AIService = require('./ai.service');
const ChatService = require('./chat.service');
const MemoryService = require('./memory.service');
const { buildDailyTaskRecommendPrompt, buildDailyTaskCompletePrompt } = require('../utils/prompt-template');

const DailyTaskService = {
  /**
   * 获取功法菜单（数据预处理）
   */
  getGongfaMenu() {
    const cultivations = CacheManager.get('userCultivations');
    if (!cultivations) return [];

    const allGongfas = [
      ...cultivations.body,
      ...cultivations.mind,
      ...cultivations.skill,
      ...cultivations.wealth
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

    const filterForDisplay = (content) => {
      return content.split(/___TASK_DATA___|```json/)[0].trim();
    };

    AIService.sendMessageStream(
      messages,
      (chunk) => {
        fullContent += chunk;
        if (onStream) onStream(filterForDisplay(fullContent));
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

    const cultivations = CacheManager.get('userCultivations') || {};
    if (cultivations[category]) {
      const item = cultivations[category].find(i => i.id === gongfaId);
      if (item) {
        item.dailyTaskCompletedCount = (item.dailyTaskCompletedCount || 0) + 1;
        CacheManager.set('userCultivations', cultivations);
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
    const cultivations = CacheManager.get('userCultivations');
    if (!cultivations) return null;

    const categories = ['body', 'mind', 'skill', 'wealth'];
    for (const category of categories) {
      const found = cultivations[category]?.find(item => item.id === gongfaId);
      if (found) return category;
    }
    return null;
  }
};

module.exports = DailyTaskService;
