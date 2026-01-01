import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface ResearchQuery {
  query: string;
  category: string;
  priority: number;
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
}

export interface ResearchSummary {
  timeline: Array<{ date: string; event: string; significance: string }>;
  keyFacts: Array<{ fact: string; source: string; verified: boolean }>;
  controversies: Array<{ topic: string; perspectives: string[] }>;
  mainCharacters: Array<{ name: string; role: string; significance: string }>;
}

export async function expandResearchQueries(title: string): Promise<ResearchQuery[]> {
  const prompt = `You are a research assistant preparing to create a documentary about: "${title}"

Your task is to generate comprehensive research queries that will gather factual information for this documentary.

DO NOT write any story, narrative, or creative content.
ONLY generate research questions.

Generate 8-12 research queries covering:
1. Historical timeline and key dates
2. Main people/figures involved
3. Causes and origins
4. Key events and turning points
5. Controversies or conflicting accounts
6. Long-term impact and legacy
7. Lesser-known facts or hidden stories
8. Primary sources and documentation

Respond in JSON format:
{
  "queries": [
    {
      "query": "Specific factual research question",
      "category": "timeline|people|causes|events|controversies|impact|hidden|sources",
      "priority": 1-3
    }
  ]
}

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
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
    return result.queries || [];
  } catch (e) {
    console.error("Failed to parse research queries:", e);
    throw new Error("Failed to parse research queries");
  }
}

export async function fetchPerplexitySources(query: string): Promise<Source[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn("PERPLEXITY_API_KEY not set, skipping Perplexity research");
    return [];
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a research assistant. Provide factual, well-sourced information with specific dates, names, and verifiable facts. Be precise and cite sources."
          },
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.2,
        return_images: false,
        return_related_questions: false,
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status);
      return [];
    }

    const data = await response.json();
    const sources: Source[] = [];

    if (data.citations && Array.isArray(data.citations)) {
      data.citations.forEach((url: string, index: number) => {
        sources.push({
          title: `Source ${index + 1}`,
          url,
          snippet: data.choices?.[0]?.message?.content?.substring(0, 200) || "",
          relevance: 1 - (index * 0.1),
        });
      });
    }

    if (data.choices?.[0]?.message?.content) {
      sources.push({
        title: "Perplexity Research",
        url: "",
        snippet: data.choices[0].message.content,
        relevance: 1,
      });
    }

    return sources;
  } catch (error) {
    console.error("Perplexity fetch error:", error);
    return [];
  }
}

export async function analyzeAndSummarizeResearch(
  title: string,
  sources: Source[]
): Promise<ResearchSummary> {
  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`)
    .join("\n\n");

  const prompt = `You are analyzing research sources to create a factual documentary about: "${title}"

Research Sources:
${sourcesText}

Based on these sources, create a structured research summary.

DO NOT write any narrative or story.
ONLY extract and organize verified facts.

Respond in JSON format:
{
  "timeline": [
    { "date": "Year or date", "event": "What happened", "significance": "Why it matters" }
  ],
  "keyFacts": [
    { "fact": "Verified factual statement", "source": "Source reference", "verified": true }
  ],
  "controversies": [
    { "topic": "Controversial aspect", "perspectives": ["View 1", "View 2"] }
  ],
  "mainCharacters": [
    { "name": "Person's name", "role": "Their role", "significance": "Their importance" }
  ]
}

Include at least:
- 5-10 timeline entries in chronological order
- 8-15 key facts
- 2-5 controversies or different perspectives (if applicable)
- 3-8 main characters/figures

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
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
    return {
      timeline: result.timeline || [],
      keyFacts: result.keyFacts || [],
      controversies: result.controversies || [],
      mainCharacters: result.mainCharacters || [],
    };
  } catch (e) {
    console.error("Failed to parse research summary:", e);
    throw new Error("Failed to parse research summary");
  }
}

export async function conductFullResearch(title: string): Promise<{
  queries: ResearchQuery[];
  sources: Source[];
  summary: ResearchSummary;
}> {
  console.log(`Starting research for: ${title}`);

  const queries = await expandResearchQueries(title);
  console.log(`Generated ${queries.length} research queries`);

  const allSources: Source[] = [];
  const priorityQueries = queries.filter(q => q.priority <= 2).slice(0, 5);

  for (const query of priorityQueries) {
    console.log(`Researching: ${query.query}`);
    const sources = await fetchPerplexitySources(query.query);
    allSources.push(...sources);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Collected ${allSources.length} sources`);

  const summary = await analyzeAndSummarizeResearch(title, allSources);
  console.log("Research analysis complete");

  return {
    queries,
    sources: allSources,
    summary,
  };
}
