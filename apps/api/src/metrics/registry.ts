import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

const registry = new Registry();

collectDefaultMetrics({
  prefix: "news_api_",
  register: registry
});

const httpRequestDuration = new Histogram({
  name: "news_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  registers: [registry],
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const httpRequestCounter = new Counter({
  name: "news_api_http_requests_total",
  help: "Total number of HTTP requests",
  registers: [registry],
  labelNames: ["method", "route", "status_code"]
});

export const metrics = {
  registry,
  httpRequestDuration,
  httpRequestCounter
};

