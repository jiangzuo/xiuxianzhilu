---
name: 提示词 上下文构建prompt-context-build
description: 构建 AI Prompt 上下文并防止内容重复。当构建包含用户档案的系统提示词、构建任务特定提示词，或遇到 AI 回复中信息重复时调用。
---

# Prompt Context Building

## Problem 1: Duplicate Content

User sees repeated profile information in AI responses because `SYSTEM_PROMPT` is processed multiple times.

### Root Cause

```javascript
// ❌ Wrong: Multiple replaces on same template
const prompt = SYSTEM_PROMPT
  .replace('{hard_info}', hardInfo)  // First replace
  .replace('{soft_info}', softInfo);

// Later in another function:
const finalPrompt = prompt
  .replace('{hard_info}', hardInfo);  // Replaces again!
```

### Solution: Separate Templates

```javascript
// utils/prompt-template.js

// Base template for daily chat
const SYSTEM_PROMPT = `
# Role
你是器灵...

# User Archive
{user_archive}

# Constraint
...
`;

// Task-specific additions
const DAILY_TASK_RULES = `
## Special Rules for Daily Task
- When user asks "今日宜练", recommend a gongfa
- Format: 推荐语 + 【功法名称】
- Example: "今天适合【散步30分钟】"
`;

// Build function
function buildDailyTaskPrompt(userData) {
  const userArchive = buildUserArchive(userData);
  
  return SYSTEM_PROMPT
    .replace('{user_archive}', userArchive)
    .replace('# Constraint', `${DAILY_TASK_RULES}\n\n# Constraint`);
}
```

## Problem 2: Context Too Long

Including all user data wastes tokens and confuses AI.

### Solution: Selective Context

```javascript
function buildContextForTask(taskType, userData) {
  switch(taskType) {
    case 'daily_task':
      return {
        gongfaList: userData.gongfas,  // Only gongfas
        recentPractice: userData.logs.slice(0, 3)  // Last 3 logs
      };
    case 'chat':
      return {
        profile: userData.profile,
        memory: userData.memory,
        recentLogs: userData.logs.slice(0, 5)
      };
  }
}
```

## Best Practices

1. **Template once**: Load template, replace once, use result
2. **Separate concerns**: Base template + task-specific rules
3. **Minimal context**: Only include relevant data
4. **Clear markers**: Use `{placeholder}` for replacement points
5. **No nested replaces**: Avoid processing same template multiple times

## Template Structure

```javascript
// Good structure
const PROMPT_TEMPLATES = {
  base: `...`,
  
  dailyTask: `...`,
  
  chat: `...`,
  
  build(type, data) {
    const template = this[type] || this.base;
    return template.replace(/\{(\w+)\}/g, (match, key) => data[key] || '');
  }
};
```