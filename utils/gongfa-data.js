// utils/gongfa-data.js
// 功法数据库

// --- 1. 定义可复用的规则模板 ---

// 模板A：标准时长与经验规则 (用于体修、术修、学习类)
// 10分钟(2), 20分钟(3), 30分钟(5), 1小时(10), 2小时(15), 3小时(20)
const DURATION_EXP_TEMPLATE = [
  { duration: '10分钟', exp: 2 },
  { duration: '20分钟', exp: 3 },
  { duration: '30分钟', exp: 5 },
  { duration: '1小时', exp: 10 },
  { duration: '2小时', exp: 15 },
  { duration: '3小时', exp: 20 }, 
];

// 模板B：程度/大小 (用于赚钱、节流)
// 小(5), 中(10), 大(20)
const AMOUNT_EXP = [
  { duration: '小', exp: 5 },
  { duration: '中', exp: 10 },
  { duration: '大', exp: 20 },
];

// --- 2. 构建功法库 ---

const GONGFA_LIBRARY = {
  // === 体修 (Body) ===
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

  // === 心修 (Mind) ===
  // 所有心修功法，单位都是“1次”，经验都是 5
  // 【修正】已修复重复 Key 的问题，确保唯一性
  mind: [
    { key: 'study_mind_theory', name: '学习心修知识', unit: '1次', exp: 5 },
    { key: 'meditation', name: '静坐冥想', unit: '1次', exp: 5 },
    { key: 'association', name: '自由联想', unit: '1次', exp: 5 },
    { key: 'summary', name: '记录总结', unit: '1次', exp: 5 },
    { key: 'discussion', name: '和人论道', unit: '1次', exp: 5 },
    { key: 'awareness', name: '自我觉察', unit: '1次', exp: 5 },
    { key: 'calligraphy_mind', name: '练字（心）', unit: '1次', exp: 5 },
  ],

  // === 术修 (Skill) ===
  // 严格对应需求列表，使用 DURATION_EXP_TEMPLATE
  skill: [
    { key: 'study_skill_theory', name: '学习术修知识', options: DURATION_EXP_TEMPLATE },
    { key: 'language', name: '学习语言', options: DURATION_EXP_TEMPLATE },
    { key: 'music', name: '音乐', options: DURATION_EXP_TEMPLATE },
    { key: 'writing', name: '写作', options: DURATION_EXP_TEMPLATE },
    { key: 'calligraphy_skill', name: '练字（术）', options: DURATION_EXP_TEMPLATE },
    { key: 'ai_learning', name: '学习AI', options: DURATION_EXP_TEMPLATE },
    { key: 'life_skill', name: '生活技能', options: DURATION_EXP_TEMPLATE },
    { key: 'work_skill', name: '工作技能', options: DURATION_EXP_TEMPLATE },
  ],

  // === 财修 (Wealth) ===
  // 学习用时间，赚钱/节流用程度
  wealth: [
    { key: 'study_wealth_theory', name: '学习财修知识', options: DURATION_EXP_TEMPLATE },
    { key: 'earn_money', name: '赚钱', options: AMOUNT_EXP },
    { key: 'save_money', name: '节流', options: AMOUNT_EXP },
  ]
};

// 导出功法库
module.exports = {
  GONGFA_LIBRARY
}