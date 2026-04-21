# Tasks

## 1. 数据层改造
- [x] 1.1 改造 ChatService.saveMessage() 支持 category 参数
- [x] 1.2 新增 ChatService.getDemonContextForAI() 获取心魔上下文
- [x] 1.3 改造 ChatService.getContextForAI() 支持混合上下文

## 2. Service 层
- [x] 2.1 创建 services/heart-demon.service.js
  - [x] 2.1.1 定义心魔修炼方法：start, sendMessage, complete
  - [x] 2.1.2 上下文拼接逻辑
  - [x] 2.1.3 修炼完成调用修炼奖励
  - [x] 2.1.4 轮次统计逻辑（每次从1开始）
  - [x] 2.1.5 归隐功法检测（过滤 archived 状态）

## 3. 页面层
- [x] 3.1 chat.wxml - 新增心魔修炼按钮和完成按钮
- [x] 3.2 chat.wxss - 心魔修炼按钮样式
- [x] 3.3 chat.js - 心魔修炼模式逻辑
  - [x] 3.3.1 状态管理：isDemonMode, selectedDemonType
  - [x] 3.3.2 弹窗选择类型
  - [x] 3.3.3 发送消息逻辑区分
  - [x] 3.3.4 完成修炼逻辑（含用户消息显示）

## 4. 数据准备
- [x] 4.1 心魔功法数据（恐惧、后悔）

## 5. 已实现功能
- [x] 5.1 轮次统计：每次从第1轮开始
- [x] 5.2 完成修炼显示用户消息
- [x] 5.3 归隐功法检测

# Task Dependencies
- [1.1] 是 [1.2] 的前置
- [1.1] 是 [1.3] 的前置
- [2.1] 依赖 [1.1], [1.2], [1.3]
- [3.1, 3.2, 3.3] 依赖 [2.1]
- [3.3] 依赖 [4.1]
