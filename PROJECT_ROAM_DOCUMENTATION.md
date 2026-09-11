# Project Roam: Comprehensive Technical & Architecture Documentation
*The Serverless, Multimodal Telegram AI Concierge with ClickHouse Vector Memory, Exa Real-Time Search, and Multiplayer Group Context Arbitration.*

---

## 1. Executive Summary & Value Proposition

Traditional AI assistants (ChatGPT, Claude, Gemini) are strictly **single-player experiences**. In travel planning or social group meetups, one person is forced to play "secretary"—copying messages from a group chat, pasting them into ChatGPT, trying to balance everyone's conflicting preferences, and copying recommendations back.

**Project Roam** solves this by living directly inside the Telegram group chat:
- **Passive Memory Ingestion**: As friends converse naturally, Roam streams messages into ClickHouse Cloud without spamming the chat.
- **On-Demand Multi-Party Arbitration**: When tagged (e.g. `@roam_concierge_bot`), Roam analyzes the preceding 30–50 messages, extracts everyone's conflicting constraints (dietary, budget, neighborhood, vibe), queries live web sources, and outputs an actionable **Group Consensus Card**.
- **Multimodal Intelligence**: Accepts text, voice notes (Whisper transcription), GPS pins, and event flyers/menus/landmarks (GPT-4o Vision).
- **Single-Player Concierge**: Also serves as an elite 1-on-1 personalized travel concierge, learning user preferences over time with vector embeddings.

---

## 2. Complete Architecture & The Proxy Pattern

### 2.1 The 3-Second Webhook Constraint
Telegram requires webhook receivers to respond with `HTTP 200 OK` within **3 seconds**. If a bot fails to respond in time, Telegram drops the connection and exponentially retries, creating request storms.

However, a production AI agent pipeline takes **10–30 seconds**:
1. Downloading voice notes or photos from Telegram CDN (1–2s)
2. Whisper audio transcription or GPT-4o Vision parsing (2–4s)
3. ClickHouse vector memory cosine search (100–300ms)
4. Exa real-time web discovery across live web pages (2–4s)
5. Multi-agent constraint arbitration & LLM synthesis (3–6s)
6. Formatting interactive Telegram media cards & inline buttons (500ms)
7. Background preference extraction & embedding insertion (1–2s)

### 2.2 The Asynchronous Proxy Solution

```
                                          ┌────────────────────────────────────────────────────────┐
                                          │                     Trigger.dev v3                     │
                                          │                   (Durable AI Worker)                  │
                                          │                                                        │
                                          │  1. In-place status message ("Heard...", "Analyzing")  │
                                          │  2. Multimodal Parsing:                                │
┌──────────────┐     POST < 100ms         │     • Whisper: voice note -> text                      │
│   Telegram   │ ───────────────────────> │     • GPT-4o: flyer/photo -> vision analysis           │
│   Webhook    │ <─────────────────────── │     • ClickHouse: group message buffer                 │
└──────────────┘     200 OK               │  3. Multi-Party Arbitration (if group chat)            │
                                          │  4. ClickHouse Vector Memory Lookup (cosineDistance)   │
                                          │  5. Exa Live Web Researcher                            │
                                          │  6. LLM Orchestration & Group Consensus Synthesis      │
                                          │  7. Delivery: Unified Photo Card + Action Buttons      │
                                          │  8. Delete temporary progress status message           │
                                          │  9. Async Preference Ingestion into ClickHouse         │
                                          └────────────────────────────────────────────────────────┘
```

- **Frontend Proxy (`app/api/telegram/route.ts`)**: Next.js App Router route that validates requests, fires Telegram's typing action, streams group messages to ClickHouse, triggers `roam-agent-task` on Trigger.dev v3, and returns `200 OK` in **< 100ms**.
- **Durable Worker (`src/trigger/roam.ts`)**: Background agent task that manages long-running steps with OpenTelemetry tracing, live progress updates, and graceful error handling.

---

## 3. Multiplayer Group Context & Multi-Party Arbitration

### 3.1 The Group Dilemma
When 4 friends discuss dinner plans in Telegram:
- **Alice**: *"I'm strictly vegan and prefer gluten-free 🌱"*
- **Bob**: *"Keep it under $20 please, I'm on a budget 💸"*
- **Charlie**: *"Let's stay around Chinatown or Tanjong Pagar 📍"*
- **Sarah**: *"@roam_concierge_bot where should we eat tonight?"*

### 3.2 Database Streaming Schema (`group_chat_history`)
Every non-command message in a group chat is silently inserted into ClickHouse Cloud AWS Singapore:
```sql
CREATE TABLE IF NOT EXISTS group_chat_history (
  chat_id Int64,
  user_id String,
  user_name String,
  text String,
  timestamp DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (chat_id, timestamp);
```

### 3.3 Multi-Party Constraint Arbiter (`src/lib/ai.ts`)
When Roam is summoned, `arbitrateGroupConstraints()` runs:
```typescript
export async function arbitrateGroupConstraints(
  messages: Array<{ userName: string; text: string }>,
  currentQuery: string
): Promise<GroupArbitrationResult>
```
1. **Extraction**: Identifies each participant's constraints (diet, budget, location, vibe).
2. **Intersection Query**: Synthesizes a focused search query:
   `"vegan gluten-free restaurant Chinatown Tanjong Pagar under $20 Singapore"`.
