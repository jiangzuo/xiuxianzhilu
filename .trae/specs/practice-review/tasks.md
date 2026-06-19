# Tasks - 修炼回顾模块开发

## 开发任务列表

### 阶段一：Service 层和提示词开发

- [x] Task 1.1: 创建 services/review.service.js 修炼回顾服务
  - 实现 getAllRecords(page, pageSize) 获取记录（分页，初始50条）
  - 实现 addLevelUpRecord() 写入突破记录
  - 实现 checkAndGenerateWeeklyReview() 检查并生成 AI 回顾
    - 添加防重复锁机制（isGenerating + lastWeeklyReviewWeekStart）
    - 添加本周无修炼记录则跳过
    - 生成后写入日志（type: 'ai_review'）
  - 实现 cleanOldRecords() 清理超量数据（保留2000条）
  - 实现 getWeekPracticeData() 获取本周修炼数据
  - 实现 buildReviewContent() 构建场景提示词

- [x] Task 1.2: 创建 prompts/skills/review.prompt.js AI 回顾提示词
  - 编写 AI 修炼回顾提示词模板

### 阶段二：页面开发（分包）

- [x] Task 2.1: 创建 pkg_review/pages/review/review.json 页面配置
  - 添加 van-icon 组件引用

- [x] Task 2.2: 创建 pkg_review/pages/review/review.wxml 页面结构
  - 导航栏（标题 + 返回按钮使用 van-icon）
  - 滚动内容区（scroll-view）
  - 记录列表（wx:for 渲染，根据 type 区分样式）
  - 空状态提示
  - 触底加载更多

- [x] Task 2.3: 创建 pkg_review/pages/review/review.wxss 页面样式
  - 导航栏样式
  - 记录列表样式
  - 各类记录颜色：
    - 修炼记录：#5c5241（深褐色）
    - 突破记录：#d86c32（橙色）
    - AI 回顾：#5a7d9a（靛青色）
  - 空状态样式
  - 加载更多样式
  - 背景图（使用 image 标签 + 绝对路径）
  - 显式默认字体覆盖全局隶书设置

- [x] Task 2.4: 创建 pkg_review/pages/review/review.js 页面逻辑
  - onLoad 加载初始数据（第一页50条）
  - onReachBottom 触底加载更多
  - loadData() 分页加载数据
  - goBack() 返回按钮处理
  - formatDate() 日期格式化

### 阶段三：现有代码改造

- [x] Task 3.1: 修改 services/practice.service.js 添加突破记录写入
  - 引入 ReviewService
  - 在 doPractice 检测到 isLevelUp 时调用 addLevelUpRecord
  - 修复日志限制为 2000 条（原为 50 条）
  - 添加 type: 'practice' 和 category 字段

- [x] Task 3.2: 修改 pages/profile/profile.js 添加入口和 AI 回顾触发
  - 引入 ReviewService
  - navigateToReview 跳转到修炼回顾页面（分包路径）
  - onShow 中调用 ReviewService.checkAndGenerateWeeklyReview()

- [x] Task 3.3: 修改 app.json 添加分包配置
  - 添加 pkg_review 分包

### 阶段四：测试验证

- [x] Task 4.1: 代码实现完成
  - 所有核心功能已实现
  - 待真机测试验证

## 任务依赖关系

- Task 1.1 依赖于 Task 1.2（提示词）
- Task 2.1、2.2、2.3、2.4 可并行开发
- Task 2.x 依赖于 Task 1.1
- Task 3.x 依赖于 Task 1.1
- Task 4.1 依赖于 Task 2.x 和 Task 3.x
