# 第四步：模拟数据与异常案例

## 范围与兼容性

本步提供静态JSON及其生成、验证工具。数据直接放在Vite的 `public/mock/` 下，构建时复制到 `dist/mock/`，发布后可通过 `/mock/<文件名>` 访问，不需要数据库、后端或模型API。

生成器直接读取原有 `src/data/catalog.ts` 的点位配置，校验器同时检查点位与该配置一致。既有React组件、指标定义、依赖与部署配置均未改动。页面仍保持第三步的空状态，数据接入属于后续模块。

## 固定演示环境

| 配置             | 值                                                           |
| ---------------- | ------------------------------------------------------------ |
| 数据来源         | 全部为synthetic模拟记录                                      |
| 默认种子         | 20261004                                                     |
| 生成器与数据版本 | 1.0.0                                                        |
| 数据窗口         | 2026-09-05 至 2026-10-04，共30个北京时间自然日               |
| 快照截止         | 2026-10-04 18:00:00，北京时间；UTC为2026-10-04T10:00:00.000Z |
| 点位             | 上海、北京、杭州、成都，名称和ID沿用catalog                  |
| 设备             | 每点位2台，共8台                                             |
| 默认7天          | 2026-09-28 至 2026-10-04；相对数据快照，不是访问者当天       |
| 默认30天         | 2026-09-05 至 2026-10-04                                     |

最后一天仅统计到快照时刻，不能与完整自然日直接比较。UTC ISO时间戳用于存储，北京时间用于日期归属和展示。筛选起止日期均包含当日，内部推荐转换成 `[开始日00:00, 结束日次日00:00)`。不要用浏览器所在时区归属日期。

默认数据规模：3,750次有效体验、3,100个虚构匿名用户、3,455个逻辑任务。295次体验未提交生成任务。逻辑任务中3,285个成功、168个失败、1个排队、1个处理中。

## 文件及关联关系

```text
metadata.locations.id ← devices.location_id
metadata.locations.id ← sessions.location_id
devices.device_id     ← sessions.device_id
sessions.session_id   ← generations.session_id
scenarios.scenario_id ← sessions.scenario_ids[]
```

| 文件             | 用途                                                         |
| ---------------- | ------------------------------------------------------------ |
| metadata.json    | 版本、随机种子、时区、日期范围、快照时刻、点位与统一规则     |
| sessions.json    | 一条记录代表一次有效体验，包括未提交生成的体验               |
| generations.json | 一条记录代表一个逻辑任务，内部包含重试、审核、展示和扫码事件 |
| devices.json     | 设备名录与快照时刻已知的最后心跳，不包含完整历史心跳         |
| scenarios.json   | 场景筛选条件、演示阈值、待排查方向和运营建议                 |
| manifest.json    | 前五个文件的字节数与SHA-256；清单不对自身做哈希              |

不保存用于页面展示的固定指标卡数字。所有指标都应由明细计算。`scripts/validate-mock-data.mjs` 的汇总结果是QA参考，不是前端已经实现的指标模块。

## 字段字典

### metadata.json

| 字段                                     | 类型与含义                                          |
| ---------------------------------------- | --------------------------------------------------- |
| schema_version / generator_version       | 字符串；数据契约与生成器版本                        |
| seed                                     | 32位无符号整数，0也有效                             |
| data_origin                              | 固定synthetic                                       |
| timezone / utc_offset                    | Asia/Shanghai / +08:00                              |
| period.start_date / end_date / day_count | YYYY-MM-DD / YYYY-MM-DD / 30                        |
| snapshot_at                              | 所有状态统一观察时刻，UTC ISO字符串                 |
| online_threshold_seconds                 | 300；恰好5分钟算在线                                |
| default_range_days                       | 7                                                   |
| locations                                | 四个 `{ id, name }` 配置，排除UI中的all选项         |
| date_attribution                         | session_started_at，业务指标按体验开始日归属        |
| status_as_of                             | snapshot_at，读取快照时刻已经发生的事件和结果       |
| device_filter_scope                      | location_only，设备状态只受点位筛选影响             |
| visitor_identity_scope                   | synthetic_cross_location，模拟全局匿名标识          |
| generation_granularity                   | one_logical_task_per_session_with_internal_attempts |

### sessions.json

