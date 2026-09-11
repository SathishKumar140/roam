# 🚀 Project Roam: Telegram-Native AI Concierge

**Project Roam** is a serverless, multi-agent AI concierge bot built for Telegram. It solves the strict Telegram webhook timeout constraint (3 seconds) by employing a **Proxy Architecture** powered by Next.js App Router and Trigger.dev v3 background task orchestration.

Roam combines **real-time live web search (Exa API)**, **multimodal voice transcription (OpenAI Whisper)**, **model routing & reasoning (OpenRouter / Claude 3.5 Sonnet / OpenAI GPT-4o)**, and **persistent semantic memory (ClickHouse Vector DB + LangChain)**.

---

## 🏗️ Architecture & Data Flow

```
[Telegram User] 
       │ (Sends text, GPS pin, or voice note)
       ▼
[Next.js Webhook Proxy: app/api/telegram/route.ts] 
       │ ──> Immediately returns 200 OK (< 100ms)
       ▼ 
[Trigger.dev v3 Background Task: src/trigger/roam.ts]
       ├─► 1. Acknowledgment: Sends "Got it, searching live data..." to Telegram
       ├─► 2. Multimodal Audio: Transcribes voice notes via OpenAI Whisper
       ├─► 3. Vector Memory Retrieval: Queries ClickHouse via LangChain embeddings (cosineDistance)
       ├─► 4. Live Researcher: Queries Exa API for live menus, reviews, trails, and events
       ├─► 5. Orchestrator Synthesis: Synthesizes actionable itinerary with OpenRouter / OpenAI
       ├─► 6. Delivery: Sends formatted markdown with Google Maps links to Telegram
       └─► 7. Memory Ingestion: Extracts enduring preferences and saves to ClickHouse
```

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack, TypeScript)
- **Durable Orchestration**: [Trigger.dev v3 SDK](https://trigger.dev/) (`@trigger.dev/sdk/v3`)
- **Telegram Bot SDK**: [grammY](https://grammy.dev/)
- **Live Web Search**: [Exa AI](https://exa.ai/) (`exa-js`)
- **AI & Reasoning**: [OpenAI](https://platform.openai.com/) & [OpenRouter](https://openrouter.ai/) (supporting Claude 3.5 Sonnet & Llama 3)
- **Audio Transcription**: OpenAI Whisper (`whisper-1`)
- **Vector Memory**: [ClickHouse](https://clickhouse.com/) (`@clickhouse/client`)
- **AI Orchestration & Embeddings**: [LangChain](https://js.langchain.com/) (`@langchain/core`, `@langchain/openai`)

---

## 🗄️ ClickHouse Vector Memory Schema

Roam stores user preferences as 1536-dimensional embeddings (using `text-embedding-3-small`) in ClickHouse:

```sql
CREATE TABLE IF NOT EXISTS user_memory (
  user_id String,
  interaction_id UUID,
  timestamp DateTime DEFAULT now(),
  raw_query String,
  extracted_preference String, -- e.g., "Prefers vegetarian food", "Enjoys quiet shaded hikes"
  preference_embedding Array(Float32) -- For semantic cosine similarity searches
) ENGINE = MergeTree()
ORDER BY (user_id, timestamp);
```

### Semantic Preference Retrieval
```sql
SELECT extracted_preference,
       cosineDistance(preference_embedding, {queryEmbedding:Array(Float32)}) AS distance
FROM user_memory
WHERE user_id = {userId:String}
ORDER BY distance ASC
LIMIT 5;
```

---

## 🚀 Getting Started

### 1. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your API credentials:
```env
TRIGGER_SECRET_KEY=tr_dev_sk_...
TELEGRAM_BOT_TOKEN=...
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...       # Optional: for model routing
EXA_API_KEY=...
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

### 2. Run the Next.js Webhook Proxy
```bash
npm run dev
```
The Next.js server starts on `http://localhost:3000`. The webhook endpoint is ready at `/api/telegram`.

### 3. Run the Trigger.dev Worker
In a separate terminal window:
```bash
npm run dev:trigger
```
This connects to your Trigger.dev project and executes background AI tasks as events are received.

### 4. Connect Telegram Webhook
To connect your Telegram bot (via ngrok, Cloudflare Tunnel, or Cloud Run):
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_TUNNEL_DOMAIN>/api/telegram"
```

To verify the webhook status:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

---

## 🧪 Verification & Testing

Run typecheck:
```bash
npm run typecheck
```

Run Next.js build:
```bash
npm run build
```

Run test suite:
```bash
./node_modules/.bin/tsx tests/verify.ts
```

Run webhook route integration test:
```bash
./node_modules/.bin/tsx --env-file=.env tests/test-webhook.ts
```
