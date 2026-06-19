Component({
  options: {
    addGlobalClass: true
  },
  data: {
    defaultDescription: '你的修为有了新的精进，对大道的理解更深了一层。',
    animationData: {}
  },
  properties: {
    show: { type: Boolean, value: false },
    oldLevel: { type: Object, value: {} },
    newLevel: { type: Object, value: {} }
  },
  observers: {
    'show': function(show) {
      if (show) {
        wx.nextTick(() => {
          this.animateIn();
        });
      }
    }
  },
  methods: {
    animateIn() {
      const animation = wx.createAnimation({
        duration: 400,
        timingFunction: 'ease'
      });
      animation.scale(1).opacity(1).step();
      this.setData({ animationData: animation.export() });
    },
    onClose() {
      const animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease'
      });
      animation.scale(0.5).opacity(0).step();
      this.setData({ animationData: animation.export() });
      
      setTimeout(() => {
        this.triggerEvent('close');
      }, 300);
    }
  }
});
