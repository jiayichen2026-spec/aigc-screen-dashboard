# ScreenPulse · 第三题提交说明

本项目为AIGC互动大屏运营看板原型，面向品牌活动运营人员，展示活动效果、AI生成稳定性和设备状态。全部点位、用户和记录均为模拟数据。

**在线访问：** https://aigc-screen-dashboard.vercel.app/

**源码仓库：** https://github.com/jiayichen2026-spec/aigc-screen-dashboard

## 压缩包内容

| 路径 | 用途 |
| --- | --- |
| 01-metrics-one-page.pdf | 一页指标说明：六类核心指标及完整漏斗的定义、口径与运营行动 |
| 02-ai-tool-usage.pdf | AI使用说明：工具、关键提示词及本人完成的主要修改 |
| 03-source/ | 完整源码、锁定依赖、模拟数据、生成器、测试与说明 |
| 03-source/public/mock/ | 六份模拟数据与校验清单，无需连接数据库 |
| 04-preview/ | 已构建的静态网页，可本地启动HTTP服务预览 |
| 05-validation.md | 验收结果与已知边界 |
| 06-demo-guide.md | 三分钟演示路径与产品取舍 |
| SOURCE_REVISION.txt | 打包时的Git提交版本 |
| MANIFEST.sha256 | 包内文件的SHA-256校验清单 |

## 推荐查看方式

1. 打开在线链接，默认查看最近7天与全部点位。
2. 查看首屏重点关注；切换30天或指定点位，检查指标、趋势、漏斗与审核状态联动。分组导航仅页内定位，不重置筛选。
3. 进入异常中心，打开“上海生成超时增多”，查看21/62的失败依据、任务明细和建议行动。
4. 点击“在概览中查看此范围”，查看上海10月2日至3日的成功率66.13%。
5. 阅读两份PDF说明；源码及模拟数据均在03-source中。

## 从源码运行

安装Node.js 24和npm，终端进入解压后的 `03-source` 文件夹：

```sh
npm ci
npm run dev
```

打开命令输出的本地地址，默认 http://127.0.0.1:5173/。安装依赖需访问npm网络；运行本身不需要API密钥、数据库或环境变量。

```sh
npm test
npm run data:validate
npm run build
npm run preview
```

`npm run preview` 默认 http://127.0.0.1:4173/。请使用HTTP服务访问，不要双击HTML用file协议打开。

## 不安装npm依赖的静态预览

若已安装Python 3，在压缩包解压后的根目录运行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory 04-preview
```

然后打开 http://127.0.0.1:4173/。预览所需模拟JSON已包含在04-preview/mock中。

## 复现模拟数据

在03-source内执行：

```sh
npm run data:generate -- --out artifacts/reproduced-mock
npm run data:validate -- --dir artifacts/reproduced-mock
```

默认随机种子20261004，固定北京时间2026-10-04 18:00:00快照，覆盖2026-09-05至2026-10-04。同版本、同种子生成逐字节相同的数据；不会随系统日期和时区变化。

## 文件编辑

两份PDF对应的可编辑文本位于03-source/docs/METRICS_ONE_PAGE.md和AI_USAGE_SUBMISSION.md，内容源为submission-content.json。重新生成PDF可使用scripts/build-submission-pdfs.py，需要Python、reportlab、pypdf及本地中文TrueType字体；这些仅用于文档排版，不影响网页运行。

## 演示边界

- 当前扫码是结果领取转化，不代表购买或分享转化。
- 设备状态是固定快照，只随点位筛选，不提供历史在线率。
- 异常基于预设模拟案例窗口和阈值；没有实时告警推送、工单或处理状态存储。
- 无业务日期覆盖、无体验与低样本量分别提示；模拟阈值不是行业标准，可能原因不是确认根因。
- 这是运营分析原型，没有接入真实AI生成或内容审核服务。

许可证沿用源码仓库MIT License。
