# Flowless — Architecture Documentation

> Süreç insana uyar, insan sürece değil.

---

## Vizyon

Flowless, yazılım geliştirme süreçlerini izleyen, anlayan ve besleyen bir ajan sistemidir.

Geliştirici sadece işini yapar — kod yazar, commit atar, konuşur. Flowless arka planda süreci takip eder, statüleri günceller, dokümantasyonu üretir, boşlukları tespit eder.

Kimse süreci öğrenmek zorunda değildir. Kimseye zorlama yoktur. **Sistem insanı izler.**

---

## Temel Tasarım Prensipleri

### 1. Dependency-free core
Core katmanı hiçbir dış servise, araca ya da platforma bağımlı değildir. GitHub bilmez, Jira bilmez, Azure bilmez. Sadece kendi interface'lerini bilir.

### 2. Her yerde çalışır
Connector değişir, core değişmez. Jira kullanan ekip de çalışır, Linear kullanan da, kendi iç aracını kullanan da.

### 3. Input agnostic
Webhook mi, polling mi, MCP mi, manual trigger mi — fark etmez. Core her zaman normalize edilmiş event alır.

### 4. Output agnostic
Hangi hedefe yazılacağı connector'ın işidir. Core sadece action üretir, nereye gideceğini bilmez.

### 5. AI reasoning merkezi
Kural tabanlı değil. Her event için AI yorumlar, karar verir, aksiyon planlar. Kural yazılmaz, bağlam verilir.

---

## Katman Mimarisi

```
┌─────────────────────────────────────────────┐
│                   FLOWLESS                  │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │         INPUT LAYER                 │   │
│  │  Webhook │ Polling │ MCP │ Manual   │   │
│  └──────────────────┬──────────────────┘   │
│                     │ FlowlessEvent         │
│  ┌──────────────────▼──────────────────┐   │
│  │         CORE — AGENT ENGINE         │   │
│  │  Normalizer → AI Reasoning          │   │
│  │               → Action Planner      │   │
│  └──────────────────┬──────────────────┘   │
│                     │ FlowlessAction        │
│  ┌──────────────────▼──────────────────┐   │
│  │        OUTPUT LAYER — CONNECTORS    │   │
│  │  Jira │ GitHub │ Azure │ Mock │ +   │   │
│  └─────────────────────────────────────┘   │
│                     │                       │
│  ┌──────────────────▼──────────────────┐   │
│  │            DASHBOARD                │   │
│  │  Agent durumu · Aksiyon geçmişi     │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## Proje Yapısı

```
flowless/
├── core/
│   ├── interfaces.ts       → IInputConnector, IOutputConnector, FlowlessEvent, FlowlessAction
│   ├── normalizer.ts       → Ham event → FlowlessEvent dönüşümü
│   ├── agent.ts            → AI reasoning + action planning
│   └── context.ts          → Agent'a verilecek bağlam yönetimi
│
├── connectors/
│   ├── mock.ts             → Test ve geliştirme için
│   ├── github.ts           → GitHub connector
│   ├── jira.ts             → Jira connector
│   └── azure-devops.ts     → Azure DevOps connector
│
├── inputs/
│   ├── webhook.ts          → HTTP webhook dinleyici
│   ├── polling.ts          → Periyodik kaynak sorgulama
│   └── mcp.ts              → MCP protokolü üzerinden input
│
├── dashboard/
│   ├── index.ts            → Dashboard server
│   └── store.ts            → Event ve aksiyon geçmişi
│
└── index.ts                → Ana giriş noktası
```

---

## Core Interfaces

Core katmanının dışarıya bağımlılığı yoktur. Tüm dış dünya bu interface'ler üzerinden konuşur.

### FlowlessEvent
Her inputtan gelen verinin normalize edilmiş hali.

```typescript
interface FlowlessEvent {
  id: string
  source: string        // nereden geldi: "github", "jira", "mock"
  type: string          // ne oldu: "commit_pushed", "pr_opened", "ticket_updated"
  payload: unknown      // ham veri — normalizer işler
  timestamp: Date
  metadata?: Record<string, unknown>
}
```

### FlowlessAction
Core'un ürettiği, connector'ın uygulayacağı aksiyon.

```typescript
interface FlowlessAction {
  id: string
  type: string              // "update_ticket", "create_comment", "generate_doc"
  targetConnector: string   // hangi connector uygulayacak
  payload: unknown          // connector'a özel veri
  reasoning?: string        // AI neden bu aksiyona karar verdi
}
```

### IInputConnector
Her input kaynağının uygulaması gereken interface.

```typescript
interface IInputConnector {
  name: string
  listen(onEvent: (event: FlowlessEvent) => void): void
  stop(): void
}
```

### IOutputConnector
Her hedef sistemin uygulaması gereken interface.

```typescript
interface IOutputConnector {
  name: string
  execute(action: FlowlessAction): Promise<FlowlessResult>
}

