import { ensure_uv_threadpool } from "./uv_threadpool.js";

ensure_uv_threadpool();

const { load_config_from_env } = await import("./config.js");
const { create_server } = await import("./server.js");

function listen_port(): number {
  const raw = process.env.PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer 1–65535; got ${JSON.stringify(raw)}`);
  }
  return port;
}

const port = listen_port();
try {
  const config = await load_config_from_env();
  create_server(config).listen(port, "0.0.0.0", () => {
    process.stdout.write(`untangled-auth listening on ${port}\n`);
  });
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "failed to start";
  process.stderr.write(`untangled-auth failed to start: ${message}\n`);
  process.exit(1);
}
