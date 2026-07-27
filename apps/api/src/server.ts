import "./load-environment.js";

import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.API_PORT ?? 4000);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(
    { errorType: error instanceof Error ? error.name : "UnknownError" },
    "API startup failed",
  );
  process.exit(1);
}
