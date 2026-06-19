// components/custom-dialog/custom-dialog.js
Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '提示'
    },
    message: {
      type: String,
      value: ''
    },
    confirmText: {
      type: String,
      value: '确认'
    },
    cancelText: {
      type: String,
      value: '取消'
    }
  },

  data: {},

  methods: {
    preventTouchMove() {},
    onCancel() {
      this.setData({ show: false });
      this.triggerEvent('cancel');
    },
    onConfirm() {
      this.setData({ show: false });
      this.triggerEvent('confirm');
    }
  }
})
