---
name: frontend-skill
description: 构建结构清晰且风格克制的前端界面，并通过规范的信息层级与排版提升视觉效果。当用户需要开发新功能页面、优化现有界面、或需要前端开发最佳实践指导时调用。
---

# Frontend Development - 前端开发技能

## 核心目标

构建高质量的前端界面：
1. 结构清晰，易于维护
2. 风格一致，符合设计规范
3. 信息层级明确，用户体验好
4. 代码规范，可复用性高

## 使用场景

### 必须调用的场景
- 开发新功能页面
- 重构现有页面
- 需要前端最佳实践指导
- 代码质量需要提升
- 界面风格需要统一

### 不需要调用的场景
- 简单的样式调整
- 纯后端逻辑修改
- 配置文件修改

## 技术栈规范

### 微信小程序

```
技术栈：原生小程序 + Vant Weapp
文件结构：
- .wxml - 页面结构
- .wxss - 样式
- .js - 逻辑
- .json - 配置
```

### 代码组织原则

1. **单一职责** - 每个文件/组件只做一件事
2. **高内聚低耦合** - 相关逻辑放在一起
3. **可复用** - 通用逻辑抽离
4. **可读性** - 命名清晰，注释适度

## 开发流程

### 第一阶段：需求分析

1. **理解需求**
   - 功能目标
   - 用户场景
   - 边界情况

2. **技术方案**
   - 需要哪些组件
   - 数据结构设计
   - 状态管理方案

### 第二阶段：结构设计

1. **页面布局**
   ```
   ┌─────────────┐
   │   Header    │
   ├─────────────┤
   │   Content   │
   │             │
   ├─────────────┤
   │   Footer    │
   └─────────────┘
   ```

2. **组件拆分**
   ```
   Page
   ├── Header
   ├── ContentList
   │   ├── ContentItem
   │   └── ContentItem
   └── Footer
   ```

3. **数据流设计**
   ```javascript
   // 页面数据
   data: {
     list: [],
     loading: false,
     error: null
   }
   ```

### 第三阶段：代码实现

1. **编写顺序**
   - 数据结构定义
   - 页面框架
   - 组件实现
   - 样式调整
   - 交互逻辑

2. **代码规范**
   - 命名规范
   - 注释规范
   - 提交规范

## 代码规范

### 命名规范

```javascript
// 文件名：小写 + 短横线
// pages/user-profile/user-profile.js

// 变量名：小驼峰
const userInfo = {};

// 常量：大写下划线
const MAX_COUNT = 10;

// 函数名：小驼峰，动词开头
function getUserInfo() {}
function handleClick() {}

// 组件名：大驼峰
const UserProfile = {};
```

### 目录结构

```
project/
├── pages/              # 页面
│   ├── index/         # 首页
│   ├── profile/       # 个人页
│   └── settings/      # 设置页
├── components/         # 通用组件
│   ├── button/
│   ├── card/
│   └── list/
├── services/           # 业务逻辑
│   ├── user.service.js
│   └── api.service.js
├── utils/              # 工具函数
│   ├── formatter.js
│   └── validator.js
├── styles/             # 全局样式
│   ├── variables.wxss
│   └── mixins.wxss
└── images/             # 图片资源
```

### 注释规范

```javascript
/**
 * 获取用户信息
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 用户信息对象
 */
function getUserInfo(userId) {
  // 实现代码
}

// 坏注释：重复代码
const count = 10; // 定义 count 为 10

// 好注释：解释原因
// 这里设置为 10 是因为超过 10 会影响性能
const count = 10;
```

## 样式规范

### CSS 组织

```css
/* 1. 页面级样式 */
.page-wrapper {
  height: 100vh;
}

/* 2. 区域样式 */
.header { }
.content { }
.footer { }

/* 3. 组件样式 */
.card { }
.button { }
.list { }

/* 4. 状态样式 */
.loading { }
.error { }
.empty { }
```

### 响应式设计

```css
/* 使用 rpx 单位（微信小程序） */
.container {
  width: 750rpx;  /* 满屏 */
  padding: 32rpx; /* 标准间距 */
}

/* 媒体查询（Web） */
@media (max-width: 768px) {
  .container {
    padding: 16px;
  }
}
```

