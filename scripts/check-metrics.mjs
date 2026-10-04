import { loadDataset } from "./validate-mock-data.mjs";
import { createMetricEngine } from "../src/lib/metrics.ts";

const files = loadDataset();
const engine = createMetricEngine({
  metadata: files["metadata.json"],
  sessions: files["sessions.json"],
  generations: files["generations.json"],
  devices: files["devices.json"],
});
for (const days of [7, 30]) {
  const result = engine.calculate(engine.defaultFilter(days));
  const { items: _items, ...deviceCounts } = result.devices;
  console.log(
    JSON.stringify(
      {
        days,
        filter: result.filter,
        coverage: result.coverage,
        metrics: result.metrics,
        devices: deviceCounts,
      },
      null,
      2,
    ),
  );
}
