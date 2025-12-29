import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface DocumentaryFramework {
  title: string;
  genres: string[];
  premise: string;
  openingHook: string;
  totalChapters: number;
  estimatedDuration: string;
}

export interface ChapterScript {
  chapterNumber: number;
  title: string;
  narration: string;
  scenes: ScenePrompt[];
  estimatedDuration: number;
}

export interface ScenePrompt {
  sceneNumber: number;
  imagePrompt: string;
  duration: number;
  narrationSegment: string;
  mood: string;
  shotType: string;
}

export async function generateDocumentaryFramework(
  title: string,
  storyLength: string = "medium"
): Promise<DocumentaryFramework> {
  const chapterCounts: Record<string, number> = {
    short: 3,
    medium: 5,
    long: 8,
    feature: 12,
  };

  const durations: Record<string, string> = {
    short: "5-8 minutes",
    medium: "15-20 minutes",
    long: "30-45 minutes",
    feature: "60+ minutes",
  };

  const prompt = `You are a professional documentary scriptwriter specializing in compelling historical narratives similar to channels like "Grand Manors" or "Old Money Dynasty".

Create a documentary framework for: "${title}"

Target length: ${durations[storyLength] || durations.medium}
Number of chapters: ${chapterCounts[storyLength] || 5}

Generate a compelling documentary framework in JSON format:
{
  "title": "The refined, dramatic documentary title",
  "genres": ["Documentary", "History", "one more relevant genre"],
  "premise": "A 2-3 sentence premise that captures the essence of this documentary",
  "openingHook": "A 150-word dramatic opening hook that would grab viewers in the first 30 seconds. Use vivid imagery, suspense, and hint at revelations to come. Write in present tense, documentary narration style.",
  "totalChapters": ${chapterCounts[storyLength] || 5},
  "estimatedDuration": "${durations[storyLength] || durations.medium}"
}

Write in the style of premium documentary narration - dramatic, evocative, revealing dark secrets and untold stories.

Respond ONLY with valid JSON.`;

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
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content.text);
  } catch (e) {
    throw new Error("Failed to parse documentary framework");
  }
}

export async function generateChapterScript(
  documentaryTitle: string,
  premise: string,
  chapterNumber: number,
  totalChapters: number,
  chapterTitle?: string
): Promise<ChapterScript> {
  const prompt = `You are writing Chapter ${chapterNumber} of ${totalChapters} for a documentary titled: "${documentaryTitle}"

Premise: ${premise}

${chapterTitle ? `This chapter is about: ${chapterTitle}` : ''}

Generate this chapter's complete script with scene breakdowns. Each scene should be 15-30 seconds of narration with a corresponding image prompt.

Respond in JSON format:
{
  "chapterNumber": ${chapterNumber},
  "title": "Chapter title",
  "narration": "The complete narration text for this chapter (2-4 minutes of speaking, ~400-600 words)",
  "scenes": [
    {
      "sceneNumber": 1,
      "imagePrompt": "Detailed cinematic image prompt for Flux/Ideogram. Include: subject, composition, lighting, mood, style (photorealistic, historical, cinematic). Example: 'A grand Victorian mansion at twilight, dramatic gothic architecture, warm lights glowing from ornate windows, misty atmosphere, cinematic photography, 8K quality'",
      "duration": 20,
      "narrationSegment": "The portion of narration that plays over this image",
      "mood": "mysterious/dramatic/revelatory/somber/triumphant",
      "shotType": "wide establishing shot / close-up detail / portrait / aerial view / interior"
    }
  ],
  "estimatedDuration": 180
}

Create 6-10 scenes for this chapter. Write in premium documentary narration style - dramatic, evocative, revealing. Image prompts should be highly detailed for AI image generation.

Respond ONLY with valid JSON.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format");
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(content.text);
  } catch (e) {
    throw new Error("Failed to parse chapter script");
  }
}

export async function generateChapterOutline(
  documentaryTitle: string,
  premise: string,
  openingHook: string,
  totalChapters: number
): Promise<string[]> {
  const prompt = `Create a chapter outline for a documentary titled: "${documentaryTitle}"

Premise: ${premise}

Opening Hook: ${openingHook}

Generate ${totalChapters} chapter titles that tell a compelling narrative arc. Each chapter should build on the previous, with revelations, twists, and dramatic progression.

Respond in JSON format:
{
  "chapters": [
    "Chapter 1: [Title that hooks the viewer]",
    "Chapter 2: [Title that deepens the mystery]",
    ...
  ]
}

The titles should be evocative and hint at the content without spoiling it. Use the style of premium documentary series.

Respond ONLY with valid JSON.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format");
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
    return data.chapters || [];
  } catch (e) {
    throw new Error("Failed to parse chapter outline");
  }
}

export async function generateWordTimings(
  narrationText: string,
  audioDuration: number
): Promise<Array<{ word: string; start: number; end: number }>> {
  const words = narrationText.split(/\s+/).filter(w => w.length > 0);
  const avgWordDuration = audioDuration / words.length;
  
  return words.map((word, index) => ({
    word,
    start: index * avgWordDuration,
    end: (index + 1) * avgWordDuration,
  }));
}
