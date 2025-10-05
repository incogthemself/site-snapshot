import { playwrightService } from "./playwright";
import { fileManager } from "./fileManager";
import { storage } from "../storage";
import { URL } from "url";
import * as cheerio from "cheerio";

interface CloneProgressCallback {
  (progress: number, step: string, currentFile?: string): void;
}

export class CloneService {
  async cloneWebsite(
    projectId: string,
    url: string,
    onProgress?: CloneProgressCallback,
    method: "static" | "playwright" = "playwright"
  ): Promise<void> {
    try {
      let html: string;
      let initialResources: string[] = [];

      // Check if paused
      const project = await storage.getProject(projectId);
      if (project?.isPaused === 1) {
        await storage.updateProjectStatus(projectId, "paused");
        return;
      }

      if (method === "static") {
        // Static method: Fast, no JavaScript execution
        onProgress?.(10, "Fetching page (static mode)");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Fetching page (static mode)",
          progressPercentage: 10,
        });

        const response = await fetch(url);
        html = await response.text();

        onProgress?.(20, "Analyzing resources");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Analyzing resources",
          progressPercentage: 20,
        });
      } else {
        // Playwright method: Slower, executes JavaScript
        onProgress?.(5, "Initializing browser");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Initializing browser",
          progressPercentage: 5,
        });

        // Pre-initialize browser to speed up
        await playwrightService.initialize();

        onProgress?.(10, "Loading page with JavaScript");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Loading page with JavaScript",
          progressPercentage: 10,
        });

        const result = await playwrightService.renderPage(url);
        html = result.html;
        initialResources = result.resources;

        onProgress?.(20, "Page rendered successfully");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Page rendered successfully",
          progressPercentage: 20,
        });
      }

      // Parse HTML with Cheerio
      const $ = cheerio.load(html);

      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

      // Collect all resources to download
      const cssLinks = new Set<string>();
      $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          cssLinks.add(href);
        }
      });

      const jsScripts = new Set<string>();
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          jsScripts.add(src);
        }
      });

      const images = new Set<string>();
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          images.add(src);
        }
      });

      const totalResources = cssLinks.size + jsScripts.size + images.size;
      let downloadedCount = 0;

      onProgress?.(30, "Downloading CSS files");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Downloading CSS files",
        progressPercentage: 30,
      });
      
      for (const href of Array.from(cssLinks)) {
        // Check if paused before each file
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        try {
          const absoluteUrl = new URL(href, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(href, url);

          await fileManager.saveFile(projectId, `css/${localPath}`, content);
          await storage.createFile({
            projectId,
            path: `css/${localPath}`,
            content: content.toString(),
            type: "css",
            size: content.length,
          });

          // Update link in HTML
          $(`link[href="${href}"]`).attr("href", `./css/${localPath}`);

          downloadedCount++;
          const progressPercentage = Math.floor(30 + (downloadedCount / totalResources) * 20);
          onProgress?.(progressPercentage, "Downloading CSS files", localPath);
          await storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Downloading CSS files",
            progressPercentage,
            filesProcessed: downloadedCount,
          });
        } catch (error) {
          console.error(`Failed to download CSS: ${href}`, error);
        }
      }

      // Download JavaScript files
      onProgress?.(50, "Downloading JavaScript files");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Downloading JavaScript files",
        progressPercentage: 50,
      });

      for (const src of Array.from(jsScripts)) {
        // Check if paused before each file
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        try {
          const absoluteUrl = new URL(src, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(src, url);

          await fileManager.saveFile(projectId, `js/${localPath}`, content);
          await storage.createFile({
            projectId,
            path: `js/${localPath}`,
            content: content.toString(),
            type: "js",
            size: content.length,
          });

          // Update script src in HTML
          $(`script[src="${src}"]`).attr("src", `./js/${localPath}`);

          downloadedCount++;
          const progressPercentage = Math.floor(50 + (downloadedCount / totalResources) * 20);
          onProgress?.(progressPercentage, "Downloading JavaScript files", localPath);
          await storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Downloading JavaScript files",
            progressPercentage,
            filesProcessed: downloadedCount,
          });
        } catch (error) {
          console.error(`Failed to download JS: ${src}`, error);
        }
      }

      // Download images
      onProgress?.(70, "Downloading images");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Downloading images",
        progressPercentage: 70,
      });

      for (const src of Array.from(images)) {
        // Check if paused before each file
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        try {
          const absoluteUrl = new URL(src, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(src, url);

          await fileManager.saveFile(projectId, `images/${localPath}`, content);
          await storage.createFile({
            projectId,
            path: `images/${localPath}`,
            content: "",
            type: "image",
            size: content.length,
          });

          // Update img src in HTML
          $(`img[src="${src}"]`).attr("src", `./images/${localPath}`);

          downloadedCount++;
          const progressPercentage = Math.floor(70 + (downloadedCount / totalResources) * 15);
          onProgress?.(progressPercentage, "Downloading images", localPath);
          await storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Downloading images",
            progressPercentage,
            filesProcessed: downloadedCount,
          });
        } catch (error) {
          console.error(`Failed to download image: ${src}`, error);
        }
      }

      // Rewrite all absolute URLs to relative
      onProgress?.(90, "Rewriting URLs");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Rewriting URLs",
        progressPercentage: 90,
      });
      const updatedHtml = $.html();

      // Save main HTML file
      await fileManager.saveFile(projectId, "index.html", updatedHtml);
      await storage.createFile({
        projectId,
        path: "index.html",
        content: updatedHtml,
        type: "html",
        size: updatedHtml.length,
      });

      // Get all files for final count
      const allFiles = await storage.getFilesByProject(projectId);
      const totalSize = allFiles.reduce((sum, file) => sum + (file.size || 0), 0);

      await storage.updateProjectStatus(projectId, "complete", {
        totalFiles: allFiles.length,
        totalSize,
        currentStep: "Clone complete",
        progressPercentage: 100,
      });

      onProgress?.(100, "Clone complete");
    } catch (error) {
      await storage.updateProjectStatus(projectId, "error", {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async fetchResource(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async estimateClone(url: string, method: "static" | "playwright" = "static"): Promise<{
    estimatedTime: number;
    estimatedSize: number;
    resourceCount: number;
  }> {
    try {
      // Fetch the HTML
      const response = await fetch(url);
      const html = await response.text();
      const htmlSize = html.length;

      // Parse HTML to count resources
      const $ = cheerio.load(html);

      const cssLinks = new Set<string>();
      $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) cssLinks.add(href);
      });

      const jsScripts = new Set<string>();
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) jsScripts.add(src);
      });

      const images = new Set<string>();
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) images.add(src);
      });

      const totalResources = cssLinks.size + jsScripts.size + images.size;

      // Estimate size (rough calculation)
      // Average CSS: 50KB, JS: 100KB, Image: 200KB
      const estimatedSize =
        htmlSize +
        cssLinks.size * 50 * 1024 +
        jsScripts.size * 100 * 1024 +
        images.size * 200 * 1024;

      // Estimate time (in seconds)
      // Static: ~0.5s per resource, Playwright: ~1s per resource + 5s overhead
      let estimatedTime = totalResources * (method === "static" ? 0.5 : 1);
      if (method === "playwright") {
        estimatedTime += 5; // Browser launch overhead
      }

      return {
        estimatedTime: Math.ceil(estimatedTime),
        estimatedSize: Math.ceil(estimatedSize),
        resourceCount: totalResources + 1, // +1 for HTML
      };
    } catch (error) {
      // Return default estimates if fetch fails
      return {
        estimatedTime: method === "playwright" ? 30 : 15,
        estimatedSize: 2 * 1024 * 1024, // 2MB default
        resourceCount: 10,
      };
    }
  }
}

export const cloneService = new CloneService();
