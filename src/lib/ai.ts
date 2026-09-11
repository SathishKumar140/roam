import OpenAI, { toFile } from "openai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { FormattedSearchResult } from "./exa";

/**
 * Returns an OpenAI client configured for either OpenRouter (if OPENROUTER_API_KEY is present)
 * or standard OpenAI.
 */
export function getLLMClient(): { client: OpenAI; model: string } {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (openRouterKey) {
    return {
      client: new OpenAI({
        apiKey: openRouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://project-roam.ai",
          "X-Title": "Project Roam Telegram Concierge",
        },
      }),
      model: process.env.AI_MODEL_NAME || "openrouter/auto",
    };
  }

  if (!openAiKey) {
    throw new Error("Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  return {
    client: new OpenAI({ apiKey: openAiKey }),
    model: process.env.AI_MODEL_NAME || "gpt-4o",
  };
}

/**
 * Transcribes audio (voice note) into text using OpenAI Whisper.
 */
export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for Whisper voice transcription.");
  }

  const openai = new OpenAI({ apiKey });
  const file = await toFile(Buffer.from(audioBuffer), "voice_note.ogg", {
    type: "audio/ogg",
  });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    prompt: "Singapore, Hougang, Ang Mo Kio, Tanjong Pagar, Bugis, Chinatown, Orchard, Marina Bay, cafes, matcha, food, itineraries",
  });

  return response.text;
}

export interface VisionAnalysisResult {
  summary: string;
  detectedText: string;
  searchQuery: string;
}

/**
 * Multimodal Vision Parsing using OpenAI GPT-4o.
 * Identifies menus, flyers, event posters, landmarks, dishes, or tickets.
 */
export async function analyzeImageWithVision(
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg",
  userPrompt?: string
): Promise<VisionAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("API key is required for image recognition.");
  }

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const client = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://project-roam.ai",
          "X-Title": "Project Roam Telegram Concierge",
        },
      });

  const model = process.env.OPENAI_API_KEY
    ? "gpt-4o"
    : (process.env.AI_MODEL_NAME || "openrouter/auto");

  const promptText =
    userPrompt && userPrompt.trim().length > 0
      ? `The user sent this photo with the message: "${userPrompt}". Analyze the photo to answer their question.`
      : `Analyze this image in detail. Identify the place, event, flyer, dish, menu, or landmark.`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are the Vision Engine for "Roam", an elite Telegram AI concierge.
Examine the image carefully.
Extract:
1. "summary": A crisp 1-sentence description of what the image shows (e.g. "Event flyer for Asian Friends Social in Singapore starting at 7PM").
2. "detectedText": Key visible text (event/venue title, date, time, location, price, highlights).
3. "searchQuery": A focused 3-6 word search query for finding the official event, tickets, or venue on the web (e.g. "Asian Friends Social Singapore event").

Output ONLY a valid JSON object matching this schema:
{
  "summary": string,
  "detectedText": string,
  "searchQuery": string
}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const rawJson = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(rawJson);
    return {
      summary: parsed.summary || "Image analyzed",
      detectedText: parsed.detectedText || "",
      searchQuery: parsed.searchQuery || parsed.summary || "",
    };
  } catch {
    return {
      summary: rawJson,
      detectedText: "",
      searchQuery: "",
    };
  }
}

export interface GroupParticipantConstraint {
  userName: string;
  constraint: string;
}

export interface GroupArbitrationResult {
  constraints: GroupParticipantConstraint[];
  consensusSummary: string;
  searchQuery: string;
}

/**
 * Multi-party group constraint arbitration:
 * Analyzes preceding group chat messages to extract constraints from different friends
 * (dietary, budget, location, vibes) and synthesizes an optimal search query.
 */
