/**
 * installer.js — opencode CLI ve Desktop tespiti + kurulumu.
 *
 * Kurulum kaynakları (SOURCES) resmî dokümantasyondan doğrulanmıştır.
 * Tek seferde yalnızca bir kurulum işi çalışır; günlük (log) bellekte tutulur
 * ve arayüz tarafından düzenli aralıklarla çekilir.
 */
"use strict";

const { spawn, execFile } = require("child_process");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ---------------------------------------------------------------------------
// Kurulum kaynakları — araştırmayla doğrulanan değerler bakılarak güncellenir
// ---------------------------------------------------------------------------
const SOURCES = {
  cli: {
    scriptMacLinux: "curl -fsSL https://opencode.ai/install | bash",
    npmPackage: "opencode-ai",
    brewFormula: "opencode",
    wingetId: null,
    scoop: null,
  },
  desktop: {
    // anomalyco/opencode sürümleri; dosya adları sürüm numarası içermediği için
    // "releases/latest/download/<ad>" URL'leri her zaman en son sürümü verir.
    exists: true,
    assets: [
      { platform: "mac-arm64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-mac-arm64.dmg", format: "dmg", assetName: "opencode-desktop-mac-arm64.dmg" },
      { platform: "mac-x64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-mac-x64.dmg", format: "dmg", assetName: "opencode-desktop-mac-x64.dmg" },
      { platform: "win-x64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-win-x64.exe", format: "exe", assetName: "opencode-desktop-win-x64.exe" },
      { platform: "win-arm64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-win-arm64.exe", format: "exe", assetName: "opencode-desktop-win-arm64.exe" },
      { platform: "linux-x64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-linux-x86_64.AppImage", format: "AppImage", assetName: "opencode-desktop-linux-x86_64.AppImage" },
      { platform: "linux-arm64", url: "https://github.com/anomalyco/opencode/releases/latest/download/opencode-desktop-linux-arm64.AppImage", format: "AppImage", assetName: "opencode-desktop-linux-arm64.AppImage" },
    ],
    macAppNames: ["OpenCode.app", "opencode.app", "Opencode.app"],
    winExeGlobs: ["OpenCode", "opencode", "opencode-desktop", "OpenCode Desktop"],
    note: "",
  },
};

const LOG_CAP = 400;
let job = null; // {target, method, status:"running"|"done"|"failed", log:[], exitCode, note}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function execFileP(cmd, args, options = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, ...options }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function appendLog(line) {
  if (!job) return;
  for (const l of String(line).split(/\r?\n/)) {
    const trimmed = l.trimEnd();
    if (trimmed) job.log.push(trimmed);
  }
  if (job.log.length > LOG_CAP) job.log.splice(0, job.log.length - LOG_CAP);
}

// ---------------------------------------------------------------------------
// Tespit
// ---------------------------------------------------------------------------
async function detectCli() {
  const isWin = process.platform === "win32";
  const candidates = [];

  // PATH üzerinde ara
  const which = await execFileP(isWin ? "where" : "which", ["opencode"]);
  if (!which.err) {
    const first = which.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first) candidates.push(first);
  }

  // Bilinen kurulum yolları
  const home = os.homedir();
  const known = isWin
    ? [
        path.join(home, ".opencode", "bin", "opencode.exe"),
        path.join(home, ".opencode", "bin", "opencode.cmd"),
      ]
    : [
        path.join(home, ".opencode", "bin", "opencode"),
        "/opt/homebrew/bin/opencode",
        "/usr/local/bin/opencode",
      ];
  for (const p of known) {
    if (fs.existsSync(p) && !candidates.includes(p)) candidates.push(p);
  }

  for (const bin of candidates) {
    const res = await execFileP(bin, ["--version"]);
    if (!res.err) {
      const version = (res.stdout + res.stderr).split(/\r?\n/)[0].trim();
      return { installed: true, path: bin, version };
    }
  }
  return { installed: false, path: null, version: null };
}

