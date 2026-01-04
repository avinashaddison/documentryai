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
  historicalContext?: string;
}

export async function generateDocumentaryFramework(
  title: string,
  storyLength: string = "medium",
  customChapters?: number
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

  const numChapters = customChapters || chapterCounts[storyLength] || 5;
  const estimatedDuration = customChapters 
    ? `~${Math.round(numChapters * 3)} minutes` 
    : (durations[storyLength] || durations.medium);

  const prompt = `You are a professional documentary scriptwriter for premium historical documentary channels like "Grand Manors", "Old Money Dynasty", and "Dark Estate".

Your style is characterized by:
- Deep, authoritative narration with measured pacing and dramatic pauses
- Revealing hidden secrets, untold stories, and dark truths behind wealth and power
- Building tension through rhetorical questions and unexpected revelations
- Using specific dates, numbers, names, and historical facts to establish authority
- Creating emotional resonance through human drama - tragedy, ambition, downfall, survival
- Clean, cinematic presentation without on-screen text overlays

Create a documentary framework for: "${title}"

Target length: ${estimatedDuration}
Number of chapters: ${numChapters}

Generate a compelling documentary framework in JSON format:
{
  "title": "A dramatic, evocative documentary title that hints at secrets or revelations (example: 'The Dark Secrets of...', 'The Untold Story Behind...', 'The Hidden Truth of...')",
  "genres": ["Documentary", "History", "one more relevant genre"],
  "premise": "A 2-3 sentence premise that sets up the central mystery or revelation - what secret will be uncovered, what hidden truth revealed?",
  "openingHook": "A 150-word dramatic opening hook written for a deep, authoritative narrator voice. Start with a striking visual or fact. Build tension. Use short, punchy sentences mixed with longer descriptive passages. Hint at dark secrets to come. End with a question or revelation that demands the viewer keep watching. Write in present tense, measured documentary narration style with natural pauses.",
  "totalChapters": ${numChapters},
  "estimatedDuration": "${estimatedDuration}"
}

Write like the opening of a Grand Manors video - commanding, mysterious, revealing hidden truths behind beautiful facades.

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
    let result;
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(content.text);
    }
    result.totalChapters = numChapters;
    result.estimatedDuration = estimatedDuration;
    return result;
  } catch (e) {
    throw new Error("Failed to parse documentary framework");
  }
}

export interface ResearchContext {
  timeline?: Array<{ date: string; event: string; significance: string }>;
  keyFacts?: Array<{ fact: string; source: string; verified: boolean }>;
  controversies?: Array<{ topic: string; perspectives: string[] }>;
  mainCharacters?: Array<{ name: string; role: string; significance: string }>;
}

export async function generateChapterScriptWithResearch(
  documentaryTitle: string,
  premise: string,
  chapterNumber: number,
  totalChapters: number,
  researchContext: ResearchContext,
  chapterTitle?: string
): Promise<ChapterScript> {
  const timelineText = researchContext.timeline?.length 
    ? `VERIFIED TIMELINE:\n${researchContext.timeline.map(t => `- ${t.date}: ${t.event}`).join('\n')}`
    : '';
  
  const factsText = researchContext.keyFacts?.length
    ? `KEY FACTS (use these in narration):\n${researchContext.keyFacts.map(f => `- ${f.fact}`).join('\n')}`
    : '';
    
  const charactersText = researchContext.mainCharacters?.length
    ? `KEY FIGURES:\n${researchContext.mainCharacters.map(c => `- ${c.name}: ${c.role}`).join('\n')}`
    : '';

  const prompt = `You are writing Chapter ${chapterNumber} of ${totalChapters} for a premium historical documentary titled: "${documentaryTitle}"

Premise: ${premise}

${chapterTitle ? `This chapter is about: ${chapterTitle}` : ''}

RESEARCH DATA (MUST use these verified facts - do not invent information):
${timelineText}
${factsText}
${charactersText}

STYLE GUIDE (Match "Grand Manors" / "Old Money Dynasty" documentary channels):

NARRATION STYLE:
- Write for a deep, authoritative male narrator with measured pacing
- Use short, punchy sentences mixed with longer descriptive passages
- Include specific dates, numbers, names, and historical facts FROM THE RESEARCH DATA
- Build tension through rhetorical questions: "But what happened next would change everything."
- Create dramatic reveals: "Behind the gilded facade, a darker truth waited."
- Use natural pause points: "The answer... was far more troubling than anyone imagined."
- Present tense for immediacy, past tense for historical context
- CRITICAL: Only use facts from the research data. Do not invent dates, names, or events.

IMAGE PROMPTS (for Ken Burns-style documentary):
- CRITICAL: Use SPECIFIC names, locations, dates, and details from the research data
- Historical archival photographs and period images showing actual events and locations from research
- Architectural exterior shots of NAMED mansions, buildings, estates mentioned in research
- Interior details: grand staircases, ornate rooms, period furniture authentic to the era
- Portraits and formal photographs depicting NAMED key figures from the research
- Dramatic landscapes with atmospheric lighting showing SPECIFIC locations from the timeline
- Document close-ups: newspapers, letters, photographs with dates matching research timeline
- All images should work with slow zoom/pan (Ken Burns effect)
- Include specific historical context in prompts: year, location, event details from research

Generate this chapter's complete script with scene breakdowns. Each scene should be 15-25 seconds of narration.

Respond in JSON format:
{
  "chapterNumber": ${chapterNumber},
  "title": "Chapter title",
  "narration": "The complete narration text for this chapter (2-4 minutes of speaking, ~400-600 words). Write in measured, authoritative documentary style with natural pauses.",
  "scenes": [
    {
      "sceneNumber": 1,
      "imagePrompt": "Ultra-detailed cinematic image prompt with SPECIFIC names, dates, and locations from research. Include historical era, setting details, and mood. Example: '1945 Berlin bunker interior, dim lighting, concrete walls, sparse furniture, tension-filled atmosphere, documentary photograph style'",
      "duration": 18,
      "narrationSegment": "The portion of narration that plays over this image.",
      "mood": "mysterious/dramatic/revelatory/somber/triumphant/ominous/contemplative",
      "shotType": "wide establishing / architectural detail / portrait / interior grand / document closeup / landscape atmospheric",
      "historicalContext": "Specific date and event from research data this scene depicts"
    }
  ],
  "estimatedDuration": 180
}

Create 10-15 scenes for this chapter. More scenes = more visual variety and engagement.

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

export async function generateChapterScript(
  documentaryTitle: string,
  premise: string,
  chapterNumber: number,
  totalChapters: number,
  chapterTitle?: string
): Promise<ChapterScript> {
  const prompt = `You are writing Chapter ${chapterNumber} of ${totalChapters} for a premium historical documentary titled: "${documentaryTitle}"

Premise: ${premise}

${chapterTitle ? `This chapter is about: ${chapterTitle}` : ''}

STYLE GUIDE (Match "Grand Manors" / "Old Money Dynasty" documentary channels):

NARRATION STYLE:
- Write for a deep, authoritative male narrator with measured pacing
- Use short, punchy sentences mixed with longer descriptive passages
- Include specific dates, numbers, names, and historical facts
- Build tension through rhetorical questions: "But what happened next would change everything."
- Create dramatic reveals: "Behind the gilded facade, a darker truth waited."
- Use natural pause points: "The answer... was far more troubling than anyone imagined."
- Present tense for immediacy, past tense for historical context

IMAGE PROMPTS (for Ken Burns-style documentary):
- Historical archival photographs and period images
- Architectural exterior shots of mansions, buildings, estates
- Interior details: grand staircases, ornate rooms, period furniture
- Portraits and formal photographs of the era
- Dramatic landscapes with atmospheric lighting
- Document close-ups: newspapers, letters, photographs
- All images should work with slow zoom/pan (Ken Burns effect)

Generate this chapter's complete script with scene breakdowns. Each scene should be 15-25 seconds of narration.

Respond in JSON format:
{
  "chapterNumber": ${chapterNumber},
  "title": "Chapter title",
  "narration": "The complete narration text for this chapter (2-4 minutes of speaking, ~400-600 words). Write in measured, authoritative documentary style with natural pauses.",
  "scenes": [
    {
      "sceneNumber": 1,
      "imagePrompt": "Detailed cinematic image prompt optimized for Ken Burns effect. Describe: main subject centered for zoom capability, historical/archival photograph style, dramatic lighting, rich details that reward close inspection. Example: 'Grand Gilded Age mansion facade, ornate limestone exterior, towering columns, dramatic storm clouds gathering, late afternoon golden light, historical photograph circa 1890, high detail architectural photography'",
      "duration": 18,
      "narrationSegment": "The portion of narration that plays over this image. Write with natural pauses.",
      "mood": "mysterious/dramatic/revelatory/somber/triumphant/ominous/contemplative",
      "shotType": "wide establishing / architectural detail / portrait / interior grand / document closeup / landscape atmospheric"
    }
  ],
  "estimatedDuration": 180
}

Create 10-15 scenes for this chapter. More scenes = more visual variety and engagement. Image prompts should describe scenes that work beautifully with slow zoom and pan effects.

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
  const chapterExamples = totalChapters === 1 
    ? '"Chapter 1: [Complete title for the single chapter]"'
    : `"Chapter 1: [Title that hooks the viewer]"${totalChapters > 1 ? ',\n    "Chapter 2: [Title that deepens the mystery]"' : ''}${totalChapters > 2 ? ',\n    ...' : ''}`;
    
  const prompt = `Create a chapter outline for a premium documentary titled: "${documentaryTitle}"

Premise: ${premise}

Opening Hook: ${openingHook}

STYLE: Match "Grand Manors" / "Old Money Dynasty" documentary chapter structure:
- Each chapter reveals a new layer of the story
- Titles hint at secrets, mysteries, or dramatic turns
- Build from origins → rise → complications → dark truths → resolution/legacy
- Use evocative phrases: "The Price of...", "Behind the...", "The Dark Truth of...", "What Really Happened..."

IMPORTANT: Generate EXACTLY ${totalChapters} chapter title${totalChapters === 1 ? '' : 's'}. No more, no less.

Respond in JSON format:
{
  "chapters": [
    ${chapterExamples}
  ]
}

${totalChapters === 1 ? 'This is a single-chapter documentary. Create one comprehensive chapter title.' : 'Each chapter should build dramatic tension. Early chapters establish, middle chapters reveal complications and dark truths, final chapters deliver resolutions or lasting mysteries.'}

Respond ONLY with valid JSON with exactly ${totalChapters} chapter${totalChapters === 1 ? '' : 's'}.`;

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
    let chapters = data.chapters || [];
    
    // Force exact chapter count - trim if too many, pad if too few
    if (chapters.length > totalChapters) {
      chapters = chapters.slice(0, totalChapters);
    } else if (chapters.length < totalChapters) {
      for (let i = chapters.length; i < totalChapters; i++) {
        chapters.push(`Chapter ${i + 1}: The Untold Story`);
      }
    }
    
    return chapters;
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
