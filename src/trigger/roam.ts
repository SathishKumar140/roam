import { task, logger } from "@trigger.dev/sdk/v3";
import {
  sendTelegramMessage,
  sendChatAction,
  downloadTelegramAudio,
  downloadTelegramPhoto,
  startTypingLoop,
  editTelegramMessage,
  sendTelegramPhoto,
  deleteTelegramMessage,
} from "../lib/telegram";
import {
  transcribeAudio,
  synthesizeConciergeResponse,
  analyzeImageWithVision,
  VisionAnalysisResult,
  arbitrateGroupConstraints,
  GroupArbitrationResult,
} from "../lib/ai";
import { searchLiveWeb } from "../lib/exa";
import {
  retrieveUserPreferences,
  extractAndSavePreferences,
} from "../lib/memory";
import { getRecentGroupChatHistory } from "../lib/clickhouse";
import type { RoamTaskPayload } from "../../app/api/telegram/route";

export const roamAgentTask = task({
  id: "roam-agent-task",
  run: async (payload: RoamTaskPayload) => {
    logger.info("Project Roam agent task started", {
      chatId: payload.chatId,
      userId: payload.userId,
      hasText: Boolean(payload.text),
      hasLocation: Boolean(payload.location),
      hasVoice: Boolean(payload.voiceFileId),
      hasPhoto: Boolean(payload.photoFileId),
      isGroup: Boolean(payload.isGroup),
    });

    const { chatId, userId } = payload;
    let queryText = payload.text || "";
    let imageAnalysis: VisionAnalysisResult | undefined;
    let groupArbitration: GroupArbitrationResult | undefined;

    // Keep Telegram "typing..." action alive throughout background processing
    const stopTyping = startTypingLoop(chatId);

    try {
      // =========================================================================
      // STEP 1: THE ACKNOWLEDGEMENT (Live In-Place Status Tracker)
      // =========================================================================
      const initialStatus = payload.isGroup
        ? "🤝 _Reviewing group conversation & arbitrating preferences..._"
        : payload.photoFileId
        ? "🖼️ _Analyzing your photo with AI vision..._"
        : payload.voiceFileId
        ? "🎙️ _Transcribing your voice note..._"
        : payload.location
        ? "📍 _Coordinates received! Searching live local spots around you..._"
        : "🔍 _Searching live data for you..._";

      const statusMsg = await sendTelegramMessage(chatId, initialStatus, {
        parse_mode: "Markdown",
      });

      // =========================================================================
      // STEP 2: MULTIMODAL PARSING (WHISPER, GPT-4o VISION, & GROUP ARBITRATION)
      // =========================================================================
      // A) MULTIPLAYER GROUP CONTEXT ARBITRATION (THE KILLER FEATURE)
      if (payload.isGroup) {
        logger.info("Fetching recent group chat messages for constraint arbitration", { chatId });
        try {
          const groupHistory = await getRecentGroupChatHistory(chatId, 30);
          logger.info("Retrieved group messages from ClickHouse", { count: groupHistory.length });
          if (groupHistory.length > 1) {
            groupArbitration = await arbitrateGroupConstraints(groupHistory, queryText);
            logger.info("Group constraints arbitrated", { groupArbitration });

            if (groupArbitration.constraints.length > 0) {
              if (statusMsg) {
                const constraintSummary = groupArbitration.constraints
                  .map((c) => `• *${c.userName}:* ${c.constraint}`)
                  .join("\n");
                await editTelegramMessage(
                  chatId,
                  statusMsg.message_id,
                  `🤝 *Arbitrated group preferences:*\n${constraintSummary}\n\n🔎 _Finding spots that work for everyone..._`,
                  { parse_mode: "Markdown" }
                );
              }
              // Direct Exa search to find places satisfying the group intersection!
              if (groupArbitration.searchQuery) {
                queryText = groupArbitration.searchQuery;
              }
            }
          }
        } catch (groupErr) {
          logger.warn("Group constraint arbitration warning (graceful bypass):", { error: groupErr });
        }
      }

      // B) PHOTO / VISION RECOGNITION
      if (payload.photoFileId) {
        logger.info("Analyzing incoming Telegram photo via GPT-4o Vision");
        try {
          const { buffer, mimeType } = await downloadTelegramPhoto(payload.photoFileId);
          imageAnalysis = await analyzeImageWithVision(buffer, mimeType, payload.text);
          logger.info("Photo vision analysis complete", { imageAnalysis });

          if (statusMsg) {
            await editTelegramMessage(
              chatId,
              statusMsg.message_id,
              `👁️ *Recognized:* "${imageAnalysis.summary}"\n\n🔎 _Searching live details for ${imageAnalysis.searchQuery || "event"}..._`,
              { parse_mode: "Markdown" }
            );
          }

          // Augment search query with vision findings
          if (imageAnalysis.searchQuery) {
            queryText = payload.text
              ? `${imageAnalysis.searchQuery} ${payload.text}`
              : imageAnalysis.searchQuery;
          } else if (imageAnalysis.detectedText) {
            queryText = `${imageAnalysis.detectedText} ${payload.text || ""}`;
          }
        } catch (visionError) {
          logger.error("Vision recognition failed", { error: visionError });
        }
      }

      // C) VOICE NOTE PARSING (WHISPER)
      if (payload.voiceFileId && !queryText) {
        logger.info("Transcribing incoming Telegram voice note via Whisper");
        try {
          const audioBuffer = await downloadTelegramAudio(payload.voiceFileId);
          const transcribed = await transcribeAudio(audioBuffer);
          queryText = transcribed;
          logger.info("Voice note transcribed successfully", { queryText });

          // Instantly show user what was transcribed
          if (statusMsg) {
            await editTelegramMessage(
              chatId,
              statusMsg.message_id,
              `🎧 *Heard:* "${queryText}"\n\n🔎 _Searching live verified spots..._`,
              { parse_mode: "Markdown" }
            );
          }
        } catch (transcribeError) {
          logger.error("Whisper transcription failed", { error: transcribeError });
          await sendTelegramMessage(
            chatId,
            "⚠️ Could not transcribe your voice note clearly. Please try text or recording again."
          );
          return { success: false, reason: "transcription_failed" };
        }
      }

      // If only a location pin was sent without text, default to recommendations nearby
      if (!queryText && payload.location) {
        queryText = "Recommend the best highlights, dining, and activities near my current location";
      }

      // If still no query text, guide the user
      if (!queryText.trim()) {
        await sendTelegramMessage(
          chatId,
          "Hey there! Send me a message, voice note, photo, or location pin and I'll find live, personalized recommendations for you."
        );
        return { success: true, reason: "empty_query" };
      }

      // =========================================================================
      // STEP 3: CONTEXT RETRIEVAL (CLICKHOUSE + LANGCHAIN VECTOR MEMORY)
      // =========================================================================
      logger.info("Retrieving user historical preferences from ClickHouse vector memory", {
        userId,
        queryText,
      });
      let userPreferences: string[] = [];
      try {
        userPreferences = await retrieveUserPreferences(userId, queryText, 5);
        logger.info("Retrieved preferences from ClickHouse", {
          count: userPreferences.length,
          preferences: userPreferences,
        });
      } catch (memError) {
        logger.warn("ClickHouse vector memory retrieval warning (graceful bypass)", {
          error: memError,
        });
      }

      // =========================================================================
      // STEP 4: THE RESEARCHER (EXA API LIVE SEARCH)
      // =========================================================================
      logger.info("Executing live web search via Exa API", {
        queryText,
        location: payload.location,
      });
      await sendChatAction(chatId, "typing");

      const { formattedContext, results, heroImageUrl } = await searchLiveWeb(
        queryText,
        payload.location
      );

      logger.info("Exa search complete", {
        resultsCount: results.length,
        hasHeroImage: Boolean(heroImageUrl),
      });

      // Update progress so user knows search succeeded and synthesis began
      if (statusMsg) {
        const header = groupArbitration
          ? `🤝 *Arbitrating ${groupArbitration.constraints.length} friend preferences*`
          : imageAnalysis
          ? `👁️ *Recognized:* "${imageAnalysis.summary}"`
          : queryText
          ? `🎧 *Query:* "${queryText}"`
          : "";
        await editTelegramMessage(
          chatId,
          statusMsg.message_id,
          `${header}\n\n✨ _Found ${results.length} live verified sources! Formulating your card..._`,
          { parse_mode: "Markdown" }
        );
      }

      // =========================================================================
      // STEP 5: THE ORCHESTRATOR (OPENAI / OPENROUTER SYNTHESIS)
      // =========================================================================
      logger.info("Synthesizing personalized response with LLM", {
        hasMemory: userPreferences.length > 0,
        hasImageAnalysis: Boolean(imageAnalysis),
        hasGroupArbitration: Boolean(groupArbitration),
      });

      const { content: finalItinerary, buttons } = await synthesizeConciergeResponse({
        userQuery: payload.text || queryText,
        searchContext: formattedContext,
        userPreferences,
        location: payload.location,
        rawResults: results,
        imageAnalysis,
        groupArbitration,
      });

      // =========================================================================
      // STEP 6: THE DELIVERY (Embedded Media Card + Interactive Action Buttons)
      // =========================================================================
      logger.info("Delivering final cards to Telegram", {
        chatId,
        buttonCount: buttons.length,
        hasImage: Boolean(heroImageUrl),
      });

      let delivered = false;

      // If we have a hero image and the card fits within Telegram photo caption limit (1024 chars),
      // deliver as a single unified media card with photo on top, formatted text, and buttons!
      if (heroImageUrl && finalItinerary.length <= 1024) {
        const photoResult = await sendTelegramPhoto(chatId, heroImageUrl, {
          caption: finalItinerary,
          buttons,
          parse_mode: "Markdown",
        });
        if (photoResult) {
          delivered = true;
        }
      }

      // If no image, or caption too long, or photo sending failed: deliver text card
      if (!delivered) {
        await sendTelegramMessage(chatId, finalItinerary, {
          parse_mode: "Markdown",
          buttons,
          imageUrl: heroImageUrl,
        });
      }

      // Delete the temporary status message so the chat isn't cluttered
      if (statusMsg) {
        await deleteTelegramMessage(chatId, statusMsg.message_id);
      }

      // =========================================================================
      // STEP 7: MEMORY INGESTION (CLICKHOUSE VECTOR MEMORY UPDATE)
      // =========================================================================
      // Run asynchronous preference extraction and embedding in the background
      try {
        const extracted = await extractAndSavePreferences(
          userId,
          queryText,
          finalItinerary
        );
        if (extracted.length > 0) {
          logger.info("New preferences extracted and stored in ClickHouse", {
            extracted,
          });
        }
      } catch (savePrefError) {
        logger.warn("Non-fatal: Failed to extract and save preferences", {
          error: savePrefError,
        });
      }

      logger.info("Project Roam agent task completed successfully", { chatId });
      return {
        success: true,
        queryText,
        preferencesCount: userPreferences.length,
        sourcesCount: results.length,
      };
    } catch (error) {
      // =========================================================================
      // STEP 8: ERROR HANDLING & OBSERVABILITY
      // =========================================================================
      logger.error("Project Roam agent task encountered an error", {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Send polite fallback message to the user
      await sendTelegramMessage(
        chatId,
        "Sorry, I hit a snag checking the live data. Please try again in a moment."
      );

      return {
        success: false,
        error: (error as Error).message,
      };
    } finally {
      // Always stop the typing indicator loop
      stopTyping();
    }
  },
});
