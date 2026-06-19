# 修炼回顾功能 Spec

## Why

为用户提供修炼历程回顾能力，展示历史修炼记录和 AI 周期性总结，帮助用户获得成就感和修炼动力。

## What Changes

### 1. 新增 Service 层

- `services/review.service.js` - 修炼回顾核心服务
  - 获取修炼记录列表（支持分页，初始50条，触底加载更多）
  - 存储突破记录
  - AI 回顾生成（加锁防重复触发）
  - 数据清理（保留2000条）

### 2. 新增提示词

- `prompts/skills/review.prompt.js` - AI 修炼回顾提示词（放在 skills 文件夹）

### 3. 新增页面（分包）

- `pkg_review/pages/review/review.js` - 修炼回顾页面逻辑
- `pkg_review/pages/review/review.wxml` - 页面结构
- `pkg_review/pages/review/review.wxss` - 页面样式
- `pkg_review/pages/review/review.json` - 页面配置

### 4. 修改现有文件

- `pages/profile/profile.js` - 添加"修炼回顾"入口跳转 + AI 回顾触发
- `services/practice.service.js` - 境界突破时写入突破记录，日志限制改为2000条
- `app.json` - 添加 pkg_review 分包配置

## Impact

- Affected specs: 修炼页面、我的洞府（profile）
- Affected code: practice.service.js, profile 页面

## ADDED Requirements

### Requirement: 修炼回顾入口

用户点击"修炼回顾"入口后，应跳转到修炼回顾页面。

#### Scenario: 进入修炼回顾

- **WHEN** 用户点击"修炼回顾"入口
- **THEN** 跳转到修炼回顾页面（分包路径：/pkg_review/pages/review/review）

### Requirement: 修炼记录展示

修炼回顾页面应展示用户所有历史修炼记录、突破记录和 AI 回顾记录。

#### Scenario: 显示修炼记录

- **WHEN** 页面加载且有记录
- **THEN** 按时间倒序显示所有记录（统一排序）
- **AND** 修炼记录格式：`XX年XX月XX日，你完成了一次【功法名称】的修炼`
- **AND** 突破记录格式：`XX年XX月XX日，你的境界突破至【境界名称】`
- **AND** AI 回顾格式：`小周天回顾：XXX`

#### Scenario: 记录样式区分

- **WHEN** 显示修炼记录
- **THEN** 修炼记录显示为深褐色文字 `#5c5241`
- **AND** 突破记录显示为橙色文字 `#d86c32`（遵循设计稿）
- **AND** AI 回顾显示为靛青色文字 `#5a7d9a`（古风审美）

#### Scenario: 数据限制

- **WHEN** 记录条数超过2000条
- **THEN** 自动删除最早的记录

### Requirement: 空状态展示

当没有修炼记录时，应显示空状态提示。

#### Scenario: 无记录空状态

- **WHEN** 用户没有修炼记录
- **THEN** 显示文字："尚无修炼记录，灵气稀薄..."

### Requirement: AI 自动回顾

每周一用户首次进入"我的洞府"页面时，自动生成 AI 修炼回顾，并作为一条特殊记录插入到日志中。

**⚠️ 防重复机制**：由于 onShow 触发频繁，Service 内部必须加锁：
- 内存锁 `isGenerating` 防止重复调用
- 存储时间戳 `lastWeeklyReviewWeekStart` 防止同一周重复生成

**⚠️ 前置检查**：本周必须有修炼记录才发送 AI 请求

#### Scenario: 触发条件

- **WHEN** 用户本周（周一0点至周日23:59:59）首次进入我的洞府（profile）页面
- **AND** 本周有修炼记录
- **AND** 系统调用 AI 生成回顾
- **AND** 回顾内容作为一条记录插入到日志（type: 'ai_review'）
- **AND** 显示时和其他记录统一按时间排序

#### Scenario: 本周无修炼时不发送 AI

- **WHEN** 本周没有修炼记录
- **AND** 触发 AI 回顾检查
- **THEN** 跳过 AI 调用，不生成回顾

#### Scenario: AI 回顾内容格式

- **WHEN** AI 回顾生成成功
- **THEN** 显示格式：`小周天回顾：XXX`
- **AND** 内容包含本周修炼统计（总修为、各功法明细）
- **AND** 内容为鼓励性文字，200字以内

#### Scenario: 已有回顾不重复生成