export async function arbitrateGroupConstraints(
  messages: Array<{ userName: string; text: string }>,
  currentQuery: string
): Promise<GroupArbitrationResult> {
  const { client, model } = getLLMClient();

  const conversationTranscript = messages
    .map((m) => `${m.userName}: "${m.text}"`)
    .join("\n");

  const prompt = `You are the Multi-Party Group Arbiter for "Roam", an elite Telegram AI concierge.
Analyze the preceding group conversation where multiple friends are discussing plans, dining, or meetups.
Identify each participant's stated preferences and constraints:
- Dietary (vegan, vegetarian, halal, gluten-free, allergies)
- Budget (cheap, <$20, splurge, affordable)
- Location / neighborhood (Chinatown, Tanjong Pagar, Bugis, MRT-accessible)
- Vibe / activity (chill, rooftop, dinner, drinks, casual)

Then create a concise 3-6 word search query for a search engine to find venues satisfying ALL constraints simultaneously.

Output ONLY a JSON object matching this schema:
{
  "constraints": [
    { "userName": "string", "constraint": "string" }
  ],
  "consensusSummary": "1-sentence summary of the shared goal",
  "searchQuery": "focused search query combining all constraints"
}`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Group Conversation:\n${conversationTranscript}\n\nLatest Trigger Query: "${currentQuery}"\n\nArbitrate group constraints.`,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const rawJson = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(rawJson);
    let searchQuery = parsed.searchQuery || currentQuery;
    if (
      !searchQuery.toLowerCase().includes("singapore") &&
      !searchQuery.toLowerCase().includes("malaysia") &&
      !searchQuery.toLowerCase().includes("tokyo") &&
      !searchQuery.toLowerCase().includes("bali")
    ) {
      searchQuery = `${searchQuery} Singapore`;
    }

    return {
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
      consensusSummary: parsed.consensusSummary || "Group consensus planning",
      searchQuery,
    };
  } catch (err) {
    console.warn("[Group Arbitration] Failed to parse group constraints:", err);
    return {
      constraints: [],
      consensusSummary: "Group planning",
      searchQuery: currentQuery,
    };
  }
}

export interface ConciergeCardResult {
  content: string;
  buttons: Array<{ label: string; url: string }>;
}

/**
 * Synthesizes a concierge response combining Exa search results,
 * ClickHouse historical memory preferences, and current user input.
 * Formats as high-usability cards with interactive navigation buttons.
 */
export async function synthesizeConciergeResponse(params: {
  userQuery: string;
  searchContext: string;
  userPreferences: string[];
  location?: { latitude: number; longitude: number };
  rawResults?: FormattedSearchResult[];
  imageAnalysis?: VisionAnalysisResult;
  groupArbitration?: GroupArbitrationResult;
}): Promise<ConciergeCardResult> {
  const { client, model } = getLLMClient();

  const preferencesContext =
    params.userPreferences.length > 0
      ? params.userPreferences.map((p) => `- ${p}`).join("\n")
      : "None recorded yet.";

  const locationContext = params.location
    ? `User Coordinates: Latitude ${params.location.latitude}, Longitude ${params.location.longitude}`
    : "Default to Singapore unless specified otherwise.";

  const imageContext = params.imageAnalysis
    ? `User Uploaded Photo Analysis:
• What it shows: ${params.imageAnalysis.summary}
• Detected text: ${params.imageAnalysis.detectedText}
(CRITICAL: The user uploaded this photo. Your card MUST directly identify and explain the event, venue, or details shown in the photo, and answer their question!).\n\n`
    : "";

  const groupContext =
    params.groupArbitration && params.groupArbitration.constraints.length > 0
      ? `MULTI-PARTY GROUP CONSTRAINTS (KILLER FEATURE):
The following friends in the group chat have specific constraints:
${params.groupArbitration.constraints.map((c) => `• ${c.userName}: ${c.constraint}`).join("\n")}
Consensus Goal: ${params.groupArbitration.consensusSummary}

YOU MUST FORMAT AS A GROUP CONSENSUS CARD:
🤝 **Group Consensus Recommendation**
───────────────
${params.groupArbitration.constraints.map((c) => `• **${c.userName}:** ${c.constraint}`).join("\n")}
───────────────
🍽️ **[Venue Name](<maps_or_website_link>)**
• ✨ **Vibe:** [Why it fits this group]
• 🍴 **Why It Works For Everyone:**
${params.groupArbitration.constraints.map((c) => `  - For ${c.userName}: [How this venue satisfies their constraint]`).join("\n")}\n\n`
      : "";

  const systemPrompt = `You are "Roam", an elite, hyper-personalized Telegram AI concierge for Singapore and beyond.
Your mission is to provide concise, visually stunning, highly actionable cards tailored directly to the user's request.

CORE RULES:
1. STRICT TRUTH & TOPIC ALIGNMENT:
   • Rely EXCLUSIVELY on the Uploaded Photo Analysis, Multi-Party Group Constraints, and Live Web Context provided below.
   • If Multi-Party Group Constraints are present:
     - Output the "Group Consensus Recommendation" Card explicitly proving how each friend's preference is satisfied.
   • If the user uploaded a PHOTO or FLYER (e.g. event flyer, menu, landmark):
     - Focus 100% on explaining what is shown in their photo and answering their question (e.g. "What is there and happening where?")!
     - Do NOT recommend unrelated generic apps or random venues.
   • If the user asks about an EVENT, HACKATHON, MEETUP, or FESTIVAL (e.g. "AI Tinkerers", "Asian Friends Social", hackathon, conference, workshop):
     - Focus 100% on the specific event in the Live Web Context!
     - Event Card Format:
       🚀 / 🎉 **[Event Name](<registration_or_event_link>)**
       ───────────────
       • 📅 **When:** [Date & Time from context]
       • 🏷️ **Theme / What It Is:** [Description from context]
       • 📍 **Where:** [Location / Venue / Neighborhood from context]
       • 💡 **Details:** [Highlights, who attends, vibe]
   • If the user asks for DINING, CAFES, NIGHTLIFE, or PLACES (single-player):
     - Provide 1-3 crisp venue cards:
       ☕ / 🍸 / 🍽️ **[Venue Name](<maps_or_website_link>)**
       ───────────────
       • ✨ **Vibe:** [Atmosphere & specialty]
       • 📍 **Area:** [Neighborhood or street]
       • 🍴 **Must-Try:** [Signature food or drinks]
2. LENGTH (CRITICAL FOR MOBILE TELEGRAM CARDS):
   • Keep total response concise (under 850 characters) so it displays cleanly as a mobile card.
3. GROUNDING:
   • NEVER say "I don't have real-time access", "As an AI", or "My training cutoff". You have verified real-time live search context.
4. ACTION LINKS:
   • Format venue/event names as Markdown links [Name](URL) using links from the Live Web Context.

${groupContext}${imageContext}Live Web Context:
${params.searchContext || "No live web results available."}

User Memory & Preferences:
${preferencesContext}

User Location:
${locationContext}`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: params.userQuery },
    ],
    temperature: 0.3,
  });

  const rawContent =
    response.choices[0]?.message?.content ||
    "I searched live sources but couldn't formulate a recommendation. Please try again!";

  // Extract links into native Telegram action buttons
  const buttons: Array<{ label: string; url: string }> = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(rawContent)) !== null) {
    const rawLabel = match[1].replace(/[*_#]/g, "").trim();
    const url = match[2].trim();
    const lower = rawLabel.toLowerCase();
    const urlLower = url.toLowerCase();

    // Filter out search engines or generic links
    const isGeneric =
      lower.includes("google search") ||
      lower.includes("click here") ||
      lower.includes("read more");

    if (!isGeneric && !buttons.some((b) => b.url === url) && buttons.length < 4) {
      let icon = "📍";
      if (
        urlLower.includes("hackathon") ||
        urlLower.includes("aitinkerers") ||
        urlLower.includes("luma") ||
        urlLower.includes("eventbrite") ||
        urlLower.includes("meetup") ||
        lower.includes("event") ||
        lower.includes("rsvp") ||
        lower.includes("register")
      ) {
        icon = "🎟️";
      } else if (urlLower.includes("google.com/maps") || urlLower.includes("maps")) {
        icon = "📍";
      } else {
        icon = "🌐";
      }

      // Truncate long labels for mobile button aesthetics
      const cleanLabel = rawLabel.length > 28 ? rawLabel.slice(0, 26) + "…" : rawLabel;
      buttons.push({
        label: `${icon} ${cleanLabel}`,
        url,
      });
    }
  }

  // If rawResults was provided (from Exa) and we don't have an event/primary button yet,
  // add the primary source link as a button!
  if (params.rawResults && params.rawResults.length > 0) {
    const topResult = params.rawResults[0];
    if (topResult.url && !buttons.some((b) => b.url === topResult.url) && buttons.length < 4) {
      const isEvent =
        topResult.url.includes("aitinkerers") ||
        topResult.url.includes("hackathon") ||
        topResult.title.toLowerCase().includes("hackathon") ||
        topResult.title.toLowerCase().includes("event");

      const icon = isEvent ? "🎟️" : "🌐";
      const shortTitle = topResult.title
        .replace(/—.*$/, "")
        .replace(/\[.*\]$/, "")
        .replace(/\|.*$/, "")
        .trim();
      const label = `${icon} ${shortTitle.length > 26 ? shortTitle.slice(0, 24) + "…" : shortTitle}`;

      buttons.unshift({
        label,
        url: topResult.url,
      });
    }
  }

  // Fallback: If no links exist at all, generate Google Maps search buttons from bold titles
  if (buttons.length === 0) {
    const venueRegex = /(?:[☕🍽️🍸🚀🌿📍\d\.\s-]*\*\*([A-Za-z0-9\s&'’.-]{3,35})\*\*)/g;
    let vMatch;
    while ((vMatch = venueRegex.exec(rawContent)) !== null) {
      const name = vMatch[1].trim();
      const lower = name.toLowerCase();
      if (
        !lower.includes("when") &&
        !lower.includes("theme") &&
        !lower.includes("where") &&
        !lower.includes("vibe") &&
        !lower.includes("area") &&
        !lower.includes("details") &&
        !lower.includes("must-try") &&
        !buttons.some((b) => b.label.includes(name)) &&
        buttons.length < 4
      ) {
        buttons.push({
          label: `📍 ${name}`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " Singapore")}`,
        });
      }
    }
  }

  // Clean the text body: replace [Name](URL) with **Name**, and remove leftover raw URLs
  const cleanedContent = rawContent
    .replace(/\*\*\[([^\]]+)\]\(https?:\/\/[^\s\)]+\)\*\*/g, "**$1**")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s\)]+\)/g, "**$1**")
    .replace(/(?:More details|Register here|Info & RSVP|RSVP):\s*https?:\/\/[^\s\)]+/gi, "")
    .replace(/\|\s*📍\s*\*\*[^*]+\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    content: cleanedContent,
    buttons,
  };
}

