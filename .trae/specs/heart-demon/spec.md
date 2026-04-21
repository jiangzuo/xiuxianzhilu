# 心魔修炼功能 Spec

## Why

为用户提供心魔修炼能力，通过对话、角色模拟等方式修炼人性弱点（恐惧、后悔），提升心灵圆满度。心魔修炼采用独立上下文，与日常聊天隔离，但修炼记录可在日常聊天中按时间显示。

## What Changes

### 1. 新增 Skill 文档

* `prompts/skills/heart-demon/heart-demon.js` - 心魔修炼通用部分（已完成）
* `prompts/skills/heart-demon/fear.js` - 恐惧心魔知识（已完成）
* `prompts/skills/heart-demon/regret.js` - 后悔心魔知识（已完成）

### 2. 新增 Service 层

* `services/heart-demon.service.js` - 心魔修炼服务

### 3. 改造 ChatService

* 新增 `saveMessage()` - 支持 category 参数存储
* 新增 `getDemonContextForAI()` - 获取指定类型的心魔上下文
* 改造 `getContextForAI()` - 支持按时间混合所有上下文

### 4. 页面改造

* `pages/chat/chat.wxml` - 新增"心魔修炼"按钮，切换"完成修炼"
* `pages/chat/chat.js` - 心魔修炼模式逻辑
* `pages/chat/chat.wxss` - 心魔修炼按钮样式

### 5. 数据改造

* `utils/gongfa-data.js` - 新增心魔功法数据（恐惧、后悔）

## Impact

* Affected specs: 日常聊天、今日宜练、修炼页面
* Affected code: chat.service.js, ai.service.js, 聊天页面

## ADDED Requirements

### Requirement: 心魔修炼入口

系统应在聊天页面输入框上方提供"心魔修炼"按钮。

#### Scenario: 入口显示

* **WHEN** 用户在聊天页面
* **THEN** 在"今日宜练"按钮旁边显示"心魔修炼"按钮

### Requirement: 类型选择弹窗

用户点击"心魔修炼"后，应显示类型选择弹窗，支持恐惧和后悔两种。

#### Scenario: 选择恐惧

* **WHEN** 用户点击"心魔修炼"
* **THEN** 弹出类型选择弹窗，显示"恐惧"和"后悔"选项

#### Scenario: 未配置功法

* **WHEN** 用户未配置心魔功法
* **THEN** 提示用户去功法页面配置

### Requirement: 心魔修炼模式

选择类型后进入心魔修炼模式，按钮变为"完成修炼"。

#### Scenario: 发送初始消息

* **WHEN** 用户选择"恐惧"
* **THEN** 发送消息"心魔修炼-恐惧"，AI开始恐惧心魔修炼

### Requirement: 轮次统计

每次心魔修炼从第1轮开始统计，历史对话不计入当前轮次。

#### Scenario: 轮次从1开始

* **WHEN** 用户开始新的心魔修炼
* **THEN** 轮次从第1轮开始计数
* **AND** 历史对话作为上下文但不显示轮次编号

#### Scenario: 轮次累加

* **WHEN** 用户发送消息
* **THEN** 轮次依次递增（2、3、4...）

### Requirement: 完成修炼消息显示

用户点击"完成修炼"后，聊天中先显示用户消息"完成心魔修炼-类型"。

#### Scenario: 完成消息

* **WHEN** 用户点击"完成修炼"
* **THEN** 聊天中显示"完成心魔修炼-恐惧"或"完成心魔修炼-后悔"

### Requirement: 上下文隔离

心魔修炼采用独立上下文，不同类型之间隔离。

#### Scenario: 恐惧上下文

* **WHEN** 恐惧心魔修炼期间
* **THEN** AI只收到用户档案 + 恐惧修炼历史

#### Scenario: 后悔上下文

* **WHEN** 后悔心魔修炼期间
* **THEN** AI只收到用户档案 + 后悔修炼历史

#### Scenario: 上下文不污染

* **WHEN** 恐惧心魔修炼期间
* **THEN** AI不会看到后悔心魔的对话历史

### Requirement: 归隐功法检测

