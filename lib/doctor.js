/**
 * doctor.js — "Sağlık" kontrolleri: opencode neden çalışmıyor / eklenenler
 * gerçekten çalışıyor mu sorularını yanıtlar.
 *
 * - MCP sunucu testi: yerel sunucularla gerçek MCP el sıkışması yapılır
 *   (JSON-RPC initialize). Bu aynı zamanda npx paketini önceden indirir;
 *   böylece opencode ilk açılışta takılmaz. Uzak sunuculara HTTP ile erişilir.
 * - Plugin kontrolü: npm kayıt defterinde paket doğrulanır; kurulum
 *   gerektiren katalog plugin'leri işaretlenir.
 * - Açılış sınaması: `opencode models` config + plugin'leri yükler; süresi
 *   ve hatası ölçülür (temiz kurulumda ~0,5-2 sn sürer).
 * - Günlük: opencode'un kendi günlük dosyasındaki son hatalar gösterilir.
 */
"use strict";

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("./store");
const installer = require("./installer");
const { PLUGIN_CATALOG } = require("./catalog");

const LOCAL_MCP_TIMEOUT = 90000; // npx ilk indirmesi uzun sürebilir
const REMOTE_MCP_TIMEOUT = 12000;
const STARTUP_TIMEOUT = 90000;

let doctor = { status: "idle", startedAt: null, finishedAt: null, steps: [] };
const mcpResults = {}; // ad -> {status:"ok"|"auth"|"fail", ms, detail, at}
let mcpTestRunning = new Set();

function getState() {
  return { ...doctor, mcpResults };
}

// ---------------------------------------------------------------------------
// MCP sunucu testleri
// ---------------------------------------------------------------------------
function testLocalMcp(cfg) {
  return new Promise((resolve) => {
    const [cmd, ...args] = Array.isArray(cfg.command) ? cfg.command : [];
    if (!cmd) return resolve({ status: "fail", ms: 0, detail: "Komut boş." });
    const t0 = Date.now();
    let child;
    try {
      child = spawn(cmd, args, {
        env: { ...process.env, ...(cfg.environment || {}) },
        windowsHide: true,
        shell: process.platform === "win32", // npx.cmd için gerekli
      });
    } catch (e) {
      return resolve({ status: "fail", ms: 0, detail: e.message });
    }
    let out = "";
    let errbuf = "";
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      resolve({ ms: Date.now() - t0, ...r });
    };
    const timer = setTimeout(
      () => finish({ status: "fail", detail: ("Zaman aşımı — sunucu yanıt vermedi. " + errbuf.slice(-200)).trim() }),
      LOCAL_MCP_TIMEOUT
    );
    child.on("error", (e) =>
      finish({ status: "fail", detail: e.code === "ENOENT" ? `Komut bulunamadı: ${cmd}` : e.message })
    );
    child.on("exit", (code) => {
      if (!done) finish({ status: "fail", detail: (`Süreç ${code} koduyla erken kapandı. ` + errbuf.slice(-200)).trim() });
    });
    child.stderr.on("data", (d) => { errbuf += d; });
    child.stdout.on("data", (d) => {
      out += d;
      for (const line of out.split("\n")) {
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg && msg.id === 1) {
          if (msg.result) {
            const name = msg.result.serverInfo && msg.result.serverInfo.name;
            finish({ status: "ok", detail: name ? `Yanıt verdi: ${name}` : "MCP el sıkışması başarılı." });
          } else {
            finish({ status: "fail", detail: "initialize hatası: " + JSON.stringify(msg.error).slice(0, 150) });
          }
          return;
        }
      }
    });
    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "opencode-configurator", version: "1.0.0" },
      },
    };
    try { child.stdin.write(JSON.stringify(req) + "\n"); } catch {}
  });
}

async function testRemoteMcp(cfg) {
  const t0 = Date.now();
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(cfg.headers || {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "opencode-configurator", version: "1.0.0" } },
      }),
      signal: AbortSignal.timeout(REMOTE_MCP_TIMEOUT),
    });
    const ms = Date.now() - t0;
    if (res.status === 401 || res.status === 403) {
      return { status: "auth", ms, detail: `Erişilebilir (HTTP ${res.status}) — OAuth girişi opencode içinde yapılır.` };
    }
    if (res.ok) return { status: "ok", ms, detail: `Yanıt verdi (HTTP ${res.status}).` };
    return { status: "fail", ms, detail: `HTTP ${res.status}` };
  } catch (e) {
    const detail =
      e.name === "TimeoutError"
        ? "Zaman aşımı — sunucuya ulaşılamıyor."
        : (e.cause && e.cause.code) || e.message;
    return { status: "fail", ms: Date.now() - t0, detail };
  }
}

