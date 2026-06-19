Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    show: { type: Boolean, value: false },
    exp: { type: Number, value: 0 },
    categoryName: { type: String, value: '' },
    attrChanges: { type: Array, value: [] }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    }
  }
});
