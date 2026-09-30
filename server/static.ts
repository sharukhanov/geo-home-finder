// Serving the built client, and the log helper.
//
// Deliberately free of any dependency on vite: this module is what production
// loads. The dev-server half lives in ./vite.ts, which imports the vite
// package and is only reachable in development — importing the two together
// made the production bundle require a build tool that the image had pruned,
// and the container died on start.

import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));

  // Social crawlers ignore a relative og:image, and the deployed hostname is
  // not known at build time (it has already changed once), so the absolute URL
  // is filled in per request from the host we were actually reached on.
  const template = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

  app.use("*", (req, res) => {
    const proto = req.protocol === "https" ? "https" : "http";
    const host = req.get("host");
    const html = host
      ? template.replaceAll('content="/og.png"', `content="${proto}://${host}/og.png"`)
      : template;
    res.type("html").send(html);
  });
}
