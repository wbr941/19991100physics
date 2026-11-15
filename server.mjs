import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 4173);
const useDist = args.includes("--dist");
const siteRoot = resolve(process.cwd(), useDist ? "dist" : ".");
const host = "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
};

function safePath(pathname) {
  const requested = decodeURIComponent(pathname).replace(/^\/+/, "");
  const relative = requested || "index.html";
  const target = resolve(siteRoot, relative);
  if (target !== siteRoot && !target.startsWith(`${siteRoot}${sep}`)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  let target = safePath(url.pathname);

  if (!target) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const targetStat = await stat(target);
    if (targetStat.isDirectory()) target = resolve(target, "index.html");

    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(target).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    try {
      const body = await readFile(resolve(siteRoot, "404.html"));
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  }
});

server.listen(port, host, () => {
  console.log(`19991100 Physics Lab: http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
