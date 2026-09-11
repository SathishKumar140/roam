import { createClient, ClickHouseClient } from "@clickhouse/client";

let clickhouseClient: ClickHouseClient | null = null;
let isInitialized = false;
let isAvailable = true;

/**
 * Get or initialize the ClickHouse client.
 * Gracefully disables if credentials are not configured or connection fails.
 */
export function getClickHouseClient(): ClickHouseClient | null {
  if (!isAvailable) {
    return null;
  }

  if (clickhouseClient) {
    return clickhouseClient;
  }

  const url = process.env.CLICKHOUSE_URL || "http://localhost:8123";
  const username = process.env.CLICKHOUSE_USER || "default";
  const password = process.env.CLICKHOUSE_PASSWORD || "";
  const database = process.env.CLICKHOUSE_DATABASE || "default";

  try {
    clickhouseClient = createClient({
      url,
      username,
      password,
      database,
      request_timeout: 5000,
    });
    return clickhouseClient;
  } catch (err) {
    console.warn("[ClickHouse] Unable to create ClickHouse client, memory will be disabled:", err);
    isAvailable = false;
    return null;
  }
}

/**
 * Initializes the user_memory and group_chat_history tables if they do not exist.
 */
export async function initClickHouseSchema(): Promise<boolean> {
  if (isInitialized) return true;
  const client = getClickHouseClient();
  if (!client) return false;

  try {
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS user_memory (
          user_id String,
          interaction_id UUID,
          timestamp DateTime DEFAULT now(),
          raw_query String,
          extracted_preference String,
          preference_embedding Array(Float32)
        ) ENGINE = MergeTree()
        ORDER BY (user_id, timestamp);
      `,
    });

    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS group_chat_history (
          chat_id Int64,
          user_id String,
          user_name String,
          text String,
          timestamp DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (chat_id, timestamp);
      `,
    });

    isInitialized = true;
    console.log("[ClickHouse] user_memory and group_chat_history verified and initialized.");
    return true;
  } catch (err) {
    console.warn("[ClickHouse] Failed to initialize table schema, memory will be bypassed:", err);
    isAvailable = false;
    return false;
  }
}

/**
 * Saves a group chat message for multi-party group context arbitration.
 */
export async function saveGroupChatMessage(
  chatId: number | string,
  userId: string,
  userName: string,
  text: string
): Promise<boolean> {
  const client = getClickHouseClient();
  if (!client) return false;

  try {
    await initClickHouseSchema();
    await client.insert({
      table: "group_chat_history",
      values: [
        {
          chat_id: Number(chatId),
          user_id: userId,
          user_name: userName,
          text,
        },
      ],
      format: "JSONEachRow",
    });
    return true;
  } catch (err) {
    console.warn("[ClickHouse] Failed to save group chat message:", err);
    return false;
  }
}

/**
 * Retrieves the recent messages from a group chat in chronological order.
 */
export async function getRecentGroupChatHistory(
  chatId: number | string,
  limit: number = 50
): Promise<Array<{ userId: string; userName: string; text: string; timestamp: string }>> {
  const client = getClickHouseClient();
  if (!client) return [];

  try {
    await initClickHouseSchema();
    const result = await client.query({
      query: `
        SELECT user_id, user_name, text, timestamp
        FROM group_chat_history
        WHERE chat_id = {chatId:Int64}
        ORDER BY timestamp DESC
        LIMIT {limit:UInt32}
      `,
      query_params: {
        chatId: Number(chatId),
        limit,
      },
      format: "JSONEachRow",
    });
    const rows = await result.json<{
      user_id: string;
      user_name: string;
      text: string;
      timestamp: string;
    }>();

    return rows.reverse().map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      text: r.text,
      timestamp: r.timestamp,
    }));
  } catch (err) {
    console.warn("[ClickHouse] Failed to fetch group chat history:", err);
    return [];
  }
}

