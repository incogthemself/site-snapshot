import fs from "fs/promises";
import path from "path";
import { URL } from "url";

export class FileManager {
  private baseDir: string;

  constructor(baseDir: string = "./cloned_sites") {
    this.baseDir = baseDir;
  }

  async ensureProjectDir(projectId: string): Promise<string> {
    const projectDir = path.join(this.baseDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  async saveFile(
    projectId: string,
    filePath: string,
    content: string | Buffer
  ): Promise<void> {
    const projectDir = await this.ensureProjectDir(projectId);
    const fullPath = path.join(projectDir, filePath);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  async readFile(projectId: string, filePath: string): Promise<string> {
    const projectDir = await this.ensureProjectDir(projectId);
    const fullPath = path.join(projectDir, filePath);
    return await fs.readFile(fullPath, "utf-8");
  }

  async listFiles(projectId: string): Promise<string[]> {
    const projectDir = await this.ensureProjectDir(projectId);
    const files: string[] = [];

    async function walk(dir: string, baseDir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          await walk(fullPath, baseDir);
        } else {
          files.push(relativePath);
        }
      }
    }

    try {
      await walk(projectDir, projectDir);
    } catch (error) {
      // Directory might not exist yet
    }

    return files;
  }

  async deleteProject(projectId: string): Promise<void> {
    const projectDir = path.join(this.baseDir, projectId);
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  }

  getLocalPath(url: string, baseUrl: string): string {
    try {
      const urlObj = new URL(url, baseUrl);
      let pathname = urlObj.pathname;

      // Handle root path
      if (pathname === "/" || pathname === "") {
        return "index.html";
      }

      // Remove leading slash
      pathname = pathname.replace(/^\//, "");

      // If no extension, treat as directory and add index.html
      if (!path.extname(pathname)) {
        pathname = path.join(pathname, "index.html");
      }

      return pathname;
    } catch (error) {
      return "index.html";
    }
  }

  getFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const typeMap: { [key: string]: string } = {
      ".html": "html",
      ".htm": "html",
      ".css": "css",
      ".js": "js",
      ".json": "js",
      ".png": "image",
      ".jpg": "image",
      ".jpeg": "image",
      ".gif": "image",
      ".svg": "image",
      ".webp": "image",
      ".ico": "image",
      ".woff": "font",
      ".woff2": "font",
      ".ttf": "font",
      ".otf": "font",
      ".eot": "font",
    };

    return typeMap[ext] || "other";
  }
}

export const fileManager = new FileManager();
