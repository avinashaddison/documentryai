import Anthropic from "@anthropic-ai/sdk";
import { sseBroadcaster } from "./sse-broadcaster";

// Lazy initialization to ensure env vars are loaded
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

export interface ResearchQuery {
  query: string;
  category: string;
  priority: number;
  phase?: "initial" | "deep" | "verification";
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
  query?: string;
}

export interface ResearchFact {
  id: string;
  claim: string;
  evidence: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  category: string;
  timePeriod?: string;
  relatedEntities?: string[];
}

export interface ResearchSummary {
  timeline: Array<{ date: string; event: string; significance: string; sources?: string[] }>;
  keyFacts: Array<{ fact: string; source: string; verified: boolean }>;
  controversies: Array<{ topic: string; perspectives: string[] }>;
  mainCharacters: Array<{ name: string; role: string; significance: string }>;
  statistics: Array<{ stat: string; context: string; source: string }>;
  quotes: Array<{ quote: string; speaker: string; context: string }>;
}

export interface DeepResearchResult {
  queries: ResearchQuery[];
  sources: Source[];
  summary: ResearchSummary;
  facts: ResearchFact[];
  subtopics: string[];
  depth: "shallow" | "medium" | "deep";
}

// Phase 1: Generate initial broad research queries
async function generateInitialQueries(title: string): Promise<ResearchQuery[]> {
  const prompt = `You are a senior investigative journalist preparing a deep-dive documentary about: "${title}"

Generate comprehensive initial research queries to gather foundational facts.

IMPORTANT: These queries should be specific and searchable, designed to find:
- Precise dates, names, locations
- Official records and documentation
- Primary source materials
- Statistical data
- Expert opinions and analysis

Generate 12-15 research queries covering:
1. ORIGINS: How did this begin? What were the root causes?
2. TIMELINE: Key dates and chronological events
3. KEY FIGURES: Who are the main people involved?
4. EVIDENCE: What documentation or proof exists?
5. IMPACT: What were the consequences?
6. CONTROVERSIES: What are the disputed aspects?
7. HIDDEN ANGLES: What's not commonly known?
8. CURRENT STATUS: What's the situation today?

Respond in JSON format:
{
  "queries": [
    {
      "query": "Specific, searchable research question",
      "category": "origins|timeline|figures|evidence|impact|controversies|hidden|current",
      "priority": 1
    }
  ]
}

Respond ONLY with valid JSON.`;

  const message = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response format");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
  return (result.queries || []).map((q: any) => ({ ...q, phase: "initial" }));
}

// Phase 2: Generate deep follow-up queries based on initial findings
async function generateDeepDiveQueries(
  title: string, 
  initialFindings: string,
  subtopics: string[]
): Promise<ResearchQuery[]> {
  const prompt = `You are conducting a DEEP DIVE investigation into: "${title}"

Based on initial research findings:
${initialFindings}

Key subtopics identified:
${subtopics.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Generate 10-15 FOLLOW-UP research queries that:
1. Drill deeper into each subtopic
2. Seek primary sources and documentation
3. Look for contradicting evidence
4. Find expert analysis and opinions
5. Uncover lesser-known details
6. Verify or challenge initial findings

Each query should be specific and designed to find NEW information not covered in initial research.

Respond in JSON format:
{
  "queries": [
    {
      "query": "Specific deep-dive research question",
      "category": "verification|primary_source|expert_opinion|contradiction|detail|context",
      "priority": 1,
      "targetSubtopic": "Which subtopic this addresses"
    }
  ]
}

Respond ONLY with valid JSON.`;

  const message = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response format");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
  return (result.queries || []).map((q: any) => ({ ...q, phase: "deep" }));
}

// Execute Perplexity query with enhanced options
async function executePerplexityQuery(
  query: string, 
  options: { 
    searchDomainFilter?: string[];
    searchRecencyFilter?: string;
    returnCitations?: boolean;
  } = {}
): Promise<{ content: string; citations: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn("PERPLEXITY_API_KEY not set");
    return { content: "", citations: [] };
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: `You are an expert research assistant conducting deep investigative research. 
Provide comprehensive, factual information with:
- Specific dates, names, and locations
- Numerical data and statistics when available
- Direct quotes from credible sources
- Multiple perspectives on controversial topics
- Clear attribution of claims to sources
Be thorough and precise. Cite your sources.`
          },
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.1,
        return_images: false,
        return_related_questions: true,
        search_recency_filter: options.searchRecencyFilter || "month",
      }),
    });

    if (!response.ok) {
      console.error("Perplexity API error:", response.status, await response.text());
      return { content: "", citations: [] };
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch (error) {
    console.error("Perplexity fetch error:", error);
    return { content: "", citations: [] };
  }
}

