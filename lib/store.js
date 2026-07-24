/**
 * store.js — opencode yapılandırmasının diskteki tüm okuma/yazma işlemleri.
 *
 * Platformdan bağımsızdır: yol birleştirmede daima path.join kullanılır,
 * hiçbir harici bağımlılık yoktur (yalnızca Node çekirdek modülleri).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const SETTINGS_FILE = path.join(__dirname, "..", "configurator-settings.json");
const BACKUP_DIRNAME = "configurator-backups";
const STATE_FILENAME = "configurator-state.json"; // devre dışı plugin listesi burada tutulur
const MAX_BACKUPS = 25;
const MAX_EXPORT_FILE_BYTES = 1024 * 1024; // skill başına dosya sınırı (1 MB)

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let cliConfigDir = null; // --config-dir bayrağı (test ve gelişmiş kullanım)

// ---------------------------------------------------------------------------
// Yol çözümleme
// ---------------------------------------------------------------------------

function defaultConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "opencode");
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

function setCliConfigDir(dir) {
  cliConfigDir = dir ? path.resolve(dir) : null;
}

function setUserConfigDir(dir) {
  const settings = loadSettings();
  if (dir && dir.trim()) {
    settings.configDir = path.resolve(expandHome(dir.trim()));
  } else {
    delete settings.configDir;
  }
  saveSettings(settings);
}

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function getConfigDir() {
  if (cliConfigDir) return cliConfigDir;
  const settings = loadSettings();
  if (settings.configDir) return settings.configDir;
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (envDir && envDir.trim()) return path.resolve(envDir.trim());
  return defaultConfigDir();
}

function getConfigPath() {
  return path.join(getConfigDir(), "opencode.json");
}

function getBackupDir() {
  return path.join(getConfigDir(), BACKUP_DIRNAME);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// JSONC-toleranslı ayrıştırma (opencode.json içinde yorum/virgül kalıntısı olabilir)
// ---------------------------------------------------------------------------

function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") { out += next ?? ""; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { inLine = true; continue; }
    if (c === "/" && next === "*") { inBlock = true; i++; continue; }
    out += c;
  }
  // sondaki virgülleri temizle:  ,}  veya  ,]
  return out.replace(/,\s*([}\]])/g, "$1");
}

function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(stripJsonComments(text));
  }
}

// ---------------------------------------------------------------------------
// opencode.json okuma / yazma / yedekleme
// ---------------------------------------------------------------------------

function readConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) {
    return { $schema: "https://opencode.ai/config.json" };
  }
  const raw = fs.readFileSync(p, "utf8");
  if (!raw.trim()) return { $schema: "https://opencode.ai/config.json" };
  try {
    return parseJsonc(raw);
  } catch (err) {
    const e = new Error(
      `opencode.json ayrıştırılamadı (${p}): ${err.message}. ` +
      `Dosyayı elle düzeltmeden bu araç değişiklik yapmayacak.`
    );
    e.status = 500;
    throw e;
  }
}

function backupFile(srcPath, prefix) {
  if (!fs.existsSync(srcPath)) return null;
  const backupDir = getBackupDir();
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `${prefix}-${stamp}${path.extname(srcPath) || ".json"}`);
  fs.copyFileSync(srcPath, dest);
  pruneBackups();
  return dest;
}

function pruneBackups() {
  const backupDir = getBackupDir();
  let entries;
  try {
    entries = fs.readdirSync(backupDir, { withFileTypes: true });
  } catch {
    return;
  }
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort(); // ISO zaman damgalı isimler => alfabetik sıralama kronolojiktir
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift();
    try { fs.rmSync(path.join(backupDir, oldest)); } catch {}
  }
}

function writeConfig(config) {
  const p = getConfigPath();
  ensureDir(getConfigDir());
  backupFile(p, "opencode");
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Yardımcı durum dosyası (devre dışı npm plugin'leri hatırlamak için)
// ---------------------------------------------------------------------------

function readState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(getConfigDir(), STATE_FILENAME), "utf8"));
  } catch {
    return { disabledPlugins: [] };
  }
}

function writeState(state) {
  ensureDir(getConfigDir());
  fs.writeFileSync(
    path.join(getConfigDir(), STATE_FILENAME),
    JSON.stringify(state, null, 2) + "\n"
  );
}

// ---------------------------------------------------------------------------
// MCP sunucuları
// ---------------------------------------------------------------------------

function assertMcpName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    const e = new Error("Geçersiz sunucu adı: sadece harf, rakam, tire ve alt çizgi kullanılabilir.");
    e.status = 400;
    throw e;
  }
}

function listMcp() {
  const config = readConfig();
  const mcp = config.mcp && typeof config.mcp === "object" ? config.mcp : {};
  return Object.entries(mcp).map(([name, cfg]) => ({
    name,
    config: cfg,
    enabled: cfg && cfg.enabled !== false,
  }));
}

function upsertMcp(name, cfg) {
  assertMcpName(name);
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    const e = new Error("Geçersiz sunucu yapılandırması.");
    e.status = 400;
    throw e;
  }
  const config = readConfig();
  if (!config.mcp || typeof config.mcp !== "object") config.mcp = {};
  config.mcp[name] = cfg;
  writeConfig(config);
}

function setMcpEnabled(name, enabled) {
  assertMcpName(name);
  const config = readConfig();
  if (!config.mcp || !config.mcp[name]) {
    const e = new Error(`"${name}" adlı MCP sunucusu bulunamadı.`);
    e.status = 404;
    throw e;
  }
  config.mcp[name].enabled = !!enabled;
  writeConfig(config);
}

function deleteMcp(name) {
  assertMcpName(name);
  const config = readConfig();
  if (!config.mcp || !config.mcp[name]) {
    const e = new Error(`"${name}" adlı MCP sunucusu bulunamadı.`);
    e.status = 404;
    throw e;
  }
  delete config.mcp[name];
  writeConfig(config);
}

// ---------------------------------------------------------------------------
// Skill'ler
// ---------------------------------------------------------------------------
// Bir skill = <skillDir>/<ad>/SKILL.md
// Devre dışı bırakma: opencode.json -> permission.skill["<ad>"] = "deny"
// (opencode'un yerleşik mekanizması; skill dosyaları yerinde kalır)

let SKILL_DIRNAMES = ["skills", "skill"]; // "skills" resmî ad; "skill" eski kurulumlarla uyumluluk
let CANONICAL_SKILL_DIRNAME = "skills";    // yeni skill'lerin yazılacağı klasör

function setSkillDirnames(readNames, canonical) {
  SKILL_DIRNAMES = readNames;
  CANONICAL_SKILL_DIRNAME = canonical;
}

function skillReadDirs() {
  const base = getConfigDir();
  const dirs = [];
  for (const dirname of SKILL_DIRNAMES) {
    const p = path.join(base, dirname);
    if (fs.existsSync(p)) dirs.push(p);
  }
  return dirs;
}

function skillWriteDir() {
  const existing = skillReadDirs();
  if (existing.length > 0) return existing[0];
  return path.join(getConfigDir(), CANONICAL_SKILL_DIRNAME);
}

function assertSkillName(name) {
  if (typeof name !== "string" || !SKILL_NAME_RE.test(name) || name.length > 80) {
    const e = new Error(
      "Geçersiz skill adı: küçük harf ve rakamlardan oluşmalı, kelimeler tire ile ayrılmalı (örn. pdf-isleme)."
    );
    e.status = 400;
    throw e;
  }
}

function parseFrontmatter(raw) {
  // Yalnızca ihtiyacımız olan kadar basit YAML: tek satırlık "anahtar: değer" çiftleri
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fields: {}, fmRaw: null, body: raw };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return { fields, fmRaw: m[1], body: raw.slice(m[0].length) };
}

function buildSkillMd(name, description, body) {
  const desc = String(description || "").replace(/\r?\n/g, " ").trim();
  return `---\nname: ${name}\ndescription: ${desc}\n---\n\n${String(body || "").replace(/^\s+/, "")}`;
}

function rebuildSkillMd(name, description, body, fmRaw) {
  if (!fmRaw) return buildSkillMd(name, description, body);
  const desc = String(description || "").replace(/\r?\n/g, " ").trim();
  const lines = fmRaw.split(/\r?\n/);
  const outLines = [];
  let hasName = false;
  let replacedDesc = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^description\s*:/.test(line)) {
      outLines.push(`description: ${desc}`);
      replacedDesc = true;
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++; // çok satırlı açıklamanın devamını atla
    } else {
      if (/^name\s*:/.test(line)) hasName = true;
      outLines.push(line);
    }
  }
  if (!replacedDesc) outLines.unshift(`description: ${desc}`);
  if (!hasName) outLines.unshift(`name: ${name}`);
  return `---\n${outLines.join("\n")}\n---\n\n${String(body || "").replace(/^\s+/, "")}`;
}

// --- opencode'un yerleşik skill izin mekanizması (permission.skill) ---

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function skillPermissionMap(config) {
  if (
    config.permission && typeof config.permission === "object" &&
    config.permission.skill && typeof config.permission.skill === "object"
  ) {
    return config.permission.skill;
  }
  return null;
}

function skillPermissionValue(config, name) {
  const map = skillPermissionMap(config);
  if (!map) return "allow";
  if (typeof map[name] === "string") return map[name];
  let best = null;
  for (const [pattern, value] of Object.entries(map)) {
    if (typeof value !== "string" || !pattern.includes("*")) continue;
    if (globToRegex(pattern).test(name) && (!best || pattern.length > best.pattern.length)) {
      best = { pattern, value };
    }
  }
  return best ? best.value : "allow";
}

function setSkillPermission(config, name, value) {
  if (value === null) {
    const map = skillPermissionMap(config);
    if (map) {
      delete map[name];
      if (Object.keys(map).length === 0) delete config.permission.skill;
      if (config.permission && Object.keys(config.permission).length === 0) delete config.permission;
    }
    return;
  }
  if (!config.permission || typeof config.permission !== "object") config.permission = {};
  if (!config.permission.skill || typeof config.permission.skill !== "object") config.permission.skill = {};
  config.permission.skill[name] = value;
}

function resolveEnableValue(config, name) {
  // Girdiyi silince joker bir desen (örn. "deneme-*": "deny") skill'i yine
  // engelleyecekse açıkça "allow" yaz; aksi halde girdiyi tamamen kaldır.
  const clone = JSON.parse(JSON.stringify(config));
  setSkillPermission(clone, name, null);
  return skillPermissionValue(clone, name) === "deny" ? "allow" : null;
}

function findSkill(name) {
  for (const dir of skillReadDirs()) {
    const skillDir = path.join(dir, name);
    const active = path.join(skillDir, "SKILL.md");
    const disabled = path.join(skillDir, "SKILL.md.disabled");
    if (fs.existsSync(active)) return { skillDir, file: active, fileEnabled: true };
    if (fs.existsSync(disabled)) return { skillDir, file: disabled, fileEnabled: false };
  }
  return null;
}

function listSkills() {
  const out = [];
  const seen = new Set();
  let config = {};
  try { config = readConfig(); } catch {}
  for (const dir of skillReadDirs()) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      const active = path.join(dir, entry.name, "SKILL.md");
      const disabled = path.join(dir, entry.name, "SKILL.md.disabled");
      let file = null;
      let enabled = true;
      if (fs.existsSync(active)) {
        file = active;
      } else if (fs.existsSync(disabled)) {
        file = disabled;
        enabled = false;
      } else {
        continue;
      }
      if (enabled) enabled = skillPermissionValue(config, entry.name) !== "deny";
      seen.add(entry.name);
      let description = "";
      try {
        const { fields } = parseFrontmatter(fs.readFileSync(file, "utf8"));
        description = fields.description || "";
      } catch {}
      out.push({ name: entry.name, description, enabled, dir });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function createSkill({ name, description, content }) {
  assertSkillName(name);
  if (findSkill(name)) {
    const e = new Error(`"${name}" adlı bir skill zaten var.`);
    e.status = 409;
    throw e;
  }
  const dir = path.join(skillWriteDir(), name);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "SKILL.md"), buildSkillMd(name, description, content));
}

function installSkillFiles(name, filesMap) {
  assertSkillName(name);
  if (findSkill(name)) {
    const e = new Error(`"${name}" adlı bir skill zaten var.`);
    e.status = 409;
    throw e;
  }
  if (!filesMap["SKILL.md"]) {
    const e = new Error("İndirilen klasörde SKILL.md yok; kurulum iptal edildi.");
    e.status = 400;
    throw e;
  }
  const dir = path.join(skillWriteDir(), name);
  let written = 0;
  for (const [rel, buf] of Object.entries(filesMap)) {
    const segments = sanitizeRelPath(rel);
    if (!segments || buf.length > MAX_EXPORT_FILE_BYTES) continue;
    const target = path.join(dir, ...segments);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, buf);
    written++;
  }
  return written;
}

function getSkill(name) {
  assertSkillName(name);
  const found = findSkill(name);
  if (!found) {
    const e = new Error(`"${name}" adlı skill bulunamadı.`);
    e.status = 404;
    throw e;
  }
  const raw = fs.readFileSync(found.file, "utf8");
  const { fields, body } = parseFrontmatter(raw);
  return {
    name,
    description: fields.description || "",
    body: body.replace(/^\s*\n/, ""),
    enabled: found.fileEnabled && skillPermissionValue(readConfig(), name) !== "deny",
  };
}

function updateSkill(name, { description, content }) {
  assertSkillName(name);
  const found = findSkill(name);
  if (!found) {
    const e = new Error(`"${name}" adlı skill bulunamadı.`);
    e.status = 404;
    throw e;
  }
  backupFile(found.file, `skill-${name}`);
  const { fmRaw } = parseFrontmatter(fs.readFileSync(found.file, "utf8"));
  fs.writeFileSync(found.file, rebuildSkillMd(name, description, content, fmRaw));
}

function setSkillEnabled(name, enabled) {
  assertSkillName(name);
  const found = findSkill(name);
  if (!found) {
    const e = new Error(`"${name}" adlı skill bulunamadı.`);
    e.status = 404;
    throw e;
  }
  // Dosya (eski sürüm ya da elle) .disabled yapılmışsa etkinleştirirken geri adlandır
  if (enabled && !found.fileEnabled) {
    fs.renameSync(found.file, path.join(found.skillDir, "SKILL.md"));
  }
  const config = readConfig();
  setSkillPermission(config, name, enabled ? resolveEnableValue(config, name) : "deny");
  writeConfig(config);
}

function deleteSkill(name) {
  assertSkillName(name);
  const found = findSkill(name);
  if (!found) {
    const e = new Error(`"${name}" adlı skill bulunamadı.`);
    e.status = 404;
    throw e;
  }
  // Kalıcı silme yerine yedek klasörüne taşı
  const backupDir = getBackupDir();
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `skill-${name}-${stamp}`);
  fs.renameSync(found.skillDir, dest);
  // opencode.json içinde bu skill'e ait izin girdisi kaldıysa temizle
  const config = readConfig();
  if (skillPermissionMap(config) && name in skillPermissionMap(config)) {
    setSkillPermission(config, name, null);
    writeConfig(config);
  }
}

// ---------------------------------------------------------------------------
// Plugin'ler
// ---------------------------------------------------------------------------
// İki tür: npm girdileri (opencode.json içindeki "plugin" dizisi)
//          dosya plugin'leri (<configDir>/plugin/*.js|*.ts)

function pluginFileDir() {
  const base = getConfigDir();
  const plural = path.join(base, "plugins");  // resmî klasör adı
  const singular = path.join(base, "plugin"); // eski kurulumlarla uyumluluk
  if (fs.existsSync(plural)) return plural;
  if (fs.existsSync(singular)) return singular;
  return plural;
}

function assertPluginName(name) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 300 ||
    /[\0\n\r]/.test(name)
  ) {
    const e = new Error("Geçersiz plugin adı.");
    e.status = 400;
    throw e;
  }
  return name.trim();
}

function listPlugins() {
  const config = readConfig();
  const state = readState();
  const enabledNpm = Array.isArray(config.plugin) ? config.plugin : [];
  const disabledNpm = Array.isArray(state.disabledPlugins) ? state.disabledPlugins : [];

  const out = [];
  for (const name of enabledNpm) out.push({ name, kind: "npm", enabled: true });
  for (const name of disabledNpm) {
    if (!enabledNpm.includes(name)) out.push({ name, kind: "npm", enabled: false });
  }

  // dosya plugin'leri
  let entries = [];
  try {
    entries = fs.readdirSync(pluginFileDir(), { withFileTypes: true });
  } catch {}
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(js|ts)$/.test(entry.name)) {
      out.push({ name: entry.name, kind: "file", enabled: true });
    } else if (/\.(js|ts)\.disabled$/.test(entry.name)) {
      out.push({ name: entry.name.replace(/\.disabled$/, ""), kind: "file", enabled: false });
    }
  }
  return out;
}

function addPlugin(rawName) {
  const name = assertPluginName(rawName);
  const config = readConfig();
  if (!Array.isArray(config.plugin)) config.plugin = [];
  if (config.plugin.includes(name)) {
    const e = new Error(`"${name}" zaten ekli.`);
    e.status = 409;
    throw e;
  }
  config.plugin.push(name);
  writeConfig(config);
  // devre dışı listesinde kaldıysa temizle
  const state = readState();
  state.disabledPlugins = (state.disabledPlugins || []).filter((n) => n !== name);
  writeState(state);
}

function setPluginEnabled(rawName, kind, enabled) {
  const name = assertPluginName(rawName);
  if (kind === "file") {
    const active = path.join(pluginFileDir(), name);
    const disabled = active + ".disabled";
    if (enabled && fs.existsSync(disabled)) fs.renameSync(disabled, active);
    else if (!enabled && fs.existsSync(active)) fs.renameSync(active, disabled);
    return;
  }
  const config = readConfig();
  const state = readState();
  if (!Array.isArray(config.plugin)) config.plugin = [];
  state.disabledPlugins = state.disabledPlugins || [];
  if (enabled) {
    if (!config.plugin.includes(name)) config.plugin.push(name);
    state.disabledPlugins = state.disabledPlugins.filter((n) => n !== name);
  } else {
    config.plugin = config.plugin.filter((n) => n !== name);
    if (!state.disabledPlugins.includes(name)) state.disabledPlugins.push(name);
  }
  writeConfig(config);
  writeState(state);
}

function deletePlugin(rawName, kind) {
  const name = assertPluginName(rawName);
  if (kind === "file") {
    const backupDir = getBackupDir();
    ensureDir(backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const candidate of [
      path.join(pluginFileDir(), name),
      path.join(pluginFileDir(), name + ".disabled"),
    ]) {
      if (fs.existsSync(candidate)) {
        fs.renameSync(candidate, path.join(backupDir, `plugin-${stamp}-${path.basename(candidate)}`));
        return;
      }
    }
    const e = new Error(`"${name}" adlı plugin dosyası bulunamadı.`);
    e.status = 404;
    throw e;
  }
  const config = readConfig();
  const state = readState();
  config.plugin = (Array.isArray(config.plugin) ? config.plugin : []).filter((n) => n !== name);
  state.disabledPlugins = (state.disabledPlugins || []).filter((n) => n !== name);
  writeConfig(config);
  writeState(state);
}

// ---------------------------------------------------------------------------
// Dışa / içe aktarma
// ---------------------------------------------------------------------------

function walkFiles(baseDir, relDir = "", depth = 0, acc = []) {
  if (depth > 4) return acc;
  const abs = path.join(baseDir, relDir);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = relDir ? relDir + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      walkFiles(baseDir, rel, depth + 1, acc);
    } else if (entry.isFile()) {
      const size = fs.statSync(path.join(baseDir, rel)).size;
      if (size <= MAX_EXPORT_FILE_BYTES) acc.push(rel);
    }
  }
  return acc;
}

function exportAll() {
  const config = readConfig();
  const state = readState();

  const skills = {};
  for (const skill of listSkills()) {
    const skillDir = path.join(skill.dir, skill.name);
    const files = {};
    for (const rel of walkFiles(skillDir)) {
      const content = fs.readFileSync(path.join(skillDir, rel));
      // Devre dışı skill'i dışa aktarırken dosya adını normalleştir
      const exportRel = rel === "SKILL.md.disabled" ? "SKILL.md" : rel;
      files[exportRel] = content.toString("base64");
    }
    skills[skill.name] = { enabled: skill.enabled, files };
  }

  const pluginFiles = {};
  for (const plugin of listPlugins()) {
    if (plugin.kind !== "file") continue;
    const actual = plugin.enabled ? plugin.name : plugin.name + ".disabled";
    try {
      const content = fs.readFileSync(path.join(pluginFileDir(), actual));
      pluginFiles[plugin.name] = {
        enabled: plugin.enabled,
        content: content.toString("base64"),
      };
    } catch {}
  }

  return {
    kind: "opencode-configurator-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    mcp: config.mcp && typeof config.mcp === "object" ? config.mcp : {},
    plugin: {
      enabled: Array.isArray(config.plugin) ? config.plugin : [],
      disabled: Array.isArray(state.disabledPlugins) ? state.disabledPlugins : [],
    },
    pluginFiles,
    skills,
  };
}

function sanitizeRelPath(rel) {
  if (typeof rel !== "string" || !rel.trim()) return null;
  const segments = rel.split(/[/\\]+/);
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      /[\0:<>|?*]/.test(segment) ||
      segment.length > 200
    ) {
      return null;
    }
  }
  return segments;
}

function importAll(data) {
  if (!data || typeof data !== "object" || data.kind !== "opencode-configurator-export") {
    const e = new Error("Geçersiz dosya: bu bir Opencode Configurator dışa aktarımı değil.");
    e.status = 400;
    throw e;
  }
  const report = { mcp: 0, skills: 0, plugins: 0, pluginFiles: 0, errors: [] };

  // --- MCP + npm plugin'ler (tek yazımda birleştir) ---
  const config = readConfig();
  if (data.mcp && typeof data.mcp === "object") {
    if (!config.mcp || typeof config.mcp !== "object") config.mcp = {};
    for (const [name, cfg] of Object.entries(data.mcp)) {
      if (!NAME_RE.test(name) || !cfg || typeof cfg !== "object") {
        report.errors.push(`MCP atlandı: ${name}`);
        continue;
      }
      config.mcp[name] = cfg;
      report.mcp++;
    }
  }
  const state = readState();
  if (data.plugin && typeof data.plugin === "object") {
    const incomingEnabled = Array.isArray(data.plugin.enabled) ? data.plugin.enabled : [];
    const incomingDisabled = Array.isArray(data.plugin.disabled) ? data.plugin.disabled : [];
    if (!Array.isArray(config.plugin)) config.plugin = [];
    state.disabledPlugins = state.disabledPlugins || [];
    for (const name of incomingEnabled) {
      if (typeof name !== "string" || !name.trim()) continue;
      if (!config.plugin.includes(name)) {
        config.plugin.push(name);
        report.plugins++;
      }
      state.disabledPlugins = state.disabledPlugins.filter((n) => n !== name);
    }
    for (const name of incomingDisabled) {
      if (typeof name !== "string" || !name.trim()) continue;
      if (!config.plugin.includes(name) && !state.disabledPlugins.includes(name)) {
        state.disabledPlugins.push(name);
        report.plugins++;
      }
    }
  }
  writeConfig(config);
  writeState(state);

  // --- Skill'ler ---
  const skillPermissionUpdates = [];
  if (data.skills && typeof data.skills === "object") {
    for (const [name, skill] of Object.entries(data.skills)) {
      try {
        if (!SKILL_NAME_RE.test(name)) throw new Error("geçersiz ad");
        if (!skill || typeof skill !== "object" || !skill.files || typeof skill.files !== "object") {
          throw new Error("geçersiz kayıt");
        }
        const existing = findSkill(name);
        if (existing) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          ensureDir(getBackupDir());
          fs.renameSync(existing.skillDir, path.join(getBackupDir(), `skill-${name}-${stamp}`));
        }
        const dir = path.join(skillWriteDir(), name);
        let hasSkillMd = false;
        for (const [rel, b64] of Object.entries(skill.files)) {
          const segments = sanitizeRelPath(rel);
          if (!segments) continue;
          const buf = Buffer.from(String(b64), "base64");
          if (buf.length > MAX_EXPORT_FILE_BYTES) continue;
          const target = path.join(dir, ...segments);
          ensureDir(path.dirname(target));
          fs.writeFileSync(target, buf);
          if (segments.join("/") === "SKILL.md") hasSkillMd = true;
        }
        if (!hasSkillMd) throw new Error("SKILL.md içermiyor");
        skillPermissionUpdates.push({ name, enabled: skill.enabled !== false });
        report.skills++;
      } catch (err) {
        report.errors.push(`Skill atlandı (${name}): ${err.message}`);
      }
    }
  }

  // Skill etkin/devre dışı durumlarını opencode'un permission.skill ayarına işle
  if (skillPermissionUpdates.length > 0) {
    const configAfterSkills = readConfig();
    for (const { name, enabled } of skillPermissionUpdates) {
      setSkillPermission(
        configAfterSkills,
        name,
        enabled ? resolveEnableValue(configAfterSkills, name) : "deny"
      );
    }
    writeConfig(configAfterSkills);
  }

  // --- Dosya plugin'leri ---
  if (data.pluginFiles && typeof data.pluginFiles === "object") {
    for (const [name, entry] of Object.entries(data.pluginFiles)) {
      try {
        if (!/^[A-Za-z0-9._-]+\.(js|ts)$/.test(name)) throw new Error("geçersiz dosya adı");
        if (!entry || typeof entry.content !== "string") throw new Error("içerik yok");
        const buf = Buffer.from(entry.content, "base64");
        if (buf.length > MAX_EXPORT_FILE_BYTES) throw new Error("dosya çok büyük");
        ensureDir(pluginFileDir());
        const target = path.join(
          pluginFileDir(),
          entry.enabled === false ? name + ".disabled" : name
        );
        // aynı adın etkin/devre dışı halini temizle
        for (const old of [path.join(pluginFileDir(), name), path.join(pluginFileDir(), name + ".disabled")]) {
          if (fs.existsSync(old)) fs.rmSync(old);
        }
        fs.writeFileSync(target, buf);
        report.pluginFiles++;
      } catch (err) {
        report.errors.push(`Plugin dosyası atlandı (${name}): ${err.message}`);
      }
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Güvenli mod: tüm MCP sunucularını ve plugin'leri tek seferde devre dışı bırak
// (opencode açılmıyorsa hızlı kurtarma; her şey arayüzden tek tek geri açılabilir)
// ---------------------------------------------------------------------------

function safeMode() {
  const config = readConfig();
  const state = readState();
  let mcpCount = 0;
  let pluginCount = 0;
  if (config.mcp && typeof config.mcp === "object") {
    for (const name of Object.keys(config.mcp)) {
      if (config.mcp[name] && config.mcp[name].enabled !== false) {
        config.mcp[name].enabled = false;
        mcpCount++;
      }
    }
  }
  state.disabledPlugins = state.disabledPlugins || [];
  if (Array.isArray(config.plugin) && config.plugin.length > 0) {
    for (const spec of config.plugin) {
      if (!state.disabledPlugins.includes(spec)) state.disabledPlugins.push(spec);
      pluginCount++;
    }
    config.plugin = [];
  }
  writeConfig(config);
  writeState(state);
  return { mcpCount, pluginCount };
}

// ---------------------------------------------------------------------------

module.exports = {
  defaultConfigDir,
  getConfigDir,
  getConfigPath,
  getBackupDir,
  setCliConfigDir,
  setUserConfigDir,
  setSkillDirnames,
  skillWriteDir,
  listMcp,
  upsertMcp,
  setMcpEnabled,
  deleteMcp,
  listSkills,
  createSkill,
  installSkillFiles,
  getSkill,
  updateSkill,
  setSkillEnabled,
  deleteSkill,
  listPlugins,
  addPlugin,
  setPluginEnabled,
  deletePlugin,
  exportAll,
  importAll,
  safeMode,
  readConfigForDoctor: readConfig,
};
