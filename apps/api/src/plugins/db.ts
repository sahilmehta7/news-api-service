import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import {
  prisma,
  disconnectPrisma,
  type PrismaClientType
} from "@news-api/db";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClientType;
  }
}

async function dbPlugin(fastify: FastifyInstance) {
  fastify.decorate("db", prisma);

  fastify.addHook("onClose", async () => {
    await disconnectPrisma();
  });
}

export default fp(dbPlugin, {
  name: "db"
});

