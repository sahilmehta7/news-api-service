import pino, { type LoggerOptions } from "pino";

type CreateLoggerOptions = {
  name?: string;
  level?: string;
};

const defaultOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true
          }
        }
      : undefined
};

export function createLogger(options: CreateLoggerOptions = {}) {
  return pino({
    ...defaultOptions,
    name: options.name ?? "news-api",
    level: options.level ?? defaultOptions.level
  });
}

