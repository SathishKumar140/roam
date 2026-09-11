import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { sendChatAction } from "@/src/lib/telegram";
import { saveGroupChatMessage } from "@/src/lib/clickhouse";

export interface RoamTaskPayload {
  chatId: number | string;
  userId: string;
  text?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  voiceFileId?: string;
  photoFileId?: string;
  userName?: string;
  isGroup?: boolean;
}

/**
 * Telegram Webhook Receiver (Next.js App Router)
 * Acts as an ultra-fast proxy (< 100ms) to prevent Telegram 3-second webhook timeouts.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Telegram sends updates inside 'message' or 'edited_message'
    const message = body.message || body.edited_message;
    if (!message) {
      // Return 200 for other Telegram updates (e.g. callback queries, bot additions)
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }

    const chatId = message.chat?.id;
    if (!chatId) {
      return NextResponse.json({ error: "Missing chat ID" }, { status: 400 });
    }

    const userId = String(message.from?.id || chatId);
    const userName = message.from?.first_name || message.from?.username || "Traveler";
    const text = message.text || message.caption;
    const chatType = message.chat?.type;
    const isGroup = chatType === "group" || chatType === "supergroup";

    // Silently stream group chat messages into ClickHouse for multiplayer context arbitration
    if (isGroup && text) {
      saveGroupChatMessage(chatId, userId, userName, text).catch((err) => {
        console.warn("[Group Chat Memory] Non-fatal save failure:", err);
      });
    }

    // In a group chat, only wake up Roam if explicitly tagged, commanded, or replied to
    if (isGroup) {
      const isBotMentioned =
        text?.toLowerCase().includes("@roam_concierge_bot") ||
        text?.toLowerCase().startsWith("/roam") ||
        text?.toLowerCase().startsWith("/arbitrate") ||
        text?.toLowerCase().startsWith("/plan") ||
        message.reply_to_message?.from?.is_bot ||
        Boolean(message.entities?.some((e: { type: string }) => e.type === "mention" || e.type === "bot_command"));

      if (!isBotMentioned) {
        // Silently buffered in group chat memory for future arbitration
        return NextResponse.json({ success: true, buffered: true }, { status: 200 });
      }
    }

    const location = message.location
      ? {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        }
      : undefined;

    const voiceFileId = message.voice?.file_id;
    const photoFileId = message.photo?.length
      ? message.photo[message.photo.length - 1].file_id
      : undefined;

    // Ignore if there is no actionable content (no text, voice, location, photo)
    if (!text && !location && !voiceFileId && !photoFileId) {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }

    // Clean bot mention tag out of the query text
    const cleanedText = text
      ? text
          .replace(/@roam_concierge_bot/gi, "")
          .replace(/^\/(?:roam|arbitrate|plan)\s*/i, "")
          .trim()
      : text;

    // Immediately signal typing action to Telegram (< 50ms) so user sees instant activity
    sendChatAction(chatId, "typing").catch(() => {});

    // Dispatch durable background task via Trigger.dev v3
    await tasks.trigger("roam-agent-task", {
      chatId,
      userId,
      text: cleanedText,
      location,
      voiceFileId,
      photoFileId,
      userName,
      isGroup,
    } satisfies RoamTaskPayload);

    // Immediately return 200 OK within < 100ms
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[Telegram Webhook Error]:", error);
    // Still return 200 OK so Telegram doesn't retry indefinitely
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 200 }
    );
  }
}

/**
 * Health check endpoint for verifying webhook status
 */
export async function GET() {
  return NextResponse.json({
    status: "online",
    service: "Project Roam Telegram Webhook Proxy",
    timestamp: new Date().toISOString(),
  });
}
