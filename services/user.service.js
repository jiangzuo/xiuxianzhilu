// services/user.service.js
const Cache = require('../utils/cache-manager');

const UserService = {
  /**
   * 获取用户基础信息 (如果不存在则初始化)
   */
  getUserProfile() {
    let profile = Cache.get('userProfile');
    if (!profile) {
      // 初始化默认用户
      profile = {
        nickName: '道友',
        avatarUrl: '/images/profile-avatar-ink.png', // 默认头像
        joinDate: Date.now()
      };
      Cache.set('userProfile', profile);
    }
    return profile;
  },

  /**
   * 更新用户基础信息
   */
  updateProfile(data) {
    const profile = this.getUserProfile();
    const newProfile = { ...profile, ...data };
    Cache.set('userProfile', newProfile);
    return newProfile;
  }
};

module.exports = UserService;