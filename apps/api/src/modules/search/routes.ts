import type { FastifyInstance } from "fastify";
import { loadConfig } from "@news-api/config";
import { createElasticsearchClient, checkElasticsearchHealth } from "@news-api/search";
import {
  searchQuerySchema,
  storyListQuerySchema,
  storyDetailQuerySchema
} from "./schemas.js";
import { searchArticles, searchStories, getStoryDetail } from "./service.js";
import { articleListResponseSchema } from "../articles/schemas.js";

export async function registerSearchRoutes(app: FastifyInstance) {
  const config = loadConfig();
  const searchClient = createElasticsearchClient(config);

  app.get(
    "/search",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = searchQuerySchema.parse(request.query);
      const result = await searchArticles(app, query, searchClient, config);
      return articleListResponseSchema.parse(result);
    }
  );

  app.get(
    "/stories",
    {
      preHandler: app.verifyAdmin
    },
    async (request) => {
      const query = storyListQuerySchema.parse(request.query);
      return searchStories(app, query, searchClient, config);
    }
  );

  app.get(
    "/stories/:id",
    {
      preHandler: app.verifyAdmin
    },
    async (request, reply) => {
      const storyId = request.params as { id: string };
      const query = storyDetailQuerySchema.parse(request.query);

      const story = await getStoryDetail(app, storyId.id, query, searchClient, config);

      if (!story) {
        reply.code(404).send({
          error: "NotFound",
          message: `Story ${storyId.id} not found`
        });
        return;
      }

      return story;
    }
  );
}