| 字段                    | 类型与含义                                         |
| ----------------------- | -------------------------------------------------- |
| session_id              | 唯一体验ID                                         |
| visitor_id              | 虚构全局匿名用户ID，可重复；用于参与人数去重       |
| location_id / device_id | 关联点位与设备，二者所属关系必须一致               |
| started_at              | 已开始有效体验的时刻，UTC ISO字符串                |
| scenario_ids            | 此体验所属的注入场景ID数组，可为空                 |
| fixture_tags            | 用于验收的边界标签数组，可为空；不直接作为告警依据 |

参与人数不是体验次数。按天或按点位的去重人数不能直接相加作为全周期人数。

### generations.json

| 字段                       | 类型与含义                                                     |
| -------------------------- | -------------------------------------------------------------- |
| generation_id / session_id | 唯一逻辑任务ID / 关联体验ID                                    |
| submitted_at               | 用户提交任务时间                                               |
| completed_at               | 任务最终结束时间；排队或处理中为null                           |
| status                     | queued / processing / success / failed                         |
| duration_ms                | 最终结束时间减提交时间；未结束为null；包含排队及内部重试       |
| failure_code               | 最终失败类型；成功或未结束为null                               |
| attempts                   | 内部尝试数组；排队任务为空，重试沿用同一generation_id          |
| moderation_status          | not_applicable / pending / passed / blocked                    |
| reviewed_at                | 最终审核时间；待审核或不适用为null                             |
| moderation_reason          | 仅被拦截时有原因分类，其余null                                 |
| result_displayed_at        | 已审核通过的结果实际展示时间；未展示为null                     |
| scan_events                | 扫码后进入领取页的模拟到达事件，可有重复扫码；不代表分享或购买 |

`attempts` 每项包含 `attempt_id、started_at、ended_at、status、failure_code`。尝试状态为success、failed或processing；处理中ended_at和failure_code为null。最后一次尝试决定逻辑任务最终状态，前面的尝试均应失败。成功重试的历史失败只保留在attempts中。

`scan_events` 每项包含 `scan_event_id、scanned_at`。扫码时间不能早于结果展示；每个会话只计一次扫码转化，即使有多个事件。

失败类型：GENERATION_TIMEOUT（生成超时）、SERVICE_UNAVAILABLE（服务不可用）、INVALID_OUTPUT（结果格式不符合要求）。审核拦截分类：UNSAFE_CONTENT、PERSONAL_INFORMATION_RISK、BRAND_POLICY_REVIEW。这里只保存分类标签，没有真实用户图片或敏感内容。

审核状态与生成状态相互独立：失败、排队、处理中不产生可审核结果，为not_applicable；成功任务进入passed、blocked或pending。blocked和pending均不得展示领取结果或产生扫码事件。passed也可能暂未展示，不能将全部审核通过任务直接用作扫码分母。

### devices.json

| 字段                           | 类型与含义                                   |
| ------------------------------ | -------------------------------------------- |
| device_id / location_id / name | 设备唯一标识、所属点位、显示名               |
| last_heartbeat_at              | 截至固定快照已知的最后心跳；没有记录时为null |

从metadata.snapshot_at与last_heartbeat_at推导状态，不根据访问者当前时间计算。差值≤300秒为online，大于300秒为offline，null为unknown。

该文件仅提供快照，不支持计算过去30天在线率、故障持续时长或历史设备状态。心跳和体验记录是不同数据链路，因此状态未知的设备可以有历史体验。不能将unknown直接归类为offline。

### scenarios.json与manifest.json

每个案例包含 `scenario_id、kind、title、selection、rule、suspected_cause、suggested_action、root_cause_confirmed、data_origin`。kind区分anomaly与boundary，根因均未确认。业务selection指定location_id与闭区间日期；设备selection指定device_id和scope=snapshot。

rule包含指标名及阈值/相等条件；比例和均值规则另有minimum_denominator。阈值只是这份作业的演示设置，不能当作行业标准。真实告警应基于当前筛选下的明细重新计算；scenario_ids只是测试标签，不应让一个相关记录出现在筛选结果里就触发整段场景的告警。

manifest使用 `algorithm: sha256` 与 `files: [{ path, bytes, sha256 }]`，用于确认下载与本地数据是否一致。

## 九个可复现案例（默认种子）

