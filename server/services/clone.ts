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

      // Render page with Playwright
      const { html, resources } = await playwrightService.renderPage(url);

      onProgress?.(20, "Rendering JavaScript content");

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
      for (const href of Array.from(cssLinks)) {
        try {
          const absoluteUrl = new URL(href, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(href, baseUrl);

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
          onProgress?.(
            30 + (downloadedCount / totalResources) * 20,
            "Downloading CSS files",
            localPath
          );
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
      for (const src of Array.from(jsScripts)) {
        try {
          const absoluteUrl = new URL(src, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(src, baseUrl);

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
          onProgress?.(
            50 + (downloadedCount / totalResources) * 20,
            "Downloading JavaScript files",
            localPath
          );
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
      for (const src of Array.from(images)) {
        try {
          const absoluteUrl = new URL(src, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(src, baseUrl);

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
          onProgress?.(
            70 + (downloadedCount / totalResources) * 15,
            "Downloading images",
            localPath
          );
        } catch (error) {
          console.error(`Failed to download image: ${src}`, error);
        }
      }

      // Rewrite all absolute URLs to relative
      onProgress?.(90, "Rewriting URLs");
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
