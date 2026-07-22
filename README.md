# Opencode Configurator

[Opencode](https://opencode.ai) için platform bağımsız yapılandırma arayüzü.
MCP sunucularını, skill'leri ve plugin'leri tek ekrandan yönet; tüm kurulumunu
JSON olarak dışa aktarıp başka bir bilgisayarda içe aktar.

Harici hiçbir bağımlılık yoktur — `npm install` gerekmez. Sadece **Node.js 18+**
kurulu olması yeterlidir. macOS, Windows ve Linux'ta aynı şekilde çalışır.

## Çalıştırma

| Platform | Yöntem |
| --- | --- |
| macOS | `start-mac.command` dosyasına çift tıkla *(ilk açılışta: sağ tık → Aç)* |
| Windows | `start-windows.bat` dosyasına çift tıkla |
| Hepsi | Terminalde `npm start` veya `node server.js` |

Uygulama `http://127.0.0.1:4517` adresinde açılır (port doluysa sıradaki denenır)
ve varsayılan tarayıcını kendisi başlatır. Yalnızca kendi bilgisayarından
erişilebilir (127.0.0.1'e bağlanır).

Seçenekler: `node server.js --port 5000 --config-dir /baska/klasor --no-open`

## Özellikler

- **Opencode kurulumu** — üst banttaki kartlar CLI ve Desktop'ın kurulu olup
  olmadığını gösterir. CLI kurulu değilse tek tıkla kurulur: npm (her
  platform), Homebrew (macOS) veya resmî kurulum scripti (macOS/Linux,
  `~/.opencode/bin`'e kurar); kurulum günlüğü canlı izlenir. Desktop kurulu
  değilse platformuna uygun resmî paket (macOS .dmg / Windows .exe / Linux
  .AppImage) GitHub'ın son sürümünden indirilir ve kurulum başlatılır.

- **MCP Sunucuları** — yüklü sunucuları anahtarla aç/kapat, düzenle, kaldır.
  Kategorilere ayrılmış **22 popüler sunucu kataloğu** (Playwright, Chrome
  DevTools, Context7, GitHub, Supabase, Notion, Linear, Sentry…) tek tıkla
  eklenir; API anahtarı gerektirenler önce düzenleme penceresi açar. "+ Özel
  Sunucu Ekle" ile yerel (komut) veya uzak (URL) sunucu tanımla.
- **Skill'ler** — mevcut skill'leri listele, anahtarla aç/kapat, düzenle, sil.
  "+ Yeni Skill" ile ad + açıklama + Markdown içerikten `SKILL.md` oluştur.
  **13 popüler skill kataloğu** (frontend-design, tdd, pdf, docx,
  systematic-debugging…): anahtar açılınca dosyalar GitHub'daki kaynağından
  indirilir (kimliksiz GitHub API'si saatte 60 istekle sınırlıdır).
- **Plugin'ler** — npm plugin'lerini (`opencode.json` → `plugin` listesi) ve
  dosya plugin'lerini (`plugins/` klasörü) listele, aç/kapat, ekle, kaldır.
  **12 popüler plugin kataloğu** (oh-my-opencode, opencode-dcp, opencode-mem…)
  yıldız/indirme sayılarıyla listelenir, tek tıkla eklenir.
- **Dışa / İçe Aktar** — tüm MCP + skill (dosyalarıyla birlikte) + plugin
  yapılandırmasını tek JSON dosyası olarak indir; başka bilgisayarda "İçe
  Aktar" ile geri yükle. Önce özet gösterilir, onaydan sonra uygulanır.

## Nasıl çalışır

Araç, opencode'un **global yapılandırma klasörünü** düzenler:

| Platform | Klasör |
| --- | --- |
| macOS / Linux | `~/.config/opencode` |
| Windows | `%USERPROFILE%\.config\opencode` |

(`XDG_CONFIG_HOME` ve `OPENCODE_CONFIG_DIR` ortam değişkenlerine uyar; üstteki
📁 rozetinden klasörü elle de değiştirebilirsin.)

- **MCP aç/kapat** → girdinin `enabled` alanı (opencode'un resmî mekanizması).
- **Skill aç/kapat** → `opencode.json` içinde `permission.skill["ad"] = "deny"`
  (opencode'un resmî mekanizması; skill dosyaları yerinde kalır).
- **npm plugin kapat** → `plugin` listesinden çıkarılır; kapatıldığı bilgisi
  `configurator-state.json` dosyasında hatırlanır (opencode'da plugin için
  yerleşik bir kapatma mekanizması yoktur).
- **Yedekleme** → her yazma işleminden önce `configurator-backups/` klasörüne
  zaman damgalı yedek alınır (son 25 yedek tutulur). Silinen skill'ler de
  buraya taşınır, kalıcı silinmez.

## Notlar

- opencode henüz kurulu olmasa bile kullanılabilir: klasör ve dosyalar
  gerektiğinde oluşturulur, opencode kurulunca hazır olur.
- `opencode.json` içindeki yorumlar (JSONC) okunurken sorun çıkarmaz; ancak bu
  araç dosyayı kaydettiğinde yorumlar korunmaz (yedeği alınır).
- Dışa aktarılan dosya, MCP sunucularına girdiğin **API anahtarlarını
  içerebilir** — dosyayı güvenli bir yerde sakla.
