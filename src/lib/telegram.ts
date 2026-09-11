import { Bot, InlineKeyboard } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Singleton grammY Bot instance
 */
let botInstance: Bot | null = null;

export function getTelegramBot(): Bot {
  if (!botInstance) {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set.");
    }
    botInstance = new Bot(token);
  }
  return botInstance;
}

/**
 * Sends a chat action (e.g. typing indicator) to a Telegram chat.
 */
export async function sendChatAction(
  chatId: number | string,
  action: "typing" | "upload_document" | "find_location" = "typing"
): Promise<void> {
  try {
    const bot = getTelegramBot();
    await bot.api.sendChatAction(chatId, action);
  } catch (err) {
    console.error(`[Telegram] Failed to send chat action "${action}":`, err);
  }
}

/**
 * Starts a recurring typing indicator loop every 4 seconds.
 * Returns a stop function.
 */
export function startTypingLoop(chatId: number | string): () => void {
  sendChatAction(chatId, "typing");
  const interval = setInterval(() => {
    sendChatAction(chatId, "typing");
  }, 4000);

  return () => {
    clearInterval(interval);
  };
}

/**
 * Sends a message to a Telegram chat. Supports inline buttons and disables ugly previews.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: {
    parse_mode?: "Markdown" | "HTML";
    buttons?: Array<{ label: string; url: string }>;
    disable_preview?: boolean;
    imageUrl?: string;
  }
): Promise<{ message_id: number } | null> {
  const bot = getTelegramBot();
  const maxChunkLength = 4000;

  let replyMarkup: InlineKeyboard | undefined = undefined;
  if (options?.buttons && options.buttons.length > 0) {
    replyMarkup = new InlineKeyboard();
    for (const btn of options.buttons) {
      replyMarkup.url(btn.label, btn.url).row();
    }
  }

  // Configure rich media link preview to embed the image at the top of the message
  let linkPreviewOptions: Record<string, unknown> = {
    is_disabled: options?.disable_preview !== false,
  };

  let messageText = text;
  if (options?.imageUrl) {
    linkPreviewOptions = {
      is_disabled: false,
      url: options.imageUrl,
      prefer_large_media: true,
      show_above_text: true,
    };
    // Prepend zero-width space link so Telegram prioritizes this image as the header
    if (options.parse_mode === "Markdown") {
      messageText = `[\u200B](${options.imageUrl})${messageText}`;
    }
  }

  const sendOptions = {
    parse_mode: options?.parse_mode,
    reply_markup: replyMarkup,
    link_preview_options: linkPreviewOptions,
  };

  // If text is within limits, send directly
  if (messageText.length <= maxChunkLength) {
    try {
      const res = await bot.api.sendMessage(chatId, messageText, sendOptions);
      return { message_id: res.message_id };
    } catch (err: unknown) {
      console.warn("[Telegram] Failed with formatting, falling back to plain text:", err);
      // Fallback without parse_mode in case of invalid markdown/HTML
      const res = await bot.api.sendMessage(chatId, text, {
        reply_markup: replyMarkup,
        link_preview_options: linkPreviewOptions,
      });
      return { message_id: res.message_id };
    }
  }

  // Split into smaller chunks
  let remaining = text;
  while (remaining.length > 0) {
    let chunk = remaining.slice(0, maxChunkLength);
    // Try to break at a newline
    const lastNewline = chunk.lastIndexOf("\n");
    if (lastNewline > 2000) {
      chunk = chunk.slice(0, lastNewline);
    }
    remaining = remaining.slice(chunk.length);

    try {
      await bot.api.sendMessage(chatId, chunk, options);
    } catch {
      await bot.api.sendMessage(chatId, chunk);
    }
  }
  return null;
}

/**
 * Edits an existing message in-place to show live progress without flooding the chat
 */
export async function editTelegramMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: { parse_mode?: "Markdown" | "HTML" }
): Promise<boolean> {
  try {
    const bot = getTelegramBot();
    await bot.api.editMessageText(chatId, messageId, text, options);
    return true;
  } catch (err: unknown) {
    try {
      const bot = getTelegramBot();
      await bot.api.editMessageText(chatId, messageId, text);
      return true;
    } catch (fallbackErr) {
      console.warn("[Telegram] Failed to edit message:", fallbackErr);
      return false;
    }
  }
}

/**
 * Retrieves the download URL for a file stored on Telegram servers
 */
export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const bot = getTelegramBot();
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error(`Could not resolve file path for file_id: ${fileId}`);
  }
  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
}

/**
 * Downloads a voice note or audio file from Telegram as an ArrayBuffer
 */
export async function downloadTelegramAudio(fileId: string): Promise<ArrayBuffer> {
  const fileUrl = await getTelegramFileUrl(fileId);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio from Telegram: ${response.status} ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

/**
 * Downloads a photo from Telegram as a Buffer and resolves its content type
 */
export async function downloadTelegramPhoto(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const fileUrl = await getTelegramFileUrl(fileId);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download photo from Telegram: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { buffer, mimeType: contentType };
}

/**
 * Sends a high-res photo directly to the Telegram chat with optional caption and interactive buttons.
 */
export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  options?: {
    caption?: string;
    buttons?: Array<{ label: string; url: string }>;
    parse_mode?: "Markdown" | "HTML";
  }
): Promise<{ message_id: number } | null> {
  try {
    const bot = getTelegramBot();
    let replyMarkup: InlineKeyboard | undefined = undefined;
    if (options?.buttons && options.buttons.length > 0) {
      replyMarkup = new InlineKeyboard();
      for (const btn of options.buttons) {
        replyMarkup.url(btn.label, btn.url).row();
      }
    }

    const res = await bot.api.sendPhoto(chatId, photoUrl, {
      caption: options?.caption ? options.caption.slice(0, 1024) : undefined,
      parse_mode: options?.parse_mode || "Markdown",
      reply_markup: replyMarkup,
    });
    return { message_id: res.message_id };
  } catch (err) {
    console.warn("[Telegram] Failed to send photo with formatting, attempting fallback:", err);
    if (options?.caption) {
      try {
        const bot = getTelegramBot();
        let replyMarkup: InlineKeyboard | undefined = undefined;
        if (options?.buttons && options.buttons.length > 0) {
          replyMarkup = new InlineKeyboard();
          for (const btn of options.buttons) {
            replyMarkup.url(btn.label, btn.url).row();
          }
        }
        const res = await bot.api.sendPhoto(chatId, photoUrl, {
          caption: options.caption.slice(0, 1024),
          reply_markup: replyMarkup,
        });
        return { message_id: res.message_id };
      } catch (fallbackErr) {
        console.warn("[Telegram] Failed to send photo on fallback:", fallbackErr);
      }
    }
    return null;
  }
}

/**
 * Deletes a Telegram message (e.g. temporary progress status message)
 */
export async function deleteTelegramMessage(
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  try {
    const bot = getTelegramBot();
    await bot.api.deleteMessage(chatId, messageId);
    return true;
  } catch {
    return false;
  }
}

