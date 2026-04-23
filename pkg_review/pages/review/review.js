// pkg_review/pages/review/review.js
const ReviewService = require('../../../services/review.service');

const app = getApp();

Page({
  data: {
    // 状态栏高度
    statusBarHeight: 0,

    // 数据
    records: [],
    page: 1,
    pageSize: 50,
    hasMore: true,
    loading: false
  },

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });

    // 清理超量数据
    ReviewService.cleanOldRecords();

    // 加载第一页数据
    this.loadData(true);
  },

  // 加载数据
  loadData(refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });

    const page = refresh ? 1 : this.data.page;
    const records = ReviewService.getAllRecords(page, this.data.pageSize);
    const hasMore = ReviewService.hasMoreData(page, this.data.pageSize);

    // 格式化日期
    const formattedRecords = records.map(item => ({
      ...item,
      formattedDate: this.formatDate(item.timestamp)
    }));

    this.setData({
      records: refresh ? formattedRecords : [...this.data.records, ...formattedRecords],
      page: page + 1,
      hasMore: hasMore,
      loading: false
    });
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 格式化日期
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear().toString().slice(2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
  }
});
