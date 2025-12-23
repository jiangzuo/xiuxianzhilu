// utils/mood-data.js
// 最终版心情数据映射 (使用 Emoji)

const MOOD_MAP = {
  // key: { name: '中文名', icon: 'Emoji字符' }
  happy:      { name: '快乐', icon: '😊' },
  satisfied:  { name: '满意', icon: '😌' },
  calm:       { name: '平静', icon: '🙂' },
  sad:        { name: '悲伤', icon: '😢' },
  angry:      { name: '生气', icon: '😠' },
  fear:       { name: '恐惧', icon: '😨' }
};

// 确保导出语句是正确的
module.exports = {
  MOOD_MAP: MOOD_MAP
}