| 案例       | 筛选范围           | 明细验证结果                               | 运营动作                               |
| ---------- | ------------------ | ------------------------------------------ | -------------------------------------- |
| 生成超时   | 上海，10月2—3日    | 62个已结束任务；失败率33.87%，包含超时失败 | 排查超时、排队及重试；不直接归因于模型 |
| 生成变慢   | 杭州，10月3日      | 40个成功任务；平均耗时60.35秒              | 分别检查排队与执行耗时                 |
| 扫码偏低   | 北京，10月1—3日    | 94个可领取会话；扫码转化3.19%              | 检查二维码、领取引导和现场反馈         |
| 内容拦截   | 成都，10月2—3日    | 61个已审核结果；拦截率34.43%               | 复核风险分类与内容规则                 |
| 待审核积压 | 杭州，10月4日      | 20个待审核任务                             | 查看排队记录，安排复核或排查服务       |
| 设备离线   | 成都02号，固定快照 | 最后心跳15:04，快照18:00                   | 检查网络、供电及应用进程               |
| 设备未知   | 北京02号，固定快照 | last_heartbeat_at=null                     | 检查登记与心跳采集，不能判定离线       |
| 空数据     | 成都，9月5日       | 0次体验                                    | 显示空状态，比例与平均值为“—”          |
| 小样本     | 北京，9月5日       | 3次体验                                    | 展示样本不足提示，避免比例误判         |

另有：同一用户重复体验、跨点位用户、同一会话重复扫码、内部失败后重试成功、体验后未提交，以及快照时排队/处理中任务。它们用于验证去重、分母与时间逻辑。

## 统计口径保持一致

先根据session.started_at的北京时间日期与点位筛选体验，再关联该批体验的任务；任务状态和扫码均观察到固定快照截止。因此这是“按体验开始日归属、截至快照观察结果”的统计，不能另按扫码发生日混用分子。

| 指标         | 默认全范围QA参考值    | 计算方法                             |
| ------------ | --------------------- | ------------------------------------ |
| 参与人数     | 3,100人               | visitor_id去重                       |
| 生成成功率   | 95.13%                | 3285 ÷ (3285+168)，排除2个未结束任务 |
| 扫码转化率   | 41.17%                | 1248个扫码会话 ÷ 3031个可领取会话    |
| 平均生成时长 | 22.00秒               | 成功任务提交至完成的总时长 ÷ 3285    |
| 审核通过率   | 96.11%                | 3138 ÷ (3138+127)，20个待审核单列    |
| 设备快照     | 在线6 / 离线1 / 未知1 | 对全部8台设备按快照时刻判断          |

分母为零时QA输出null，页面应显示“—”。先合并明细再计算比例和平均值；不能平均各点位百分比。扫码事件总数1368，不应当作扫码会话数1248。

## 如何复现与验证

在仓库根目录使用Node.js 24：

```sh
npm run data:generate
npm run data:validate
npm run test:data
npm run build
```

默认命令重写且只重写 `public/mock/` 中六个生成文件。试验新种子时使用单独目录，避免替换默认演示数据：

```sh
npm run data:generate -- --seed 42 --out artifacts/mock-seed-42
npm run data:validate -- --dir artifacts/mock-seed-42
```

18项测试包含逐字节复现、三个时区独立进程、不同种子、全部案例、手工小样本、心跳边界，以及孤立任务、错误耗时、拦截后展示、未来心跳和文件损坏等反例。校验器发现与点位或指标契约不一致时会报错，不会修改现有页面代码。

生成器不读取系统日期，也不联网。若修改数据结构、注入规则或随机调用顺序，应更新生成器版本、重新生成、更新参考值并重新验证。

## 取舍与边界

- 这是一份用于展示和验收的合成数据，不是从真实大屏采集的运营结果。异常比例由规则注入，不能据此推断因果或真实行业水平。
- 当前将每次体验简化为最多一个逻辑生成任务，任务内可重试。未来若支持一个会话主动生成多个结果，需要先扩展数据契约，不能直接重复计数。
- 全局匿名visitor_id是模拟假设，用于演示跨点位去重，不代表已经实现真实身份识别或跨设备追踪。
- 设备只有固定快照，不提供历史在线率。模板中列出的原因均为待排查假设。
- 第四步未接入前端，也未生成最终一页指标PDF；两者继续按后续模块完成。
