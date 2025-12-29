import Replicate from "replicate";
import { storage } from "./storage";
import type { Project } from "@shared/schema";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

async function log(projectId: number, step: string, status: string, message: string) {
  await storage.createGenerationLog({
    projectId,
    step,
    status,
    message,
  });
}

async function updateProgress(projectId: number, currentStep: number, progress: number, status: string = "generating") {
  await storage.updateProject(projectId, {
    currentStep,
    progress,
    status,
  });
}

async function generateStory(project: Project): Promise<string> {
  await log(project.id, "story", "started", "Generating story with Claude");
  await updateProgress(project.id, 1, 10);

  const model = project.scriptModel === "claude-3-5" 
    ? "anthropic/claude-4-sonnet" 
    : "openai/gpt-5";

  const prompt = `You are a master storyteller. Create a compelling, cinematic story based on this title: "${project.title}".

The story should have exactly ${project.chapterCount} chapter(s). Each chapter should be approximately 800 words and tell a complete narrative arc.

Format your response as JSON with this structure:
{
  "hook": "A powerful opening paragraph (1-2 sentences)",
  "genres": ["genre1", "genre2", "genre3"],
  "premise": "A 15-20 sentence premise describing the full story arc",
  "tone": "The narrative tone and pacing",
  "chapters": [
    {
      "number": 1,
      "title": "Chapter Title",
      "content": "~800 word chapter content with vivid, cinematic description"
    }
  ]
}

Make it visually descriptive and cinematic - perfect for adaptation into a video format.`;

  let storyOutput = "";
  
  for await (const event of replicate.stream(model as any, {
    input: {
      prompt,
      system_prompt: "You are a professional screenwriter and novelist. Always respond with valid JSON.",
    }
  })) {
    storyOutput += event.toString();
  }

  await log(project.id, "story", "completed", "Story generated successfully");
  await updateProgress(project.id, 1, 20);

  return storyOutput;
}

async function generateImagePrompts(projectId: number, storyContent: string, chapterNumber: number): Promise<string[]> {
  await log(projectId, "prompts", "started", `Generating image prompts for chapter ${chapterNumber}`);
  
  const prompt = `Based on this chapter content, create 10-15 ultra-detailed cinematic image prompts that capture key scenes:

${storyContent.substring(0, 2000)}

Each prompt should include:
- Camera angle (wide shot, close-up, aerial, etc.)
- Lighting description (golden hour, volumetric fog, dramatic shadows, etc.)
- Emotion and atmosphere
- Environment details
- Character descriptions (if applicable)
- Art style: photorealistic, cinematic, 8k resolution

Format as JSON array of strings.`;

  let promptsOutput = "";
  
  for await (const event of replicate.stream("openai/gpt-5" as any, {
    input: {
      prompt,
    }
  })) {
    promptsOutput += event.toString();
  }

  await log(projectId, "prompts", "completed", `Generated prompts for chapter ${chapterNumber}`);
  
  try {
    const prompts = JSON.parse(promptsOutput);
    return Array.isArray(prompts) ? prompts : [];
  } catch {
    return [];
  }
}

async function generateImage(projectId: number, prompt: string, imageModel: string): Promise<string | null> {
  const model = imageModel === "ideogram-v3" 
    ? "ideogram-ai/ideogram-v3-turbo"
    : "black-forest-labs/flux-1.1-pro";

  try {
    const output: any = await replicate.run(model as any, {
      input: {
        prompt,
        aspect_ratio: imageModel === "ideogram-v3" ? "16:9" : undefined,
        prompt_upsampling: imageModel === "flux-pro" ? true : undefined,
      }
    });

    if (output && typeof output === 'object' && 'url' in output) {
      return output.url();
    } else if (typeof output === 'string') {
      return output;
    } else if (Array.isArray(output) && output.length > 0) {
      return output[0];
    }

    return null;
  } catch (error: any) {
    await log(projectId, "images", "error", `Image generation failed: ${error.message}`);
    return null;
  }
}

export async function generateVideo(projectId: number) {
  try {
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await log(projectId, "start", "started", "Starting video generation pipeline");
    await updateProgress(projectId, 0, 5);

    const storyJson = await generateStory(project);
    await updateProgress(projectId, 1, 25);

    let story;
    try {
      story = JSON.parse(storyJson);
    } catch {
      story = {
        chapters: [{ number: 1, title: "Generated Story", content: storyJson }]
      };
    }

    for (let i = 0; i < story.chapters.length; i++) {
      const chapter = story.chapters[i];
      const progressStart = 25 + (i * (60 / story.chapters.length));
      
      await log(projectId, "chapter", "started", `Processing chapter ${chapter.number}`);
      
      const savedChapter = await storage.createChapter({
        projectId,
        chapterNumber: chapter.number,
        content: chapter.content,
        wordCount: chapter.content.split(' ').length,
      });

      await updateProgress(projectId, 2, progressStart + 5);

      const prompts = await generateImagePrompts(projectId, chapter.content, chapter.number);
      await updateProgress(projectId, 3, progressStart + 10);

      for (let j = 0; j < Math.min(prompts.length, 5); j++) {
        await log(projectId, "images", "started", `Generating image ${j + 1}/${prompts.length} for chapter ${chapter.number}`);
        
        const imageUrl = await generateImage(projectId, prompts[j], project.imageModel);
        
        if (imageUrl) {
          await storage.createScene({
            chapterId: savedChapter.id,
            sceneNumber: j + 1,
            prompt: prompts[j],
            imageUrl,
          });
        }

        await updateProgress(projectId, 3, progressStart + 10 + (j * 8));
      }

      await log(projectId, "chapter", "completed", `Chapter ${chapter.number} complete`);
    }

    await updateProgress(projectId, 4, 90, "generating");
    await log(projectId, "audio", "pending", "Audio generation not yet implemented");

    await updateProgress(projectId, 5, 95, "generating");
    await log(projectId, "assembly", "pending", "Video assembly not yet implemented");

    await updateProgress(projectId, 5, 100, "completed");
    await log(projectId, "complete", "completed", "Video generation pipeline completed");

  } catch (error: any) {
    await log(projectId, "error", "failed", error.message);
    await storage.updateProject(projectId, { status: "failed" });
    throw error;
  }
}
