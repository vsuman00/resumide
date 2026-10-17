import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";

const [
  { default: express },
  { createRequestHandler },
  { getServerConfig },
  { createSecurityHeaders },
  { getOrCreateRequestId },
  { recordHttpRequest },
] = await Promise.all([
  import("express"),
  import("@react-router/express"),
  import("../app/lib/server/config.ts"),
  import("../app/lib/server/security-headers.ts"),
  import("../app/lib/server/request-context.ts"),
  import("../app/lib/server/observability.ts"),
]);

const config = getServerConfig();
const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const build = await import(
  new URL("../build/server/index.js", import.meta.url)
);
const app = express();

app.disable("x-powered-by");
app.use((request, response, next) => {
  const requestId = getOrCreateRequestId(request.get("X-Request-Id"));
  const startedAt = performance.now();
  response.setHeader("X-Request-Id", requestId);
  response.on("finish", () => {
    recordHttpRequest({
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: performance.now() - startedAt,
      requestId,
    });
  });
  next();
});
function setStaticSecurityHeaders(response) {
  const headers = createSecurityHeaders({
    appOrigin: config.APP_ORIGIN,
    environment: config.NODE_ENV,
    cspMode: config.CSP_MODE,
    cspReportUri: config.CSP_REPORT_URI || undefined,
  });
  for (const [name, value] of headers) response.setHeader(name, value);
}
app.use(
  "/assets",
  express.static(path.join(rootDirectory, "build/client/assets"), {
    immutable: true,
    maxAge: "1y",
    setHeaders: setStaticSecurityHeaders,
  }),
);
app.use(
  express.static(path.join(rootDirectory, "build/client"), {
    setHeaders: setStaticSecurityHeaders,
  }),
);
app.use(
  express.static(path.join(rootDirectory, "public"), {
    maxAge: "1h",
    setHeaders: setStaticSecurityHeaders,
  }),
);
app.all(
  "/{*splat}",
  createRequestHandler({ build, mode: process.env.NODE_ENV }),
);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST;
const server = host
  ? app.listen(port, host, onListen)
  : app.listen(port, onListen);

let shuttingDown = false;

function onListen() {
  console.log(`[resumide] listening on http://${host ?? "localhost"}:${port}`);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[resumide] received ${signal}; draining requests`);

  const deadline = setTimeout(() => {
    console.error("[resumide] graceful shutdown deadline exceeded");
    server.closeAllConnections();
    process.exitCode = 1;
  }, config.SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  server.close((error) => {
    clearTimeout(deadline);
    if (error) {
      console.error("[resumide] server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
