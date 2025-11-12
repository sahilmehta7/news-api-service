const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const API_BASE_URL = baseUrl;

export const API_METRICS_URL =
  process.env.NEXT_PUBLIC_API_METRICS_URL?.replace(/\/$/, "") ??
  `${baseUrl}/metrics`;

export const WORKER_METRICS_URL =
  process.env.NEXT_PUBLIC_WORKER_METRICS_URL?.replace(/\/$/, "") ??
  "http://localhost:9300/metrics";

