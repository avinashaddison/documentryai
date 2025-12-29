import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface StoryFrameworkResult {
  title: string;
  genres: string[];
  premise: string;
  openingHook: string;
}

export async function generateStoryFramework(userTitle: string): Promise<StoryFrameworkResult> {
  const prompt = `You are a professional screenwriter and story consultant. Based on the following title/concept, generate a compelling story framework for an AI-generated cinematic video.

Title/Concept: "${userTitle}"

Generate the following in JSON format:
1. "title" - A refined, cinematic title (can be the same or improved)
2. "genres" - Exactly 3 relevant genres (e.g., "Sci-Fi", "Drama", "Thriller")
3. "premise" - A compelling 2-3 sentence premise that sets up the story
4. "openingHook" - A captivating 150-word opening hook that would grab the viewer's attention in the first scene. This should be vivid, visual, and emotionally engaging.

Respond ONLY with valid JSON, no additional text.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format");
  }

  try {
    const result = JSON.parse(content.text);
    return {
      title: result.title || userTitle,
      genres: result.genres || ["Drama", "Adventure", "Fantasy"],
      premise: result.premise || "",
      openingHook: result.openingHook || "",
    };
  } catch (e) {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        title: result.title || userTitle,
        genres: result.genres || ["Drama", "Adventure", "Fantasy"],
        premise: result.premise || "",
        openingHook: result.openingHook || "",
      };
    }
    throw new Error("Failed to parse AI response");
  }
}
