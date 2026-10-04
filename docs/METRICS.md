# 第五步：指标计算模块

## 交付与兼容性

新增 `src/types/mock-data.ts`、`src/lib/metrics.ts`、`src/lib/metric-format.ts`，为后续页面接入准备独立、可测试的计算接口。

本模块只依赖浏览器标准JavaScript能力，无Node文件系统、网络请求、React状态、数据库或额外依赖。Node.js 24可直接运行TypeScript测试。既有JSON文件、生成器、`src/data/catalog.ts`、页面组件、样式与部署配置未修改。第四步QA脚本继续作为独立参考，不与前端共用聚合实现。

第五步完成后，线上页面仍显示“—”。本步验证计算结果，下一步再连接数据加载、指标卡和图表。

## 文件与运行命令

| 文件                      | 作用                                                   |
| ------------------------- | ------------------------------------------------------ |
| src/types/mock-data.ts    | 四类JSON输入的TypeScript类型                           |
| src/lib/metrics.ts        | 计算器、筛选、汇总、趋势、点位比较、设备快照与边界检查 |
| src/lib/metric-format.ts  | 数字格式化；不把null改为0                              |
| scripts/check-metrics.mjs | 从默认数据输出7天和30天完整结果                        |
| tests/metrics.test.mjs    | 24项独立指标测试                                       |

```sh
npm run metrics:check
npm run test:metrics
npm test
npm run build
```

## 接入方式

后续页面加载 `metadata.json、sessions.json、generations.json、devices.json` 后，按下述方式组合。输入应来自第四步已经验证的数据，不能把任意未知JSON直接当成正确记录；本模块还会检查影响统计口径的关键关联、时间和状态条件。

```ts
import { createMetricEngine } from "./lib/metrics";
import { formatCount, formatPercent, formatSeconds } from "./lib/metric-format";
import type { MetricDataset } from "./types/mock-data";

// metadata/sessions/generations/devices为四个JSON加载后的对象。
const dataset: MetricDataset = { metadata, sessions, generations, devices };
const engine = createMetricEngine(dataset);

const filter = engine.defaultFilter(7);
const result = engine.calculate(filter);
const shanghai = engine.calculate({ ...filter, locationId: "shanghai" });

const participantText = formatCount(result.metrics?.participants ?? null);
const successText = formatPercent(
  result.metrics?.generation.successRate ?? null,
);
const durationText = formatSeconds(
  result.metrics?.generation.averageSeconds ?? null,
);
```

这是接入示意，不是已经写入App的代码。建议数据加载后创建一次engine；控件变化时调用calculate，避免每次重渲染重复建立索引。构造时保留独立数据快照，调用方后续修改原对象不会污染计算器。

`scenarios.json` 不参与指标计算。指标必须从明细算出，不能使用异常案例标签或预设阈值推导数字。

## 筛选接口

`MetricFilter`包含：

| 字段       | 含义                                 |
| ---------- | ------------------------------------ |
| startDate  | YYYY-MM-DD，北京时间开始日，包含当日 |
| endDate    | YYYY-MM-DD，北京时间结束日，包含当日 |
| locationId | 原有点位ID，或UI中的all              |

默认7天为2026-09-28至2026-10-04，默认30天为2026-09-05至2026-10-04。均锚定模拟快照，不读取系统今天；请求更长的默认周期会裁剪到数据起始日。自定义筛选可包含数据覆盖范围外日期，并通过coverage显式说明。单次范围最多366天，避免错误参数产生超长趋势数组。

业务筛选以体验开始日为准。先选session，再关联该批session的generation；审核、展示和扫码结果均观察到固定快照时刻。跨午夜完成的生成和扫码仍归属体验开始日，不能另按事件发生日切断分子。

## 六类指标返回值

`result.metrics`为汇总对象；日期完全没有数据覆盖时为null。已覆盖但无记录时返回计数0和比例/均值null。

| 字段                                  | 计算与用途                                       |
| ------------------------------------- | ------------------------------------------------ |
| participants                          | 当前选中体验的visitor_id去重数                   |
| sessions                              | 体验记录数，包含未提交生成的体验                 |
| generation.submitted                  | 关联逻辑任务数，内部重试不会增加计数             |
| generation.succeeded / failed         | 最终成功/失败任务数                              |
| generation.queued / processing        | 未结束任务单列                                   |
| generation.ended                      | succeeded＋failed                                |
| generation.successRate                | succeeded÷ended；0..1，零分母为null              |
| generation.successfulDurationMs       | 成功任务从提交到完成的总毫秒数，含排队与内部重试 |
| generation.averageSeconds             | 成功总耗时÷成功数÷1000；无成功任务为null         |
| conversion.eligibleSessions           | 已展示可领取结果的会话数                         |
| conversion.scannedSessions            | 至少一次扫码的会话数；重复扫码只计一次           |
| conversion.scanEvents                 | 原始扫码事件总数，仅用于检查重复扫码             |
| conversion.rate                       | scannedSessions÷eligibleSessions                 |
| moderation.passed / blocked / pending | 三类内容审核结果数量                             |
| moderation.notApplicable              | 失败、排队、处理中任务，不等于审核拒绝           |
| moderation.reviewed                   | passed＋blocked，排除pending                     |
| moderation.passRate                   | passed÷reviewed                                  |