// Extract subtopics from initial research
async function extractSubtopics(title: string, researchContent: string): Promise<string[]> {
  const prompt = `Based on initial research about "${title}":

${researchContent.substring(0, 8000)}

Identify 5-8 KEY SUBTOPICS that deserve deeper investigation. These should be:
1. Specific aspects that need more detail
2. Controversial points that need verification
3. Key figures who need more background
4. Events that need timeline clarification
5. Claims that need evidence

Respond in JSON format:
{
  "subtopics": [
    "Specific subtopic that needs deeper research"
  ]
}

Respond ONLY with valid JSON.`;

  const message = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") return [];

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
    return result.subtopics || [];
  } catch {
    return [];
  }
}

// Extract structured facts from research content
async function extractStructuredFacts(
  title: string, 
  researchContent: string,
  sources: Source[]
): Promise<ResearchFact[]> {
  const prompt = `Extract verified facts from this research about "${title}":

${researchContent.substring(0, 12000)}

Extract 15-25 discrete, verifiable FACTS. Each fact should be:
- A single, specific claim
- Supported by evidence in the research
- Categorized by type
- Rated by confidence level

Respond in JSON format:
{
  "facts": [
    {
      "id": "fact_1",
      "claim": "Specific factual statement",
      "evidence": "The supporting evidence",
      "sources": ["Source name or URL"],
      "confidence": "high|medium|low",
      "category": "date|person|event|statistic|quote|location|cause|effect",
      "timePeriod": "When this occurred (if applicable)",
      "relatedEntities": ["Names of people, places, or things mentioned"]
    }
  ]
}

Prioritize facts that are:
- Unique or surprising
- Well-documented
- Important to the story
- Verifiable

Respond ONLY with valid JSON.`;

  const message = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") return [];

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
    return result.facts || [];
  } catch {
    return [];
  }
}

// Create comprehensive research summary
async function createResearchSummary(
  title: string,
  allContent: string,
  facts: ResearchFact[]
): Promise<ResearchSummary> {
  const prompt = `Create a comprehensive research summary for a documentary about "${title}".

Research content:
${allContent.substring(0, 15000)}

Extracted facts:
${JSON.stringify(facts.slice(0, 20), null, 2)}

Create a structured summary with:

1. TIMELINE: Chronological events with dates
2. KEY FACTS: Most important verified facts
3. CONTROVERSIES: Disputed aspects with multiple perspectives
4. MAIN CHARACTERS: Key people involved
5. STATISTICS: Important numbers and data
6. QUOTES: Notable quotes from sources

Respond in JSON format:
{
  "timeline": [
    { "date": "YYYY or YYYY-MM-DD", "event": "What happened", "significance": "Why it matters", "sources": ["source"] }
  ],
  "keyFacts": [
    { "fact": "Verified statement", "source": "Where it's from", "verified": true }
  ],
  "controversies": [
    { "topic": "The disputed topic", "perspectives": ["View 1", "View 2"] }
  ],
  "mainCharacters": [
    { "name": "Full name", "role": "Their role", "significance": "Why they matter" }
  ],
  "statistics": [
    { "stat": "The number or percentage", "context": "What it means", "source": "Where it's from" }
  ],
  "quotes": [
    { "quote": "The exact quote", "speaker": "Who said it", "context": "When/why" }
  ]
}

Include:
- 8-15 timeline entries in chronological order
- 10-20 key facts
- 3-6 controversies
- 5-10 main characters
- 5-10 statistics
- 3-8 notable quotes

Respond ONLY with valid JSON.`;

  const message = await getAnthropicClient().messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response format");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content.text);
  
  return {
    timeline: result.timeline || [],
    keyFacts: result.keyFacts || [],
    controversies: result.controversies || [],
    mainCharacters: result.mainCharacters || [],
    statistics: result.statistics || [],
    quotes: result.quotes || [],
  };
}