async function testMcpServer(name) {
  if (mcpTestRunning.has(name)) {
    const e = new Error(`"${name}" testi zaten sürüyor.`);
    e.status = 409;
    throw e;
  }
  const entry = store.listMcp().find((m) => m.name === name);
  if (!entry) {
    const e = new Error(`"${name}" adlı MCP sunucusu bulunamadı.`);
    e.status = 404;
    throw e;
  }
  mcpTestRunning.add(name);
  mcpResults[name] = { status: "running", ms: null, detail: "Test ediliyor…", at: Date.now() };
  try {
    const cfg = entry.config || {};
    const result = cfg.type === "remote" ? await testRemoteMcp(cfg) : await testLocalMcp(cfg);
    mcpResults[name] = { ...result, at: Date.now() };
    return mcpResults[name];
  } finally {
    mcpTestRunning.delete(name);
  }
}

// ---------------------------------------------------------------------------
// Plugin kontrolü
// ---------------------------------------------------------------------------
function pluginBase(spec) {
  if (spec.startsWith("@")) {
    const i = spec.indexOf("@", 1);
    return i === -1 ? spec : spec.slice(0, i);
  }
  const i = spec.indexOf("@");
  return i === -1 ? spec : spec.slice(0, i);
}

function isPathSpec(spec) {
  return /^(\.|\/|~|file:|[A-Za-z]:[\\/])/.test(spec);
}

async function npmPackageExists(base) {
  const url = `https://registry.npmjs.org/${base.startsWith("@") ? "@" + encodeURIComponent(base.slice(1)).replace("%2F", "/") : encodeURIComponent(base)}/latest`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (res.status === 404) return { exists: false };
  if (!res.ok) return { exists: null, note: `kayıt defteri yanıtı: HTTP ${res.status}` };
  const data = await res.json();
  return { exists: true, version: data.version, deprecated: !!data.deprecated };
}

async function checkPlugin(spec) {
  if (isPathSpec(spec)) {
    return { spec, status: "ok", detail: "Yerel dosya/yol (opencode çözer)." };
  }
  const base = pluginBase(spec);
  try {
    const reg = await npmPackageExists(base);
    if (reg.exists === false) return { spec, status: "fail", detail: "npm'de böyle bir paket yok — opencode açılışta kurmayı deneyip yavaşlar." };
    if (reg.deprecated) return { spec, status: "warn", detail: "Paket npm'de kullanımdan kaldırılmış (deprecated)." };
    const cat = PLUGIN_CATALOG.find((p) => p.npm === base);
    if (cat && cat.requires) return { spec, status: "warn", detail: "Kurulum/hesap gerektirir: " + cat.requires };
    return { spec, status: "ok", detail: `npm'de mevcut (v${reg.version}).` };
  } catch {
    return { spec, status: "warn", detail: "npm kayıt defterine ulaşılamadı; doğrulanamadı." };
  }
}

// ---------------------------------------------------------------------------
// Açılış sınaması ve opencode günlüğü
// ---------------------------------------------------------------------------
function probeStartup(bin, configDir) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile(
      bin,
      ["models"],
      {
        timeout: STARTUP_TIMEOUT,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, OPENCODE_CONFIG_DIR: configDir },
      },
      (err, _stdout, stderr) => {
        const ms = Date.now() - t0;
        if (err && err.killed) {
          return resolve({ ok: false, ms, detail: `Zaman aşımı (${STARTUP_TIMEOUT / 1000} sn) — açılış tamamlanamıyor.` });
        }
        if (err) {
          return resolve({ ok: false, ms, detail: String(stderr || err.message).trim().split("\n").slice(-3).join(" ").slice(0, 300) });
        }
        resolve({ ok: true, ms, detail: "" });
      }
    );
  });
}

function opencodeLogTail() {
  const candidates = [
    path.join(os.homedir(), ".local", "share", "opencode", "log"),
    path.join(os.homedir(), ".local", "state", "opencode", "log"),
  ];
  for (const dir of candidates) {
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".log"));
    } catch {
      continue;
    }
    if (files.length === 0) continue;
    const newest = files
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f;
    const content = fs.readFileSync(path.join(dir, newest), "utf8");
    const lines = content.trim().split("\n");
    const errors = lines.filter((l) => /level=(ERROR|WARN)/.test(l)).slice(-5);
    return { file: path.join(dir, newest), errors };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tam kontrol
// ---------------------------------------------------------------------------
function addStep(id, label) {
  const s = { id, label, status: "running", detail: "", ms: null };
  doctor.steps.push(s);
  return s;
}

