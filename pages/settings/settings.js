// pages/settings/settings.js (最终大头部固定版)
const { GONGFA_LIBRARY } = require('../../utils/gongfa-data.js');
const app = getApp();

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    showDeleteDialog: false,
    tempDeleteData: null,
    activeTab: 'body',
    gongfaLibrary: GONGFA_LIBRARY,
    userCultivations: { body: [], mind: [], skill: [], wealth: [] },
    categoryMap: { body: '体修', mind: '心修', skill: '技修', wealth: '财修' },
    categoryIconMap: { 
      body: 'gongfa-book-icon1.png',
      mind: 'gongfa-book-icon2.png',
      skill: 'gongfa-book-icon3.png',
      wealth: 'gongfa-book-icon4.png'
    },
    showPickerPopup: false,
    pickerColumns: { gongfaNames: [], durations: [], exps: [] },
    pickerValue: [0, 0, 0],
    isEditMode: false,
    editingGongfaId: null,
  },

  onLoad(options) {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    const applyFont = () => { this.setData({ pageClass: 'font-lishu' }); };
    if (app.globalData.fontLoaded) { applyFont(); }
    else { app.fontReadyCallback = app.fontReadyCallback ? app.fontReadyCallback + app.fontReadyCallback : applyFont; }
  },


  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateSelected('/pages/settings/settings');
    }
    this.loadUserCultivations();
  },

  onDeleteTap(event) {
    const { category, id } = event.currentTarget.dataset;
    this.setData({
      showDeleteDialog: true,
      tempDeleteData: { category, id }
    });
  },

  onDeleteConfirm() {
    const { category, id } = this.data.tempDeleteData;
    const list = this.data.userCultivations;
    const index = list[category].findIndex(item => item.id === id);
    if (index > -1) {
      // 不再物理删除，而是增加一个“归隐”状态
      list[category][index].status = 'archived';
      this.setData({ 
        userCultivations: list,
        showDeleteDialog: false 
      });
      wx.setStorageSync('userCultivations', list);
      wx.showToast({ title: '已归隐', icon: 'success' });
    }
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
        cultivations.body.push({ id: this.uuid(), name: '散步30分钟', exp: 5, count: 0, totalExpEarned: 0 });
        wx.setStorageSync('userCultivations', cultivations);
    }
    this.setData({ userCultivations: cultivations });
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

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

    // 根据用户的选择，组合出最终的功法名称和经验值
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

    // 判断是“编辑模式”还是“新增模式”
    if (this.data.isEditMode) {
      // --- 【核心改造】全新的“编辑”逻辑 ---
      
      const list = this.data.userCultivations;
      const editingId = this.data.editingGongfaId;
      const editingIndex = list[categoryKey].findIndex(item => item.id === editingId);

      if (editingIndex !== -1) {
        // 1. 先将正在被编辑的旧功法“归隐”
        list[categoryKey][editingIndex].status = 'archived';
        console.log('旧功法已归隐:', list[categoryKey][editingIndex].name);

        // 2. 创建一个全新的功法对象，作为“修改后”的新功法
        const newCultivation = {
          id: this.uuid(), // 给予一个全新的ID
          name: finalName, 
          exp: exp, 
          count: 0, // 修炼次数从0开始
          totalExpEarned: 0 // 累计修为也从0开始
        };
        
        // 3. 调用 addCultivationToUserList 来添加这个“新”功法
        // addCultivationToUserList 内部已经包含了“复活”和“查重”逻辑，非常安全
        this.addCultivationToUserList(newCultivation);
        
        // 提示语改为“修改成功”，而不是 addCultivationToUserList 里的“编入成功”
        // （由于 wx.showToast 是异步的，这里直接覆盖即可）
        wx.showToast({ title: '修改成功' });
      }

    } else {
      // --- 新增逻辑 (保持不变) ---
      const newCultivation = {
        id: this.uuid(), 
        name: finalName, 
        exp: exp, 
        count: 0,
        totalExpEarned: 0
      };
      this.addCultivationToUserList(newCultivation);
    }
    
    this.closeGongfaPickerPopup();
  },
  
 

  /**
   * 将一个新功法添加到用户的配置列表中
   * 增加了“复活”已归隐功法的逻辑
   */
  addCultivationToUserList(cultivation) {
    const category = this.data.activeTab;
    const list = this.data.userCultivations;

    // 1. 检查是否存在一个“已归隐”的同名功法
    const archivedItem = list[category].find(item => item.name === cultivation.name && item.status === 'archived');

    if (archivedItem) {
      // --- “复活”逻辑 ---
      console.log('发现已归隐的同名功法，正在复活...');
      // 移除它的 status 标记
      delete archivedItem.status;
      
      // 更新界面和缓存
      this.setData({ userCultivations: list });
      wx.setStorageSync('userCultivations', list);
      wx.showToast({ title: '功法已复原', icon: 'success' });
      return; // 提前结束函数
    }

    // 2. 检查是否存在一个“正在使用”的同名功法
    const activeItem = list[category].find(item => item.name === cultivation.name && item.status !== 'archived');

    if (activeItem) {
      // --- 报错逻辑 (保持不变) ---
      wx.showToast({ title: '此功法已存在', icon: 'none' });
      return;
    }

    // 3. 如果上面两种情况都不是，说明这是一个全新的功法，执行“新增”逻辑
    list[category].push(cultivation);
    this.setData({ userCultivations: list });
    wx.setStorageSync('userCultivations', list);
    wx.showToast({ title: '编入成功', icon: 'success' });
  },

  // -------------------------------------------------------------------
  // --- 【核心改造】到这里结束 ---
  // -------------------------------------------------------------------

  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }
})