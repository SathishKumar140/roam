---
name: project-roam
description: >-
  Architect, operate, debug, and extend Project Roam — the serverless multimodal Telegram
  AI concierge with ClickHouse vector memory, Exa live search, GPT-4o vision, and Multiplayer
  Group Context Arbitration.
---

# Project Roam: Telegram AI Concierge Skill

Use this skill when developing, debugging, operating, or extending **Project Roam**, a serverless, multi-agent AI Concierge built for Telegram with ClickHouse vector memory, Exa real-time search, multimodal GPT-4o vision & Whisper audio, and real-time multiplayer group arbitration.

---

## 1. System Architecture

Project Roam uses an **Asynchronous Proxy Architecture** to satisfy Telegram's strict 3-second webhook timeout requirement while running deep multi-agent pipelines (10–30s):

```
                                          ┌────────────────────────────────────────┐
                                          │            Trigger.dev v3              │
                                          │           (Durable Worker)             │
                                          │                                        │
                                          │  1. In-place status message            │
                                          │  2. Multimodal Parsing:                │
┌──────────────┐     POST < 100ms         │     • Whisper: Audio -> Text           │
│   Telegram   │ ───────────────────────> │     • GPT-4o: Photo -> Vision Analysis │
│   Webhook    │ <─────────────────────── │     • ClickHouse: Group Chat Buffer    │
└──────────────┘     200 OK               │  3. ClickHouse Vector Memory Lookup    │
                                          │  4. Exa Live Web Researcher            │
                                          │  5. LLM Synthesis / Arbitration        │
                                          │  6. Telegram Media Card + Buttons      │
                                          │  7. Async Memory Ingestion             │
                                          └────────────────────────────────────────┘
```

### Components:
1. **Webhook Receiver (`app/api/telegram/route.ts`)**:
   - Responds with `200 OK` in `< 100ms`.
   - Sends immediate Telegram `typing` chat action.
   - For group chats: silently buffers messages to ClickHouse `group_chat_history`.
   - Dispatches background task to Trigger.dev v3 (`tasks.trigger("roam-agent-task", payload)`).
2. **Background Task Runner (`src/trigger/roam.ts`)**:
   - Runs the multi-step agent pipeline durably with OpenTelemetry tracing and retries.
   - Deletes temporary progress messages upon card delivery to keep chats uncluttered.
3. **Multi-Party Group Arbiter (`src/lib/ai.ts`)**:
   - Parses preceding 30–50 group chat messages from ClickHouse.
   - Extracts individual constraints (dietary, budget, location, vibe).
   - Generates intersection search queries and formats **Group Consensus Cards**.
4. **Multimodal Vision Engine (`src/lib/ai.ts` & `src/lib/telegram.ts`)**:
   - Downloads incoming Telegram photos via `downloadTelegramPhoto()`.
   - Analyzes flyers, menus, landmarks, and tickets with GPT-4o Vision.
5. **ClickHouse Cloud Database (`src/lib/clickhouse.ts` & `src/lib/memory.ts`)**:
   - `user_memory`: Stores user preferences with vector embeddings (`cosineDistance`).
   - `group_chat_history`: Stores group message streams for group arbitration.
6. **Live Web Researcher (`src/lib/exa.ts`)**:
   - Queries Exa AI Search with highlights, text snippets, and hero image extraction.

---

## 2. BotFather Configuration Guide

For Roam to operate in both direct messages and group chats:
1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/setprivacy`.
3. Select `@roam_concierge_bot`.
4. Set to **`Disabled`**.
   - *Why*: Allows Roam to buffer group messages to ClickHouse so it has the context needed to arbitrate when tagged.
5. (Optional) Run `/setjoingroups` ➔ `Enable` to allow adding Roam to groups.

---

## 3. Multiplayer Group Context & Multi-Party Arbitration

### The Workflow:
1. Friends chat naturally in a Telegram group:
   - *Alice:* "I'm strictly vegan and prefer gluten-free 🌱"
   - *Bob:* "Keep it under $20 please, I'm on a budget 💸"
   - *Charlie:* "Let's stay around Chinatown or Tanjong Pagar 📍"
2. Someone tags Roam:
   - *"@roam_concierge_bot where should we eat tonight?"*
3. Roam triggers `arbitrateGroupConstraints()`:
   - Extracts `{ userName: "Alice", constraint: "strictly vegan & gluten-free" }`, etc.
   - Produces intersection search query: `"vegan gluten-free restaurant Chinatown Tanjong Pagar under $20 Singapore"`.
4. Exa searches for live verified spots.
5. Roam delivers the **Group Consensus Card**:
   ```markdown
   🤝 Group Consensus Recommendation
   ───────────────
   • Alice: Strictly vegan and gluten-free
   • Bob: Budget under $20
   • Charlie: Chinatown or Tanjong Pagar location
   ───────────────
   🍽️ [Selected Venue](maps_or_website_link)
   • ✨ Vibe: Casual, great for groups
   • 🍴 Why It Works For Everyone:
     - For Alice: [Satisfies vegan & gluten-free]
     - For Bob: [Dishes under $20]
     - For Charlie: [Located in Chinatown / near MRT]
   ```

---

## 4. Multimodal Vision Recognition Workflow

When a user sends a photo (flyer, menu, landmark, ticket) with or without a caption:
1. `downloadTelegramPhoto(fileId)` fetches the binary buffer from Telegram CDN.
2. `analyzeImageWithVision(buffer, mimeType, caption)` runs GPT-4o Vision with JSON schema:
   ```json
   {
     "summary": "Event flyer for Asian Friends Social in Singapore starting at 7PM",
     "detectedText": "Asian Friends Social Singapore Starts 7PM Local Time",
     "searchQuery": "Asian Friends Social Singapore event"
   }
   ```
3. Exa searches for real-world details (ticketing, venue address, operating hours).
4. Delivers an Event / Venue card with native Telegram action buttons (`[ 🎟️ RSVP / Tickets ↗ ]`).

---

## 5. Telegram UI/UX Best Practices

- **Unified Media Cards**: Always use `sendTelegramPhoto(chatId, photoUrl, { caption, buttons })` if the text fits within Telegram's 1024-character caption limit.
- **Progress Cleanup**: Always call `deleteTelegramMessage(chatId, statusMsg.message_id)` right before delivering the final card to eliminate chat noise.
- **Link Buttons**: Convert venue links into native Telegram `InlineKeyboard` buttons:
  - `🎟️` for events, ticketing, and RSVPs.
  - `📍` for Google Maps search.
  - `🌐` for official websites.
- **No Ugly Markdown URLs**: Replace `[Name](URL)` with `**Name**` in the caption text body because the inline buttons handle navigation.

---

## 6. Development & Run Commands

```bash
# 1. Start Next.js Webhook Proxy (Port 3001)
npm run dev

# 2. Start Trigger.dev v3 background task worker
npm run dev:trigger

# 3. Start Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3001

# 4. Register Telegram Webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<TUNNEL_URL>/api/telegram"

# 5. Typecheck & verify
npm run typecheck
```
