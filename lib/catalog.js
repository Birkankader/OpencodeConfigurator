/**
 * catalog.js — Popüler MCP sunucuları, plugin'ler ve skill'ler kataloğu.
 *
 * Veriler 2026-07 taramasıyla doğrulandı: npm indirme sayıları
 * (api.npmjs.org), GitHub yıldızları, skills.sh kurulum sayıları ve
 * üreticilerin resmî dokümantasyon sayfaları. Kullanımdan kaldırılmış
 * (deprecated) npm paketleri katalog dışı bırakıldı.
 *
 * Alanlar:
 *  - "requires": kullanıcı etkinleştirmeden ÖNCE doldurması gereken alan
 *    (API anahtarı, bağlantı dizesi, klasör yolu) — arayüz önce düzenleme
 *    penceresi açar.
 *  - "note": bilgilendirme (OAuth girişi, kurulu uygulama gereksinimi) —
 *    satırda gösterilir, düzenleme penceresi gerektirmez.
 */
"use strict";

const MCP_CATALOG = [
  // --- Tarayıcı & Test ---
  {
    id: "playwright",
    name: "Playwright",
    description: "Playwright ile tarayıcı otomasyonu: gezinme, tıklama, form doldurma, ekran görüntüsü, test.",
    popularity: "npm 24,7M/ay · Microsoft resmî",
    category: "browser",
    config: { type: "local", command: ["npx", "-y", "@playwright/mcp@latest"], enabled: true },
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    description: "Canlı Chrome'u kontrol et ve incele: hata ayıklama, performans izleri, DOM, ağ.",
    popularity: "npm 10,9M/ay · Google resmî",
    category: "browser",
    note: "Makinede Chrome kurulu olmalı",
    config: { type: "local", command: ["npx", "-y", "chrome-devtools-mcp@latest"], enabled: true },
  },

  // --- Arama & Dokümantasyon ---
  {
    id: "context7",
    name: "Context7",
    description: "Kütüphaneler için güncel, sürüme özel dokümantasyon ve kod örnekleri (anahtarsız çalışır).",
    popularity: "npm 3,8M/ay · 59K yıldız",
    category: "search-docs",
    config: { type: "local", command: ["npx", "-y", "@upstash/context7-mcp@latest"], enabled: true },
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Web kazıma ve tarama: siteleri LLM'e uygun temiz markdown'a çevirir.",
    popularity: "npm 475K/ay · 7K yıldız",
    category: "search-docs",
    requires: "firecrawl.dev'den ücretsiz API anahtarı alıp ortam değişkenine gir",
    config: {
      type: "local",
      command: ["npx", "-y", "firecrawl-mcp@latest"],
      environment: { FIRECRAWL_API_KEY: "" },
      enabled: true,
    },
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    description: "Güncel Cloudflare dokümantasyonunda arama (Workers, R2, D1…) — anahtarsız.",
    popularity: "resmî Cloudflare remote",
    category: "search-docs",
    config: { type: "remote", url: "https://docs.mcp.cloudflare.com/mcp", enabled: true },
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    description: "Herhangi bir halka açık GitHub deposu hakkında soru sor (DeepWiki indeksi) — anahtarsız.",
    popularity: "resmî Cognition remote",
    category: "search-docs",
    config: { type: "remote", url: "https://mcp.deepwiki.com/mcp", enabled: true },
  },
  {
    id: "tavily",
    name: "Tavily",
    description: "Kaynak alıntılı, yapay zekâya optimize web araması ve içerik çıkarma.",
    popularity: "npm 133K/ay",
    category: "search-docs",
    requires: "tavily.com'dan ücretsiz API anahtarı alıp ortam değişkenine gir",
    config: {
      type: "local",
      command: ["npx", "-y", "tavily-mcp@latest"],
      environment: { TAVILY_API_KEY: "" },
      enabled: true,
    },
  },

  // --- Geliştirme & Servisler ---
  {
    id: "github",
    name: "GitHub",
    description: "GitHub depo, issue, PR, Actions ve kod araması (GitHub'ın barındırdığı resmî sunucu).",
    popularity: "resmî GitHub remote · 31K yıldız",
    category: "dev",
    note: "İlk bağlantıda OAuth ile GitHub girişi istenir",
    config: { type: "remote", url: "https://api.githubcopilot.com/mcp/", enabled: true },
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "İzin verilen klasörlerde güvenli dosya işlemleri: okuma, yazma, arama, düzenleme.",
    popularity: "npm 2,1M/ay · resmî referans",
    category: "dev",
    requires: "Komut sonundaki klasör argümanını kontrol et — '.' çalışılan proje klasörü demektir",
    config: {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem@latest", "."],
      enabled: true,
    },
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Karmaşık problemleri adım adım, yapılandırılmış düşünmeyle çözme aracı.",
    popularity: "npm 641K/ay · resmî referans",
    category: "dev",
    config: {
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking@latest"],
      enabled: true,
    },
  },
  {
    id: "azure",
    name: "Azure",
    description: "Azure kaynak yönetimi: depolama, Cosmos DB, AKS, izleme ve daha fazlası.",
    popularity: "npm 454K/ay · Microsoft resmî",
    category: "dev",
    note: "'az login' ile Azure girişi gerekir",
    config: { type: "local", command: ["npx", "-y", "@azure/mcp@latest", "server", "start"], enabled: true },
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Sentry hatalarını ve izlerini sorgula/düzelt; Seer AI analizi dahil.",
    popularity: "resmî Sentry remote",
    category: "dev",
    note: "İlk bağlantıda OAuth ile Sentry girişi istenir",
    config: { type: "remote", url: "https://mcp.sentry.dev/mcp", enabled: true },
  },
  {
    id: "desktop-commander",
    name: "Desktop Commander",
    description: "Terminal komutları, süreç kontrolü, tüm makinede dosya düzenleme — geniş yetki verir, bilinçli aç.",
    popularity: "npm 342K/ay",
    category: "dev",
    config: { type: "local", command: ["npx", "-y", "@wonderwhy-er/desktop-commander@latest"], enabled: true },
  },
  {
    id: "figma",
    name: "Figma",
    description: "Figma tasarım bağlamını çek (kareler, değişkenler, kod) — tasarımdan koda akışlar.",
    popularity: "resmî Figma remote",
    category: "dev",
    note: "Dev Mode MCP erişimli Figma hesabıyla OAuth girişi gerekir",
    config: { type: "remote", url: "https://mcp.figma.com/mcp", enabled: true },
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Stripe API: müşteriler, ödemeler, faturalar ve doküman araması.",
    popularity: "resmî Stripe remote",
    category: "dev",
    note: "İlk bağlantıda OAuth ile Stripe girişi istenir",
    config: { type: "remote", url: "https://mcp.stripe.com", enabled: true },
  },

  // --- Veri & Hafıza ---
  {
    id: "memory",
    name: "Memory",
    description: "Kalıcı bilgi grafiği hafızası: varlıklar, ilişkiler ve bilgiler oturumlar arası saklanır.",
    popularity: "npm 442K/ay · resmî referans",
    category: "data",
    config: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-memory@latest"], enabled: true },
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Supabase projeleri: veritabanı sorguları, migration'lar, tablo ve yapılandırma yönetimi.",
    popularity: "npm 387K/ay · Supabase resmî",
    category: "data",
    requires: "Supabase hesap ayarlarından kişisel erişim jetonu oluşturup ortam değişkenine gir",
    config: {
      type: "local",
      command: ["npx", "-y", "@supabase/mcp-server-supabase@latest"],
      environment: { SUPABASE_ACCESS_TOKEN: "" },
      enabled: true,
    },
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "MongoDB veritabanlarını ve Atlas kümelerini doğal dille sorgula ve yönet.",
    popularity: "npm 306K/ay · MongoDB resmî",
    category: "data",
    requires: "MongoDB bağlantı dizesini ortam değişkenine gir",
    config: {
      type: "local",
      command: ["npx", "-y", "mongodb-mcp-server@latest"],
      environment: { MDB_MCP_CONNECTION_STRING: "" },
      enabled: true,
    },
  },

  // --- Üretkenlik ---
  {
    id: "notion",
    name: "Notion",
    description: "Notion sayfalarında ve veritabanlarında arama, okuma ve yazma.",
    popularity: "resmî Notion remote",
    category: "productivity",
    note: "İlk bağlantıda OAuth ile Notion girişi istenir",
    config: { type: "remote", url: "https://mcp.notion.com/mcp", enabled: true },
  },
  {
    id: "linear",
    name: "Linear",
    description: "Linear issue, proje ve döngülerini oluştur ve yönet.",
    popularity: "resmî Linear remote",
    category: "productivity",
    note: "İlk bağlantıda OAuth ile Linear girişi istenir",
    config: { type: "remote", url: "https://mcp.linear.app/mcp", enabled: true },
  },
  {
    id: "atlassian",
    name: "Atlassian (Jira & Confluence)",
    description: "Jira issue'larında ve Confluence sayfalarında arama, oluşturma, güncelleme.",
    popularity: "resmî Atlassian remote",
    category: "productivity",
    note: "İlk bağlantıda OAuth ile Atlassian girişi istenir",
    config: { type: "remote", url: "https://mcp.atlassian.com/v1/mcp/authv2", enabled: true },
  },
  {
    id: "n8n",
    name: "n8n",
    description: "n8n otomasyon akışları kur ve yönet; 1000+ entegrasyon düğümünün dokümanı.",
    popularity: "npm 494K/ay · 22K yıldız",
    category: "productivity",
    note: "Dokümanlar anahtarsız; canlı n8n örneği için N8N_API_URL + N8N_API_KEY ekle",
    config: { type: "local", command: ["npx", "-y", "n8n-mcp@latest"], enabled: true },
  },
];

