# Checklist

## 数据层
- [x] ChatService.saveMessage 支持 category 参数
- [x] ChatService.getDemonContextForAI 正确获取指定类型上下文
- [x] ChatService.getContextForAI 按时间混合所有上下文

## Service 层
- [x] HeartDemonService.start 正确初始化心魔修炼
- [x] HeartDemonService.sendMessage 正确拼接上下文并发送
- [x] HeartDemonService.complete 正确完成修炼并触发奖励
- [x] 轮次统计：每次从第1轮开始
- [x] 归隐功法检测：过滤 archived 状态

## 页面层
- [x] 聊天页面显示"心魔修炼"按钮
- [x] 点击后弹出类型选择
- [x] 选择后按钮变为"完成修炼"
- [x] 完成修炼后显示用户消息"完成心魔修炼-类型"
- [x] 完成修炼后恢复日常模式
- [x] 未配置功法时引导用户去配置

## 功能验证
- [x] 恐惧心魔修炼：完整流程可走通
- [x] 后悔心魔修炼：完整流程可走通
- [x] 上下文隔离：恐惧看不到后悔历史
- [x] 历史记录：日常聊天能看到心魔修炼记录
- [x] 修为奖励：弹窗正常显示
- [x] 轮次统计：每次从第1轮开始，历史不计入
- [x] 归隐功法：检测并引导用户配置
