/** Mirrors the existing v1 JSON contract. No backend or browser API required. */
export interface Metadata {
  schema_version: "1.0.0";
  generator_version: string;
  seed: number;
  data_origin: "synthetic";
  timezone: "Asia/Shanghai";
  utc_offset: "+08:00";
  period: { start_date: string; end_date: string; day_count: number };
  snapshot_at: string;
  online_threshold_seconds: 300;
  default_range_days: number;
  locations: { id: string; name: string }[];
  date_attribution: "session_started_at";
  status_as_of: "snapshot_at";
  device_filter_scope: "location_only";
  visitor_identity_scope: "synthetic_cross_location";
  generation_granularity: "one_logical_task_per_session_with_internal_attempts";
}

export interface Session {
  session_id: string;
  visitor_id: string;
  location_id: string;
  device_id: string;
  started_at: string;
  scenario_ids: string[];
  fixture_tags: string[];
}

export type GenerationStatus = "queued" | "processing" | "success" | "failed";
export type ModerationStatus =
  | "not_applicable"
  | "pending"
  | "passed"
  | "blocked";

export interface Generation {
  generation_id: string;
  session_id: string;
  submitted_at: string;
  completed_at: string | null;
  status: GenerationStatus;
  duration_ms: number | null;
  failure_code: string | null;
  attempts: {
    attempt_id: string;
    started_at: string;
    ended_at: string | null;
    status: Exclude<GenerationStatus, "queued">;
    failure_code: string | null;
  }[];
  moderation_status: ModerationStatus;
  reviewed_at: string | null;
  moderation_reason: string | null;
  result_displayed_at: string | null;
  scan_events: { scan_event_id: string; scanned_at: string }[];
}

export interface Device {
  device_id: string;
  location_id: string;
  name: string;
  last_heartbeat_at: string | null;
}

export interface MetricDataset {
  metadata: Metadata;
  sessions: Session[];
  generations: Generation[];
  devices: Device[];
}