用户归隐（删除）心魔功法后，心魔修炼入口应引导用户重新配置。

#### Scenario: 归隐后引导

* **WHEN** 用户将心魔功法归隐
* **THEN** 点击心魔修炼时提示用户去配置功法

### Requirement: 日常聊天上下文

日常聊天发送给AI时，按时间混合显示所有上下文。

#### Scenario: 日常聊天

* **WHEN** 用户在日常聊天模式发送消息
* **THEN** AI收到：日常对话 + 今日宜练 + 心魔修炼历史（按时间）

### Requirement: 完成修炼

用户点击"完成修炼"后，AI生成总结，触发修为奖励。

#### Scenario: 完成修炼

* **WHEN** 用户点击"完成修炼"
* **THEN** 发送"完成心魔修炼-类型"，AI生成总结，保存到该类型历史

#### Scenario: 修为奖励

* **WHEN** 修炼完成
* **THEN** 复用修炼页面弹窗逻辑，显示修为提升

### Requirement: 模式切换

修炼完成后恢复日常聊天模式。

#### Scenario: 恢复日常

* **WHEN** 修炼完成弹窗关闭
* **THEN** 按钮恢复为"心魔修炼"，进入日常聊天模式

### Requirement: 修炼类型标记

聊天记录中保留心魔修炼类型的标记能力。

#### Scenario: 消息存储

* **WHEN** 保存心魔修炼消息
* **THEN** 存储时包含 `category: 'demon_fear' | 'demon_regret'`

## MODIFIED Requirements

### Requirement: ChatService 消息保存

修改 `ChatService.saveMessage()` 支持分类存储。

#### Scenario: 保存消息

* **WHEN** 保存消息时传入 category
* **THEN** 消息按 category 分类存储

### Requirement: ChatService 上下文获取

改造 `ChatService.getContextForAI()` 支持混合上下文。

#### Scenario: 获取日常上下文

* **WHEN** 获取日常聊天上下文
* **THEN** 按时间返回所有类型的消息

## Technical Design

### UI 设计

#### 1. 心魔修炼入口按钮

位置：聊天页面输入框上方，与"今日宜练"按钮并列

* 文字："心魔修炼"
* 样式：与"今日宜练"一致

#### 2. 类型选择弹窗

* 标题："选择你要修炼的心魔"
* 选项：
  * 恐惧（棕色背景 `#bf8171`，圆角6px）
  * 后悔（蓝灰色背景 `#505c7b`，圆角6px）
* 按钮：
  * 取消（左侧，灰色调）
  * 开始（右侧，蓝色调）

#### 3. 未配置功法弹窗

* 标题："选择你要修炼的心魔"
* 提示文字："你还没有设置心魔修炼功法，请前往心修功法阁添加"
* 按钮：
  * 取消（左侧）
  * 去配置（右侧）

#### 4. 完成修炼按钮

位置：输入框上方，"今日宜练"旁边

* 文字："完成修炼"
* 样式：与"心魔修炼"一致，区分颜色

### 数据结构

```javascript
// 消息结构
{
  id: 'msg_xxx',
  role: 'user' | 'assistant',
  content: '...',
  category: 'normal' | 'demon_fear' | 'demon_regret',
  timestamp: 1234567890
}

// HeartDemonService 状态
{
  _currentType: 'fear' | 'regret' | null,
  _roundCount: number,       // 当前轮次（每次从1开始）
  _currentGongfaId: string    // 当前修炼的功法ID
}
```

### 上下文组装

```javascript
// 日常聊天
messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: 历史消息(按时间) }
]

// 心魔修炼
messages = [
  { role: 'system', content: systemPrompt + demonPrompt },
  { role: 'user', content: 【历史对话】\n用户：xxx\n系统：xxx\n\n【当前】用户：xxx\n【当前轮次】：第N轮 }
]
```

### 轮次统计规则

1. 每次 `start()` 调用时，`_roundCount` 重置为 0
2. 每次 `sendMessage()` 或 `complete()` 时，先 `_roundCount += 1`
3. 历史对话作为上下文，但不标注轮次编号
4. 当前轮次通过 `【当前轮次】：第N轮` 告知 AI
