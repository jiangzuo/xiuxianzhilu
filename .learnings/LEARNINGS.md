# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge\_gap | best\_practice

***

## \[LRN-20260422-001] best\_practice

**Logged**: 2026-04-22T10:00:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary

心魔修炼功能开发经验总结

### Details

本次开发"心魔修炼"功能，总结以下关键经验：

1. **轮次统计逻辑**
   - 问题：历史对话轮次与当前会话轮次混淆，导致 AI 显示轮次不正确
   - 解决：每次 `start()` 重置 `_roundCount = 0`，后续消息累加
   - 关键：历史对话作为上下文，但不标注轮次编号
2. **归隐功法检测**
   - 问题：用户归隐（删除）心魔功法后，仍能选择该类型修炼
   - 解决：`practiceService.hasHeartDemonGongfa()` 中过滤 `status === 'archived'` 的功法
3. **URL 参数替代全局变量**
   - 问题：使用 `app.globalData` 在页面间传递参数不够优雅
   - 解决：改用 URL 参数 `?tab=mind`，在 `onLoad(options)` 中读取
4. **组件命名规范**
   - 问题：`cultivation-result` 命名与功能不符（实际是修炼结算）
   - 解决：重命名为 `practice-result`，保持语义清晰
5. **Service 层代码重构**
   - 将 `cultivation.service.js` 重命名为 `practice.service.js`
   - 新增独立的 `heart-demon.service.js` 处理心魔修炼逻辑
   - 实现上下文隔离：恐惧和后悔分开存储

### Suggested Action

在后续心魔修炼功能迭代中：

1. 轮次统计：每次会话从1开始，历史不计入
2. 功法状态检测：始终过滤 archived 状态
3. 页面跳转传参：优先使用 URL 参数
4. 组件命名：语义化命名，避免技术术语

### Metadata

- Source: development\_heart\_demon\_feature
- Related Files: services/heart-demon.service.js, services/practice.service.js, pages/chat/chat.js, components/practice-result/
- Tags: heart-demon, round-count, archived-check, url-params, refactor

***

## \[LRN-20260422-002] best\_practice

**Logged**: 2026-04-22T11:00:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary

AI 上下文拼接与用户档案替换经验

### Details

在 AI 对话功能开发中，总结以下上下文拼接经验：

1. **上下文分层设计**
   - System Prompt：系统级指令（不变）
   - 用户档案：用户基础信息（每次构建）
   - 历史对话：按时间/类型筛选
   - 当前消息：用户最新输入
2. **用户档案替换位置**
   - 在 `UserService.buildUserArchive()` 中统一构建
   - 使用固定占位符：`{hard_info_text}`, `{practice_stats}`, `{soft_info_text}`, `{rolling_summary}`
   - 在 prompt 模板中直接替换
3. **占位符替换原则**
   - 替换次数：只在系统消息构建时替换一次
   - 避免重复替换导致占位符被破坏
   - 使用正则全局替换：`str.replace(/\{key\}/g, value)`
4. **上下文隔离**
   - 心魔修炼：恐惧和后悔分开存储 (`demon_fear`, `demon_regret`)
   - 使用 `category` 字段区分消息类型
   - 获取上下文时按 category 过滤
5. **历史消息组装格式**
   - 心魔修炼：`用户：xxx\n系统：xxx` 格式
   - 当前轮次：`【当前】用户：xxx\n【当前轮次】：第N轮`
   - 历史对话与当前消息用 `\n\n` 分隔

### Suggested Action

在后续 AI 对话功能开发中：

1. 设计 prompt 时定义清晰的占位符
2. 用户档案统一在 Service 层构建
3. 替换只执行一次，避免重复替换
4. 不同类型对话使用 category 隔离
5. 历史消息格式化便于 AI 阅读

### Metadata

- Source: development\_ai\_chat\_context
- Related Files: services/user.service.js, services/chat.service.js, services/heart-demon.service.js, prompts/system.prompt.js, prompts/skills/heart-demon/heart-demon.js
- Tags: context, prompt, user-archive, replacement, category-filter

***

## \[LRN-20260421-001] knowledge\_gap

**Logged**: 2026-04-21T10:00:00Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary

修炼回顾模块开发经验总结

### Details

本次开发"修炼回顾"模块，总结以下关键经验：

1. **微信小程序 WXSS 本地图片限制**
   - 问题：WXSS 中不能直接使用本地资源图片作为背景
   - 解决：使用 `<image>` 标签 + 绝对路径（或相对于根目录的路径）
   - 正确：`src="/images/practice-review.png"`
   - 错误：`background-image: url('/images/xxx.png')`
2. **分包页面路径问题**
   - 问题：分包页面引用主包资源时路径问题
   - 解决：使用绝对路径（从根目录开始）
   - 参考启动页 splash 页面的实现
3. **全局字体覆盖问题**
   - 问题：app.wxss 设置了全局隶书字体 `text { font-family: 'LishuFont' }`
   - 解决：在页面 wxss 中使用 `!important` 显式覆盖
   - 示例：`text { font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; }`
4. **防重复触发机制**
   - 问题：onShow 生命周期触发频繁，AI 调用可能被重复触发
   - 解决：使用内存锁 + 存储时间戳双重检查
   - 代码：`isGenerating` 变量 + `lastWeeklyReviewWeekStart` storage
5. **Service 循环依赖**
   - 问题：practice.service.js 和 review\.service.js 互相 require 导致问题
   - 解决：review\.service.js 不需要引用 practice.service，只需独立实现

### Suggested Action

在后续微信小程序开发中：

1. 本地图片使用 `<image>` 标签而非 CSS background-image
2. 分包页面资源使用绝对路径
3. 需要覆盖全局样式时使用 `!important`
4. onShow 中调用外部服务时要考虑防重复
5. Service 层避免循环依赖

### Metadata

- Source: development\_practice\_review\_module
- Related Files: services/review\.service.js, pkg\_review/pages/review/review\.wxml, pkg\_review/pages/review/review\.wxss
- Tags: wechat, miniprogram, wxss, font, best-practice

***

## \[LRN-20260402-001] best\_practice

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
2. 根据任务类型 (daily\_task/chat) 选择性加载上下文
3. 使用 PROMPT\_TEMPLATES.build(type, data) 方法

### Metadata

- Source: skill\_analysis
- Related Files: .trae/skills/prompt-context-build/SKILL.md, utils/prompt-template.js
- Tags: prompt, context, best-practice, ai
- Pattern-Key: ai.prompt-template

***

## \[LRN-20260402-002] best\_practice

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

- Source: skill\_analysis
- Related Files: .trae/skills/ai-streaming-filter/SKILL.md, services/ai.service.js
- Tags: streaming, json, filter, ui
- Pattern-Key: ai.streaming-filter

***

## \[LRN-20260402-003] best\_practice

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

- Source: skill\_analysis
- Related Files: .trae/skills/wxapp-tabbar-nav/SKILL.md, pages/practice/practice.js
- Tags: wechat, miniprogram, navigation, tabbar
- Pattern-Key: wxapp.tabbar-navigation

***

