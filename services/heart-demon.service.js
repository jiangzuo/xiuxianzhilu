// services/heart-demon.service.js 心魔修炼服务
const AIService = require('./ai.service');
const ChatService = require('./chat.service');
const UserService = require('./user.service');
const MemoryService = require('./memory.service');
const practiceService = require('./practice.service');
const { HEART_DEMON_COMMON } = require('../prompts/skills/heart-demon/heart-demon');
const { HEART_DEMON_FEAR } = require('../prompts/skills/heart-demon/fear');
const { HEART_DEMON_REGRET } = require('../prompts/skills/heart-demon/regret');

const HeartDemonService = {
  _currentType: null,
  _roundCount: 0,
  _currentGongfaId: null,
  _sessionStartRound: 0,

  getDemonPrompt(type) {
    if (type === 'fear') {
      return HEART_DEMON_FEAR;
    } else if (type === 'regret') {
      return HEART_DEMON_REGRET;
    }
    return '';
  },

  buildSystemMessage(type) {
    const demonPrompt = this.getDemonPrompt(type);
    const userArchive = UserService.buildUserArchive();

    let content = HEART_DEMON_COMMON
      .replace('{hard_info_text}', userArchive.hard_info_text)
      .replace('{recent_activity_log}', userArchive.recent_activity_log)
      .replace('{practice_stats}', userArchive.practice_stats)
      .replace('{soft_info_text}', userArchive.soft_info_text)
      .replace('{rolling_summary}', userArchive.rolling_summary);

    content = content + '\n\n' + demonPrompt;

    return { role: 'system', content };
  },

  _buildContext(type) {
    const demonHistory = ChatService.getDemonContextForAI(type, 30);
    
    const rounds = [];
    let currentRound = null;
    
    demonHistory.forEach(msg => {
      if (msg.role === 'user') {
        if (currentRound) {
          rounds.push(currentRound);
        }
        currentRound = { user: msg.content };
      } else if (msg.role === 'assistant' && currentRound) {
        currentRound.assistant = msg.content;
        rounds.push(currentRound);
        currentRound = null;
      }
    });
    
    const historyRoundCount = rounds.length;
    
    const historyStr = rounds.map((round) => {
      return `用户：${round.user}\n系统：${round.assistant || ''}`;
    }).join('\n\n');

    return { historyStr, historyRoundCount };
  },

  start(type, onStream, onFinish, onError) {
    this._currentType = type;
    this._roundCount = 0;
    this._sessionStartRound = 0;
    const category = type === 'fear' ? 'demon_fear' : 'demon_regret';

    // 记录当前修炼的功法ID
    const data = practiceService.getpracticeData();
    const mindList = data.mind || [];
    const key = type === 'fear' ? 'heart-demon-fear' : 'heart-demon-regret';
    const gongfa = mindList.find(item => item.key === key);
    this._currentGongfaId = gongfa ? gongfa.id : null;

    const userContent = `心魔修炼-${type === 'fear' ? '恐惧' : '后悔'}`;
    ChatService.saveMessage('user', userContent, category);

    this._roundCount += 1;
    const { historyStr } = this._buildContext(type);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userContent}\n【当前轮次】：第${this._roundCount}轮`;

    const messages = [
      this.buildSystemMessage(type),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    AIService.sendMessageStream(
      messages,
      (chunk) => {
        fullAiContent += chunk;
        if (onStream) onStream(fullAiContent);
      },
      () => {
        ChatService.saveMessage('assistant', fullAiContent, category);
        if (onFinish) onFinish(fullAiContent);
      },
      (err) => {
        console.error('[HeartDemon] AI调用失败', err);
        if (onError) onError(err);
      }
    );
  },

  sendMessage(userInput, onStream, onFinish, onError) {
    if (!this._currentType) {
      if (onError) onError({ message: '未在心魔修炼模式' });
      return;
    }

    const category = this._currentType === 'fear' ? 'demon_fear' : 'demon_regret';
    ChatService.saveMessage('user', userInput, category);

    this._roundCount += 1;
    const currentRound = this._roundCount;

    const { historyStr } = this._buildContext(this._currentType);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userInput}\n【当前轮次】：第${currentRound}轮`;

    const messages = [
      this.buildSystemMessage(this._currentType),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    AIService.sendMessageStream(
      messages,
      (chunk) => {
        fullAiContent += chunk;
        if (onStream) onStream(fullAiContent);
      },
      () => {
        ChatService.saveMessage('assistant', fullAiContent, category);
        if (onFinish) onFinish(fullAiContent);
      },
      (err) => {
        console.error('[HeartDemon] AI调用失败', err);
        if (onError) onError(err);
      }
    );
  },

  complete(onStream, onFinish, onError) {
    if (!this._currentType) {
      if (onError) onError({ message: '未在心魔修炼模式' });
      return;
    }

    const category = this._currentType === 'fear' ? 'demon_fear' : 'demon_regret';
    const typeName = this._currentType === 'fear' ? '恐惧' : '后悔';
    const userContent = `完成心魔修炼-${typeName}`;

    ChatService.saveMessage('user', userContent, category);

    this._roundCount += 1;
    const currentRound = this._roundCount;

    const { historyStr } = this._buildContext(this._currentType);
    const contextStr = historyStr ? `【历史对话】\n${historyStr}\n\n` : '';
    const fullContent = `${contextStr}【当前】用户：${userContent}\n【当前轮次】：第${currentRound}轮`;

    const messages = [
      this.buildSystemMessage(this._currentType),
      { role: 'user', content: fullContent }
    ];

    let fullAiContent = '';

    AIService.sendMessageStream(
      messages,
      (chunk) => {
        fullAiContent += chunk;
        if (onStream) onStream(fullAiContent);
      },
      () => {
        ChatService.saveMessage('assistant', fullAiContent, category);

        // 调用统一的修炼完成方法，更新真实数据
        let practiceResult = null;
        if (this._currentGongfaId) {
          practiceResult = practiceService.doPractice(this._currentGongfaId, 'mind');
        }

        this._currentType = null;
        this._roundCount = 0;
        this._currentGongfaId = null;
        MemoryService.forceUpdateMemory();
        if (onFinish) onFinish(fullAiContent, practiceResult);
      },
      (err) => {
        console.error('[HeartDemon] 完成修炼失败', err);
        if (onError) onError(err);
      }
    );
  },

  isInMode() {
    return this._currentType !== null;
  },

  getCurrentType() {
    return this._currentType;
  }
};

module.exports = HeartDemonService;
