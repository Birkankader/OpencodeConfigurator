/**
 * github.js — Skill kataloğu için GitHub'dan klasör indirme.
 *
 * Kimlik doğrulamasız GitHub API kullanılır (saatte 60 istek sınırı vardır;
 * tek skill kurulumu birkaç istek tutar). Yalnızca uygulamanın kendi
 * kataloğundaki depolardan indirme yapılır — kullanıcı girdisiyle rastgele
 * depo çekilmez.
 */
"use strict";

const GH_API = "https://api.github.com";
const MAX_FILES = 50;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 3;

async function ghFetch(url, asBuffer = false) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "opencode-configurator",
        Accept: asBuffer ? "application/octet-stream" : "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    const e = new Error("GitHub'a ulaşılamadı. İnternet bağlantını kontrol et.");
    e.status = 502;
    throw e;
  }
  if (res.status === 403 || res.status === 429) {
    const e = new Error(
      "GitHub API istek sınırına takıldın (kimliksiz erişim saatte 60 istek). ~1 saat sonra tekrar dene."
    );
    e.status = 429;
    throw e;
  }
  if (res.status === 404) {
    const e = new Error("GitHub'da bulunamadı (depo taşınmış olabilir).");
    e.status = 404;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`GitHub hatası (${res.status}).`);
    e.status = 502;
    throw e;
  }
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

/**
 * repo ("owner/name") içindeki basePath klasörünü indirir.
 * Dönüş: { "SKILL.md": Buffer, "scripts/x.py": Buffer, ... } (basePath'e göre göreli)
 */
async function collectSkillFiles(repo, basePath, ref) {
  const files = {};
  let count = 0;

  async function walk(subPath, depth) {
    if (depth > MAX_DEPTH || count >= MAX_FILES) return;
    const listing = await ghFetch(
      `${GH_API}/repos/${repo}/contents/${encodePath(subPath)}?ref=${encodeURIComponent(ref)}`
    );
    if (!Array.isArray(listing)) {
      const e = new Error("Beklenmeyen GitHub yanıtı: yol bir klasör değil.");
      e.status = 502;
      throw e;
    }
    for (const item of listing) {
      if (count >= MAX_FILES) return;
      if (item.type === "dir") {
        if (item.name === "node_modules" || item.name.startsWith(".")) continue;
        await walk(item.path, depth + 1);
      } else if (item.type === "file") {
        if (item.size > MAX_FILE_BYTES || !item.download_url) continue;
        files[item.path.slice(basePath.length + 1)] = await ghFetch(item.download_url, true);
        count++;
      }
    }
  }

  await walk(basePath.replace(/\/+$/, ""), 0);
  return files;
}

module.exports = { collectSkillFiles };
