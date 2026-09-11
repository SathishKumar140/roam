import { v4 as uuidv4 } from "uuid";
import { OpenAIEmbeddings } from "@langchain/openai";
import { getClickHouseClient, initClickHouseSchema } from "./clickhouse";
import OpenAI from "openai";

let embeddingsModel: OpenAIEmbeddings | null = null;

function getEmbeddingsModel(): OpenAIEmbeddings | null {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openRouterKey && !openAiKey) {
    console.warn("[Memory] Neither OPENROUTER_API_KEY nor OPENAI_API_KEY set, embeddings disabled.");
    return null;
  }
  if (!embeddingsModel) {
    embeddingsModel = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      apiKey: openRouterKey || openAiKey,
      configuration: openRouterKey
        ? { baseURL: "https://openrouter.ai/api/v1" }
        : undefined,
    });
  }
  return embeddingsModel;
}

/**
 * Retrieves the most semantically relevant user preferences from ClickHouse vector store.
 */
export async function retrieveUserPreferences(
  userId: string,
  query: string,
  limit: number = 5
): Promise<string[]> {
  try {
    const initialized = await initClickHouseSchema();
    if (!initialized) return [];

    const client = getClickHouseClient();
    const embedder = getEmbeddingsModel();
    if (!client || !embedder) return [];

    // 1. Generate query embedding
    const queryEmbedding = await embedder.embedQuery(query);

    // 2. Query ClickHouse using cosineDistance
    const resultSet = await client.query({
      query: `
        SELECT extracted_preference,
               cosineDistance(preference_embedding, {queryEmbedding:Array(Float32)}) AS distance
        FROM user_memory
        WHERE user_id = {userId:String}
        ORDER BY distance ASC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        queryEmbedding,
        userId,
        limit,
      },
      format: "JSONEachRow",
    });

    const rows = await resultSet.json<{
      extracted_preference: string;
      distance: number;
    }>();

    // Filter by semantic distance threshold (cosine distance <= 0.8 is relevant)
    const relevant = rows
      .filter((row) => row.distance <= 0.85)
      .map((row) => row.extracted_preference);

    return relevant;
  } catch (err) {
    console.warn("[Memory] Error retrieving preferences from ClickHouse:", err);
    return [];
  }
}

/**
 * Stores an extracted preference into ClickHouse with its vector embedding.
 */
export async function saveUserPreference(
  userId: string,
  rawQuery: string,
  extractedPreference: string
): Promise<void> {
  try {
    const initialized = await initClickHouseSchema();
    if (!initialized) return;

    const client = getClickHouseClient();
    const embedder = getEmbeddingsModel();
    if (!client || !embedder) return;

    const embedding = await embedder.embedQuery(extractedPreference);
    const interactionId = uuidv4();

    await client.insert({
      table: "user_memory",
      values: [
        {
          user_id: userId,
          interaction_id: interactionId,
          raw_query: rawQuery,
          extracted_preference: extractedPreference,
          preference_embedding: embedding,
        },
      ],
      format: "JSONEachRow",
    });

    console.log(`[Memory] Saved preference for user ${userId}: "${extractedPreference}"`);
  } catch (err) {
    console.warn("[Memory] Failed to save preference into ClickHouse:", err);
  }
}

/**
 * Extracts persistent user preferences (e.g. dietary restrictions, interests, travel pace)
 * from a user query and assistant response, and saves them to ClickHouse.
 */
export async function extractAndSavePreferences(
  userId: string,
  rawQuery: string,
  botResponse: string
): Promise<string[]> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!openRouterKey && !openAiKey) return [];

  try {
    const openai = openRouterKey
      ? new OpenAI({
          apiKey: openRouterKey,
          baseURL: "https://openrouter.ai/api/v1",
        })
      : new OpenAI({ apiKey: openAiKey });

    const model = openRouterKey
      ? "openrouter/auto"
      : "gpt-4o-mini";
    const extractionPrompt = `
You are a memory extraction component for a personal concierge bot.
Analyze the user's message and identify any long-term preferences, dietary habits, constraints, or interests.
Ignore temporary ephemeral instructions (e.g. "show me where to eat now").
Only extract enduring traits (e.g. "Prefers vegetarian or vegan food", "Enjoys quiet nature trails", "Prefers budget under $30", "Dislikes crowded places").

User message: "${rawQuery}"
Assistant response snippet: "${botResponse.slice(0, 300)}"

Respond ONLY with a JSON array of strings representing 0 to 3 extracted preferences.
Example format: ["Prefers vegetarian food", "Likes outdoor shaded trails"]
If no enduring preferences are revealed, respond with [].
`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: extractionPrompt }],
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // The response could be { preferences: [...] } or array-like
    let preferences: string[] = [];
    if (Array.isArray(parsed)) {
      preferences = parsed;
    } else if (Array.isArray(parsed.preferences)) {
      preferences = parsed.preferences;
    } else {
      const firstArrayValue = Object.values(parsed).find((val) => Array.isArray(val));
      if (Array.isArray(firstArrayValue)) {
        preferences = firstArrayValue as string[];
      }
    }

    // Save each preference
    for (const pref of preferences) {
      if (typeof pref === "string" && pref.trim().length > 0) {
        await saveUserPreference(userId, rawQuery, pref.trim());
      }
    }

    return preferences;
  } catch (err) {
    console.warn("[Memory] Preference extraction failed:", err);
    return [];
  }
}
