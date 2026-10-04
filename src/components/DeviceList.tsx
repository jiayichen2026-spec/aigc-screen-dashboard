import type { DeviceSnapshot } from "../lib/metrics";

export function formatSnapshot(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export default function DeviceList({ snapshot }: { snapshot: DeviceSnapshot }) {
  return (
    <details className="device-details">
      <summary>查看设备明细（{snapshot.total}台）</summary>
      <ul className="device-list">
        {snapshot.items.map((device) => (
          <li key={device.device_id}>
            <div>
              <strong>{device.name}</strong>
              <small>{device.device_id}</small>
              <small>
                最近心跳：
                {device.last_heartbeat_at
                  ? formatSnapshot(device.last_heartbeat_at)
                  : "无记录"}
              </small>
            </div>
            <span className={`device-badge ${device.status}`}>
              {
                { online: "在线", offline: "离线", unknown: "未知" }[
                  device.status
                ]
              }
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