async function runDoctor() {
  if (doctor.status === "running") {
    const e = new Error("Sağlık kontrolü zaten sürüyor.");
    e.status = 409;
    throw e;
  }
  doctor = { status: "running", startedAt: Date.now(), finishedAt: null, steps: [] };
  runDoctorInner().catch((err) => {
    const s = addStep("internal", "Beklenmeyen hata");
    s.status = "fail";
    s.detail = err.message;
  }).finally(() => {
    doctor.status = "done";
    doctor.finishedAt = Date.now();
  });
}

async function runDoctorInner() {
  // 1) CLI
  let s = addStep("cli", "Opencode CLI");
  const cli = await installer.detectCli(true);
  if (cli.installed) {
    s.status = "ok";
    s.detail = `${cli.version} — ${cli.path}`;
  } else {
    s.status = "warn";
    s.detail = "CLI bulunamadı; açılış sınaması atlanacak. (Desktop kuruluysa da CLI önerilir.)";
  }

  // 2) Yapılandırma dosyası
  s = addStep("config", "Yapılandırma dosyası (opencode.json)");
  let config = null;
  try {
    config = store.readConfigForDoctor();
    s.status = "ok";
    s.detail = store.getConfigPath();
  } catch (err) {
    s.status = "fail";
    s.detail = err.message;
  }

  // 3) Plugin'ler
  const plugins = store.listPlugins().filter((p) => p.enabled);
  s = addStep("plugins", `Plugin'ler (${plugins.length})`);
  if (plugins.length === 0) {
    s.status = "ok";
    s.detail = "Etkin plugin yok.";
  } else {
    const checks = await Promise.all(plugins.map((p) => checkPlugin(p.name)));
    const bad = checks.filter((c) => c.status === "fail");
    const warns = checks.filter((c) => c.status === "warn");
    const parts = checks.map((c) => `${c.spec}: ${c.detail}`);
    // Bilinen çakışma: iki orkestrasyon paketi birlikte
    const bases = plugins.map((p) => pluginBase(p.name));
    if (bases.includes("oh-my-opencode") && bases.includes("oh-my-opencode-slim")) {
      warns.push({});
      parts.push("oh-my-opencode + oh-my-opencode-slim birlikte etkin — çakışabilir, birini kapat.");
    }
    s.status = bad.length ? "fail" : warns.length ? "warn" : "ok";
    s.detail = parts.join("\n");
  }

  // 4) MCP sunucuları (yalnızca etkin olanlar; 3'erli paralel)
  const servers = store.listMcp().filter((m) => m.enabled);
  s = addStep("mcp", `MCP sunucuları (${servers.length})`);
  if (servers.length === 0) {
    s.status = "ok";
    s.detail = "Etkin MCP sunucusu yok.";
  } else {
    const queue = [...servers];
    const results = [];
    async function worker() {
      while (queue.length) {
        const entry = queue.shift();
        try {
          const r = await testMcpServer(entry.name);
          results.push(`${entry.name}: ${r.status === "ok" ? "✓" : r.status === "auth" ? "◐" : "✗"} ${r.detail} (${Math.round(r.ms / 1000)} sn)`);
        } catch (err) {
          results.push(`${entry.name}: test edilemedi (${err.message})`);
        }
        s.detail = results.join("\n");
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    const anyFail = servers.some((sv) => (mcpResults[sv.name] || {}).status === "fail");
    s.status = anyFail ? "fail" : "ok";
  }

  // 5) Açılış sınaması
  s = addStep("startup", "Opencode açılış sınaması (opencode models)");
  if (!cli.installed) {
    s.status = "warn";
    s.detail = "CLI olmadığı için atlandı.";
  } else {
    const probe = await probeStartup(cli.path, store.getConfigDir());
    s.ms = probe.ms;
    if (!probe.ok) {
      s.status = "fail";
      s.detail = probe.detail;
    } else if (probe.ms > 20000) {
      s.status = "warn";
      s.detail = `Açılış ${Math.round(probe.ms / 1000)} sn sürdü — bir plugin ilk kurulumda ya da sorunlu olabilir. (Temiz kurulum ~1-2 sn.)`;
    } else {
      s.status = "ok";
      s.detail = `${probe.ms} ms — normal.`;
    }
  }

  // 6) Opencode günlüğü
  s = addStep("log", "Opencode günlüğü");
  const log = opencodeLogTail();
  if (!log) {
    s.status = "ok";
    s.detail = "Günlük dosyası bulunamadı (opencode bu makinede hiç çalışmamış olabilir).";
  } else if (log.errors.length === 0) {
    s.status = "ok";
    s.detail = `Hata kaydı yok (${log.file}).`;
  } else {
    s.status = "warn";
    s.detail = log.errors.join("\n").slice(0, 800);
  }
}

module.exports = { getState, runDoctor, testMcpServer, checkPlugin, pluginBase, isPathSpec, npmPackageExists };
