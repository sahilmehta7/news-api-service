const logError = (error, origin) => {
  if (error instanceof Error) {
    console.error(`[${origin}] ${error.message}\n${error.stack}`);
  } else {
    console.error(`[${origin}]`, error);
  }
};

process.on("uncaughtException", (error) => {
  logError(error, "uncaughtException");
  throw error;
});

process.on("unhandledRejection", (reason) => {
  logError(reason, "unhandledRejection");
  throw reason instanceof Error ? reason : new Error(String(reason));
});


