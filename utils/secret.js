// utils/secret.js

const ENCRYPTED_KEY = "CwJYGQ1QWkheERxYUlsbXUAZWABYS14XSA1XVhxbQ0AIWVs="; 
const CIPHER = "xiuxian"; // 解密密钥 (可以改得复杂点)

const SecretManager = {
  getApiKey() {
    try {
      // 微信小程序没有 atob，使用 wx.base64ToArrayBuffer
      const rawBuffer = wx.base64ToArrayBuffer(ENCRYPTED_KEY);
      const text = String.fromCharCode.apply(null, new Uint8Array(rawBuffer));
      
      return Array.from(text).map((c, i) => 
        String.fromCharCode(c.charCodeAt(0) ^ CIPHER.charCodeAt(i % CIPHER.length))
      ).join('');
    } catch (e) {
      console.error('【Secret】解密失败', e);
      return '';
    }
  }
};

module.exports = SecretManager;