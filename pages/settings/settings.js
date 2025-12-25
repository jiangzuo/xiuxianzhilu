// pages/settings/settings.js (Service 重构版)
const { GONGFA_LIBRARY } = require('../../utils/gongfa-data.js');
const app = getApp();
// 【引入 Service】
const GongfaService = require('../../services/gongfa.service');
const CultivationService = require('../../services/cultivation.service');

Page({
  data: {
    pageClass: '',
    statusBarHeight: 0,
    
    // 弹窗相关
    showDeleteDialog: false,
    tempDeleteData: null,
    
    // 数据源
    activeTab: 'body',
    gongfaLibrary: GONGFA_LIBRARY, // Picker 仍需依赖此静态数据
    userCultivations: { body: [], mind: [], skill: [], wealth: [] },
    
    // 静态配置
    categoryMap: { body: '体修', mind: '心修', skill: '术修', wealth: '财修' }, 
    categoryIconMap: { 
      body: 'gongfa-book-icon1.png',
      mind: 'gongfa-book-icon2.png',
      skill: 'gongfa-book-icon3.png',
      wealth: 'gongfa-book-icon4.png'
    },
    
    // Picker 相关
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
    // 【核心修改】调用 Service 刷新列表
    this.refreshList();
  },

  /**
   * 【核心重构】刷新功法列表
   * 直接从 CultivationService 获取最新的全量数据 (包含内存缓存支持)
   */
  refreshList() {
    const cultivations = CultivationService.getCultivationData();
    this.setData({ userCultivations: cultivations });
  },

  // --- 删除逻辑 ---

  onDeleteTap(event) {
    const { category, id } = event.currentTarget.dataset;
    this.setData({
      showDeleteDialog: true,
      tempDeleteData: { category, id }
    });
  },

  /**
   * 【核心重构】确认删除 (归隐)
   */
  onDeleteConfirm() {
    const { category, id } = this.data.tempDeleteData;
    
    // 调用 Service 执行归隐逻辑
    const success = GongfaService.archiveGongfa(category, id);
    
    if (success) {
      this.setData({ showDeleteDialog: false });
      this.refreshList(); // 刷新界面
      wx.showToast({ title: '已归隐', icon: 'success' });
    } else {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // --- Tab 切换 ---
  onTabChange(event) {
    this.setData({ activeTab: event.detail.name });
  },

  // --- Picker 选择器逻辑 (UI 交互部分保持不变) ---

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
      // 找不到预设模板的情况，给个默认提示或定位到第一个
      wx.showToast({ title: '自定义功法无法完全还原选项', icon: 'none' });
      this.setData({ isEditMode: true, editingGongfaId: id });
      this.openPicker(0, 0);
    }
  },

  findGongfaInLibrary(fullName) {
    const categoryKey = this.data.activeTab;
    const gongfaList = this.data.gongfaLibrary[categoryKey] || [];
    
    for (let i = 0; i < gongfaList.length; i++) {
      const libGongfa = gongfaList[i];
      // 简单前缀匹配
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
      this.setData({ 
        'pickerColumns.gongfaNames': ['该分类暂无功法'], 
        'pickerColumns.durations': ['-'], 
        'pickerColumns.exps': ['-'] 
      });
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
      durations = [selectedGongfa.unit || '次'];
      exps = [`经验+${selectedGongfa.exp}`];
    }
    
    this.setData({ 
      'pickerColumns.gongfaNames': gongfaNames, 
      'pickerColumns.durations': durations, 
      'pickerColumns.exps': exps 
    });
  },

  onPickerChange(event) {
    const val = event.detail.value;
    const [gongfaIndex, optionIndex] = val;
    
    // 如果第一列变了，后面重置
    if (gongfaIndex !== this.data.pickerValue[0]) {
       this.updatePickerColumns(gongfaIndex, 0);
       this.setData({ pickerValue: [gongfaIndex, 0, 0] });
    } else {
       this.updatePickerColumns(gongfaIndex, optionIndex);
       this.setData({ pickerValue: val });
    }
  },

  /**
   * 【核心重构】确认 Picker 选择
   * 组装数据 -> 调用 Service
   */
  onPickerConfirm() {
    const [gongfaIndex, optionIndex] = this.data.pickerValue;
    const categoryKey = this.data.activeTab;
    const gongfaList = this.data.gongfaLibrary[categoryKey];
    
    if (!gongfaList || gongfaList.length === 0) {
      this.closeGongfaPickerPopup();
      return;
    }
    
    const selectedGongfa = gongfaList[gongfaIndex];

    // 1. 组装功法名称和经验
    let finalName = selectedGongfa.name;
    let exp = 0;
    
    if (selectedGongfa.options) {
      const safeOptionIndex = Math.min(optionIndex, selectedGongfa.options.length - 1);
      const selectedOption = selectedGongfa.options[safeOptionIndex];
      // 注意：加个空格，避免名称粘连
      finalName = `${selectedGongfa.name} ${selectedOption.duration}`;
      exp = selectedOption.exp;
    } else {
      exp = selectedGongfa.exp;
    }

    // 2. 构造数据对象
    const gongfaTemplate = {
      name: finalName,
      exp: exp,
      // 可以把图标或其他属性也传进去
      // icon: selectedGongfa.icon 
    };

    let result;

    if (this.data.isEditMode) {
      // --- 编辑模式 ---
      // 1. 先归隐旧的 (Service 负责去找并标记)
      const archiveSuccess = GongfaService.archiveGongfa(categoryKey, this.data.editingGongfaId);
      if(archiveSuccess) {
         // 2. 添加新的 (Service 内部负责查重、生成UUID)
         result = GongfaService.addGongfa(categoryKey, gongfaTemplate);
         wx.showToast({ title: '修改成功' });
      } else {
         wx.showToast({ title: '原功法异常', icon: 'none' });
      }
    } else {
      // --- 新增模式 ---
      result = GongfaService.addGongfa(categoryKey, gongfaTemplate);
      
      if (result.success) {
        wx.showToast({ title: result.msg, icon: 'success' });
      } else {
        wx.showToast({ title: result.msg, icon: 'none' });
      }
    }
    
    // 3. 刷新列表并关闭弹窗
    this.refreshList();
    this.closeGongfaPickerPopup();
  }
})