// utils/gongfa-data.js
// 功法数据库

// --- 1. 定义可复用的规则模板 ---

// 模板A：标准时长与经验规则 (用于体修、术修)
const DURATION_EXP_TEMPLATE = [
  { duration: '10分钟', exp: 2 },
  { duration: '20分钟', exp: 3 },
  { duration: '30分钟', exp: 5 },
  { duration: '1小时', exp: 10 },
  { duration: '2小时', exp: 15 },
  { duration: '3小时', exp: 20 }, 
];

// --- 2. 构建功法库 ---

const GONGFA_LIBRARY = {
  // === 体修 ===
  // 所有体修功法，都将使用上面定义的 DURATION_EXP_TEMPLATE
  body: [
    { key: 'fitness', name: '健身', options: DURATION_EXP_TEMPLATE },
    { key: 'walk', name: '散步', options: DURATION_EXP_TEMPLATE },
    { key: 'run', name: '跑步', options: DURATION_EXP_TEMPLATE },
    { key: 'ride', name: '骑行', options: DURATION_EXP_TEMPLATE },
    { key: 'climb', name: '登山', options: DURATION_EXP_TEMPLATE },
    { key: 'yoga', name: '瑜伽', options: DURATION_EXP_TEMPLATE },
    { key: 'swim', name: '游泳', options: DURATION_EXP_TEMPLATE },
    { key: 'basketball', name: '篮球', options: DURATION_EXP_TEMPLATE },
    { key: 'football', name: '足球', options: DURATION_EXP_TEMPLATE },
    { key: 'pingpong', name: '乒乓球', options: DURATION_EXP_TEMPLATE },
    { key: 'badminton', name: '羽毛球', options: DURATION_EXP_TEMPLATE },
    { key: 'tennis', name: '网球', options: DURATION_EXP_TEMPLATE },
    { key: 'volleyball', name: '排球', options: DURATION_EXP_TEMPLATE },
    { key: 'boxing', name: '拳击', options: DURATION_EXP_TEMPLATE },
    { key: 'wrestle', name: '摔跤', options: DURATION_EXP_TEMPLATE },
    { key: 'skate', name: '滑冰', options: DURATION_EXP_TEMPLATE },
    { key: 'ski', name: '滑雪', options: DURATION_EXP_TEMPLATE },
    { key: 'dive', name: '潜水', options: DURATION_EXP_TEMPLATE },
    { key: 'other_sport', name: '其他', options: DURATION_EXP_TEMPLATE },
  ],

  // === 心修 ===
  // 所有心修功法，单位都是“1次”，经验都是 5
  mind: [
    { key: 'meditation', name: '静坐冥想', unit: '一次', exp: 5 },
    { key: 'association', name: '自由联想', unit: '一次', exp: 5 },
    { key: 'summary', name: '记录总结', unit: '一次', exp: 5 },
    { key: 'discussion', name: '和人论道', unit: '一次', exp: 5 },
    // 注意：“学习知识”在您的原始需求中，心修和术修都有，这里暂时放在心修
    { key: 'study_mind', name: '学习知识', unit: '一次', exp: 5 },
  ],

  // === 术修 ===
  // 所有术修功法，也使用 DURATION_EXP_TEMPLATE
  skill: [
    { key: 'study_skill', name: '学习知识', options: DURATION_EXP_TEMPLATE },
    { key: 'work', name: '工作', options: DURATION_EXP_TEMPLATE },
  ],

  // === 财修 ===
  // 所有财修功法，单位都是“1次”，经验都是 20
  wealth: [
    { key: 'earn_money', name: '赚钱', unit: '一次', exp: 20 },
    // 未来可以增加更多财修项
    // { key: 'invest', name: '研究投资', unit: '次', exp: 20 },
  ]
};

// 导出功法库，供其他文件使用
module.exports = {
  GONGFA_LIBRARY
}