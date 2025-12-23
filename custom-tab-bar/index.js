// custom-tab-bar/index.js
Component({
  data: {
    selected: 0, // 使用索引来管理选中状态
    color: "#969799",
    selectedColor: "#4a90e2",
    list: [
      {
        "pagePath": "/pages/profile/profile",
        "text": "我" // “我”现在是第一个
      },
      {
        "pagePath": "/pages/practice/practice",
        "text": "修炼" // “修炼”现在是第二个
      },
      {
        "pagePath": "/pages/settings/settings",
        "text": "功法" // “设置”改名为“功法”
      }
    ]
  },

  methods: {
    // 切换 Tab
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    },

    // 【核心新增】由页面调用，用于更新选中状态
    updateSelected(pagePath) {
      const index = this.data.list.findIndex(item => item.pagePath === pagePath);
      if (index !== -1) {
        this.setData({
          selected: index
        });
      }
    }
  }
})