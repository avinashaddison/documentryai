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
  users,
  projects,
  chapters,
  scenes,
  generationLogs,
  storyFrameworks
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
