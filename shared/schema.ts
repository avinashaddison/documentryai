import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  chapterCount: integer("chapter_count").notNull(),
  voiceEnabled: boolean("voice_enabled").notNull().default(true),
  deepResearch: boolean("deep_research").notNull().default(true),
  imageModel: text("image_model").notNull(),
  scriptModel: text("script_model").notNull(),
  status: text("status").notNull().default("draft"),
  state: text("state").notNull().default("CREATED"), // CREATED | RESEARCH_DONE | SCRIPT_DONE | IMAGES_DONE | AUDIO_DONE | EDITOR_APPROVED | RENDERED
  currentStep: integer("current_step").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scenes = pgTable("scenes", {
  id: serial("id").primaryKey(),
  chapterId: integer("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  sceneNumber: integer("scene_number").notNull(),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  duration: integer("duration"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const generationLogs = pgTable("generation_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  currentStep: true,
  progress: true,
});

export const insertChapterSchema = createInsertSchema(chapters).omit({
  id: true,
  createdAt: true,
});

export const insertSceneSchema = createInsertSchema(scenes).omit({
  id: true,
  createdAt: true,
});

export const insertGenerationLogSchema = createInsertSchema(generationLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertChapter = z.infer<typeof insertChapterSchema>;
export type Chapter = typeof chapters.$inferSelect;
export type InsertScene = z.infer<typeof insertSceneSchema>;
export type Scene = typeof scenes.$inferSelect;
export type InsertGenerationLog = z.infer<typeof insertGenerationLogSchema>;
export type GenerationLog = typeof generationLogs.$inferSelect;

export const generatedAssets = pgTable("generated_assets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  sceneNumber: integer("scene_number").notNull(),
  assetType: text("asset_type").notNull(), // "image" | "audio"
  assetUrl: text("asset_url").notNull(),
  prompt: text("prompt"),
  narration: text("narration"),
  duration: integer("duration"),
  status: text("status").notNull().default("completed"), // "pending" | "generating" | "completed" | "failed"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const generationSessions = pgTable("generation_sessions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("in_progress"), // "in_progress" | "completed" | "failed" | "paused"
  currentChapter: integer("current_chapter").notNull().default(1),
  currentScene: integer("current_scene").notNull().default(1),
  currentStep: text("current_step").notNull().default("images"), // "images" | "audio" | "video"
  totalChapters: integer("total_chapters").notNull(),
  totalScenes: integer("total_scenes").notNull(),
  completedImages: integer("completed_images").notNull().default(0),
  completedAudio: integer("completed_audio").notNull().default(0),
  voice: text("voice").default("neutral"),
  imageModel: text("image_model").default("flux-1.1-pro"),
  imageStyle: text("image_style").default("color"), // "color" | "black-and-white"
  errorMessage: text("error_message"),
  chaptersData: text("chapters_data"), // JSON string of full chapters payload
  outlineData: text("outline_data"), // JSON string of chapter titles
  configData: text("config_data"), // JSON string of story configuration
  imagesData: text("images_data"), // JSON string of generated images map
  audioData: text("audio_data"), // JSON string of generated audio map
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGeneratedAssetSchema = createInsertSchema(generatedAssets).omit({
  id: true,
  createdAt: true,
});

export const insertGenerationSessionSchema = createInsertSchema(generationSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGeneratedAsset = z.infer<typeof insertGeneratedAssetSchema>;
export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type InsertGenerationSession = z.infer<typeof insertGenerationSessionSchema>;
export type GenerationSession = typeof generationSessions.$inferSelect;

export const storyFrameworks = pgTable("story_frameworks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  generatedTitle: text("generated_title"),
  genres: text("genres").array(),
  premise: text("premise"),
  openingHook: text("opening_hook"),
  narratorVoice: text("narrator_voice").default("male-deep"),
  storyLength: text("story_length").default("medium"),
  hookImageModel: text("hook_image_model").default("flux-1.1-pro"),
  hookImageCount: integer("hook_image_count").default(3),
  chapterImageModel: text("chapter_image_model").default("flux-1.1-pro"),
  imagesPerChapter: integer("images_per_chapter").default(5),
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectResearch = pgTable("project_research", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  researchQueries: text("research_queries"), // JSON array of expanded queries
  sources: text("sources"), // JSON array of sources with citations
  researchSummary: text("research_summary"), // JSON summary with timeline, facts, controversies
  status: text("status").notNull().default("pending"), // pending | in_progress | completed | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectResearchSchema = createInsertSchema(projectResearch).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectResearch = z.infer<typeof insertProjectResearchSchema>;
export type ProjectResearch = typeof projectResearch.$inferSelect;

export const insertStoryFrameworkSchema = createInsertSchema(storyFrameworks).omit({
  id: true,
  createdAt: true,
});

export type InsertStoryFramework = z.infer<typeof insertStoryFrameworkSchema>;
export type StoryFramework = typeof storyFrameworks.$inferSelect;

// Background generation job for running generation pipeline in the background
export const generationJobs = pgTable("generation_jobs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"), // queued | running | completed | failed | paused
  currentStep: text("current_step").default("research"), // research | framework | outline | chapters | images | audio | video
  progress: integer("progress").notNull().default(0), // 0-100
  totalChapters: integer("total_chapters").notNull().default(1),
  currentChapter: integer("current_chapter").default(1),
  currentScene: integer("current_scene").default(1),
  completedSteps: text("completed_steps").array(), // Array of completed step names
  configData: text("config_data"), // JSON string of generation config
  stateData: text("state_data"), // JSON string of current generation state (chapters, images, audio)
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGenerationJobSchema = createInsertSchema(generationJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGenerationJob = z.infer<typeof insertGenerationJobSchema>;
export type GenerationJob = typeof generationJobs.$inferSelect;

export * from "./models/chat";

// Timeline Editor JSON Schema - Single Source of Truth
// This is the immutable data model for the video editor

export const TimelineVideoClipSchema = z.object({
  id: z.string(),
  src: z.string(),
  start: z.number(),
  duration: z.number(),
  effect: z.enum(["none", "kenburns", "zoom_in", "zoom_out", "pan_left", "pan_right"]).optional().default("none"),
  fade_in: z.number().optional().default(0),
  fade_out: z.number().optional().default(0),
  blur: z.boolean().optional().default(false),
});

export const TimelineAudioClipSchema = z.object({
  id: z.string(),
  src: z.string(),
  start: z.number(),
  duration: z.number().optional(),
  volume: z.number().min(0).max(2).optional().default(1.0),
  fade_in: z.number().optional().default(0),
  fade_out: z.number().optional().default(0),
  ducking: z.boolean().optional().default(false),
  audioType: z.enum(["narration", "music", "sfx"]).optional().default("narration"),
});

export const SFX_LIBRARY = [
  { id: "whoosh", name: "Whoosh", duration: 1.2, category: "transition" },
  { id: "dramatic_hit", name: "Dramatic Hit", duration: 0.8, category: "impact" },
  { id: "suspense_rise", name: "Suspense Rise", duration: 3.0, category: "tension" },
  { id: "reveal_sting", name: "Reveal Sting", duration: 2.0, category: "reveal" },
  { id: "paper_rustle", name: "Paper Rustle", duration: 1.5, category: "ambient" },
  { id: "clock_tick", name: "Clock Tick", duration: 2.0, category: "ambient" },
  { id: "wind_ambient", name: "Wind Ambient", duration: 5.0, category: "ambient" },
  { id: "typewriter", name: "Typewriter", duration: 2.5, category: "effect" },
  { id: "camera_flash", name: "Camera Flash", duration: 0.5, category: "effect" },
  { id: "door_creak", name: "Door Creak", duration: 2.0, category: "ambient" },
  { id: "thunder", name: "Thunder", duration: 4.0, category: "weather" },
  { id: "rain_light", name: "Light Rain", duration: 10.0, category: "weather" },
  { id: "crowd_murmur", name: "Crowd Murmur", duration: 8.0, category: "ambient" },
  { id: "tension_drone", name: "Tension Drone", duration: 6.0, category: "tension" },
  { id: "heartbeat", name: "Heartbeat", duration: 4.0, category: "tension" },
] as const;

export const TimelineTextClipSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
  font: z.string().optional().default("Serif"),
  size: z.number().optional().default(48),
  color: z.string().optional().default("#FFFFFF"),
  x: z.string().optional().default("(w-text_w)/2"),
  y: z.string().optional().default("h-120"),
  box: z.boolean().optional().default(false),
  box_color: z.string().optional().default("#000000"),
  box_opacity: z.number().min(0).max(1).optional().default(0.5),
});

export const TimelineSchema = z.object({
  resolution: z.string().optional().default("1920x1080"),
  fps: z.number().optional().default(30),
  duration: z.number(),
  tracks: z.object({
    video: z.array(TimelineVideoClipSchema).optional().default([]),
    audio: z.array(TimelineAudioClipSchema).optional().default([]),
    text: z.array(TimelineTextClipSchema).optional().default([]),
  }),
});

export type TimelineVideoClip = z.infer<typeof TimelineVideoClipSchema>;
export type TimelineAudioClip = z.infer<typeof TimelineAudioClipSchema>;
export type TimelineTextClip = z.infer<typeof TimelineTextClipSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