3. **Consensus Synthesis**: Formulates the **Group Consensus Card**:
   ```markdown
   🤝 Group Consensus Recommendation
   ───────────────
   • Alice: Strictly vegan and gluten-free
   • Bob: Budget under $20
   • Charlie: Chinatown or Tanjong Pagar location
   ───────────────
   🍽️ Cultivate
   • ✨ Vibe: Health-focused, organic, library atmosphere within Maxwell Reserve
   • 🍴 Why It Works For Everyone:
     - For Alice: 100% plant-based & gluten-free earth bowls and tarts
     - For Bob: Grab-and-go options under $20
     - For Charlie: Located in Chinatown/Tanjong Pagar (2 Cook St)

   [ 🌐 View Cultivate Details ↗ ]
   ```

---

## 4. Multimodal Sensory Pipeline

### 4.1 Voice Notes (OpenAI Whisper)
- Downloads audio from Telegram CDN (`.ogg` Opus format).
- Calls OpenAI Whisper (`whisper-1`) with Singapore localized vocabulary prompting:
  `Singapore, Hougang, Ang Mo Kio, Tanjong Pagar, Bugis, Chinatown, Orchard, Marina Bay, cafes, matcha, food, itineraries`.
- Updates the live status tracker: `🎧 Heard: "..."`.

### 4.2 Photo & Vision Recognition (GPT-4o Vision)
- Downloads photo from Telegram CDN into a memory buffer (`downloadTelegramPhoto`).
- Calls GPT-4o Vision with structured JSON output:
  - `summary`: One-sentence explanation of what is in the photo.
  - `detectedText`: Exact text on the flyer, menu, or poster.
  - `searchQuery`: Targeted 3–6 word search term to find the official event/venue online.
- Enables queries like *"What is this and where is it happening?"* on event flyers, returning verified dates, ticket links, and Google Maps pins.

---

## 5. Context Memory & Real-Time Discovery Layer

### 5.1 ClickHouse Cloud Vector Memory (`user_memory`)
```sql
CREATE TABLE IF NOT EXISTS user_memory (
  user_id String,
  interaction_id UUID,
  timestamp DateTime DEFAULT now(),
  raw_query String,
  extracted_preference String,
  preference_embedding Array(Float32)
) ENGINE = MergeTree()
ORDER BY (user_id, timestamp);
```
- Retrieves 5 most relevant historical preferences using `cosineDistance`:
  ```sql
  SELECT extracted_preference,
         cosineDistance(preference_embedding, {queryEmbedding:Array(Float32)}) AS distance
  FROM user_memory
  WHERE user_id = {userId:String}
  ORDER BY distance ASC
  LIMIT 5;
  ```
- **Graceful Degradation**: If ClickHouse is temporarily unavailable, the system logs a warning and proceeds without interruption.

### 5.2 Exa AI Live Web Search
- Ingests queries augmented with GPS coordinates: `${query} near coordinates ${lat}, ${lng}`.
- Fetches text highlights, clean snippets, and high-resolution hero images.
- Distinguishes between **Events / Hackathons / Conferences** (dates, schedule, tickets) and **Venues / Dining** (vibe, must-try items, prices).

---

## 6. Telegram UI/UX Engineering

1. **Unified Embedded Media Cards**:
   - Upgraded `sendTelegramPhoto` to attach the card text as the **caption** and interactive buttons directly to the photo.
   - Fits within Telegram's 1024-character caption limit for an all-in-one native card.
2. **Ephemeral Progress Message Tracking**:
   - Displays live status updates: `🎙️ Transcribing...` ➔ `🎧 Heard: '...'` ➔ `✨ Found 3 sources! Formulating...`.
   - Automatically deletes the status message when the final card arrives to maintain a spotless chat history.
3. **Native Action Buttons (`InlineKeyboard`)**:
   - `🎟️ [Event / Ticket Link]`
   - `📍 [Google Maps Search Link]`
   - `🌐 [Official Website Link]`
4. **Clean Typography**:
   - Strips raw ugly URLs from the text body (`[Name](URL)` becomes `**Name**`).
   - Disables generic web preview boxes (`link_preview_options: { is_disabled: true }`).

---

## 7. BotFather Configuration Guide

To enable multiplayer group functionality:
1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/setprivacy`.
3. Select `@roam_concierge_bot`.
4. Choose **`Disabled`**.
   - *Reason*: Allows Telegram to deliver group chat messages so Roam can maintain the streaming context buffer in ClickHouse.
5. Send `/setjoingroups` ➔ **`Enabled`** (allows the bot to be added to group chats).

---

## 8. Environment Variables Reference

| Variable | Description | Example |
| :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather | `8340655841:AAGAV...` |
| `OPENAI_API_KEY` | Powers Whisper transcription & GPT-4o Vision | `sk-proj-...` |
| `OPENROUTER_API_KEY` | Optional LLM routing (Claude 3.5 Sonnet, etc.) | `sk-or-v1-...` |
| `AI_MODEL_NAME` | Default synthesis model | `openrouter/auto` or `gpt-4o` |
| `EXA_API_KEY` | Live web search and hero image discovery | `4a9dd127-...` |
| `CLICKHOUSE_URL` | ClickHouse Cloud endpoint | `https://h66krinijc.ap-southeast-1.aws.clickhouse.cloud:8443` |
| `CLICKHOUSE_USER` | ClickHouse username | `default` |
| `CLICKHOUSE_PASSWORD`| ClickHouse user password | `...` |
| `TRIGGER_SECRET_KEY` | Trigger.dev v3 API secret | `tr_dev_...` |

---

## 9. Verification & Run Commands

```bash
# 1. Typecheck the entire TypeScript codebase
npm run typecheck

# 2. Start the Next.js Webhook Proxy (Port 3001)
npm run dev

# 3. Start the Trigger.dev background task worker
npm run dev:trigger

# 4. Start Cloudflare Tunnel for secure HTTPS edge delivery
cloudflared tunnel --url http://localhost:3001

# 5. Register Telegram Webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<TUNNEL_URL>/api/telegram"
```
