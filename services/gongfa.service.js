// services/gongfa.service.js
const Cache = require('../utils/cache-manager');

// 辅助：生成UUID (再次复用，后期可以提取到 utils/util.js)
const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

const GongfaService = {
  /**
   * 添加新功法
   */
  addGongfa(category, gongfaTemplate) {
    const data = Cache.get('userCultivations');
    const list = data[category];

    // 1. 查重逻辑 (包含复活归隐功法)
    const archivedItem = list.find(item => item.name === gongfaTemplate.name && item.status === 'archived');
    if (archivedItem) {
      delete archivedItem.status; // 复活
      Cache.set('userCultivations', data);
      return { success: true, msg: '功法已复原', isRestore: true };
    }

    const activeItem = list.find(item => item.name === gongfaTemplate.name && item.status !== 'archived');
    if (activeItem) {
      return { success: false, msg: '此功法已存在' };
    }

    // 2. 新增逻辑
    const newGongfa = {
      id: uuid(),
      name: gongfaTemplate.name,
      exp: gongfaTemplate.exp,
      count: 0,
      totalExpEarned: 0,
      ...gongfaTemplate // 合并其他属性
    };

    list.push(newGongfa);
    Cache.set('userCultivations', data);
    return { success: true, msg: '编入成功' };
  },

  /**
   * 归隐(删除)功法
   */
  archiveGongfa(category, id) {
    const data = Cache.get('userCultivations');
    const index = data[category].findIndex(item => item.id === id);
    
    if (index > -1) {
      data[category][index].status = 'archived';
      Cache.set('userCultivations', data);
      return true;
    }
    return false;
  }
};

module.exports = GongfaService;