function detectDesktop() {
  if (process.platform === "darwin") {
    for (const appName of SOURCES.desktop.macAppNames) {
      for (const base of ["/Applications", path.join(os.homedir(), "Applications")]) {
        const p = path.join(base, appName);
        if (fs.existsSync(p)) return { installed: true, path: p };
      }
    }
    return { installed: false, path: null };
  }
  if (process.platform === "win32") {
    const bases = [
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Programs"),
      process.env.ProgramFiles || "C:\\Program Files",
    ];
    for (const base of bases) {
      for (const dirName of SOURCES.desktop.winExeGlobs) {
        const p = path.join(base, dirName);
        if (fs.existsSync(p)) return { installed: true, path: p };
      }
    }
    return { installed: false, path: null };
  }
  return { installed: false, path: null };
}

async function environmentInfo() {
  const isWin = process.platform === "win32";
  const hasBrew = !isWin && !(await execFileP("which", ["brew"])).err;
  const hasCurl = isWin || !(await execFileP("which", ["curl"])).err;
  return { hasBrew, hasCurl };
}

function pickDesktopAsset() {
  if (!SOURCES.desktop.exists) return null;
  const { platform, arch } = process;
  let key = null;
  if (platform === "darwin") key = arch === "arm64" ? "mac-arm64" : "mac-x64";
  else if (platform === "win32") key = arch === "arm64" ? "win-arm64" : "win-x64";
  else if (platform === "linux") key = arch === "arm64" ? "linux-arm64" : "linux-x64";
  if (!key) return null;
  return (
    SOURCES.desktop.assets.find((a) => a.platform === key) ||
    (key === "mac-x64" ? SOURCES.desktop.assets.find((a) => a.platform === "mac-arm64") : null) ||
    null
  );
}

async function fullStatus() {
  const [cli, env] = await Promise.all([detectCli(), environmentInfo()]);
  return {
    platform: process.platform,
    arch: process.arch,
    cli,
    desktop: { ...detectDesktop(), available: SOURCES.desktop.exists, note: SOURCES.desktop.note },
    env,
    sources: {
      npmPackage: SOURCES.cli.npmPackage,
      brewFormula: SOURCES.cli.brewFormula,
      script: process.platform === "win32" ? null : SOURCES.cli.scriptMacLinux,
      wingetId: SOURCES.cli.wingetId,
      desktopAsset: pickDesktopAsset(),
    },
    job: job
      ? { target: job.target, method: job.method, status: job.status, note: job.note, exitCode: job.exitCode, log: job.log.slice(-80) }
      : null,
  };
}

// ---------------------------------------------------------------------------
// CLI kurulumu
// ---------------------------------------------------------------------------
function assertNoRunningJob() {
  if (job && job.status === "running") {
    const e = new Error("Zaten devam eden bir kurulum var.");
    e.status = 409;
    throw e;
  }
}

function runShell(commandString) {
  // Sabit (kullanıcı girdisi içermeyen) komut dizeleri için kabuk çalıştırma
  const isWin = process.platform === "win32";
  const child = isWin
    ? spawn("cmd.exe", ["/d", "/s", "/c", commandString], { windowsVerbatimArguments: true })
    : spawn("/bin/bash", ["-lc", commandString]);
  child.stdout.on("data", (d) => appendLog(d));
  child.stderr.on("data", (d) => appendLog(d));
  return child;
}

