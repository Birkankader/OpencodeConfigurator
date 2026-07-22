"use strict";

const $ = (sel) => document.querySelector(sel);

let state = null;
let mcpEditing = null;   // düzenlenen sunucunun adı; null => yeni ekleme
let mcpOriginal = null;  // düzenlenen sunucunun mevcut config'i (timeout gibi alanları korumak için)
let skillEditing = null; // düzenlenen skill adı; null => yeni
let importPayload = null;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
async function api(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error("Sunucuya ulaşılamadı. Uygulama penceresi (terminal) kapanmış olabilir.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `İstek başarısız (${res.status}).`);
  return data;
}

const post = (url, body) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

function toast(msg, isError = false) {
  const node = el("div", "toast" + (isError ? " error" : ""), msg);
  $("#toast-container").appendChild(node);
  setTimeout(() => node.remove(), isError ? 7000 : 3500);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeSwitch(checked, onChange, labelText) {
  const label = el("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  if (labelText) input.setAttribute("aria-label", `${labelText} aç/kapat`);
  const slider = el("span", "slider");
  input.addEventListener("change", async () => {
    input.disabled = true;
    try {
      await onChange(input.checked);
    } catch (e) {
      toast(e.message, true);
    }
    refresh();
  });
  label.append(input, slider);
  return label;
}

function iconBtn(symbol, title, onClick, danger = false) {
  const btn = el("button", "icon-btn" + (danger ? " danger" : ""), symbol);
  btn.title = title;
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function card({ enabled, title, badges = [], sub, actions = [], onToggle }) {
  const c = el("div", "card" + (enabled ? "" : " disabled-card"));
  if (onToggle) c.appendChild(makeSwitch(enabled, onToggle, title));
  const body = el("div", "card-body");
  const t = el("div", "card-title", title);
  for (const [label, cls] of badges) t.appendChild(el("span", "badge " + cls, label));
  body.appendChild(t);
  if (sub) {
    const subEl = el("div", "card-sub", sub);
    subEl.title = sub;
    body.appendChild(subEl);
  }
  c.appendChild(body);
  const act = el("div", "card-actions");
  for (const a of actions) act.appendChild(a);
  c.appendChild(act);
  return c;
}

function emptyState(container, text) {
  container.appendChild(el("div", "empty", text));
}

function splitCommand(str) {
  const out = [];
  let current = "";
  let quote = null;
  for (const ch of str) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

function joinCommand(arr) {
  return (arr || []).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
}

// ---------------------------------------------------------------------------
// Durum yükleme
// ---------------------------------------------------------------------------
async function refresh() {
  try {
    state = await api("/api/state");
  } catch (e) {
    toast(e.message, true);
    return;
  }
  $("#config-path").textContent = state.configDir;
  $("#backup-path").textContent = state.backupDir;
  $("#count-mcp").textContent = state.mcp.length;
  $("#count-skills").textContent = state.skills.length;
  $("#count-plugins").textContent = state.plugins.length;
  $("#skills-hint").textContent =
    `Skill klasörü: ${state.skillDir} — kapattığın skill'ler opencode.json içindeki ` +
    `permission.skill ayarıyla gizlenir (dosyalar yerinde kalır).`;
  renderMcp();
  renderSkills();
  renderSkillCatalog();
  renderPlugins();
  renderPluginCatalog();
}

// ---------------------------------------------------------------------------
// MCP sunucuları
// ---------------------------------------------------------------------------
function mcpSub(cfg) {
  return cfg.type === "remote" ? cfg.url || "" : joinCommand(cfg.command);
}

function typeBadge(cfg) {
  return cfg.type === "remote" ? ["uzak", "remote"] : ["yerel", "local"];
}

function renderMcp() {
  const installedBox = $("#mcp-installed");
  const catalogBox = $("#mcp-catalog");
  installedBox.replaceChildren();
  catalogBox.replaceChildren();

  const installedNames = new Set(state.mcp.map((m) => m.name));

  if (state.mcp.length === 0) {
    emptyState(installedBox, "Henüz MCP sunucusu eklenmemiş. Aşağıdaki katalogdan seç veya özel sunucu ekle.");
  }
  for (const entry of state.mcp) {
    const cfg = entry.config || {};
    installedBox.appendChild(
      card({
        enabled: entry.enabled,
        title: entry.name,
        badges: [typeBadge(cfg)],
        sub: mcpSub(cfg),
        onToggle: (on) => post("/api/mcp/toggle", { name: entry.name, enabled: on }),
        actions: [
          iconBtn("✎", "Düzenle", () => openMcpDialog({ name: entry.name, config: cfg }, true)),
          iconBtn("🗑", "Kaldır", async () => {
            if (!confirm(`"${entry.name}" sunucusu yapılandırmadan kaldırılsın mı?`)) return;
            try {
              await post("/api/mcp/delete", { name: entry.name });
              toast(`"${entry.name}" kaldırıldı.`);
            } catch (e) {
              toast(e.message, true);
            }
            refresh();
          }, true),
        ],
      })
    );
  }

  const available = state.mcpCatalog.filter((c) => !installedNames.has(c.id));
  if (available.length === 0) {
    emptyState(catalogBox, "Katalogdaki tüm sunucular ekli. 🎉");
  }
  const MCP_GROUPS = [
    ["browser", "Tarayıcı & Test"],
    ["search-docs", "Arama & Dokümantasyon"],
    ["dev", "Geliştirme & Servisler"],
    ["data", "Veri & Hafıza"],
    ["productivity", "Üretkenlik"],
  ];
  const groupedKeys = new Set(MCP_GROUPS.map(([key]) => key));
  for (const [key, label] of MCP_GROUPS) {
    const group = available.filter((c) => c.category === key);
    if (group.length === 0) continue;
    catalogBox.appendChild(el("div", "catalog-group-title", label));
    for (const item of group) catalogBox.appendChild(mcpCatalogCard(item));
  }
  for (const item of available.filter((c) => !groupedKeys.has(c.category))) {
    catalogBox.appendChild(mcpCatalogCard(item));
  }
}

function mcpCatalogCard(item) {
  const badges = [typeBadge(item.config)];
  if (item.requires) badges.push(["ayar gerekli", "key"]);
  let sub = `${item.description} — ${item.popularity}`;
  if (item.note) sub += ` · ${item.note}`;
  return card({
    enabled: false,
    title: item.name,
    badges,
    sub,
    onToggle: async (on) => {
      if (!on) return;
      if (item.requires) {
        openMcpDialog({ name: item.id, config: item.config, note: item.requires }, false);
        return;
      }
      await post("/api/mcp", { name: item.id, config: item.config });
      toast(`"${item.name}" eklendi.`);
    },
  });
}

function setMcpType(type) {
  $("#mcp-local-fields").hidden = type !== "local";
  $("#mcp-remote-fields").hidden = type !== "remote";
}

function openMcpDialog(entry, isEdit) {
  mcpEditing = isEdit ? entry.name : null;
  mcpOriginal = entry ? { ...entry.config } : null;
  const cfg = entry ? entry.config : { type: "local", enabled: true };
  const type = cfg.type === "remote" ? "remote" : "local";

  $("#mcp-dialog-title").textContent = isEdit ? `"${entry.name}" sunucusunu düzenle` : "MCP Sunucusu Ekle";
  $("#mcp-dialog-note").textContent = entry && entry.note ? "⚠ " + entry.note + "." : "";
  $("#mcp-name").value = entry ? entry.name : "";
  $("#mcp-name").readOnly = !!isEdit;
  document.querySelector(`input[name="mcp-type"][value="${type}"]`).checked = true;
  setMcpType(type);
  $("#mcp-command").value = joinCommand(cfg.command);
  $("#mcp-url").value = cfg.url || "";
  fillKvRows($("#mcp-env-rows"), cfg.environment || {});
  fillKvRows($("#mcp-header-rows"), cfg.headers || {});
  $("#mcp-enabled").checked = cfg.enabled !== false;
  $("#mcp-dialog").showModal();
}

function addKvRow(container, key = "", value = "") {
  const row = el("div", "kv-row");
  const k = document.createElement("input");
  k.placeholder = "ANAHTAR";
  k.value = key;
  k.className = "key";
  const v = document.createElement("input");
  v.placeholder = "değer";
  v.value = value;
  row.append(k, v, iconBtn("✕", "Satırı sil", () => row.remove()));
  container.appendChild(row);
}

function fillKvRows(container, obj) {
  container.replaceChildren();
  for (const [k, v] of Object.entries(obj)) addKvRow(container, k, String(v));
}

function collectKv(container) {
  const out = {};
  for (const row of container.querySelectorAll(".kv-row")) {
    const [k, v] = row.querySelectorAll("input");
    if (k.value.trim()) out[k.value.trim()] = v.value;
  }
  return out;
}

$("#mcp-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("#mcp-name").value.trim();
  const type = document.querySelector('input[name="mcp-type"]:checked').value;
  const cfg = { ...(mcpOriginal || {}) };
  delete cfg.note;
  cfg.type = type;
  if (type === "local") {
    const cmd = splitCommand($("#mcp-command").value.trim());
    if (cmd.length === 0) return toast("Komut boş olamaz.", true);
    cfg.command = cmd;
    const env = collectKv($("#mcp-env-rows"));
    if (Object.keys(env).length) cfg.environment = env;
    else delete cfg.environment;
    delete cfg.url;
    delete cfg.headers;
  } else {
    const urlValue = $("#mcp-url").value.trim();
    if (!urlValue) return toast("URL boş olamaz.", true);
    cfg.url = urlValue;
    const headers = collectKv($("#mcp-header-rows"));
    if (Object.keys(headers).length) cfg.headers = headers;
    else delete cfg.headers;
    delete cfg.command;
    delete cfg.environment;
  }
  cfg.enabled = $("#mcp-enabled").checked;
  try {
    await post("/api/mcp", { name, config: cfg });
    $("#mcp-dialog").close();
    toast(`"${name}" kaydedildi.`);
    refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

document.querySelectorAll('input[name="mcp-type"]').forEach((radio) =>
  radio.addEventListener("change", () => setMcpType(radio.value))
);
$("#mcp-env-add").addEventListener("click", () => addKvRow($("#mcp-env-rows")));
$("#mcp-header-add").addEventListener("click", () => addKvRow($("#mcp-header-rows")));

// ---------------------------------------------------------------------------
// Skill'ler
// ---------------------------------------------------------------------------
const SKILL_TEMPLATE = `Bu skill etkinleştirildiğinde izlenecek adımlar:

1. İlk adımı buraya yaz.
2. İkinci adımı buraya yaz.

## Notlar

- Modelin bilmesi gereken önemli ayrıntılar.
`;

function renderSkills() {
  const box = $("#skills-list");
  box.replaceChildren();
  if (state.skills.length === 0) {
    return emptyState(
      box,
      'Henüz skill yok. "+ Yeni Skill" ile oluşturabilir veya başka makineden dışa aktarılmış yapılandırmayı içe aktarabilirsin.'
    );
  }
  for (const skill of state.skills) {
    box.appendChild(
      card({
        enabled: skill.enabled,
        title: skill.name,
        sub: skill.description,
        onToggle: (on) => post("/api/skill/toggle", { name: skill.name, enabled: on }),
        actions: [
          iconBtn("✎", "Düzenle", async () => {
            try {
              const data = await api(`/api/skill?name=${encodeURIComponent(skill.name)}`);
              openSkillDialog(data);
            } catch (e) {
              toast(e.message, true);
            }
          }),
          iconBtn("🗑", "Sil", async () => {
            if (!confirm(`"${skill.name}" skill'i silinsin mi? (Klasörü yedeğe taşınır)`)) return;
            try {
              await post("/api/skill/delete", { name: skill.name });
              toast(`"${skill.name}" silindi.`);
            } catch (e) {
              toast(e.message, true);
            }
            refresh();
          }, true),
        ],
      })
    );
  }
}

function renderSkillCatalog() {
  const box = $("#skill-catalog");
  box.replaceChildren();
  const installedNames = new Set(state.skills.map((s) => s.name));
  const available = state.skillCatalog.filter((s) => !installedNames.has(s.name));
  if (available.length === 0) {
    return emptyState(box, state.skillCatalog.length ? "Katalogdaki tüm skill'ler kurulu. 🎉" : "Katalog boş.");
  }
  for (const item of available) {
    box.appendChild(
      card({
        enabled: false,
        title: item.name,
        badges: [["github", "file"]],
        sub: `${item.description} — ${item.popularity} · ${item.repo}`,
        onToggle: async (on) => {
          if (!on) return;
          toast(`"${item.name}" GitHub'dan indiriliyor…`);
          const result = await post("/api/skill/install", { name: item.name });
          toast(`"${item.name}" kuruldu (${result.files} dosya).`);
        },
      })
    );
  }
}

function openSkillDialog(existing) {
  skillEditing = existing ? existing.name : null;
  $("#skill-dialog-title").textContent = existing ? `"${existing.name}" skill'ini düzenle` : "Yeni Skill";
  $("#skill-name").value = existing ? existing.name : "";
  $("#skill-name").readOnly = !!existing;
  $("#skill-description").value = existing ? existing.description : "";
  $("#skill-content").value = existing ? existing.body : SKILL_TEMPLATE;
  $("#skill-dialog").showModal();
}

$("#skill-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const payload = {
    name: $("#skill-name").value.trim(),
    description: $("#skill-description").value.trim(),
    content: $("#skill-content").value,
  };
  try {
    await post(skillEditing ? "/api/skill/update" : "/api/skill", payload);
    $("#skill-dialog").close();
    toast(`"${payload.name}" kaydedildi.`);
    refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// ---------------------------------------------------------------------------
// Plugin'ler
// ---------------------------------------------------------------------------
function renderPlugins() {
  const box = $("#plugins-list");
  box.replaceChildren();
  $("#plugins-hint").textContent =
    'npm plugin\'leri opencode.json içindeki "plugin" listesinde tutulur; kapattıkların listeden çıkarılır ve bu araç tarafından hatırlanır. ' +
    "Dosya plugin'leri yapılandırma klasöründeki plugins/ içinde yaşar.";
  if (state.plugins.length === 0) {
    return emptyState(box, 'Henüz plugin yok. "+ Plugin Ekle" ile npm paketi ekleyebilirsin.');
  }
  for (const plugin of state.plugins) {
    box.appendChild(
      card({
        enabled: plugin.enabled,
        title: plugin.name,
        badges: [[plugin.kind === "file" ? "dosya" : "npm", plugin.kind === "file" ? "file" : "local"]],
        onToggle: (on) => post("/api/plugin/toggle", { name: plugin.name, kind: plugin.kind, enabled: on }),
        actions: [
          iconBtn("🗑", "Kaldır", async () => {
            if (!confirm(`"${plugin.name}" kaldırılsın mı?`)) return;
            try {
              await post("/api/plugin/delete", { name: plugin.name, kind: plugin.kind });
              toast(`"${plugin.name}" kaldırıldı.`);
            } catch (e) {
              toast(e.message, true);
            }
            refresh();
          }, true),
        ],
      })
    );
  }
}

function basePluginName(spec) {
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  return at === -1 ? spec : spec.slice(0, at);
}

function renderPluginCatalog() {
  const box = $("#plugin-catalog");
  box.replaceChildren();
  const installedBases = new Set(state.plugins.map((p) => basePluginName(p.name)));
  const available = state.pluginCatalog.filter((p) => !installedBases.has(p.npm));
  if (available.length === 0) {
    return emptyState(box, state.pluginCatalog.length ? "Katalogdaki tüm plugin'ler ekli. 🎉" : "Katalog boş.");
  }
  for (const item of available) {
    const badges = [["npm", "local"]];
    if (item.requires) badges.push(["ayar gerekli", "key"]);
    box.appendChild(
      card({
        enabled: false,
        title: item.npm,
        badges,
        sub: `${item.description} — ${item.popularity}` + (item.requires ? ` · ${item.requires}` : ""),
        onToggle: async (on) => {
          if (!on) return;
          await post("/api/plugin", { name: item.npm });
          toast(`"${item.npm}" eklendi.`);
        },
      })
    );
  }
}

$("#plugin-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("#plugin-name").value.trim();
  try {
    await post("/api/plugin", { name });
    $("#plugin-dialog").close();
    toast(`"${name}" eklendi.`);
    refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// ---------------------------------------------------------------------------
// Dışa / içe aktarma
// ---------------------------------------------------------------------------
$("#btn-export").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = "/api/export";
  a.download = `opencode-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast("Dışa aktarma indirildi. Dosya API anahtarları içerebilir; güvenli bir yerde sakla.");
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", async () => {
  const file = $("#import-file").files[0];
  $("#import-file").value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast("Dosya okunamadı: geçerli bir JSON değil.", true);
  }
  if (!data || data.kind !== "opencode-configurator-export") {
    return toast("Bu dosya bir Opencode Configurator dışa aktarımı değil.", true);
  }
  importPayload = data;
  renderImportSummary(data);
  $("#import-dialog").showModal();
});

function renderImportSummary(data) {
  const box = $("#import-summary");
  box.replaceChildren();
  const sections = [
    ["MCP sunucuları", Object.keys(data.mcp || {})],
    ["Skill'ler", Object.keys(data.skills || {})],
    ["npm plugin'leri", [...((data.plugin && data.plugin.enabled) || []), ...((data.plugin && data.plugin.disabled) || [])]],
    ["Plugin dosyaları", Object.keys(data.pluginFiles || {})],
  ];
  for (const [label, names] of sections) {
    const line = el("div");
    line.appendChild(el("strong", null, `${label}: ${names.length}`));
    box.appendChild(line);
    if (names.length) {
      const ul = el("ul");
      for (const n of names) ul.appendChild(el("li", "mono", n));
      box.appendChild(ul);
    }
  }
  if (data.exportedAt) {
    box.appendChild(el("div", "hint", `Dışa aktarma tarihi: ${new Date(data.exportedAt).toLocaleString("tr-TR")}`));
  }
}

$("#btn-import-confirm").addEventListener("click", async () => {
  if (!importPayload) return;
  try {
    const { report } = await post("/api/import", { data: importPayload });
    $("#import-dialog").close();
    toast(
      `İçe aktarıldı: ${report.mcp} MCP, ${report.skills} skill, ${report.plugins} plugin, ${report.pluginFiles} plugin dosyası.`
    );
    for (const err of report.errors || []) toast(err, true);
    refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// ---------------------------------------------------------------------------
// Yapılandırma klasörü
// ---------------------------------------------------------------------------
$("#btn-configdir").addEventListener("click", () => {
  if (!state) return;
  $("#configdir-input").value = state.configDir !== state.defaultConfigDir ? state.configDir : "";
  $("#configdir-default").textContent = `Varsayılan: ${state.defaultConfigDir}`;
  $("#configdir-dialog").showModal();
});

$("#configdir-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    await post("/api/settings", { configDir: $("#configdir-input").value.trim() });
    $("#configdir-dialog").close();
    toast("Yapılandırma klasörü güncellendi.");
    refresh();
  } catch (e) {
    toast(e.message, true);
  }
});

// ---------------------------------------------------------------------------
// Opencode kurulum durumu (CLI + Desktop)
// ---------------------------------------------------------------------------
let ocPollTimer = null;

async function loadOcStatus() {
  let oc;
  try {
    oc = await api("/api/opencode");
  } catch {
    return; // durum bandı kritik değil; sessizce geç
  }
  renderOcBanner(oc);
  if (oc.job && oc.job.status === "running") startOcPolling();
}

function ocButton(label, onClick) {
  const btn = el("button", "btn secondary", label);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function renderOcBanner(oc) {
  const banner = $("#oc-banner");
  banner.hidden = false;
  const cliCard = $("#oc-cli-card");
  const deskCard = $("#oc-desktop-card");
  cliCard.replaceChildren();
  deskCard.replaceChildren();

  // --- CLI kartı ---
  cliCard.appendChild(el("span", "dot " + (oc.cli.installed ? "ok" : "missing")));
  cliCard.appendChild(el("span", "oc-title", "Opencode CLI"));
  if (oc.cli.installed) {
    cliCard.appendChild(el("span", "oc-sub", `${oc.cli.version} — ${oc.cli.path}`));
  } else {
    cliCard.appendChild(el("span", "oc-sub", "Kurulu değil"));
    cliCard.appendChild(ocButton("npm ile kur", () => startInstall("cli", "npm", "Opencode CLI (npm)")));
    if (oc.env.hasBrew) {
      cliCard.appendChild(ocButton("brew ile kur", () => startInstall("cli", "brew", "Opencode CLI (Homebrew)")));
    }
    if (oc.sources.script) {
      cliCard.appendChild(ocButton("resmî script ile kur", () => startInstall("cli", "script", "Opencode CLI (kurulum scripti)")));
    }
    if (oc.sources.wingetId && oc.platform === "win32") {
      cliCard.appendChild(ocButton("winget ile kur", () => startInstall("cli", "winget", "Opencode CLI (winget)")));
    }
  }

  // --- Desktop kartı ---
  const desk = oc.desktop;
  deskCard.appendChild(el("span", "dot " + (desk.installed ? "ok" : "missing")));
  deskCard.appendChild(el("span", "oc-title", "Opencode Desktop"));
  if (desk.installed) {
    deskCard.appendChild(el("span", "oc-sub", desk.path));
  } else if (!desk.available) {
    deskCard.appendChild(el("span", "oc-sub", desk.note || "Bu platform için resmî masaüstü uygulaması bulunamadı."));
  } else if (!oc.sources.desktopAsset) {
    deskCard.appendChild(el("span", "oc-sub", "Bu platform/işlemci için indirme paketi yok."));
  } else {
    deskCard.appendChild(el("span", "oc-sub", "Kurulu değil"));
    deskCard.appendChild(ocButton("İndir ve kur", () => startInstall("desktop", "download", "Opencode Desktop")));
  }
}

async function startInstall(target, method, title) {
  try {
    await post("/api/opencode/install", { target, method });
  } catch (e) {
    return toast(e.message, true);
  }
  $("#install-dialog-title").textContent = title + " kuruluyor";
  $("#install-status-line").textContent = "Çalışıyor…";
  $("#install-log").textContent = "";
  $("#install-dialog").showModal();
  startOcPolling();
}

function startOcPolling() {
  if (ocPollTimer) return;
  ocPollTimer = setInterval(async () => {
    let oc;
    try {
      oc = await api("/api/opencode");
    } catch {
      return;
    }
    const logEl = $("#install-log");
    if (oc.job) {
      logEl.textContent = oc.job.log.join("\n");
      logEl.scrollTop = logEl.scrollHeight;
      $("#install-status-line").textContent =
        oc.job.status === "running" ? "Çalışıyor…" : oc.job.note || (oc.job.status === "done" ? "Tamamlandı." : "Başarısız.");
    }
    if (!oc.job || oc.job.status !== "running") {
      clearInterval(ocPollTimer);
      ocPollTimer = null;
      renderOcBanner(oc);
      if (oc.job) {
        toast(
          oc.job.status === "done" ? oc.job.note || "Kurulum tamamlandı." : "Kurulum başarısız: " + (oc.job.note || ""),
          oc.job.status !== "done"
        );
      }
    }
  }, 1200);
}

// ---------------------------------------------------------------------------
// Sekmeler, pencere kapatma düğmeleri, başlangıç
// ---------------------------------------------------------------------------
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + tab.dataset.tab));
  })
);

document.querySelectorAll("dialog [data-close]").forEach((btn) =>
  btn.addEventListener("click", () => btn.closest("dialog").close())
);

$("#btn-add-mcp").addEventListener("click", () => openMcpDialog(null, false));
$("#btn-add-skill").addEventListener("click", () => openSkillDialog(null));
$("#btn-add-plugin").addEventListener("click", () => {
  $("#plugin-name").value = "";
  $("#plugin-dialog").showModal();
});

refresh();
loadOcStatus();
