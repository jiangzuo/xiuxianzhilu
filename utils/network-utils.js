// utils/network-utils.js 网络工具函数

const NetworkUtils = {
  /**
   * 检查网络状态
   * @returns {Promise<{isConnected: boolean, networkType: string}>}
   */
  checkNetworkStatus() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          const isConnected = res.networkType !== 'none';
          resolve({ isConnected, networkType: res.networkType });
        },
        fail: () => {
          // 失败时默认认为网络连接正常
          resolve({ isConnected: true, networkType: 'unknown' });
        }
      });
    });
  },

  /**
   * 监听网络状态变化
   * @param {Function} callback 网络状态变化回调函数
   * @returns {number} 监听器ID
   */
  onNetworkStatusChange(callback) {
    return wx.onNetworkStatusChange(callback);
  }
};

module.exports = NetworkUtils;