import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".map": "application/json" };
const server = createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const relative = requested === "/"
    ? "index.html"
    : normalize(requested).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  response.setHeader("Cache-Control", "no-store");
  createReadStream(file).pipe(response);
});
server.listen(port, "127.0.0.1", () => console.log(`SU Assistant preview: http://127.0.0.1:${port}`));
