// services/import-export.service.js
const Cache = require('../utils/cache-manager');
const CultivationService = require('./cultivation.service');

const ImportExportService = {
  // 导出数据
  exportData() {
    try {
      // 获取功法数据
      const cultivations = CultivationService.getCultivationData();
      
      // 构建导出数据
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        cultivations: cultivations
      };
      
      // 转换为JSON字符串
      const jsonString = JSON.stringify(exportData, null, 2);
      return jsonString;
    } catch (error) {
      console.error('导出数据失败:', error);
      throw error;
    }
  },
  
  // 导入数据
  importData(data) {
    try {
      // 检查是否是字符串，如果是则解析
      let importData;
      if (typeof data === 'string') {
        importData = JSON.parse(data);
      } else {
        importData = data;
      }
      
      // 验证数据格式
      this.validateImportData(importData);
      
      // 更新功法数据
      const { cultivations } = importData;
      Cache.set('userCultivations', cultivations);
      
      return true;
    } catch (error) {
      console.error('导入数据失败:', error);
      throw error;
    }
  },
  
  // 验证导入数据
  validateImportData(data) {
    if (!data) {
      throw new Error('数据格式错误：数据为空');
    }
    
    if (!data.version) {
      throw new Error('数据格式错误：缺少版本号');
    }
    
    if (!data.cultivations) {
      throw new Error('数据格式错误：缺少功法数据');
    }
    
    // 验证版本兼容性
    if (data.version !== '1.0') {
      throw new Error('数据版本不兼容');
    }
    
    // 验证功法数据结构
    const categories = ['body', 'mind', 'skill', 'wealth'];
    categories.forEach(category => {
      if (!data.cultivations.hasOwnProperty(category)) {
        throw new Error(`数据格式错误：缺少 ${category} 分类`);
      }
      if (!Array.isArray(data.cultivations[category])) {
        throw new Error(`数据格式错误：${category} 必须是数组`);
      }
    });
  }
};

module.exports = ImportExportService;