function startCliInstall(method) {
  assertNoRunningJob();
  const isWin = process.platform === "win32";
  let commandString;
  if (method === "npm") {
    commandString = `npm install -g ${SOURCES.cli.npmPackage}@latest`;
  } else if (method === "brew" && !isWin) {
    commandString = `brew install ${SOURCES.cli.brewFormula}`;
  } else if (method === "script" && !isWin) {
    commandString = SOURCES.cli.scriptMacLinux;
  } else if (method === "winget" && isWin && SOURCES.cli.wingetId) {
    commandString = `winget install --id ${SOURCES.cli.wingetId} -e --accept-source-agreements --accept-package-agreements`;
  } else {
    const e = new Error("Bu platformda desteklenmeyen kurulum yöntemi.");
    e.status = 400;
    throw e;
  }

  job = { target: "cli", method, status: "running", log: [], exitCode: null, note: null };
  appendLog(`$ ${commandString}`);
  const child = runShell(commandString);
  child.on("error", (err) => {
    appendLog("HATA: " + err.message);
    job.status = "failed";
    job.note = err.message;
  });
  child.on("close", async (code) => {
    job.exitCode = code;
    if (code === 0) {
      const cli = await detectCli();
      if (cli.installed) {
        job.status = "done";
        job.note = `Kuruldu: ${cli.version} (${cli.path})`;
      } else {
        job.status = "done";
        job.note =
          "Kurulum tamamlandı fakat 'opencode' henüz PATH üzerinde görünmüyor. " +
          "Yeni bir terminal açman gerekebilir.";
      }
    } else {
      job.status = "failed";
      job.note = `Kurulum ${code} koduyla bitti. Günlüğü incele.`;
    }
  });
}

// ---------------------------------------------------------------------------
// Desktop kurulumu (indir + kurulumu başlat)
// ---------------------------------------------------------------------------
async function downloadTo(url, destPath) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "opencode-configurator" },
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!res.ok || !res.body) throw new Error(`İndirme başarısız (HTTP ${res.status}).`);
  const total = parseInt(res.headers.get("content-length") || "0", 10);
  let received = 0;
  let lastPct = -10;
  const counter = new (require("stream").Transform)({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (total > 0) {
        const pct = Math.floor((received / total) * 100);
        if (pct >= lastPct + 10) {
          lastPct = pct;
          appendLog(`İndiriliyor… %${pct} (${Math.round(received / 1048576)} MB)`);
        }
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(destPath));
  return received;
}

function downloadsDir() {
  const d = path.join(os.homedir(), "Downloads");
  return fs.existsSync(d) ? d : os.tmpdir();
}

function openFile(filePath) {
  if (process.platform === "darwin") {
    spawn("open", [filePath], { stdio: "ignore", detached: true }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", filePath], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [filePath], { stdio: "ignore", detached: true }).unref();
  }
}

function startDesktopInstall() {
  assertNoRunningJob();
  const asset = pickDesktopAsset();
  if (!asset) {
    const e = new Error("Bu platform için masaüstü uygulaması paketi bulunamadı.");
    e.status = 400;
    throw e;
  }
  job = { target: "desktop", method: "download", status: "running", log: [], exitCode: null, note: null };
  appendLog(`İndirme kaynağı: ${asset.url}`);
  const dest = path.join(downloadsDir(), asset.assetName);
  (async () => {
    try {
      const bytes = await downloadTo(asset.url, dest);
      appendLog(`İndirildi: ${dest} (${Math.round(bytes / 1048576)} MB)`);
      if (asset.format === "AppImage") {
        fs.chmodSync(dest, 0o755);
        job.status = "done";
        job.note = `AppImage indirildi ve çalıştırılabilir yapıldı: ${dest}`;
      } else {
        openFile(dest);
        job.status = "done";
        job.note =
          process.platform === "darwin"
            ? "Kurulum dosyası açıldı — uygulamayı Applications klasörüne sürükleyerek kurulumu tamamla."
            : "Kurulum dosyası çalıştırıldı — kurulum sihirbazını tamamla.";
      }
    } catch (err) {
      appendLog("HATA: " + err.message);
      job.status = "failed";
      job.note = err.message;
    }
  })();
}

module.exports = {
  SOURCES,
  fullStatus,
  startCliInstall,
  startDesktopInstall,
  detectCli,
  downloadTo,
};
