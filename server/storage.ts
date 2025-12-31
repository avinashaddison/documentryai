import { 
  type User, 
  type InsertUser,
  type Project,
  type InsertProject,
  type Chapter,
  type InsertChapter,
  type Scene,
  type InsertScene,
  type GenerationLog,
  type InsertGenerationLog,
  type StoryFramework,
  type InsertStoryFramework,
  type GeneratedAsset,
  type InsertGeneratedAsset,
  type GenerationSession,
  type InsertGenerationSession,
  type CreationSession,
  type InsertCreationSession,
  users,
  projects,
  chapters,
  scenes,
  generationLogs,
  storyFrameworks,
  generatedAssets,
  generationSessions,
  creationSessions
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: number): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  updateProject(id: number, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;
  
  createChapter(chapter: InsertChapter): Promise<Chapter>;
  getChaptersByProject(projectId: number): Promise<Chapter[]>;
  
  createScene(scene: InsertScene): Promise<Scene>;
  getScenesByChapter(chapterId: number): Promise<Scene[]>;
  
  createGenerationLog(log: InsertGenerationLog): Promise<GenerationLog>;
  getGenerationLogsByProject(projectId: number): Promise<GenerationLog[]>;
  
  createStoryFramework(framework: InsertStoryFramework): Promise<StoryFramework>;
  getStoryFrameworkByProject(projectId: number): Promise<StoryFramework | undefined>;
  updateStoryFramework(id: number, updates: Partial<StoryFramework>): Promise<StoryFramework | undefined>;
  
  // Generated Assets
  saveGeneratedAsset(asset: InsertGeneratedAsset): Promise<GeneratedAsset>;
  getGeneratedAssetsByProject(projectId: number): Promise<GeneratedAsset[]>;
  getGeneratedAsset(projectId: number, chapterNumber: number, sceneNumber: number, assetType: string): Promise<GeneratedAsset | undefined>;
  deleteGeneratedAssetsByProject(projectId: number): Promise<void>;
  
  // Generation Sessions
  createGenerationSession(session: InsertGenerationSession): Promise<GenerationSession>;
  getActiveGenerationSession(projectId: number): Promise<GenerationSession | undefined>;
  updateGenerationSession(id: number, updates: Partial<GenerationSession>): Promise<GenerationSession | undefined>;
  deleteGenerationSession(id: number): Promise<void>;
  
  // Creation Sessions (for /create page persistence)
  getCreationSession(sessionKey: string): Promise<CreationSession | undefined>;
  upsertCreationSession(session: InsertCreationSession): Promise<CreationSession>;
  deleteCreationSession(sessionKey: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const result = await db.insert(projects).values(insertProject).returning();
    return result[0];
  }

  async getProject(id: number): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id));
    return result[0];
  }

  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async updateProject(id: number, updates: Partial<Project>): Promise<Project | undefined> {
    const result = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async createChapter(insertChapter: InsertChapter): Promise<Chapter> {
    const result = await db.insert(chapters).values(insertChapter).returning();
    return result[0];
  }

  async getChaptersByProject(projectId: number): Promise<Chapter[]> {
    return await db.select().from(chapters).where(eq(chapters.projectId, projectId));
  }

  async createScene(insertScene: InsertScene): Promise<Scene> {
    const result = await db.insert(scenes).values(insertScene).returning();
    return result[0];
  }

  async getScenesByChapter(chapterId: number): Promise<Scene[]> {
    return await db.select().from(scenes).where(eq(scenes.chapterId, chapterId));
  }

  async createGenerationLog(insertLog: InsertGenerationLog): Promise<GenerationLog> {
    const result = await db.insert(generationLogs).values(insertLog).returning();
    return result[0];
  }

  async getGenerationLogsByProject(projectId: number): Promise<GenerationLog[]> {
    return await db.select().from(generationLogs).where(eq(generationLogs.projectId, projectId));
  }

  async createStoryFramework(framework: InsertStoryFramework): Promise<StoryFramework> {
    const result = await db.insert(storyFrameworks).values(framework).returning();
    return result[0];
  }

  async getStoryFrameworkByProject(projectId: number): Promise<StoryFramework | undefined> {
    const result = await db.select().from(storyFrameworks).where(eq(storyFrameworks.projectId, projectId));
    return result[0];
  }

  async updateStoryFramework(id: number, updates: Partial<StoryFramework>): Promise<StoryFramework | undefined> {
    const result = await db
      .update(storyFrameworks)
      .set(updates)
      .where(eq(storyFrameworks.id, id))
      .returning();
    return result[0];
  }

  // Generated Assets
  async saveGeneratedAsset(asset: InsertGeneratedAsset): Promise<GeneratedAsset> {
    // Check if asset already exists, update if so
    const existing = await this.getGeneratedAsset(
      asset.projectId,
      asset.chapterNumber,
      asset.sceneNumber,
      asset.assetType
    );
    if (existing) {
      // Only update fields that are actually provided (non-undefined)
      const updateFields: Partial<typeof asset> = {};
      if (asset.assetUrl !== undefined) updateFields.assetUrl = asset.assetUrl;
      if (asset.prompt !== undefined) updateFields.prompt = asset.prompt;
      if (asset.narration !== undefined) updateFields.narration = asset.narration;
      if (asset.duration !== undefined) updateFields.duration = asset.duration;
      if (asset.status !== undefined) updateFields.status = asset.status;
      
      const result = await db
        .update(generatedAssets)
        .set(updateFields)
        .where(eq(generatedAssets.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(generatedAssets).values(asset).returning();
    return result[0];
  }

  async getGeneratedAssetsByProject(projectId: number): Promise<GeneratedAsset[]> {
    return await db
      .select()
      .from(generatedAssets)
      .where(eq(generatedAssets.projectId, projectId));
  }

  async getGeneratedAsset(
    projectId: number,
    chapterNumber: number,
    sceneNumber: number,
    assetType: string
  ): Promise<GeneratedAsset | undefined> {
    const result = await db
      .select()
      .from(generatedAssets)
      .where(
        and(
          eq(generatedAssets.projectId, projectId),
          eq(generatedAssets.chapterNumber, chapterNumber),
          eq(generatedAssets.sceneNumber, sceneNumber),
          eq(generatedAssets.assetType, assetType)
        )
      );
    return result[0];
  }

  async deleteGeneratedAssetsByProject(projectId: number): Promise<void> {
    await db.delete(generatedAssets).where(eq(generatedAssets.projectId, projectId));
  }

  // Generation Sessions
  async createGenerationSession(session: InsertGenerationSession): Promise<GenerationSession> {
    const result = await db.insert(generationSessions).values(session).returning();
    return result[0];
  }

  async getActiveGenerationSession(projectId: number): Promise<GenerationSession | undefined> {
    const result = await db
      .select()
      .from(generationSessions)
      .where(
        and(
          eq(generationSessions.projectId, projectId),
          eq(generationSessions.status, "in_progress")
        )
      )
      .orderBy(desc(generationSessions.createdAt))
      .limit(1);
    return result[0];
  }

  async updateGenerationSession(id: number, updates: Partial<GenerationSession>): Promise<GenerationSession | undefined> {
    const result = await db
      .update(generationSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(generationSessions.id, id))
      .returning();
    return result[0];
  }

  async deleteGenerationSession(id: number): Promise<void> {
    await db.delete(generationSessions).where(eq(generationSessions.id, id));
  }

  // Creation Sessions
  async getCreationSession(sessionKey: string): Promise<CreationSession | undefined> {
    const result = await db
      .select()
      .from(creationSessions)
      .where(eq(creationSessions.sessionKey, sessionKey));
    return result[0];
  }

  async upsertCreationSession(session: InsertCreationSession): Promise<CreationSession> {
    const existing = await this.getCreationSession(session.sessionKey);
    if (existing) {
      const result = await db
        .update(creationSessions)
        .set({ ...session, updatedAt: new Date() })
        .where(eq(creationSessions.sessionKey, session.sessionKey))
        .returning();
      return result[0];
    }
    const result = await db.insert(creationSessions).values(session).returning();
    return result[0];
  }

  async deleteCreationSession(sessionKey: string): Promise<void> {
    await db.delete(creationSessions).where(eq(creationSessions.sessionKey, sessionKey));
  }
}

export const storage = new DatabaseStorage();
