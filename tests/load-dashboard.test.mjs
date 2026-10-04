import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset } from "../scripts/validate-mock-data.mjs";
import { loadDashboard } from "../src/lib/load-dashboard.ts";

const dataset = loadDataset();
const fixtureResponse = (url) => Response.json(dataset[url.split("/").at(-1)]);

test("四类数据并行读取，实际数据进入计算器且信号传递完整", async () => {
  const controller = new AbortController();
  const pending = [];
  const promise = loadDashboard(controller.signal, (url, options) => {
    assert.equal(options.signal, controller.signal);
    return new Promise((resolve) =>
      pending.push(() => resolve(fixtureResponse(url))),
    );
  });
  assert.equal(pending.length, 4);
  pending.forEach((resolve) => resolve());
  const { metadata, engine } = await promise;
  assert.equal(metadata.schema_version, "1.0.0");
  const result = engine.calculate(engine.defaultFilter());
  assert.equal(result.metrics.participants, 857);
  assert.equal(result.devices.online, 6);
});

test("HTTP失败不会伪装成空数据", async () => {
  await assert.rejects(
    loadDashboard(new AbortController().signal, async (url) =>
      url.includes("sessions")
        ? new Response("", { status: 503 })
        : fixtureResponse(url),
    ),
    /sessions.json.*503/,
  );
});

test("静态托管HTML回退、损坏JSON与错误结构均拒绝", async () => {
  for (const response of [
    new Response("<html>fallback</html>", {
      headers: { "content-type": "text/html" },
    }),
    new Response("{broken", {
      headers: { "content-type": "application/json" },
    }),
    Response.json({ unexpected: true }),
  ]) {
    await assert.rejects(
      loadDashboard(new AbortController().signal, async (url) =>
        url.includes("sessions") ? response : fixtureResponse(url),
      ),
    );
  }
});

test("关联损坏不能进入页面指标", async () => {
  await assert.rejects(
    loadDashboard(new AbortController().signal, async (url) =>
      url.includes("generations")
        ? Response.json([
            { ...dataset["generations.json"][0], session_id: "missing" },
          ])
        : fixtureResponse(url),
    ),
    /任务关联不存在/,
  );
});

test("取消请求的失败向上传递，供卸载和超时处理", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loadDashboard(controller.signal, async (_url, options) => {
      options.signal.throwIfAborted();
    }),
    { name: "AbortError" },
  );
});
