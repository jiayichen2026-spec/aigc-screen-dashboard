import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_SEED,
  generateDataset,
  serializeDataset,
} from "../scripts/generate-mock-data.mjs";
import {
  deviceStatus,
  loadDataset,
  summarizeRecords,
  validateDataset,
  verifyManifest,
} from "../scripts/validate-mock-data.mjs";

const data = generateDataset();

test("默认数据与发布的JSON逐字节一致，SHA-256清单完整", () => {
  const published = loadDataset();
  assert.deepEqual(published, data);
  for (const [name, content] of Object.entries(serializeDataset(data))) {
    assert.equal(
      readFileSync(new URL(`../public/mock/${name}`, import.meta.url), "utf8"),
      content,
    );
  }
  assert.equal(verifyManifest(), true);
});

test("同种子完全复现，不同种子改变数据且保留所有案例", () => {
  assert.deepEqual(
    serializeDataset(generateDataset(DEFAULT_SEED)),
    serializeDataset(data),
  );
  for (const seed of [0, 42, 0xffffffff]) {
    const alternative = generateDataset(seed);
    assert.notDeepEqual(alternative["sessions.json"], data["sessions.json"]);
    assert.equal(validateDataset(alternative).status, "PASS");
  }
});

test("在不同时区的独立进程中生成一致，命令行可复现", () => {
  const root = mkdtempSync(join(tmpdir(), "screenpulse-repro-"));
  try {
    for (const zone of ["UTC", "America/New_York", "Asia/Shanghai"]) {
      const out = join(root, zone.replaceAll("/", "-"));
      const run = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../scripts/generate-mock-data.mjs", import.meta.url),
          ),
          "--out",
          out,
        ],
        { env: { ...process.env, TZ: zone }, encoding: "utf8" },
      );
      assert.equal(run.status, 0, run.stderr);
      for (const [name, content] of Object.entries(serializeDataset(data)))
        assert.equal(readFileSync(join(out, name), "utf8"), content);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("明细一致性、九个案例和设备状态全部通过", () => {
  const report = validateDataset(data);
  assert.equal(report.scenarios.length, 9);
  assert.deepEqual(report.devices, { online: 6, offline: 1, unknown: 1 });
});

test("手工小样本：用户去重、重复扫码、加权成功率与平均耗时", () => {
  const sessions = [
    { session_id: "a", visitor_id: "u1" },
    { session_id: "b", visitor_id: "u1" },
    { session_id: "c", visitor_id: "u2" },
    { session_id: "d", visitor_id: "u3" },
  ];
  const jobs = [
    {
      session_id: "a",
      status: "success",
      submitted_at: "2026-10-01T00:00:00Z",
      completed_at: "2026-10-01T00:00:10Z",
      moderation_status: "passed",
      result_displayed_at: "2026-10-01T00:00:12Z",
      scan_events: [{}, {}, {}],
    },
    {
      session_id: "b",
      status: "success",
      submitted_at: "2026-10-01T00:00:00Z",
      completed_at: "2026-10-01T00:00:30Z",
      moderation_status: "passed",
      result_displayed_at: "2026-10-01T00:00:32Z",
      scan_events: [],
    },
    {
      session_id: "c",
      status: "failed",
      moderation_status: "not_applicable",
      result_displayed_at: null,
      scan_events: [],
    },
    {
      session_id: "d",
      status: "processing",
      moderation_status: "not_applicable",
      result_displayed_at: null,
      scan_events: [],
    },
  ];
  const result = summarizeRecords(sessions, jobs);
  assert.equal(result.participant_count, 3);
  assert.equal(result.generation_success_rate, 2 / 3);
  assert.equal(result.average_success_duration_seconds, 20);
  assert.equal(result.scan_conversion_rate, 1 / 2);
  assert.equal(result.scan_event_count, 3);
  assert.equal(result.moderation_pass_rate, 1);
  const empty = summarizeRecords([], jobs);
  for (const name of [
    "generation_success_rate",
    "average_success_duration_seconds",
    "scan_conversion_rate",
    "moderation_pass_rate",
  ])
    assert.equal(empty[name], null);
});

test("设备心跳：恰好5分钟在线，超过即离线，缺失为未知", () => {
  const meta = {
    snapshot_at: "2026-10-04T10:00:00Z",
    online_threshold_seconds: 300,
  };
  assert.equal(
    deviceStatus({ last_heartbeat_at: "2026-10-04T09:55:00Z" }, meta),
    "online",
  );
  assert.equal(
    deviceStatus({ last_heartbeat_at: "2026-10-04T09:54:59Z" }, meta),
    "offline",
  );
  assert.equal(deviceStatus({ last_heartbeat_at: null }, meta), "unknown");
});

const mutations = [
  [
    "孤立任务",
    (copy) => {
      copy["generations.json"][0].session_id = "missing";
    },
    /体验不存在/,
  ],
  [
    "重复ID",
    (copy) => {
      copy["sessions.json"].push(copy["sessions.json"][0]);
    },
    /重复ID/,
  ],
  [
    "设备点位不匹配",
    (copy) => {
      copy["sessions.json"][0].device_id = "unknown-device";
    },
    /设备与点位/,
  ],
  [
    "错误耗时",
    (copy) => {
      copy["generations.json"].find(
        (job) => job.status === "success",
      ).duration_ms += 1;
    },
    /耗时与时间戳/,
  ],
  [
    "未结束任务带结果",
    (copy) => {
      copy["generations.json"].find(
        (job) => job.status === "queued",
      ).completed_at = copy["metadata.json"].snapshot_at;
    },
    /未结束任务/,
  ],
  [
    "拦截结果被领取",
    (copy) => {
      const job = copy["generations.json"].find(
        (item) => item.moderation_status === "blocked",
      );
      job.result_displayed_at = job.reviewed_at;
    },
    /审核通过的成功结果/,
  ],
  [
    "无展示发生扫码",
    (copy) => {
      copy["generations.json"].find(
        (job) => job.scan_events.length,
      ).result_displayed_at = null;
    },
    /无可领取结果/,
  ],
  [
    "未来心跳",
    (copy) => {
      copy["devices.json"][0].last_heartbeat_at = "2027-01-01T00:00:00Z";
    },
    /超过快照/,
  ],
  [
    "修改现有点位契约",
    (copy) => {
      copy["metadata.json"].locations[0].id = "new-location";
    },
    /catalog/,
  ],
  [
    "重试时序倒置",
    (copy) => {
      const job = copy["generations.json"].find(
        (item) => item.attempts.length > 1,
      );
      job.attempts[1].started_at = job.submitted_at;
    },
    /重试时间/,
  ],
];
for (const [name, mutate, pattern] of mutations)
  test(`校验器拒绝${name}`, () => {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateDataset(copy), pattern);
  });

test("文件损坏能够被SHA-256校验发现", () => {
  const root = mkdtempSync(join(tmpdir(), "screenpulse-hash-"));
  try {
    for (const [name, content] of Object.entries(serializeDataset(data)))
      writeFileSync(join(root, name), content);
    writeFileSync(join(root, "sessions.json"), "[]\n");
    assert.throws(() => verifyManifest(root), /校验失败/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("拒绝非法随机种子", () => {
  for (const seed of [-1, 1.5, NaN, Infinity, 2 ** 32])
    assert.throws(() => generateDataset(seed), /seed/);
});
