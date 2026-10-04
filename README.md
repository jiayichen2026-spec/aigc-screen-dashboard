# ScreenPulse · AIGC 互动大屏运营看板

用于 AI 产品经理 Coding 作业的运营后台原型，覆盖活动效果、生成表现、内容审核及设备状态。

## 当前进度：第三步 / 基础项目与首次部署

已实现 React + TypeScript + Vite 工程、ECharts 空状态图表、响应式中文看板、点位和周期控件、指标口径对话框及 Vercel 配置。

**本版本没有模拟业务明细。** 所有数值为“—”；控件只切换界面选择状态与点位名单，不会生成虚构统计。生成完整模拟数据、指标计算、筛选联动和异常详情将在后续步骤实现。

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
docs/AI_USAGE.md           AI 工具使用记录
vercel.json               部署配置
```

## 后续模块

1. 生成固定随机种子的模拟明细与设备快照。
2. 实现可独立验证的指标函数、日期与点位联动。
3. 接入异常列表、详情和排查建议。
4. 验证数据关系并制作一页指标说明、最终提交包。

业务数据计划统一按北京时间的体验开始日归属。设备状态显示独立快照时间并仅随点位筛选。所有点位为虚构演示配置。

MIT License，保留仓库原有许可证。
