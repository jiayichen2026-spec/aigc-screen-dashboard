# ScreenPulse · AIGC 互动大屏运营看板

用于 AI 产品经理 Coding 作业的运营后台原型，覆盖活动效果、生成表现、内容审核及设备状态。

## 当前状态：题目要求已完成，可提交

提交入口见 [提交说明](docs/SUBMISSION.md)。已包含 [一页指标说明](output/pdf/01-metrics-one-page.pdf)、[AI工具使用说明](output/pdf/02-ai-tool-usage.pdf)、[三分钟演示路径](docs/DEMO_GUIDE.md) 和 [验收记录](docs/VALIDATION.md)。两份PDF均保留可编辑内容，完整源码与模拟数据可打包交付。

已将可复现JSON明细通过独立指标模块接入React页面，展示四张指标卡、参与人数和生成成功率趋势、点位比较、内容审核、设备状态及设备明细。

支持最近7天／30天、自定义日期、点位筛选和重置；业务指标统一按体验开始日计算，设备仅随点位筛选。提供加载、失败重试、无记录、日期未覆盖、未结束日及小样本提示。趋势数据可通过每日明细表查看。

异常中心已接入9个预设异常／边界案例：按真实明细计算触发条件，支持类型筛选、详情、任务证据分页、内部重试与审核记录、设备心跳及定位到概览。案例加载失败可独立重试，概览仍可使用。

业务规则在预设案例窗口与所选日期交集中复算，设备按固定快照判断。阈值仅为演示配置，根因均待确认；当前没有告警推送或工单处理功能。原有指标公式、JSON契约、模拟数据和部署架构未改变。

已补充最多3项重点关注、完整六阶段体验漏斗、可展开的指标口径和分组页内导航。桌面侧栏与手机置顶目录同步滚动高亮，定位保持筛选；正文与指标层级已优化。

演示路径与语义说明见 [异常中心说明](docs/EXCEPTIONS.md)。

在线页面：https://aigc-screen-dashboard.vercel.app/

## 指标模块

```sh
npm run metrics:check  # 查看默认最近7天与30天计算结果
npm run test:metrics   # 指标模块测试
npm test              # 数据与指标全部测试
```

浏览器端纯TypeScript模块位于 `src/lib/metrics.ts`，与React及后端服务解耦。读取四个JSON文件后创建 `createMetricEngine(dataset)`，再使用 `calculate(filter)` 获取结果。接入示例、返回字段、错误处理和测试说明见 [指标模块说明](docs/METRICS.md)。

## 模拟数据

默认种子 `20261004`，固定北京时间 `2026-10-04 18:00:00` 快照，覆盖 `2026-09-05` 至 `2026-10-04`，共30个自然日（最后一日截至快照时刻）。四个点位和八台设备全部虚构。

```sh
npm run data:generate
npm run data:validate
npm run test:data
```

默认结果：3,750次体验、3,100个模拟匿名用户、3,455个逻辑生成任务；含9个异常或边界案例。文件位于 `public/mock/`，发布后从 `/mock/metadata.json` 等路径读取。

修改种子并输出到独立目录：

```sh
npm run data:generate -- --seed 42 --out artifacts/mock-seed-42
npm run data:validate -- --dir artifacts/mock-seed-42
```

不要手工编辑生成的JSON。修改生成规则后重新生成并验证；`manifest.json` 用 SHA-256 校验数据文件是否发生变化。同一生成器版本、点位配置和种子会产生逐字节相同的数据，不使用当前时间或本机时区。

字段、指标边界、异常规则、已知简化和复现说明见 [模拟数据说明](docs/MOCK_DATA.md)。

## 本地运行

使用 Node.js 24 与 npm。依赖版本由 `package-lock.json` 固定。

```sh
npm ci
npm run dev
```

打开终端中显示的本地地址（默认 `http://127.0.0.1:5173`）。

```sh
npm run typecheck
npm run build
npm run preview
```

构建产物为 `dist/`，预览默认位于 `http://127.0.0.1:4173`。

## Vercel

- 仓库：`jiayichen2026-spec/aigc-screen-dashboard`
- Framework：Vite
- Root Directory：仓库根目录
- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：`dist`
- Node.js：24.x
- 无需环境变量、模型密钥或数据库。

## 文件结构

```text
src/
  App.tsx                 数据看板与日期、点位筛选
  hooks/useDashboardData.ts 加载、取消和失败重试
  lib/load-dashboard.ts   并行读取JSON并验证计算输入
  styles.css              响应式样式
  components/             图标与 ECharts 趋势组件
  data/catalog.ts         虚构点位配置与拟定指标说明
  types/mock-data.ts      与既有JSON一致的数据类型
  lib/metrics.ts          日期、点位、指标和设备快照计算
  lib/metric-format.ts    保留null语义的显示格式
docs/AI_USAGE.md           AI 工具使用记录
docs/MOCK_DATA.md          数据字典、异常案例与复现说明
docs/METRICS.md            指标模块API说明
docs/PAGE_INTEGRATION.md   页面接入、验证结果与演示路径
docs/EXCEPTIONS.md         异常判定、证据语义与演示路径
public/mock/              可直接随静态网站部署的JSON数据
scripts/                  Node.js数据生成与一致性验证脚本
tests/mock-data.test.mjs   复现、指标样例与损坏数据测试
tests/metrics.test.mjs     独立计算模块与筛选边界测试
tests/load-dashboard.test.mjs 页面加载与失败处理测试
tests/exceptions.test.mjs  规则、样本门槛与证据关联测试
vercel.json               部署配置
```

## 提交包制作

使用Python 3标准库脚本打包，无需额外Python包。先确保代码和交付文件已提交，工作区干净，并执行 `npm run build`：

```sh
python3 scripts/package-submission.py
```

会生成 `artifacts/submission/ScreenPulse-submission-draft.zip`。在独立目录解压并完成安装、测试、构建及静态预览后，将含Git提交SHA和PASS结果的验收报告传给 `--verification`，生成正式的 `ScreenPulse-submission.zip` 与对应SHA-256文件。压缩包包含源代码、模拟数据、PDF、预构建网页、运行说明与演示材料；排除依赖目录、Git历史和本机配置，并检查30MB上限。

业务数据统一按北京时间的体验开始日归属。设备状态显示独立快照时间并仅随点位筛选。所有点位为虚构演示配置。

MIT License，保留仓库原有许可证。
