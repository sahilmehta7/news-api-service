import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import cors from "@fastify/cors";

import { createLogger } from "@news-api/logger";
import { loadConfig } from "@news-api/config";
import { Prisma } from "@news-api/db";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import embeddingsPlugin from "./plugins/embeddings.js";
import { registerFeedRoutes } from "./modules/feeds/routes.js";
import { registerArticleRoutes } from "./modules/articles/routes.js";
import { registerLogRoutes } from "./modules/logs/routes.js";
import { registerSourceRoutes } from "./modules/sources/routes.js";
import { registerSearchRoutes } from "./modules/search/routes.js";
import { registerSettingsRoutes } from "./modules/settings/routes.js";
import { checkElasticsearchHealth, createElasticsearchClient } from "@news-api/search";
import { metrics } from "./metrics/registry.js";

const logger = createLogger({ name: "api" }).child({ service: "api" });

declare module "fastify" {
  interface FastifyRequest {
    metricsStopTimer?: ReturnType<typeof metrics.httpRequestDuration.startTimer>;
  }
}

async function main() {
  const config = loadConfig();

  const server = Fastify({
    logger: false,
    loggerInstance: logger
  }) as unknown as FastifyInstance;

  await server.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
    credentials: false
  });
  await server.register(dbPlugin);
  await server.register(authPlugin, {
    adminKey: config.api.adminKey
  });
  await server.register(embeddingsPlugin);

  server.addHook("onRequest", (request, _reply, done) => {
    const route = request.routeOptions.url ?? request.url;
    request.metricsStopTimer = metrics.httpRequestDuration.startTimer({
      method: request.method,
      route,
      status_code: "pending"
    });
    done();
  });

  server.addHook(
    "onResponse",
    (request: FastifyRequest, reply: FastifyReply, done) => {
      const statusCode = reply.statusCode.toString();
      const route = request.routeOptions.url ?? request.url;

      metrics.httpRequestCounter.inc({
        method: request.method,
        route,
        status_code: statusCode
      });

      if (request.metricsStopTimer) {
        request.metricsStopTimer({
          method: request.method,
          route,
          status_code: statusCode
        });
      }

      done();
    }
  );

  const searchClient = createElasticsearchClient(config);

  server.get("/health", async () => {
    const esHealth = await checkElasticsearchHealth(searchClient);
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
      checks: {
        database: await verifyDatabase(server),
        elasticsearch: esHealth.status === "ok" ? "up" : esHealth.status === "unavailable" ? "disabled" : "down"
      }
    };
  });

  server.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  await registerFeedRoutes(server);
  await registerArticleRoutes(server);
  await registerLogRoutes(server);
  await registerSourceRoutes(server);
  await registerSearchRoutes(server);
  await registerSettingsRoutes(server);

  try {
    await server.listen({
      port: config.server.port,
      host: config.server.host
    });
    logger.info(
      { port: config.server.port, host: config.server.host },
      "API server started"
    );
  } catch (error) {
    logger.error(error, "Failed to start API server");
    process.exit(1);
  }
}

void main();

async function verifyDatabase(server: FastifyInstance) {
  try {
    await server.db.$queryRaw(Prisma.sql`SELECT 1`);
    return "up";
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return "down";
  }
}

