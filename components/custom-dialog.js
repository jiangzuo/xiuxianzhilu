// components/custom-dialog/custom-dialog.js
Component({
  properties: {
    show: { // 控制弹窗显示/隐藏
      type: Boolean,
      value: false
    },
    title: { // 弹窗标题
      type: String,
      value: '提示'
    },
    message: { // 弹窗消息
      type: String,
      value: ''
    },
    confirmText: { // 确认按钮文字
      type: String,
      value: '确认'
    },
    cancelText: { // 取消按钮文字
      type: String,
      value: '取消'
    }
  },

  data: {
    // 内部数据
  },

  methods: {
    // 阻止蒙层滚动穿透
    preventTouchMove() {
      // do nothing
    },

    // 点击取消按钮
    onCancel() {
      this.setData({ show: false });
      // 触发 cancel 事件，通知父页面
      this.triggerEvent('cancel');
    },

    // 点击确认按钮
    onConfirm() {
      this.setData({ show: false });
      // 触发 confirm 事件，通知父页面
      this.triggerEvent('confirm');
    }
  }
})