数据契约约定每个会话最多一个逻辑任务，因此合格展示任务数与合格展示会话数在当前数据中对应。一旦上游出现一个会话多个逻辑任务，模块明确报错，不会偷偷改变统计方法。若未来确需支持，先修改数据契约并决定去重方式。

汇总时重新合并明细，重新做用户去重和分母计算。整体参与人数不等于每日或点位人数之和；整体成功率不等于各点位成功率的简单平均；总体耗时按成功任务数加权。

## 页面可直接使用的其他返回值

| 字段      | 说明                                                                  |
| --------- | --------------------------------------------------------------------- |
| filter    | 实际使用的筛选条件副本                                                |
| daily     | 按日期升序的 `{date, coverage, metrics}` 数组；包含无记录日           |
| locations | 当前点位选择范围内的 `{id, name, metrics}` 比较数组，顺序沿用metadata |
| devices   | 固定时刻的设备快照、分类数量与设备明细                                |
| recordIds | 当前选中的体验ID和逻辑任务ID，用于下一步明细追查                      |
| coverage  | 数据覆盖情况、可用日期边界、固定观察截止时间、不完整自然日            |

`daily.metrics`与总览metrics使用同一聚合函数，避免图表与卡片口径漂移。`recordIds`仅表示当前业务日期/点位选择；设备类异常应按设备快照单独处理。

设备返回 `asOf、total、online、offline、unknown、items`。每个item包含原设备字段、status和heartbeatAgeSeconds。恰好300秒在线，超过300秒离线，无心跳为unknown且心跳年龄为null。心跳年龄不是已确认故障持续时长。

设备只跟随点位筛选：切换业务日期不改变设备状态，日期超出业务覆盖范围时设备快照仍可显示。

## 无数据、未覆盖和未结束日

| 情形                       | 结果与后续UI处理                                                   |
| -------------------------- | ------------------------------------------------------------------ |
| 成都9月5日：已覆盖但无体验 | metrics存在；人数0，比例和平均耗时null；展示无体验记录             |
| 9月4日：没有覆盖           | metrics=null，daily.coverage=unavailable；提示该日期没有数据覆盖   |
| 筛选9月4日至6日            | coverage.dateRange=partial；只汇总已覆盖记录，9月4日不是0而是null  |
| 10月4日：快照停在18:00     | daily.coverage=partial，incompleteDates包含当天；标注统计截至18:00 |
| 全部失败                   | 成功率为0；平均成功时长和审核通过率为null                          |
| 全部待审核                 | 生成成功可计入成功率，但审核通过率为null，不能领取或扫码           |

coverage.dateRange的within仅说明选定日期在数据日期范围内，不代表每个自然日已完整结束。是否有未结束日需要检查incompleteDates。

后续UI不得将未覆盖日补成0，不得在没有提示的情况下把部分覆盖区间或未结束当天与完整周期做效果比较。本模块不提供未经定义的环比或告警阈值。

## 数字显示

`formatCount、formatPercent、formatSeconds`仅返回数字文本，单位由现有指标卡分别显示。

- formatCount(3100) → `3,100`
- formatPercent(3285 / 3453) → `95.13`，页面另显示 `%`
- formatSeconds(21.996042617960427) → `22.00`，页面另显示 `秒`
- null → `—`；真实0分别显示 `0` 或 `0.00`

计算内部保留精度，只在最终展示时舍入，不能先格式化再做汇总。

## 默认模拟数据验收结果

| 指标               |         最近7天 |          最近30天 |
| ------------------ | --------------: | ----------------: |
| 参与人数           |             857 |             3,100 |
| 体验次数           |             878 |             3,750 |
| 逻辑任务数         |             825 |             3,455 |
| 生成成功率         | 782/823＝95.02% | 3285/3453＝95.13% |
| 扫码转化率         | 269/692＝38.87% | 1248/3031＝41.17% |
| 平均生成时长       |         23.63秒 |           22.00秒 |
| 审核通过率         | 719/762＝94.36% | 3138/3265＝96.11% |
| 待审核             |              20 |                20 |
| 设备在线/离线/未知 |           6/1/1 |             6/1/1 |

这是默认种子模拟结果，不代表真实活动表现。修改数据后应运行metrics:check重新生成参考值。

## 错误处理与验证

未知数据版本、不同时间/设备口径、非法日期、反向区间、未知点位、重复ID、孤立任务、一个会话多个任务、未来结果、错误耗时、拦截结果被展示等情况会抛出 `MetricInputError`。调用方应显示可解释的数据错误，不应捕获后返回全零指标。

24项指标测试覆盖：

- 与第四步独立QA逐字段对照，包含30天×5个点位选项，共150种组合。
- 可手工核对的小样本：跨日/跨点位去重、重复扫码、内部重试、排队、处理中及未提交。
- 北京时间午夜与跨日生成/扫码，不同系统时区结果一致。
- 无记录、超出覆盖、全失败、全部拦截、全部待审核和零分母。
- 固定快照、心跳边界、独立设备筛选。
- 非法数据反例及调用方数据/返回对象修改不会污染计算器。

加上第四步18项数据测试，当前共42项自动化测试。此阶段未修改页面，因此不声称图表已经接入或异常页面已经完成。
