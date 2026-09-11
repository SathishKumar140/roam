import Exa from "exa-js";

export interface FormattedSearchResult {
  title: string;
  url: string;
  snippet: string;
  image?: string;
}

/**
 * Searches the live web using the Exa AI Search API.
 * Optimized for local discovery, itineraries, reviews, and maps.
 */
export async function searchLiveWeb(
  query: string,
  location?: { latitude: number; longitude: number }
): Promise<{
  results: FormattedSearchResult[];
  formattedContext: string;
  heroImageUrl?: string;
}> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn("[Exa] EXA_API_KEY not configured. Skipping live search.");
    return {
      results: [],
      formattedContext: "Live web search unavailable (EXA_API_KEY not set).",
    };
  }

  const exa = new Exa(apiKey);

  // Augment query with location coordinates or regional context if available
  let enhancedQuery = query;
  if (location) {
    enhancedQuery = `${query} near coordinates ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }

  try {
    const searchResponse = await exa.searchAndContents(enhancedQuery, {
      numResults: 3,
      type: "auto",
      text: { maxCharacters: 800 },
      highlights: {
        numSentences: 2,
        highlightsPerUrl: 1,
      },
    });

    const results: FormattedSearchResult[] = (searchResponse.results || []).map((item) => {
      const highlightsText = Array.isArray(item.highlights)
        ? item.highlights.join(" ")
        : "";
      const bodySnippet = item.text ? item.text.slice(0, 600) : "";
      const rawImg = (item as unknown as { image?: string }).image;
      const image = typeof rawImg === "string" && rawImg.startsWith("http") ? rawImg : undefined;

      return {
        title: item.title || "Web Result",
        url: item.url,
        snippet: (highlightsText || bodySnippet || "").trim(),
        image,
      };
    });

    // Pick first valid image URL found from venues
    const heroImageUrl = results.find((r) => r.image)?.image;

    // Format into a structured context string for prompt injection
    const formattedContext = results
      .map((r, i) => `[Source ${i + 1}]: ${r.title}\nURL: ${r.url}\nExcerpt: ${r.snippet}`)
      .join("\n\n");

    return { results, formattedContext, heroImageUrl };
  } catch (err) {
    console.error("[Exa] Search query failed:", err);
    return {
      results: [],
      formattedContext: "Live web search encountered an error while querying data.",
    };
  }
}
