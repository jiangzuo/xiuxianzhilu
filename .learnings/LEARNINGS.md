# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20250402-001] best_practice

**Logged**: 2026-04-02T08:20:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
prompt-context-build skill: 解决 AI Prompt 上下文重复和过长问题

### Details
分析项目中的 skill 后发现，prompt 构建常见问题：
1. **重复替换**：同一模板被多次 replace，导致占位符被错误替换
2. **上下文过长**：包含所有用户数据浪费 token

解决方案：
- 模板只替换一次，结果复用
- 分离 concerns：基础模板 + 任务特定规则
- 按任务类型选择性加载上下文
- 使用 `{placeholder}` 统一占位符格式

### Suggested Action
在新的 AI 对话功能开发中，遵循以下原则：
1. 设计模板结构时考虑单次替换
2. 根据任务类型 (daily_task/chat) 选择性加载上下文
3. 使用 PROMPT_TEMPLATES.build(type, data) 方法

### Metadata
- Source: skill_analysis
- Related Files: .trae/skills/prompt-context-build/SKILL.md, utils/prompt-template.js
- Tags: prompt, context, best-practice, ai
- Pattern-Key: ai.prompt-template

---

## [LRN-20250402-002] best_practice

**Logged**: 2026-04-02T08:25:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
ai-streaming-filter skill: 解决 AI 流式输出中 JSON 数据泄露问题

### Details
AI 在流式输出时，返回内容可能同时包含显示文本和结构化数据 (JSON)，导致用户看到原始 JSON。

解决方案：
1. **使用分隔符**：在 prompt 中定义 `___TASK_DATA___` 分隔符
2. **过滤显示内容**：流式更新 UI 时，只显示分隔符之前的文本
3. **提取 JSON 数据**：对话结束后，从完整内容中提取 JSON
4. **保存纯净文本**：只将过滤后的文本保存到消息历史

### Suggested Action
在 AI 流式输出功能中实现：
1. 在 prompt 中添加 `___TASK_DATA___` 分隔符
2. 实现 `filterForDisplay()` 和 `extractJsonData()` 函数
3. 流式回调和完成回调都要过滤
4. 只保存过滤后的文本到聊天记录

### Metadata
- Source: skill_analysis
- Related Files: .trae/skills/ai-streaming-filter/SKILL.md, services/ai.service.js
- Tags: streaming, json, filter, ui
- Pattern-Key: ai.streaming-filter

---

## [LRN-20250402-003] best_practice

**Logged**: 2026-04-02T08:30:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
wxapp-tabbar-nav skill: 微信小程序 tabbar 页面跳转及传参问题

### Details
微信小程序中，`wx.navigateTo` 无法跳转到 tabbar 页面，必须使用 `wx.reLaunch` 或 `wx.switchTab`。

解决方案：
1. **跳转方法选择**：
   - tabbar 页面：使用 `wx.reLaunch` 或 `wx.switchTab`
   - 非 tabbar 页面：使用 `wx.navigateTo`
2. **传参方式**：
   - 不能使用 URL 参数（tabbar 页面不支持）
   - 必须使用 `globalData` 或 `wx.setStorageSync`
3. **清理数据**：使用后清空 globalData，避免残留数据

### Suggested Action
在微信小程序开发中：
1. 跳转到 tabbar 页面时使用 `wx.reLaunch` 而非 `wx.navigateTo`
2. 通过 `app.globalData` 传递参数
3. 在目标页面 `onLoad` 中读取并清空数据
4. 替代方案：使用 Storage 传递数据

### Metadata
- Source: skill_analysis
- Related Files: .trae/skills/wxapp-tabbar-nav/SKILL.md, pages/practice/practice.js
- Tags: wechat, miniprogram, navigation, tabbar
- Pattern-Key: wxapp.tabbar-navigation

---