// Main deep research function
export async function conductDeepResearch(
  title: string,
  projectId: number,
  jobId: number,
  depth: "shallow" | "medium" | "deep" = "deep"
): Promise<DeepResearchResult> {
  console.log(`[Research] Starting ${depth} research for: ${title}`);
  
  const allQueries: ResearchQuery[] = [];
  const allSources: Source[] = [];
  let allContent = "";

  // Phase 1: Initial broad research
  sseBroadcaster.emitProgress(projectId, jobId, "research", 5, "Generating research queries...");
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "initial",
    activityType: "phase_complete",
    message: "Preparing research queries...",
  });
  
  const initialQueries = await generateInitialQueries(title);
  allQueries.push(...initialQueries);
  console.log(`[Research] Generated ${initialQueries.length} initial queries`);
  
  sseBroadcaster.emitProgress(projectId, jobId, "research", 8, `Starting initial research (${initialQueries.length} queries)...`);

  // Execute initial queries
  const maxInitialQueries = depth === "shallow" ? 5 : depth === "medium" ? 8 : 12;
  const priorityQueries = initialQueries.slice(0, maxInitialQueries);
  
  for (let i = 0; i < priorityQueries.length; i++) {
    const query = priorityQueries[i];
    console.log(`[Research] Query ${i + 1}/${priorityQueries.length}: ${query.query.substring(0, 50)}...`);
    
    // Emit query started
    sseBroadcaster.emitResearchActivity(projectId, jobId, {
      phase: "initial",
      activityType: "query_started",
      query: query.query,
      queryIndex: i + 1,
      totalQueries: priorityQueries.length,
      message: `Searching: ${query.query}`,
    });
    
    sseBroadcaster.emitProgress(
      projectId, jobId, "research", 
      10 + Math.round((i / priorityQueries.length) * 25),
      `Researching: ${query.category}...`
    );
    
    const result = await executePerplexityQuery(query.query);
    
    if (result.content) {
      allContent += `\n\n### ${query.category.toUpperCase()}: ${query.query}\n${result.content}`;
      
      // Emit query completed
      sseBroadcaster.emitResearchActivity(projectId, jobId, {
        phase: "initial",
        activityType: "query_completed",
        query: query.query,
        queryIndex: i + 1,
        totalQueries: priorityQueries.length,
        message: `Found ${result.citations.length} sources`,
      });
      
      // Emit each source found
      result.citations.forEach((url, idx) => {
        const source = {
          title: `Source ${allSources.length + 1}`,
          url,
          snippet: result.content.substring(0, 200),
          relevance: 1 - (idx * 0.1),
          query: query.query,
        };
        allSources.push(source);
        
        sseBroadcaster.emitResearchActivity(projectId, jobId, {
          phase: "initial",
          activityType: "source_found",
          source: { title: source.title, url: source.url, snippet: source.snippet.substring(0, 100) },
          message: `Source: ${url.substring(0, 60)}...`,
        });
      });
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log(`[Research] Initial research complete. ${allSources.length} sources collected.`);
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "initial",
    activityType: "phase_complete",
    message: `Initial research complete: ${allSources.length} sources collected`,
  });
  
  // Phase 2: Extract subtopics and do deep dive (only for medium/deep)
  let subtopics: string[] = [];
  
  if (depth !== "shallow") {
    sseBroadcaster.emitProgress(projectId, jobId, "research", 40, "Analyzing findings for deep dive...");
    sseBroadcaster.emitResearchActivity(projectId, jobId, {
      phase: "deep",
      activityType: "phase_complete",
      message: "Analyzing initial findings for deeper investigation...",
    });
    
    subtopics = await extractSubtopics(title, allContent);
    console.log(`[Research] Identified ${subtopics.length} subtopics for deep dive`);
    
    // Emit each subtopic identified
    subtopics.forEach((subtopic, idx) => {
      sseBroadcaster.emitResearchActivity(projectId, jobId, {
        phase: "deep",
        activityType: "subtopic_identified",
        subtopic,
        message: `Subtopic ${idx + 1}: ${subtopic}`,
      });
    });
    
    if (depth === "deep" && subtopics.length > 0) {
      sseBroadcaster.emitProgress(projectId, jobId, "research", 45, `Deep diving into ${subtopics.length} subtopics...`);
      
      const deepQueries = await generateDeepDiveQueries(title, allContent.substring(0, 5000), subtopics);
      allQueries.push(...deepQueries);
      
      const maxDeepQueries = 8;
      const selectedDeepQueries = deepQueries.slice(0, maxDeepQueries);
      
      for (let i = 0; i < selectedDeepQueries.length; i++) {
        const query = selectedDeepQueries[i];
        console.log(`[Research] Deep query ${i + 1}/${selectedDeepQueries.length}: ${query.query.substring(0, 50)}...`);
        
        // Emit deep dive query started
        sseBroadcaster.emitResearchActivity(projectId, jobId, {
          phase: "deep",
          activityType: "query_started",
          query: query.query,
          queryIndex: i + 1,
          totalQueries: selectedDeepQueries.length,
          message: `Deep dive: ${query.query}`,
        });
        
        sseBroadcaster.emitProgress(
          projectId, jobId, "research",
          50 + Math.round((i / selectedDeepQueries.length) * 20),
          `Deep diving: ${query.category}...`
        );
        
        const result = await executePerplexityQuery(query.query);
        
        if (result.content) {
          allContent += `\n\n### DEEP DIVE - ${query.category}: ${query.query}\n${result.content}`;
          
          // Emit query completed
          sseBroadcaster.emitResearchActivity(projectId, jobId, {
            phase: "deep",
            activityType: "query_completed",
            query: query.query,
            queryIndex: i + 1,
            totalQueries: selectedDeepQueries.length,
            message: `Deep dive found ${result.citations.length} sources`,
          });
          
          result.citations.forEach((url, idx) => {
            const source = {
              title: `Deep Source ${allSources.length + 1}`,
              url,
              snippet: result.content.substring(0, 200),
              relevance: 0.9 - (idx * 0.1),
              query: query.query,
            };
            allSources.push(source);
            
            sseBroadcaster.emitResearchActivity(projectId, jobId, {
              phase: "deep",
              activityType: "source_found",
              source: { title: source.title, url: source.url, snippet: source.snippet.substring(0, 100) },
              message: `Deep source: ${url.substring(0, 60)}...`,
            });
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  }

  console.log(`[Research] Total sources collected: ${allSources.length}`);
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "deep",
    activityType: "phase_complete",
    message: `Deep research complete: ${allSources.length} total sources`,
  });
  
  // Phase 3: Extract structured facts
  sseBroadcaster.emitProgress(projectId, jobId, "research", 75, "Extracting verified facts...");
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "synthesis",
    activityType: "phase_complete",
    message: "Extracting verified facts from research...",
  });
  
  const facts = await extractStructuredFacts(title, allContent, allSources);
  console.log(`[Research] Extracted ${facts.length} structured facts`);
  
  // Emit each extracted fact
  facts.slice(0, 10).forEach((fact, idx) => {
    sseBroadcaster.emitResearchActivity(projectId, jobId, {
      phase: "synthesis",
      activityType: "fact_extracted",
      fact: { claim: fact.claim, confidence: fact.confidence, category: fact.category },
      message: `Fact ${idx + 1}: ${fact.claim.substring(0, 80)}...`,
    });
  });
  
  if (facts.length > 10) {
    sseBroadcaster.emitResearchActivity(projectId, jobId, {
      phase: "synthesis",
      activityType: "fact_extracted",
      message: `...and ${facts.length - 10} more facts extracted`,
    });
  }

  // Phase 4: Create comprehensive summary
  sseBroadcaster.emitProgress(projectId, jobId, "research", 85, "Creating research summary...");
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "synthesis",
    activityType: "phase_complete",
    message: "Creating comprehensive research summary...",
  });
  
  const summary = await createResearchSummary(title, allContent, facts);
  console.log(`[Research] Summary created with ${summary.timeline.length} timeline events`);

  sseBroadcaster.emitProgress(projectId, jobId, "research", 95, "Research complete!");
  sseBroadcaster.emitResearchActivity(projectId, jobId, {
    phase: "synthesis",
    activityType: "phase_complete",
    message: `Research complete! ${facts.length} facts, ${summary.timeline.length} timeline events, ${allSources.length} sources`,
  });
  
  return {
    queries: allQueries,
    sources: allSources,
    summary,
    facts,
    subtopics,
    depth,
  };
}

