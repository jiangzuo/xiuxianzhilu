---
name: daily-task今日宜练
description: 今日宜练开发经验
---

# 今日宜练功能开发 - 技术经验总结

## 一、功能概述

今日宜练是"修行之路"小程序的一个AI推荐功能：
1. 用户点击"今日宜练"按钮
2. AI根据用户的功法列表推荐最适合今天修炼的功法
3. 用户可以点击"去修炼"或"换一个"
4. 修炼完成后获得2倍修为，AI会夸奖用户

---

## 二、核心修改文件

| 文件 | 作用 |
|------|------|
| `utils/prompt-template.js` | 管理所有提示词模板 |
| `services/daily-task.service.js` | 今日宜练核心业务逻辑 |
| `pages/chat/chat.js` | 聊天页面交互逻辑 |
| `pages/chat/chat.wxml` | 聊天页面UI |
| `pages/chat/chat.wxss` | 聊天页面样式 |
| `pages/practice/practice.js` | 修炼页面任务检测 |

---

## 三、关键技术经验

### 1. 流式输出内容过滤（分隔符截断法）

**问题**：AI返回的内容包含JSON数据，流式显示时会泄露给用户

**解决方案**：使用分隔符截断法
```javascript
// Prompt中使用特殊分隔符
// AI返回格式：
// 推荐语...
// ___TASK_DATA___
// {"id": "xxx", "name": "yyy"}

// 前端过滤显示
const filterForDisplay = (content) => {
  return content.split(/___TASK_DATA___|```json/)[0].trim();
};

// 流式回调中使用
onStream = (chunk) => {
  const displayText = filterForDisplay(chunk);
  updateUi(displayText);
};
```

**关键点**：
- 分隔符要足够特殊，避免自然语言中出现
- 前端和后端都要处理分隔符
- 流式显示只传分隔符之前的内容

---

### 2. 上下文构建（避免重复拼接）

**问题**：提示词拼接错误导致用户看到重复的档案信息

**原因分析**：
- JavaScript `replace()` 只替换第一个匹配项
- 多处拼接 SYSTEM_PROMPT 导致重复

**解决方案**：
```javascript
// 分离日常Prompt和任务Prompt
const SYSTEM_PROMPT = `...`; // 日常聊天
const DAILY_TASK_PROMPT = `...`; // 今日宜练任务

// 构建时分开处理
const systemMsg = MemoryService.buildSystemMessage(); // 包含完整档案
const taskPrompt = DAILY_TASK_PROMPT.replace(...);
const finalPrompt = systemMsg.content.replace('# Constraint', `${taskPrompt}\n\n# Constraint`);
```

---

### 3. Tabbar页面跳转传参

**问题**：修炼页是tabbar页面，`wx.navigateTo`不能跳转

**解决方案**：使用 globalData 中转
```javascript
// 跳转方
app.globalData.dailyTaskTarget = { gongfaId, gongfaName };
wx.reLaunch({ url: '/pages/practice/practice' });

// 接收方 onLoad
onLoad(options) {
  let targetId = options.gongfaId;
  if (!targetId && app.globalData.dailyTaskTarget) {
    targetId = app.globalData.dailyTaskTarget.gongfaId;
    app.globalData.dailyTaskTarget = null;
  }
}
```

---

### 4. 消息历史持久化

**问题**：退出页面后今日宜练的推荐记录丢失

**解决方案**：将推荐内容作为普通聊天消息保存
```javascript
// 保存用户消息
ChatService.saveMessage('user', '今日宜练');

// 保存AI回复（包含推荐语，不包含JSON）
ChatService.saveMessage('assistant', recommendText);
```

---

### 5. 微信小程序 dataset 命名规则

**问题**：WXML中 `data-gongfaId` 转为JS后变成 `e.currentTarget.dataset.gongfaid`

**注意**：WXML中的驼峰命名会自动转成小写
```xml
<!-- WXML -->
<view data-gongfaId="xxx" bindtap="onClick"></view>

<!-- JS -->
onClick(e) {
  const id = e.currentTarget.dataset.gongfaid; // 不是gongfaId！
}
```

---

## 四、数据结构

### 每日任务状态
```javascript
{
  gongfaId: 'xxx',
  gongfaName: '散步30分钟',
  recommendText: '推荐文本...',
  recommendedAt: 1234567890,
  completed: false
}
```

### 功法扩展字段
```javascript
{
  id: 'xxx',
  name: '散步30分钟',
  exp: 5,
  count: 10,                    // 累计修炼次数
  dailyTaskCompletedCount: 3    // 累计完成今日宜练次数
}
```

---

## 五、测试要点

1. ✅ 流式输出不显示JSON
2. ✅ 重新进入页面保留历史记录
3. ✅ 去修炼跳转正确
4. ✅ 今日宜练标签显示
5. ✅ 修为翻倍生效
6. ✅ 导入导出包含新字段
7. ✅ 上下文不重复

---

## 六、常见问题排查

| 问题 | 排查方向 |
|------|----------|
| JSON泄露 | 检查分隔符是否正确过滤 |
| 跳转失败 | 检查是否是tabbar页面 |
| 数据丢失 | 检查globalData和CacheManager |
| 提示词重复 | 检查SYSTEM_PROMPT拼接逻辑 |