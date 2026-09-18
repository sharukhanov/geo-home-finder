import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ensureSchema } from "./db";

const app = express();
// Railway terminates TLS in front of us, so the client IP arrives in
// X-Forwarded-For. Without this every visitor looks like the proxy and would
// share a single rate-limit bucket.
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

// Baseline hardening. Cheap, and it closes the obvious browser-side attacks:
// framing the site to trick a click, and browsers guessing content types.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(), camera=()");
  next();
});

// Somewhere for the host to check the service is alive without a full page load.
app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  if (process.env.DATABASE_URL) {
    try {
      await ensureSchema();
      log("database schema ready");
    } catch (err) {
      console.error(
        "!!! DATABASE SCHEMA INIT FAILED — the app is running but every save will fail:",
        err,
      );
    }
  } else {
    // Silently serving from memory looks fine until a restart wipes everyone's
    // places, so say it loudly rather than in passing.
    console.warn(
      "!!! DATABASE_URL is not set — storing data IN MEMORY. Everything is lost on restart.",
    );
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log and respond. Re-throwing here used to escape the handler after the
    // response was already sent, which could take the process down — one bad
    // request repeated was effectively a self-inflicted outage.
    console.error("Unhandled request error:", err);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
