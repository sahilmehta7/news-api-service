import { describe, expect, it } from "vitest";

import { loadConfig } from "../../packages/config/src/load-config.js";

describe("loadConfig", () => {
  it("merges environment variables with defaults", () => {
    const config = loadConfig({
      env: {
        DATABASE_URL: "postgres://example.com/news",
        API_ADMIN_KEY: "super-secure-admin-key",
        MONITORING_ENABLED: "false",
        MONITORING_METRICS_PORT: "9400",
        MONITORING_METRICS_HOST: "127.0.0.1"
      }
    });

    expect(config.database.url).toBe("postgres://example.com/news");
    expect(config.api.adminKey).toBe("super-secure-admin-key");
    expect(config.monitoring.enabled).toBe(false);
    expect(config.monitoring.metricsPort).toBe(9400);
    expect(config.monitoring.metricsHost).toBe("127.0.0.1");
    expect(config.ingestion.concurrency).toBeGreaterThan(0);
    expect(config.enrichment.timeoutMs).toBe(10_000);
  });
});

