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
  imageModel: text("image_model").notNull(),
  scriptModel: text("script_model").notNull(),
  status: text("status").notNull().default("draft"),
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
  errorMessage: text("error_message"),
  chaptersData: text("chapters_data"), // JSON string of full chapters payload
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

export const insertStoryFrameworkSchema = createInsertSchema(storyFrameworks).omit({
  id: true,
  createdAt: true,
});

export type InsertStoryFramework = z.infer<typeof insertStoryFrameworkSchema>;
export type StoryFramework = typeof storyFrameworks.$inferSelect;

export * from "./models/chat";
