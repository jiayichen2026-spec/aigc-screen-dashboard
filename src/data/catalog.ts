// Step 3: configuration only. Step 4 will add reproducible event-level mock data.
export const locations = [
  { id: "all", name: "全部点位" },
  { id: "shanghai", name: "上海 · 淮海路店" },
  { id: "beijing", name: "北京 · 三里屯店" },
  { id: "hangzhou", name: "杭州 · 湖滨店" },
  { id: "chengdu", name: "成都 · 太古里店" },
] as const;

export const metricDefinitions = [
  {
    name: "参与人数",
    formula: "所选范围内开始有效体验的匿名用户ID去重数。",
    note: "重复体验不重复计人；跨点位汇总重新去重。",
  },
  {
    name: "生成成功率",
    formula: "成功任务数 ÷（成功任务数＋失败任务数）。",
    note: "排队和处理中单列，内部重试不新增逻辑任务。",
  },
  {
    name: "扫码转化率",
    formula: "发生扫码的体验会话数 ÷ 已展示可领取结果的体验会话数。",
    note: "每个会话最多计一次扫码，审核拦截结果不进入分母。",
  },
  {
    name: "平均生成时长",
    formula: "成功任务从提交到生成完成的总耗时 ÷ 成功任务数。",
    note: "单位为秒，包含排队及内部重试耗时。",
  },
  {
    name: "内容审核",
    formula: "分别展示通过、拦截和待审核；通过率＝通过数 ÷ 已审核数。",
    note: "技术生成成功与审核通过分别统计。",
  },
  {
    name: "设备在线状态",
    formula: "模拟快照时刻，最近5分钟内有心跳为在线，超过5分钟为离线。",
    note: "无心跳记录为未知；仅跟随点位筛选。",
  },
  {
    name: "完整转化漏斗",
    formula:
      "开始体验→提交生成→生成成功→审核通过→结果展示→扫码领取。各阶段按体验ID去重，转化率＝本阶段次数÷上一阶段次数；差额＝上一阶段－本阶段。",
    note: "按体验开始日与点位筛选，统一观察至快照。排队、处理中、待审核单列；未提交、未展示、未扫码的原因未知。生成与审核阶段分母包含未结束状态，区别于概览卡片。零分母显示“—”；扫码不代表下载或购买完成。",
  },
];