interface FlowlessResult {
  success: boolean
  data?: unknown
  error?: string
}
```

---

## Core — Agent Engine

### Normalizer
Ham payload'ı `FlowlessEvent`'e dönüştürür. Her input kaynağının kendi normalizer'ı olabilir ya da genel bir normalizer kullanılabilir.

Görevleri:
- Kaynak tipini tespit etmek
- Event tipini belirlemek
- Payload'ı standart forma sokmak
- Timestamp ve metadata eklemek

### AI Reasoning
`FlowlessEvent` alır, ne yapılması gerektiğini yorumlar.

Girdi: normalize edilmiş event + sistem bağlamı
Çıktı: yapılması gereken aksiyonların listesi + her aksiyon için gerekçe

AI'a verilecek bağlam şunları içerir:
- Event detayı
- Proje/takım konfigürasyonu
- Geçmiş aksiyonlar (kısa bellek)
- Hangi connector'ların aktif olduğu

### Action Planner
AI reasoning çıktısını `FlowlessAction` listesine dönüştürür.
Hangi connector'ın hangi aksiyonu uygulayacağına karar verir.
Aksiyon sıralaması ve bağımlılık yönetimi burada yapılır.

---

## Connector Geliştirme Rehberi

Yeni bir connector eklemek için sadece `IOutputConnector` interface'ini implement et.

```typescript
// connectors/ornekConnector.ts

export class OrnekConnector implements IOutputConnector {
  name = 'ornek'

  async execute(action: FlowlessAction): Promise<FlowlessResult> {
    // action.type'a göre ilgili API çağrısını yap
    // FlowlessResult döndür
  }
}
```

Core'da hiçbir değişiklik gerekmez. Connector'ı kayıt et, çalışır.

---

## Mock Connector

Geliştirme ve test için gerçek bir servise ihtiyaç duymadan çalışmayı sağlar.

Yapması gerekenler:
- Her aksiyonu konsola loglar
- Başarılı sonuç döndürür
- Opsiyonel olarak hata simüle edebilir

Tüm geliştirme ve unit testler mock connector üzerinden yapılır.

---

## Dashboard

Agent'ın ne yaptığını görünür kılar.

Gösterilen bilgiler:
- Son N event listesi (kaynak, tip, zaman)
- Her event için üretilen aksiyonlar
- Aksiyon sonuçları (başarılı / başarısız)
- AI reasoning gerekçeleri

Teknoloji bağımsızdır. REST API açar, üstüne istenen UI yazılabilir.

---

## Geliştirme Sırası

### Faz 1 — Core iskelet
- [x] `interfaces.ts` yaz
- [x] `normalizer.ts` yaz
- [x] `mock` input connector yaz
- [x] `mock` output connector yaz
- [x] Core döngüsünü çalıştır: mock input → normalizer → mock output

### Faz 2 — AI reasoning
- [x] `agent.ts` yaz
- [x] LLM entegrasyonu ekle (provider agnostic)
- [x] Bağlam yönetimini kur
- [x] Mock üzerinde test et

### Faz 3 — İlk gerçek connector
- [x] GitHub webhook input
- [ ] Jira output connector
- [ ] Uçtan uca test: GitHub commit → Jira ticket güncelle

### Faz 4 — Dashboard
- [ ] Event store
- [ ] REST API
- [ ] Basit UI

### Faz 5 — Yeni connector'lar
- [ ] Azure DevOps
- [ ] Linear
- [ ] Slack
- [ ] Özel / internal sistemler

---

## Konfigürasyon Yapısı

```yaml
# flowless.config.yaml

agent:
  model: "gpt-4o"           # veya claude, gemini — provider agnostic
  context_window: 10        # kaç önceki aksiyon hafızada tutulsun

inputs:
  - type: webhook
    port: 3000
  - type: polling
    source: github
    interval: 60

connectors:
  - name: github
    token: ${GITHUB_TOKEN}
  - name: jira
    url: ${JIRA_URL}
    token: ${JIRA_TOKEN}

dashboard:
  port: 4000
  enabled: true
```

---

## Tasarım Kararları

**Neden interface-first?**
Core'u dış dünyadan izole etmek için. Connector değiştiğinde core'a dokunulmaz. Test için mock yeterlidir.

**Neden AI reasoning kural tabanlı değil?**
Kurallar kırılgandır, bakım ister, edge case'leri kaçırır. AI bağlamı yorumlar, esnek kalır. Yanlış karar verirse bağlam güncellenir — kural yazılmaz.

**Neden provider agnostic LLM?**
OpenAI, Anthropic, yerel model — hangisi kullanılırsa kullanılsın core değişmemelidir.

**Neden dashboard ayrı katman?**
Gözlemlenebilirlik (observability) sistemin bir parçası, sonradan eklenen bir özellik değil.

---

*Flowless · v0.1 · Geliştirme devam ediyor*