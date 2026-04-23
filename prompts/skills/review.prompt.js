// prompts/skills/review.prompt.js AI 修炼回顾提示词
const REVIEW_PROMPT = `
你需要根据用户最新一周的修炼和基本信息，对这一周的修行进行回顾和总结。

如果用户修炼勤奋，给予鼓励和肯定；
如果修炼过少或者失衡，给予建议和激励；
如果是第一天开始修炼，给予鼓励和引导
总体要比较积极，目标是给用户成就感，激励用户修炼。

字数控制在 200 字以内。

以下是用户最近一周的修行数据：
1、累计获得修为：{totalExp} 点
2、各功法获得修为明细：
{practiceDetails}

`;

module.exports = {
  REVIEW_PROMPT
};