/**
 * Popüler opencode plugin'leri (npm paketleri). Anahtar açılınca opencode.json
 * içindeki "plugin" listesine eklenir; paketi opencode ilk açılışta kendisi kurar.
 * Sıralama: GitHub yıldızı + aylık npm indirmesi karışımı (2026-07 taraması).
 */
const PLUGIN_CATALOG = [
  {
    npm: "oh-my-opencode",
    description: "Tam donanımlı paket: çoklu ajan orkestrasyonu, hazır ajanlar, hook'lar, LSP araçları.",
    popularity: "66K yıldız · 151K/ay indirme",
    requires: null,
  },
  {
    npm: "oh-my-opencode-slim",
    description: "Hafif ajan orkestrasyonu: planlayıcı + paralel arka plan ajanları, daha az token.",
    popularity: "7,2K yıldız · 71K/ay indirme",
    requires: null,
  },
  {
    npm: "@tarquinen/opencode-dcp",
    description: "Dinamik bağlam budama: bayat araç çıktılarını otomatik temizler, token tasarrufu sağlar.",
    popularity: "3,8K yıldız · 51K/ay indirme",
    requires: null,
  },
  {
    npm: "opencode-gemini-auth",
    description: "Google hesabı OAuth'uyla Gemini'yi sağlayıcı olarak ekler (ücretsiz Code Assist kotası).",
    popularity: "1,7K yıldız · 15K/ay indirme",
    requires: "Google hesabıyla giriş gerekir",
  },
  {
    npm: "@rynfar/meridian",
    description: "Claude Pro/Max aboneliğini yerel Anthropic API proxy'siyle opencode'da kullandırır.",
    popularity: "1,7K yıldız · 9,4K/ay indirme",
    requires: "Claude Pro/Max aboneliği + `meridian setup` komutu",
  },
  {
    npm: "opencode-openai-codex-auth",
    description: "ChatGPT girişiyle Plus/Pro aboneliğindeki Codex/GPT-5 modellerini kullandırır.",
    popularity: "2,2K yıldız · 7K/ay indirme",
    requires: "ChatGPT Plus/Pro aboneliği gerekir",
  },
  {
    npm: "opencode-mem",
    description: "Kalıcı ajan hafızası: yerel embedding, otomatik hatırlama, oturumlar arası tekilleştirme.",
    popularity: "1,2K yıldız · 12K/ay indirme",
    requires: null,
  },
  {
    npm: "opencode-pty",
    description: "Etkileşimli terminal yönetimi: arka planda dev sunucusu/REPL çalıştırıp kontrol eder.",
    popularity: "521 yıldız · 20K/ay indirme",
    requires: null,
  },
  {
    npm: "opencode-swarm",
    description: "Mimar liderliğinde çok ajanlı 'sürü' orkestrasyonu, uzmanlaşmış alt ekipler.",
    popularity: "407 yıldız · 25K/ay indirme",
    requires: null,
  },
  {
    npm: "opencode-supermemory",
    description: "Supermemory bulut API'siyle oturumlar arası kalıcı hafıza.",
    popularity: "1,4K yıldız · 6,5K/ay indirme",
    requires: "Supermemory hesabı + API anahtarı gerekir",
  },
  {
    npm: "opencode-claude-auth",
    description: "Mevcut Claude Code girişini kullanarak Pro/Max planındaki Claude modellerini çalıştırır.",
    popularity: "1,2K yıldız · 7K/ay indirme",
    requires: "Claude Pro/Max aboneliği gerekir",
  },
  {
    npm: "opencode-chrome-devtools",
    description: "Chrome DevTools protokolüyle tarayıcı otomasyonu: gezinme, inceleme, ekran görüntüsü.",
    popularity: "511 yıldız · 13K/ay indirme",
    requires: "Uzaktan hata ayıklama açık Chrome/Chromium gerekir",
  },
];

