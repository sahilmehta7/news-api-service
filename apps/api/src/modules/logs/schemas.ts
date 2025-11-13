import { z } from "zod";

export const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  feedId: z.string().uuid().optional(),
  status: z.enum(["running", "success", "failure"]).optional(),
  operation: z.enum(["fetch", "feed_import"]).optional(),
  search: z.string().trim().min(1).max(120).optional()
});

export type LogsQueryInput = z.infer<typeof logsQuerySchema>;

