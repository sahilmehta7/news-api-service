import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createEmbeddingProvider } from "../../../worker/src/lib/embeddings/index.js";
import type { EmbeddingProvider } from "../../../worker/src/lib/embeddings/provider.js";

declare module "fastify" {
  interface FastifyInstance {
    embeddingProvider: EmbeddingProvider;
  }
}

async function embeddingsPlugin(fastify: FastifyInstance) {
  const embeddingProvider = await createEmbeddingProvider();
  fastify.decorate("embeddingProvider", embeddingProvider);
}

export default fp(embeddingsPlugin, {
  name: "embeddings"
});


