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
    onProgress?: CloneProgressCallback
  ): Promise<void> {
    try {
      onProgress?.(5, "Launching headless browser");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Launching headless browser",
        progressPercentage: 5,
      });

      // Check if paused
      const project = await storage.getProject(projectId);
      if (project?.isPaused === 1) {
        await storage.updateProjectStatus(projectId, "paused");
        return;
      }

      // Render page with Playwright
      const { html, resources } = await playwrightService.renderPage(url);

      onProgress?.(20, "Rendering JavaScript content");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Rendering JavaScript content",
        progressPercentage: 20,
      });

      // Parse HTML with Cheerio
      const $ = cheerio.load(html);

      // Download all resources
      const totalResources = resources.length;
      let downloadedCount = 0;

      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

      // Download CSS files
      const cssLinks = new Set<string>();
      $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          cssLinks.add(href);
        }
      });

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
      const jsScripts = new Set<string>();
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          jsScripts.add(src);
        }
      });

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
      const images = new Set<string>();
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          images.add(src);
        }
      });

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
}

export const cloneService = new CloneService();
