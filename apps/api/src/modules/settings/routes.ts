import type { FastifyInstance } from "fastify";
import { loadConfig } from "@news-api/config";
import { getSearchSettings } from "./service.js";
import { searchSettingsResponseSchema } from "./schemas.js";

export async function registerSettingsRoutes(app: FastifyInstance) {
  const config = loadConfig();

  app.get(
    "/settings/search",
    {
      preHandler: [app.verifyAdmin]
    },
    async (request, reply) => {
      const settings = await getSearchSettings(app, config);
      return reply.code(200).send(searchSettingsResponseSchema.parse(settings));
    }
  );
}