/**
 * Popüler skill'ler. Anahtar açılınca dosyalar GitHub'dan indirilip
 * skills/<ad>/ klasörüne yazılır (repo/path/ref bu katalogda sabittir).
 * Sıralama: skills.sh kurulum sayıları + depo yıldızları (2026-07 taraması).
 * Not: "name" SKILL.md frontmatter'ındaki adla aynıdır; klasör bu adla oluşur.
 */
const SKILL_CATALOG = [
  {
    name: "find-skills",
    description: "skills.sh kayıt defterinden yeni skill keşfeder ve kurar.",
    repo: "vercel-labs/skills", path: "skills/find-skills", ref: "main",
    popularity: "skills.sh #1 · 2,6M kurulum",
  },
  {
    name: "frontend-design",
    description: "Anthropic'in üretim kalitesinde, özgün arayüz tasarım rehberi.",
    repo: "anthropics/skills", path: "skills/frontend-design", ref: "main",
    popularity: "skills.sh #2 · 690K kurulum · resmî Anthropic",
  },
  {
    name: "vercel-react-best-practices",
    description: "Vercel mühendisliğinden React ve Next.js performans pratikleri.",
    repo: "vercel-labs/agent-skills", path: "skills/react-best-practices", ref: "main",
    popularity: "skills.sh #4 · 569K kurulum",
  },
  {
    name: "improve-codebase-architecture",
    description: "Kod tabanını mimari iyileştirmeler için tarar, düzeltmeleri sorgulatır.",
    repo: "mattpocock/skills", path: "skills/engineering/improve-codebase-architecture", ref: "main",
    popularity: "skills.sh #7 · 511K kurulum",
  },
  {
    name: "tdd",
    description: "Test güdümlü geliştirme: önce test, sonra kod (red-green-refactor).",
    repo: "mattpocock/skills", path: "skills/engineering/tdd", ref: "main",
    popularity: "skills.sh #8 · 491K kurulum",
  },
  {
    name: "web-design-guidelines",
    description: "Arayüz kodunu erişilebilirlik ve UX kurallarına göre denetler.",
    repo: "vercel-labs/agent-skills", path: "skills/web-design-guidelines", ref: "main",
    popularity: "skills.sh #9 · 480K kurulum",
  },
  {
    name: "remotion-best-practices",
    description: "React ile Remotion'da video üretimi için en iyi pratikler.",
    repo: "remotion-dev/skills", path: "skills/remotion-best-practices", ref: "main",
    popularity: "skills.sh #12 · 438K kurulum",
  },
  {
    name: "caveman",
    description: "Ultra kısa yanıtlar: ~%65 daha az çıktı tokenı, teknik doğruluk tam.",
    repo: "juliusbrussee/caveman", path: "skills/caveman", ref: "main",
    popularity: "skills.sh #20 · 371K kurulum",
  },
  {
    name: "skill-creator",
    description: "Anthropic'in resmî yöntemiyle yeni skill oluşturur ve paketler.",
    repo: "anthropics/skills", path: "skills/skill-creator", ref: "main",
    popularity: "skills.sh #28 · 323K kurulum · resmî Anthropic",
  },
  {
    name: "brainstorming",
    description: "Fikirleri kodlamadan önce sokratik sorularla doğrulanmış tasarıma çevirir.",
    repo: "obra/superpowers", path: "skills/brainstorming", ref: "main",
    popularity: "skills.sh #36 · 289K kurulum",
  },
  {
    name: "pdf",
    description: "PDF okuma, oluşturma, birleştirme, form doldurma ve OCR.",
    repo: "anthropics/skills", path: "skills/pdf", ref: "main",
    popularity: "163K kurulum · resmî Anthropic",
  },
  {
    name: "docx",
    description: "Word belgeleri oluşturma/düzenleme: biçim, izlenen değişiklik, şablon.",
    repo: "anthropics/skills", path: "skills/docx", ref: "main",
    popularity: "156K kurulum · resmî Anthropic",
  },
  {
    name: "systematic-debugging",
    description: "Düzeltme önermeden önce kök nedeni bulduran sistematik hata ayıklama.",
    repo: "obra/superpowers", path: "skills/systematic-debugging", ref: "main",
    popularity: "superpowers koleksiyonu (259K yıldız)",
  },
];

module.exports = { MCP_CATALOG, PLUGIN_CATALOG, SKILL_CATALOG };
