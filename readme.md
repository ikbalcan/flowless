# Flowless

> Süreç insana uyar, insan sürece değil.

Yazılım geliştirme süreçlerini izleyen, anlayan ve besleyen bir ajan sistemi. GitHub webhook ile commit'leri dinler, AI ile yorumlar ve dokümantasyon üretir, Slack ile ekibi bilgilendirir.

## Hızlı Başlangıç

```bash
# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur (aşağıdaki Ortam Değişkenleri bölümüne bakın)
cp .env.example .env

# Derle ve başlat
npm run build
npm start
```

- **Dashboard:** http://localhost:4000
- **GitHub webhook:** `POST /webhook/github` (port 3000)

## Ortam Değişkenleri

`.env` dosyası oluşturun ve gerekli değerleri ayarlayın:

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `OPENAI_API_KEY` | Evet | OpenAI API anahtarı |
| `OPENAI_MODEL` | Hayır | Model adı (varsayılan: gpt-4o) |
| `GITHUB_WEBHOOK_SECRET` | Hayır | GitHub webhook imza doğrulaması. Yoksa mock input kullanılır |
| `WEBHOOK_PORT` | Hayır | Webhook portu (varsayılan: 3000) |
| `SLACK_WEBHOOK_URL` | Hayır | Slack Incoming Webhook URL. Varsa `notify_team` gerçek Slack'e gönderir |
| `GITHUB_TOKEN` | Hayır | GitHub Projects API erişimi için (token: \`project\` scope) |
| `DASHBOARD_PORT` | Hayır | Dashboard portu (varsayılan: 4000) |

## Konfigürasyon

`flowless.config.yaml` ile tool'lar ve branch kuralları yapılandırılır:

```yaml
# Branch kuralları — hangi branch'te hangi tool'lar çalışsın
branchRules:
  main:
    - generate_doc    # Commit'ten doküman üret
    - notify_team    # Slack'e bildirim gönder
  develop:
    - log_event
    - create_comment

default:
  - log_event
```

## Özellikler

### Tool'lar

| Tool | Açıklama |
|------|----------|
| `log_event` | Event'i loglar |
| `generate_doc` | Commit mesajı ve değişen dosyalardan Markdown dokümantasyon üretir (Özet, Değişiklikler, Etkilenen Alanlar, Önerilen Sonraki Adımlar) |
| `notify_team` | Ekibe Slack bildirimi gönderir. `generate_doc` ile birlikte çalışırsa zengin özet kullanır |
| `update_ticket` | Ticket güncelleme (Jira vb.) |
| `update_github_project` | Commit/PR mesajındaki `#123` ile GitHub Projects'te issue statüsünü günceller |
| `create_comment` | Yorum oluşturma |

### GitHub Webhook Kurulumu

1. `ngrok http 3000` ile tunnel açın
2. GitHub repo → Settings → Webhooks → Add webhook
3. Payload URL: `https://<ngrok-url>/webhook/github`
4. Content type: `application/json`
5. Secret: `.env` içindeki `GITHUB_WEBHOOK_SECRET`

### Slack Bildirimi

1. [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks) ile webhook oluşturun
2. URL'yi `.env` dosyasına `SLACK_WEBHOOK_URL` olarak ekleyin
3. `main` branch'e push yapıldığında otomatik bildirim gider

### GitHub Projects

Commit veya PR mesajında `#123` gibi issue referansı varsa, Flowless ilgili issue'nun GitHub Projects'teki statüsünü günceller.

```yaml
# flowless.config.yaml
github_projects:
  token: ${GITHUB_TOKEN}
  project_number: 1
  transitions:
    commit_pushed: "In Progress"
    commit_pushed_completed: "Done"   # closes #1, tamamlandı, done, … ile push
    pr_opened: "In Review"
    pr_merged: "Done"
```

- **Normal push** (`#1 yeni özellik`): issue **In Progress** olur.
- **Tamamlanma** (`closes #1`, `fixes #2`, mesajda *tamamlandı* / *done* / *completed* vb.): issue **Done** olur (Todo’da olsa bile kart statüsü güncellenir).

Örnek: `git commit -m "#1 add new feature"` → Flowless issue #1'i "In Progress" yapar, doc üretir, Slack'e haber verir.

`github_projects` + ilgili `transitions` tanımlıysa ve branch kurallarında `update_github_project` varsa, agent **GitHub statü tool'unu LLM seçmese bile otomatik ekler** (mesajda `#issue` yoksa tool yine no-op).

### Sorun giderme: Sadece doc + Slack çalışıyor

1. **Başlangıçta** konsolda `flowless.config.yaml bulunamadı` görüyorsan uygulama varsayılan config kullanıyor; `github_projects` yüklenmez. Uygulamayı `flowless.config.yaml` dosyasının olduğu dizinden çalıştır veya dosya yolunu kontrol et.
2. Başarılı yüklemede şunu görmelisin: `Config: .../flowless.config.yaml` ve `github_projects: aktif`.
3. **Commit mesajında** ilgili repodaki issue için `#12` gibi referans olmalı; Projects’e eklediğin kart **repo issue’su** olmalı (yalnızca proje içi taslak “task” issue numarası üretmez).
4. `GITHUB_TOKEN` için `project` scope ve ilgili repo/org erişimi gerekir.

## Proje Yapısı

```
flowless/
├── core/                 # Agent, normalizer, LLM
├── tools/                # generate_doc, notify_team, log_event, vb.
├── inputs/               # GitHub webhook, mock
├── config/               # YAML loader, branch kuralları
├── dashboard/             # Dashboard UI ve API
├── flowless.config.yaml  # Tool ve branch konfigürasyonu
└── index.ts              # Ana giriş
```

## Scripts 

| Komut | Açıklama |
|-------|----------|
| `npm run build` | TypeScript derleme |
| `npm start` | Uygulamayı başlat (webhook + dashboard) |
| `npm run dashboard` | Sadece dashboard (webhook/OpenAI olmadan) |
| `npm run dev` | TypeScript watch modu |

## Mimari

Detaylı mimari dökümanı için [project.md](./project.md) dosyasına bakın.
