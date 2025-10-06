import { type Project, type InsertProject, type File, type InsertFile } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Projects
  createProject(project: InsertProject & Partial<Pick<Project, 'estimatedTime' | 'estimatedSize'>>): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getAllProjects(): Promise<Project[]>;
  updateProjectStatus(id: string, status: string, updates?: Partial<Project>): Promise<void>;
  updateProjectName(id: string, displayName: string): Promise<void>;
  deleteProject(id: string): Promise<void>;

  // Files
  createFile(file: InsertFile): Promise<File>;
  getFile(id: string): Promise<File | undefined>;
  getFilesByProject(projectId: string): Promise<File[]>;
  updateFileContent(id: string, content: string): Promise<void>;
  deleteFilesByProject(projectId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private projects: Map<string, Project>;
  private files: Map<string, File>;

  constructor() {
    this.projects = new Map();
    this.files = new Map();
  }

  async createProject(insertProject: InsertProject & Partial<Pick<Project, 'estimatedTime' | 'estimatedSize'>>): Promise<Project> {
    const id = randomUUID();
    const project: Project = {
      ...insertProject,
      id,
      displayName: insertProject.displayName || insertProject.name,
      status: "pending",
      cloneMethod: insertProject.cloneMethod || "static",
      crawlDepth: insertProject.crawlDepth || 0,
      deviceProfiles: insertProject.deviceProfiles || null,
      totalFiles: 0,
      totalSize: 0,
      compressedSize: 0,
      estimatedTime: insertProject.estimatedTime || 0,
      estimatedSize: insertProject.estimatedSize || 0,
      currentStep: null,
      progressPercentage: 0,
      filesProcessed: 0,
      pagesProcessed: 0,
      generatedCode: null,
      isPaused: 0,
      createdAt: new Date(),
      completedAt: null,
      errorMessage: null,
    };
    this.projects.set(id, project);
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async updateProjectStatus(
    id: string,
    status: string,
    updates?: Partial<Project>
  ): Promise<void> {
    const project = this.projects.get(id);
    if (project) {
      this.projects.set(id, {
        ...project,
        status,
        ...updates,
        completedAt: status === "complete" ? new Date() : project.completedAt,
      });
    }
  }

  async updateProjectName(id: string, displayName: string): Promise<void> {
    const project = this.projects.get(id);
    if (project) {
      this.projects.set(id, { ...project, displayName });
    }
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    await this.deleteFilesByProject(id);
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const id = randomUUID();
    const file: File = {
      ...insertFile,
      content: insertFile.content ?? null,
      size: insertFile.size ?? null,
      id,
      createdAt: new Date(),
    };
    this.files.set(id, file);
    return file;
  }

  async getFile(id: string): Promise<File | undefined> {
    return this.files.get(id);
  }

  async getFilesByProject(projectId: string): Promise<File[]> {
    return Array.from(this.files.values())
      .filter((file) => file.projectId === projectId)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async updateFileContent(id: string, content: string): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      this.files.set(id, { ...file, content });
    }
  }

  async deleteFilesByProject(projectId: string): Promise<void> {
    const filesToDelete = Array.from(this.files.entries())
      .filter(([, file]) => file.projectId === projectId)
      .map(([id]) => id);

    filesToDelete.forEach((id) => this.files.delete(id));
  }
}

export const storage = new MemStorage();
