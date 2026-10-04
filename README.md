# ScreenPulse · AIGC 互动大屏运营看板

用于 AI 产品经理 Coding 作业的运营后台原型，覆盖活动效果、生成表现、内容审核及设备状态。

## 当前进度：第五步 / 独立指标计算模块

已实现 React + TypeScript + Vite 工程、ECharts 空状态图表、响应式中文看板、点位和周期控件、指标口径对话框及 Vercel 配置。

**模拟明细和指标计算模块已完成，尚未接入页面。** 页面所有数值仍为“—”；当前页面控件只切换界面选择状态与点位名单。指标模块已支持日期/点位筛选、汇总、每日趋势、点位比较和设备快照，页面连接与异常详情将在后续步骤实现。

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
  App.tsx                 看板框架与控件状态
  styles.css              响应式样式
  components/             图标与 ECharts 趋势组件
  data/catalog.ts         虚构点位配置与拟定指标说明
  types/mock-data.ts      与既有JSON一致的数据类型
  lib/metrics.ts          日期、点位、指标和设备快照计算
  lib/metric-format.ts    保留null语义的显示格式
docs/AI_USAGE.md           AI 工具使用记录
docs/MOCK_DATA.md          数据字典、异常案例与复现说明
docs/METRICS.md            指标模块API与后续接入说明
public/mock/              可直接随静态网站部署的JSON数据
scripts/                  Node.js数据生成与一致性验证脚本
tests/mock-data.test.mjs   复现、指标样例与损坏数据测试
tests/metrics.test.mjs     独立计算模块与筛选边界测试
vercel.json               部署配置
```

## 后续模块

1. 将已实现的指标模块接入页面，完成图表展示与筛选联动。
2. 接入异常列表、详情和排查建议。
3. 制作一页指标说明和最终提交包。

业务数据计划统一按北京时间的体验开始日归属。设备状态显示独立快照时间并仅随点位筛选。所有点位为虚构演示配置。

MIT License，保留仓库原有许可证。
