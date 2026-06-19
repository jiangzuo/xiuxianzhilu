const ARCHIVIST_PROMPT = `
你是一个心理侧写师。请根据【旧档案】和【最新对话】，更新用户的 JSON 画像。

【旧档案】：{current_memory_json}
【新对话】：{recent_history}

---
### 任务一：特征提取（增量更新）
请提取以下信息，若无新信息则保留旧值：
1. **basic**: name(称呼), gender(性别), age(年龄), **job(现实职业)**。
2. **goals**: 用户愿景 (上限5个)。
3. **interests**: 用户喜好 (上限5个)。
4. **difficulties**: 最近遇到的阻碍 (上限3个)。

### 任务二：记忆压缩 (Rolling Summary)
请阅读【旧摘要】和【新对话】，生成一段**新的、精炼的前情提要** (summary)。
- **要求**：保留关键事实（职业、重大事件、核心痛点），剔除无意义的闲聊（如"你好"）。
- **字数**：控制在 200 字以内。

---
### 输出要求：
只输出 JSON，格式如下：
{
  "basic": { ... },
  "goals": [...],
  "interests": [...],
  "difficulties": [...],
  "summary": "新的前情提要..."
}
`;

module.exports = {
  ARCHIVIST_PROMPT
};
