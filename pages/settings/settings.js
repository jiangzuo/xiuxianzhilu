// pages/settings/js
import Dialog from '@vant/weapp/dialog/dialog';
const { GONGFA_LIBRARY } = require('../../utils/gongfa-data.js');

Page({
  data: {
    activeTab: 'body',
    gongfaLibrary: GONGFA_LIBRARY,
    userCultivations: {
      body: [], mind: [], skill: [], wealth: []
    },
    categoryMap: {
      body: '体修', mind: '心修', skill: '技修', wealth: '财修'
    },
    categoryIconMap: {
      body: 'gongfa-book-icon1.png',
      mind: 'gongfa-book-icon2.png',
      skill: 'gongfa-book-icon3.png',
      wealth: 'gongfa-book-icon4.png'
    },
    
    showPickerPopup: false,
    pickerColumns: {
      gongfaNames: [], durations: [], exps: []
    },
    pickerValue: [0, 0, 0],

    isEditMode: false,
    editingGongfaId: null,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/settings/settings');
    }
    this.loadUserCultivations();
  },

  loadUserCultivations() {
    let cultivations = wx.getStorageSync('userCultivations');
    if (!cultivations || typeof cultivations !== 'object') {
      cultivations = { body: [], mind: [], skill: [], wealth: [] };
    }
    cultivations.body = cultivations.body || [];
    cultivations.mind = cultivations.mind || [];
    cultivations.skill = cultivations.skill || [];
    cultivations.wealth = cultivations.wealth || [];
    const isEmpty = Object.values(cultivations).every(arr => arr.length === 0);
    if (isEmpty) {
        cultivations.body.push({ id: this.uuid(), name: '散步30分钟', exp: 5, count: 0 });
        wx.setStorageSync('userCultivations', cultivations);
    }
    this.setData({ userCultivations: cultivations });
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  // --- Picker 逻辑 ---
  openPicker(gongfaIndex = 0, optionIndex = 0) {
    this.updatePickerColumns(gongfaIndex, optionIndex);
    this.setData({ 
      showPickerPopup: true,
      pickerValue: [gongfaIndex, optionIndex, 0]
    });
  },

  closeGongfaPickerPopup() {
    this.setData({ showPickerPopup: false });
  },

  onAddNewGongfa() {
    this.setData({
      isEditMode: false,
      editingGongfaId: null,
    });
    this.openPicker();
  },

  onEditGongfa(event) {
    const { id } = event.currentTarget.dataset;
    const categoryKey = this.data.activeTab;
    const userGongfaList = this.data.userCultivations[categoryKey];
    const editingGongfa = userGongfaList.find(item => item.id === id);

    if (!editingGongfa) return;

    const { gongfaIndex, optionIndex } = this.findGongfaInLibrary(editingGongfa.name);
    
    if (gongfaIndex !== -1) {
      this.setData({
        isEditMode: true,
        editingGongfaId: id,
      });
      this.openPicker(gongfaIndex, optionIndex);
    } else {
      wx.showToast({ title: '功法已过时，请重新添加', icon: 'none' });
    }
  },

  findGongfaInLibrary(fullName) {
    const categoryKey = this.data.activeTab;
    const gongfaList = this.data.gongfaLibrary[categoryKey];
    
    for (let i = 0; i < gongfaList.length; i++) {
      const libGongfa = gongfaList[i];
      if (fullName.startsWith(libGongfa.name)) {
        if (libGongfa.options) {
          const duration = fullName.replace(libGongfa.name, '').trim();
          const j = libGongfa.options.findIndex(opt => opt.duration === duration);
          if (j !== -1) {
            return { gongfaIndex: i, optionIndex: j };
          }
        } else {
          return { gongfaIndex: i, optionIndex: 0 };
        }
      }
    }
    return { gongfaIndex: -1, optionIndex: -1 };
  },

  updatePickerColumns(gongfaIndex = 0, optionIndex = 0) {
    const categoryKey = this.data.activeTab;
    const gongfaList = this.data.gongfaLibrary[categoryKey];
    if (!gongfaList || gongfaList.length === 0) {
      this.setData({ 'pickerColumns.gongfaNames': ['该分类暂无功法'], 'pickerColumns.durations': ['-'], 'pickerColumns.exps': ['-'], });
      return;
    }
    gongfaIndex = Math.min(gongfaIndex, gongfaList.length - 1);
    const selectedGongfa = gongfaList[gongfaIndex];
    const gongfaNames = gongfaList.map(g => g.name);
    let durations = [];
    let exps = [];
    if (selectedGongfa.options) {
      optionIndex = Math.min(optionIndex, selectedGongfa.options.length - 1);
      durations = selectedGongfa.options.map(opt => opt.duration);
      exps = [`经验+${selectedGongfa.options[optionIndex].exp}`];
    } else {
      durations = [selectedGongfa.unit];
      exps = [`经验+${selectedGongfa.exp}`];
    }
    this.setData({ 'pickerColumns.gongfaNames': gongfaNames, 'pickerColumns.durations': durations, 'pickerColumns.exps': exps, });
  },

  onPickerChange(event) {
    const val = event.detail.value;
    const [gongfaIndex, optionIndex] = val;
    this.updatePickerColumns(gongfaIndex, optionIndex);
    this.setData({ pickerValue: val });
  },

  onPickerConfirm() {
    const [gongfaIndex, optionIndex] = this.data.pickerValue;
    const categoryKey = this.data.activeTab;
    const gongfaList = this.data.gongfaLibrary[categoryKey];
    if (!gongfaList || gongfaList.length === 0) {
      this.closeGongfaPickerPopup();
      return;
    }
    const selectedGongfa = gongfaList[gongfaIndex];

    let finalName = selectedGongfa.name;
    let exp = 0;

    if (selectedGongfa.options) {
      const safeOptionIndex = Math.min(optionIndex, selectedGongfa.options.length - 1);
      const selectedOption = selectedGongfa.options[safeOptionIndex];
      finalName = `${selectedGongfa.name} ${selectedOption.duration}`;
      exp = selectedOption.exp;
    } else {
      exp = selectedGongfa.exp;
    }

    if (this.data.isEditMode) {
      const list = this.data.userCultivations;
      const editingIndex = list[categoryKey].findIndex(item => item.id === this.data.editingGongfaId);
      if (editingIndex !== -1) {
        list[categoryKey][editingIndex].name = finalName;
        list[categoryKey][editingIndex].exp = exp;
        this.setData({ userCultivations: list });
        wx.setStorageSync('userCultivations', list);
        wx.showToast({ title: '修改成功' });
      }
    } else {
      const newCultivation = {
        id: this.uuid(), name: finalName, exp: exp, count: 0
      };
      this.addCultivationToUserList(newCultivation);
    }
    
    this.closeGongfaPickerPopup();
  },
  
  addCultivationToUserList(cultivation) {
    const category = this.data.activeTab;
    const list = this.data.userCultivations;
    const isExist = list[category].some(item => item.name === cultivation.name);
    if (isExist) {
      wx.showToast({ title: '此功法已存在', icon: 'none' });
      return;
    }
    list[category].push(cultivation);
    this.setData({ userCultivations: list });
    wx.setStorageSync('userCultivations', list);
    wx.showToast({ title: '编入成功', icon: 'success' });
  },

  onDeleteTap(event) {
    const { category, id } = event.currentTarget.dataset;
    
    Dialog.confirm({
      // 【核心】强制显示取消按钮，并继续使用外部类
      showCancelButton: true,
      title: '确认删除',
      message: '确定要废弃此功法吗？',
      confirmButtonClass: 'custom-confirm-button',
      cancelButtonClass: 'custom-cancel-button',
    }).then(() => {
      const list = this.data.userCultivations;
      const index = list[category].findIndex(item => item.id === id);
      if (index > -1) {
        list[category].splice(index, 1);
        this.setData({ userCultivations: list });
        wx.setStorageSync('userCultivations', list);
        wx.showToast({ title: '已废弃', icon: 'success' });
      }
    }).catch(() => {
      // 用户点击取消
    });
  },

  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
});