/**
 * Alternative synthesis method utilizing LangChain ChatPromptTemplate and ChatOpenAI.
 */
export async function synthesizeWithLangChain(params: {
  userQuery: string;
  searchContext: string;
  userPreferences: string[];
  location?: { latitude: number; longitude: number };
}): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  const chat = new ChatOpenAI({
    modelName:
      process.env.AI_MODEL_NAME ||
      (openRouterKey ? "anthropic/claude-3.5-sonnet" : "gpt-4o"),
    openAIApiKey: openRouterKey || openAiKey,
    configuration: openRouterKey
      ? {
          baseURL: "https://openrouter.ai/api/v1",
        }
      : undefined,
    temperature: 0.4,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are "Roam", an elite Telegram AI concierge.
Rely strictly on the Live Web Context to avoid hallucination.
Incorporate the User Preferences. Provide Google Maps links: [Name](https://www.google.com/maps/search/?api=1&query=Name)

User Memory: {preferences}
Location: {location}
Live Context: {searchContext}`,
    ],
    ["user", "{query}"],
  ]);

  const chain = prompt.pipe(chat);
  const result = await chain.invoke({
    preferences: params.userPreferences.join(", ") || "None",
    location: params.location
      ? `${params.location.latitude}, ${params.location.longitude}`
      : "Not provided",
    searchContext: params.searchContext,
    query: params.userQuery,
  });

  return typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);
}
