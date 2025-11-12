import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    verifyAdmin(
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<FastifyReply | undefined>;
  }
}

type AuthPluginOptions = {
  adminKey: string;
};

async function authPlugin(
  fastify: FastifyInstance,
  options: AuthPluginOptions
) {
  fastify.decorate("verifyAdmin", async function verifyAdmin(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const rawHeader = request.headers["x-api-key"];
    const apiKeyHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (typeof apiKeyHeader !== "string" || apiKeyHeader.length === 0) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Missing API key"
      });
      return reply;
    }

    if (apiKeyHeader !== options.adminKey) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid API key"
      });
      return reply;
    }
  });
}

export default fp(authPlugin, {
  name: "auth"
});

