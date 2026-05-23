import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8765;

const repoRoot = path.resolve(__dirname, "..", "..");

const server = http.createServer((req, res) => {
  // Serve files from the fixtures directory, plus /dist/ for the built userscript.
  let filePath;
  if (req.url.startsWith("/dist/")) {
    filePath = path.join(repoRoot, req.url);
  } else {
    filePath = path.join(__dirname, req.url === "/" ? "mock-wme.html" : req.url);
  }

  // Security: prevent directory traversal.
  const realPath = path.resolve(filePath);
  const fixturesDir = path.resolve(__dirname);
  const distDir = path.join(repoRoot, "dist");
  if (!realPath.startsWith(fixturesDir) && !realPath.startsWith(distDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    let contentType = "text/plain";
    if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".js")) contentType = "application/javascript";
    else if (filePath.endsWith(".json")) contentType = "application/json";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Fixture server running on http://localhost:${PORT}`);
});
