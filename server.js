/**
 * Opencode Configurator — yerel web arayüzü sunucusu.
 *
 * Harici bağımlılık YOKTUR; yalnızca Node.js çekirdek modülleri kullanılır.
 * Çalıştırma: node server.js [--port 4517] [--config-dir <klasör>] [--no-open]
 */
"use strict";

const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 18) {
  console.error(`Node.js 18 veya üzeri gerekli (mevcut: ${process.versions.node}).`);
  process.exit(1);
}

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const store = require("./lib/store");
const { MCP_CATALOG, PLUGIN_CATALOG, SKILL_CATALOG } = require("./lib/catalog");
const { collectSkillFiles } = require("./lib/github");
const installer = require("./lib/installer");

const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// ---------------------------------------------------------------------------
// Komut satırı argümanları
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let port = 4517;
let openBrowser = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port") port = parseInt(args[++i], 10) || port;
  else if (args[i] === "--config-dir") store.setCliConfigDir(args[++i]);
  else if (args[i] === "--no-open") openBrowser = false;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100 * 1024 * 1024) {
        const e = new Error("İstek gövdesi çok büyük.");
        e.status = 413;
        reject(e);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        const e = new Error("Geçersiz JSON gövdesi.");
        e.status = 400;
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case "GET /api/state":
      return json(res, 200, {
        configDir: store.getConfigDir(),
        configPath: store.getConfigPath(),
        backupDir: store.getBackupDir(),
        defaultConfigDir: store.defaultConfigDir(),
        skillDir: store.skillWriteDir(),
        mcp: store.listMcp(),
        skills: store.listSkills(),
        plugins: store.listPlugins(),
        mcpCatalog: MCP_CATALOG,
        pluginCatalog: PLUGIN_CATALOG,
        skillCatalog: SKILL_CATALOG,
      });

    case "POST /api/mcp": {
      const body = await readBody(req);
      store.upsertMcp(body.name, body.config);
      return json(res, 200, { ok: true });
    }
    case "POST /api/mcp/toggle": {
      const body = await readBody(req);
      store.setMcpEnabled(body.name, body.enabled);
      return json(res, 200, { ok: true });
    }
    case "POST /api/mcp/delete": {
      const body = await readBody(req);
      store.deleteMcp(body.name);
      return json(res, 200, { ok: true });
    }

    case "GET /api/skill": {
      const name = url.searchParams.get("name") || "";
      return json(res, 200, store.getSkill(name));
    }
    case "POST /api/skill": {
      const body = await readBody(req);
      store.createSkill(body);
      return json(res, 200, { ok: true });
    }
    case "POST /api/skill/update": {
      const body = await readBody(req);
      store.updateSkill(body.name, body);
      return json(res, 200, { ok: true });
    }
    case "POST /api/skill/toggle": {
      const body = await readBody(req);
      store.setSkillEnabled(body.name, body.enabled);
      return json(res, 200, { ok: true });
    }
    case "POST /api/skill/install": {
      const body = await readBody(req);
      const entry = SKILL_CATALOG.find((s) => s.name === body.name);
      if (!entry) {
        const e = new Error("Bu skill katalogda yok.");
        e.status = 404;
        throw e;
      }
      const files = await collectSkillFiles(entry.repo, entry.path, entry.ref);
      const written = store.installSkillFiles(entry.name, files);
      return json(res, 200, { ok: true, files: written });
    }
    case "POST /api/skill/delete": {
      const body = await readBody(req);
      store.deleteSkill(body.name);
      return json(res, 200, { ok: true });
    }

    case "POST /api/plugin": {
      const body = await readBody(req);
      store.addPlugin(body.name);
      return json(res, 200, { ok: true });
    }
    case "POST /api/plugin/toggle": {
      const body = await readBody(req);
      store.setPluginEnabled(body.name, body.kind, body.enabled);
      return json(res, 200, { ok: true });
    }
    case "POST /api/plugin/delete": {
      const body = await readBody(req);
      store.deletePlugin(body.name, body.kind);
      return json(res, 200, { ok: true });
    }

    case "GET /api/export": {
      const data = store.exportAll();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="opencode-export.json"',
      });
      return res.end(JSON.stringify(data, null, 2));
    }
    case "POST /api/import": {
      const body = await readBody(req);
      const report = store.importAll(body.data);
      return json(res, 200, { ok: true, report });
    }

    case "GET /api/opencode":
      return json(res, 200, await installer.fullStatus());

    case "POST /api/opencode/install": {
      const body = await readBody(req);
      if (body.target === "cli") installer.startCliInstall(body.method);
      else if (body.target === "desktop") installer.startDesktopInstall();
      else {
        const e = new Error("Geçersiz kurulum hedefi.");
        e.status = 400;
        throw e;
      }
      return json(res, 200, { ok: true });
    }

    case "POST /api/settings": {
      const body = await readBody(req);
      store.setUserConfigDir(body.configDir || "");
      return json(res, 200, { ok: true, configDir: store.getConfigDir() });
    }

    default:
      return json(res, 404, { error: "Bulunamadı." });
  }
}

// ---------------------------------------------------------------------------
// Statik dosyalar
// ---------------------------------------------------------------------------
function serveStatic(req, res, url) {
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}

// ---------------------------------------------------------------------------
// Sunucu
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || "Bilinmeyen hata." });
  }
});

function openUrl(address) {
  try {
    if (process.platform === "darwin") {
      spawn("open", [address], { stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", address], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [address], { stdio: "ignore", detached: true }).unref();
    }
  } catch {}
}

function listen(tryPort, attempt) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 20) {
      listen(tryPort + 1, attempt + 1);
    } else {
      console.error("Sunucu başlatılamadı:", err.message);
      process.exit(1);
    }
  });
  server.listen(tryPort, "127.0.0.1", () => {
    const address = `http://127.0.0.1:${tryPort}`;
    console.log("");
    console.log(`  Opencode Configurator çalışıyor:  ${address}`);
    console.log(`  Yapılandırma klasörü:             ${store.getConfigDir()}`);
    console.log("  Kapatmak için: Ctrl+C");
    console.log("");
    if (openBrowser) openUrl(address);
  });
}

listen(port, 0);