- **WHEN** 本周已生成过 AI 回顾
- **AND** 用户再次进入我的洞府
- **AND** 防重复锁机制生效
- **THEN** 不重复调用 AI，直接显示已缓存的回顾内容

### Requirement: 突破记录存储

当用户境界突破时，应自动记录突破事件。

#### Scenario: 记录突破

- **WHEN** 用户修炼后境界升级
- **AND** 调用 `ReviewService.addLevelUpRecord()`
- **THEN** 写入突破记录到日志（type: 'levelup'）
- **AND** 记录包含：时间、旧境界名称、新境界名称

## MODIFIED Requirements

### Requirement: 修炼日志扩展

扩展 `practice.service.js` 的日志功能，支持突破记录。

#### Scenario: 添加突破记录

- **WHEN** 调用 doPractice 后检测到境界升级
- **AND** 调用 ReviewService.addLevelUpRecord() 写入日志

#### Scenario: 日志限制修改

- **WHEN** 写入修炼日志时
- **AND** 超过 2000 条
- **THEN** 自动删除最早的记录（与修炼回顾模块一致）

### Requirement: profile 页面入口

修改 profile 页面，添加入口跳转到修炼回顾。

#### Scenario: 点击跳转

- **WHEN** 用户点击"修炼回顾"入口
- **AND** 调用 wx.navigateTo 跳转到 /pkg_review/pages/review/review

#### Scenario: AI 回顾自动触发

- **WHEN** 用户进入我的洞府（profile）页面
- **AND** onShow 生命周期触发
- **AND** 调用 ReviewService.checkAndGenerateWeeklyReview()

## Technical Design

### 页面结构（分包）

```
pkg_review/pages/review/
├── review.js      // 页面逻辑
├── review.wxml    // 页面结构
├── review.wxss    // 页面样式
└── review.json    // 页面配置
```

### 数据结构

```javascript
// 修炼日志（统一存储在 practice_logs）
// type: 'practice' | 'levelup' | 'ai_review'

// 修炼记录
{
  timestamp: 1744567890000,
  type: 'practice',
  action: '散步 30 分钟',
  category: 'body',
  exp: 5
}

// 突破记录
{
  timestamp: 1744567890000,
  type: 'levelup',
  oldLevelName: '练气后期',
  newLevelName: '筑基初期'
}

// AI 回顾记录（作为日志存储）
{
  timestamp: 1744567890000,
  type: 'ai_review',
  content: '小周天回顾：本周你完成了 20 次修炼...',
  weekStart: '2026-04-07',
  stats: {
    totalExp: 120,
    practiceCount: 20,
    gongfaDetails: [
      { name: '散步 30 分钟', count: 10, exp: 50 }
    ]
  }
}
```

### AI 回顾提示词

```javascript
// prompts/skills/review.prompt.js
const REVIEW_PROMPT = `
你需要根据用户最新一周的修炼和基本信息，对这一周的修行进行回顾和总结。

如果用户修炼勤奋，给予鼓励和肯定；
如果修炼过少或者失衡，给予建议和激励；
总体要比较积极，目标是给用户成就感，激励用户修炼。

字数控制在 200 字以内。

以下是用户最近一周的修行数据：
1、累计获得修为：{totalExp} 点
2、各功法获得修为明细：
{practiceDetails}

请生成一段鼓励性的修炼回顾。
`;
```

### 核心方法

```javascript
// services/review.service.js

// 防重复锁（内存锁）
let isGenerating = false;

const ReviewService = {
  // 获取所有记录（修炼+突破+AI回顾），统一按时间倒序
  // 支持分页：initial=50, loadMore=每次加载更多
  getAllRecords(page = 1, pageSize = 50),

  // 获取记录总数
  getTotalCount(),

  // 是否有更多数据
  hasMoreData(page, pageSize),

  // 写入突破记录
  addLevelUpRecord(oldLevelName, newLevelName),

  // 检查并生成 AI 回顾（本周首次进入时）
  // 内部有防重复锁机制 + 本周无修炼则跳过
  checkAndGenerateWeeklyReview(onComplete),

  // 获取本周修炼数据（用于 AI 提示词）
  getWeekPracticeData(),

  // 构建 AI 回顾内容（场景提示词）
  buildReviewContent(weekData),

  // 保存 AI 回顾到日志
  saveAIReview(content, weekStart, stats),

  // 获取本周一日期字符串
  getWeekStart(timestamp),

  // 清理超量数据
  cleanOldRecords()
};
```