// Legacy function for backward compatibility
export async function expandResearchQueries(title: string): Promise<ResearchQuery[]> {
  return generateInitialQueries(title);
}

export async function fetchPerplexitySources(query: string): Promise<Source[]> {
  const result = await executePerplexityQuery(query);
  const sources: Source[] = [];
  
  result.citations.forEach((url, index) => {
    sources.push({
      title: `Source ${index + 1}`,
      url,
      snippet: result.content.substring(0, 200),
      relevance: 1 - (index * 0.1),
    });
  });
  
  if (result.content) {
    sources.push({
      title: "Perplexity Research",
      url: "",
      snippet: result.content,
      relevance: 1,
    });
  }
  
  return sources;
}

export async function analyzeAndSummarizeResearch(
  title: string,
  sources: Source[]
): Promise<ResearchSummary> {
  const allContent = sources.map(s => s.snippet).join("\n\n");
  const facts = await extractStructuredFacts(title, allContent, sources);
  return createResearchSummary(title, allContent, facts);
}

// Keep for backward compatibility
export async function conductFullResearch(title: string): Promise<{
  queries: ResearchQuery[];
  sources: Source[];
  summary: ResearchSummary;
}> {
  // Use shallow research for legacy calls
  const result = await conductDeepResearch(title, 0, 0, "shallow");
  return {
    queries: result.queries,
    sources: result.sources,
    summary: result.summary,
  };
}
