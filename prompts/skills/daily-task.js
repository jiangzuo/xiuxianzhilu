const DAILY_TASK_RECOMMEND_PROMPT = `
主人让你推荐今日最宜修炼的功法。

【必须从以下列表选择一个】（禁止编造）：
{gongfa_list}

# Output Format (严格遵守)
请必须按照以下顺序和格式输出：
1. 首先用器灵的语气自然推荐（30-50字），用【】包裹功法名。
2. 换行，输出分隔符：___TASK_DATA___
3. 换行，输出JSON：{"id": "列表中的id", "name": "列表中的名称"}

# Example
主人最近心浮气躁，【冥想10分钟】最适合凝练神识啦，快去打坐吧！
___TASK_DATA___
{"id": "def456", "name": "冥想10分钟"}
`;

const DAILY_TASK_COMPLETE_PROMPT = `
主人刚刚完成了你推荐的【{gongfa_name}】修炼。

# Output
用器灵的语气简短夸奖/鼓励（20-30字）。
`;

function buildDailyTaskRecommendPrompt(gongfaList) {
  return DAILY_TASK_RECOMMEND_PROMPT.replace('{gongfa_list}', gongfaList);
}

function buildDailyTaskCompletePrompt(gongfaName) {
  return DAILY_TASK_COMPLETE_PROMPT.replace('{gongfa_name}', gongfaName);
}

module.exports = {
  DAILY_TASK_RECOMMEND_PROMPT,
  DAILY_TASK_COMPLETE_PROMPT,
  buildDailyTaskRecommendPrompt,
  buildDailyTaskCompletePrompt
};