### 路由配置

```json
// app.json 分包配置
{
  "pages": [
    "pages/splash/splash",
    "pages/profile/profile",
    "pages/practice/practice",
    "pages/settings/settings",
    "pages/chat/chat"
  ],
  "subpackages": [
    {
      "root": "pkg_journal",
      "pages": [
        "pages/list/list",
        "pages/edit/edit"
      ]
    },
    {
      "root": "pkg_assets",
      "name": "assets",
      "pages": []
    },
    {
      "root": "pkg_review",
      "pages": [
        "pages/review/review"
      ]
    }
  ]
}
```

### UI 设计要点

1. **页面标题**：修炼回顾
2. **背景图**：使用 `<image/>` 标签 + 绝对路径 `/images/practice-review.png`（微信小程序 WXSS 不能直接使用本地图片）
3. **导航栏**：自定义导航栏（navigationStyle: custom）
4. **返回按钮**：使用 van-icon 组件 `arrow-left`，与其他页面保持一致
5. **滚动区域**：scroll-view，支持上下滑动查看历史记录
6. **字体**：使用默认字体（在 wxss 中显式设置，覆盖全局隶书设置）
7. **分页加载**：初始 50 条，触底加载更多

### AI 触发逻辑

```javascript
// pages/profile/profile.js

// 引入服务
const ReviewService = require('../../services/review.service');

// onShow 中调用
onShow() {
  // 刷新数据
  this.refreshData();
  this.updateDailyQuote();
  this.startSpiritMessageLoop();
  
  // 检查并生成每周 AI 回顾（带防重复锁 + 本周无修炼则跳过）
  ReviewService.checkAndGenerateWeeklyReview();
}
```

### AI 提示词拼接逻辑

```javascript
// services/review.service.js

// 构建消息：系统提示词 + 场景提示词
// 先用用户档案数据替换 SYSTEM_PROMPT 中的占位符
const userArchive = UserService.buildUserArchive();
let systemContent = SYSTEM_PROMPT
  .replace('{hard_info_text}', userArchive.hard_info_text || '暂无')
  .replace('{recent_activity_log}', userArchive.recent_activity_log || '暂无')
  .replace('{practice_stats}', userArchive.practice_stats || '暂无')
  .replace('{soft_info_text}', userArchive.soft_info_text || '暂无')
  .replace('{rolling_summary}', userArchive.rolling_summary || '暂无');

const messages = [
  { role: 'system', content: systemContent },
  { role: 'user', content: reviewContent }
];
```

### 防重复锁机制

```javascript
// review.service.js 内部实现
let isGenerating = false;

checkAndGenerateWeeklyReview(onComplete) {
  // 1. 检查内存锁
  if (isGenerating) return;
  
  // 2. 检查本周是否已生成
  const currentWeekStart = this.getWeekStart(Date.now());
  const lastWeekStart = wx.getStorageSync('lastWeeklyReviewWeekStart');
  if (currentWeekStart === lastWeekStart) return;
  
  // 3. 检查本周是否有修炼记录
  const weekData = this.getWeekPracticeData();
  if (weekData.practiceCount === 0) return;
  
  // 4. 加锁并调用 AI
  isGenerating = true;
  AIService.sendMessageStream(..., () => {
    isGenerating = false;
    wx.setStorageSync('lastWeeklyReviewWeekStart', currentWeekStart);
  });
}
```

## 验收标准

- [x] 用户可以从 profile 页面进入修炼回顾页面
- [x] 修炼记录按时间倒序显示
- [x] 突破记录以特殊样式显示（橙色 #d86c32）
- [x] AI 回顾以特殊样式显示（靛青色 #5a7d9a）
- [x] 修炼记录以深褐色显示（#5c5241）
- [x] AI 回顾和其他记录统一按时间排序
- [x] 超过2000条记录时自动清理最早的
- [x] 没有记录时显示空状态提示
- [x] 每周一首次进入 profile 时自动生成 AI 回顾
- [x] 已生成的 AI 回顾本周不重复生成（防重复锁机制生效）
- [x] 本周无修炼记录时不发送 AI 请求
- [x] AI 提示词包含用户档案数据
- [x] 列表采用分页加载（初始50条，触底加载更多）
- [x] 背景图正常显示
- [x] 返回按钮使用 van-icon 组件
- [x] 使用默认字体
- [ ] 性能良好，无明显卡顿（需真机测试）
