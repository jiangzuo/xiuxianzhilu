---
name: 微信小程序 tabbar 页面跳转wxapp-tabbar-nav
description: 处理微信小程序 tabbar 页面跳转及传参问题。当用户需要跳转到 tabbar 页面、向 tabbar 页面传递数据，或询问 wx.navigateTo 无法跳转 tabbar 时调用。
---

# Tabbar Page Navigation

## Problem

`wx.navigateTo` cannot navigate to tabbar pages. It only works for non-tabbar pages.

## Solution

Use `wx.reLaunch` or `wx.switchTab` combined with `globalData` to pass parameters.

### Method 1: Using globalData (Recommended)

```javascript
// Navigate from source page
const app = getApp();
app.globalData.dailyTaskTarget = { 
  gongfaId: 'xxx', 
  gongfaName: 'yyy' 
};

wx.reLaunch({ 
  url: '/pages/practice/practice' 
});
```

```javascript
// Receive in target page (practice.js)
const app = getApp();

Page({
  onLoad(options) {
    // Check if data passed via globalData
    if (app.globalData.dailyTaskTarget) {
      const { gongfaId, gongfaName } = app.globalData.dailyTaskTarget;
      // Use the data...
      
      // Clear after use
      app.globalData.dailyTaskTarget = null;
    }
  }
});
```

### Method 2: Using Storage

```javascript
// Source page
wx.setStorageSync('navigateData', { gongfaId: 'xxx' });
wx.switchTab({ url: '/pages/practice/practice' });

// Target page
onLoad() {
  const data = wx.getStorageSync('navigateData');
  wx.removeStorageSync('navigateData');
}
```

## Key Points

1. **Tabbar pages**: Use `wx.switchTab` or `wx.reLaunch`
2. **Non-tabbar pages**: Use `wx.navigateTo`
3. **Passing data**: Must use `globalData` or `Storage`, cannot use URL params
4. **Cleanup**: Always clear globalData after use to avoid stale data

## Common Mistakes

❌ Wrong:
```javascript
wx.navigateTo({ url: '/pages/practice/practice' }); // practice is tabbar page
```

✅ Correct:
```javascript
wx.reLaunch({ url: '/pages/practice/practice' });
```