### 设计 Token

```css
/* 颜色 */
--color-primary: #EAE8DC;
--color-secondary: #3B8B9B;
--color-text: #3A3A3A;

/* 间距 */
--spacing-xs: 8rpx;
--spacing-sm: 16rpx;
--spacing-md: 24rpx;
--spacing-lg: 32rpx;

/* 字体 */
--font-size-sm: 12px;
--font-size-base: 14px;
--font-size-lg: 16px;
```

## 组件开发

### 组件设计原则

1. **单一职责** - 一个组件只做一件事
2. **可复用** - 设计时考虑复用场景
3. **可测试** - 逻辑清晰，易于测试
4. **文档化** - 使用说明完整

### 组件模板

```javascript
// components/card/card.js
Component({
  /**
   * 组件属性
   */
  properties: {
    title: {
      type: String,
      value: ''
    },
    list: {
      type: Array,
      value: []
    }
  },

  /**
   * 组件数据
   */
  data: {
    loading: false
  },

  /**
   * 组件方法
   */
  methods: {
    handleClick(e) {
      this.triggerEvent('itemclick', e.detail);
    }
  }
});
```

### 组件事件

```javascript
// 子组件触发父组件事件
this.triggerEvent('change', {
  value: newValue
});

// 父组件监听
// <card bind:change="handleChange" />
```

## 状态管理

### 页面状态

```javascript
Page({
  data: {
    // 列表数据
    list: [],
    
    // 加载状态
    loading: false,
    loadMore: false,
    
    // 错误状态
    error: null,
    
    // 空状态
    isEmpty: false
  },

  // 统一的状态更新方法
  setState(state) {
    this.setData(state);
  }
});
```

### 全局状态

```javascript
// app.js
App({
  globalData: {
    userInfo: null,
    token: '',
    settings: {}
  }
});

// 页面中使用
const app = getApp();
const userInfo = app.globalData.userInfo;
```

## 性能优化

### 1. 减少渲染

```javascript
// 坏：频繁 setData
this.setData({ count: this.data.count + 1 });
this.setData({ total: this.data.total + 1 });

// 好：批量更新
this.setData({
  count: this.data.count + 1,
  total: this.data.total + 1
});
```

### 2. 列表优化

```javascript
// 使用 wx:key 优化列表渲染
<view wx:for="{{list}}" wx:key="id">
  {{item.name}}
</view>
```

### 3. 图片优化

```xml
<!-- 使用懒加载 -->
<image src="{{url}}" lazy-load="true" />

<!-- 使用 WebP 格式 -->
<image src="{{url}}.webp" />
```

## 测试检查清单

### 功能测试
- [ ] 正常流程
- [ ] 边界情况
- [ ] 错误处理
- [ ] 空状态
- [ ] 加载状态

### 兼容性测试
- [ ] iOS
- [ ] Android
- [ ] 不同屏幕尺寸
- [ ] 深色模式（如支持）

### 性能测试
- [ ] 首屏加载时间
- [ ] 列表滚动流畅度
- [ ] 内存占用
- [ ] 网络请求优化

## 示例对话

**用户**: "帮我实现一个用户列表页面"

**你**: 
"好的，我来规划一下实现方案：

## 1. 页面结构
```
user-list/
├── user-list.wxml    # 页面结构
├── user-list.wxss    # 样式
├── user-list.js      # 逻辑
└── user-list.json    # 配置
```

## 2. 组件设计
- UserList - 列表容器
- UserCard - 用户卡片（可复用）
- LoadMore - 加载更多

## 3. 数据结构
```javascript
data: {
  userList: [],
  loading: false,
  hasMore: true,
  page: 1
}
```

## 4. 实现步骤
1. 搭建页面框架
2. 实现 UserCard 组件
3. 实现列表加载逻辑
4. 添加下拉刷新
5. 实现加载更多

我先实现基础版本，然后我们再优化细节，如何？"

## 注意事项

1. **不要过度设计** - 简单优先，按需扩展
2. **保持一致性** - 风格、命名、结构统一
3. **及时重构** - 发现坏味道立即修复
4. **文档同步** - 代码和文档一起更新
