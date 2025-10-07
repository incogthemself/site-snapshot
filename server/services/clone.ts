import { playwrightService } from "./playwright";
import { fileManager } from "./fileManager";
import { storage } from "../storage";
import { URL } from "url";
import * as cheerio from "cheerio";

interface CloneProgressCallback {
  (progress: number, step: string, currentFile?: string): void;
}

export class CloneService {
  private async extractLinks(html: string, baseUrl: string): Promise<string[]> {
    const $ = cheerio.load(html);
    const links = new Set<string>();
    const urlObj = new URL(baseUrl);
    const baseDomain = urlObj.hostname;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const absoluteUrl = new URL(href, baseUrl);
          // Only include same-domain links
          if (absoluteUrl.hostname === baseDomain && absoluteUrl.pathname !== urlObj.pathname) {
            links.add(absoluteUrl.href);
          }
        } catch (error) {
          // Invalid URL, skip
        }
      }
    });

    return Array.from(links);
  }

  async cloneWebsite(
    projectId: string,
    url: string,
    onProgress?: CloneProgressCallback,
    method: "static" | "playwright" = "playwright",
    crawlDepth: number = 0
  ): Promise<void> {
    try {
      let html: string;
      let initialResources: string[] = [];
      const startTime = Date.now();

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
        onProgress?.(2, "Initializing browser");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Initializing browser",
          progressPercentage: 2,
        });

        // Pre-initialize browser to speed up
        await playwrightService.initialize();

        onProgress?.(5, "Loading page with JavaScript");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Loading page with JavaScript",
          progressPercentage: 5,
        });

        const result = await playwrightService.renderPage(url, (progress) => {
          const currentProgress = 5 + Math.floor(progress * 10);
          onProgress?.(currentProgress, "Rendering page...");
          storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Rendering page...",
            progressPercentage: currentProgress,
          });
        });
        html = result.html;
        initialResources = result.resources;

        onProgress?.(15, "Page rendered successfully");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Page rendered successfully",
          progressPercentage: 15,
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

      // Collect fonts
      const fontLinks = new Set<string>();
      $('link[rel*="font"], link[type*="font"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          fontLinks.add(href);
        }
      });

      // Collect favicons and icons
      const icons = new Set<string>();
      $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("data:")) {
          icons.add(href);
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

      // Collect background images from inline styles
      $("[style*='background']").each((_, el) => {
        const style = $(el).attr("style");
        if (style) {
          const urlMatches = style.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
          if (urlMatches) {
            urlMatches.forEach(match => {
              const url = match.replace(/url\(['"]?([^'")\s]+)['"]?\)/, '$1');
              if (url && !url.startsWith("data:")) {
                images.add(url);
              }
            });
          }
        }
      });

      const totalResources = cssLinks.size + jsScripts.size + images.size + fontLinks.size + icons.size;
      let downloadedCount = 0;

      // Calculate progress ranges
      const baseProgress = method === "playwright" ? 15 : 20;
      
      // Download fonts
      if (fontLinks.size > 0) {
        onProgress?.(baseProgress, "Downloading fonts");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Downloading fonts",
          progressPercentage: baseProgress,
        });
      }

      for (const href of Array.from(fontLinks)) {
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        try {
          const absoluteUrl = new URL(href, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(href, url);

          await fileManager.saveFile(projectId, `fonts/${localPath}`, content);
          await storage.createFile({
            projectId,
            path: `fonts/${localPath}`,
            content: "",
            type: "font",
            size: content.length,
          });

          $(`link[href="${href}"]`).attr("href", `./fonts/${localPath}`);

          downloadedCount++;
          const progressPercentage = Math.floor(baseProgress + (downloadedCount / totalResources) * 5);
          onProgress?.(progressPercentage, "Downloading fonts", localPath);
          await storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Downloading fonts",
            progressPercentage,
            filesProcessed: downloadedCount,
          });
        } catch (error) {
          console.error(`Failed to download font: ${href}`, error);
        }
      }

      // Download icons
      const iconProgress = baseProgress + 5;
      if (icons.size > 0) {
        onProgress?.(iconProgress, "Downloading icons");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Downloading icons",
          progressPercentage: iconProgress,
        });
      }

      for (const href of Array.from(icons)) {
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        try {
          const absoluteUrl = new URL(href, url).href;
          const content = await this.fetchResource(absoluteUrl);
          const localPath = fileManager.getLocalPath(href, url);

          await fileManager.saveFile(projectId, `icons/${localPath}`, content);
          await storage.createFile({
            projectId,
            path: `icons/${localPath}`,
            content: "",
            type: "image",
            size: content.length,
          });

          $(`link[href="${href}"]`).attr("href", `./icons/${localPath}`);

          downloadedCount++;
          const progressPercentage = Math.floor(baseProgress + 5 + (downloadedCount / totalResources) * 5);
          onProgress?.(progressPercentage, "Downloading icons", localPath);
          await storage.updateProjectStatus(projectId, "processing", {
            currentStep: "Downloading icons",
            progressPercentage,
            filesProcessed: downloadedCount,
          });
        } catch (error) {
          console.error(`Failed to download icon: ${href}`, error);
        }
      }
      
      // Download CSS files
      const cssProgress = baseProgress + 10;
      if (cssLinks.size > 0) {
        onProgress?.(cssProgress, "Downloading CSS files");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Downloading CSS files",
          progressPercentage: cssProgress,
        });
      }
      
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
          const progressPercentage = Math.floor(cssProgress + (downloadedCount / totalResources) * 15);
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
      const jsProgress = cssProgress + 15;
      if (jsScripts.size > 0) {
        onProgress?.(jsProgress, "Downloading JavaScript files");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Downloading JavaScript files",
          progressPercentage: jsProgress,
        });
      }

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
          const progressPercentage = Math.floor(jsProgress + (downloadedCount / totalResources) * 20);
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
      const imgProgress = jsProgress + 20;
      if (images.size > 0) {
        onProgress?.(imgProgress, "Downloading images");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Downloading images",
          progressPercentage: imgProgress,
        });
      }

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
          const progressPercentage = Math.floor(imgProgress + (downloadedCount / totalResources) * 25);
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

      // Crawl sub-pages if depth > 0
      if (crawlDepth > 0) {
        onProgress?.(88, "Discovering sub-pages");
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: "Discovering sub-pages",
          progressPercentage: 88,
        });

        const subLinks = await this.extractLinks(html, url);
        const limitedLinks = subLinks.slice(0, Math.min(10, subLinks.length)); // Limit to 10 sub-pages

        onProgress?.(90, `Found ${limitedLinks.length} sub-pages to clone`);
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: `Found ${limitedLinks.length} sub-pages to clone`,
          progressPercentage: 90,
        });

        for (let i = 0; i < limitedLinks.length; i++) {
          const subLink = limitedLinks[i];
          const project = await storage.getProject(projectId);
          if (project?.isPaused === 1) {
            await storage.updateProjectStatus(projectId, "paused");
            return;
          }

          try {
            const subProgress = 90 + Math.floor((i / limitedLinks.length) * 8);
            onProgress?.(subProgress, `Cloning sub-page ${i + 1}/${limitedLinks.length}`);
            await this.cloneSinglePage(projectId, subLink, method, onProgress);
            
            await storage.updateProjectStatus(projectId, "processing", {
              currentStep: `Cloning sub-page ${i + 1}/${limitedLinks.length}`,
              progressPercentage: subProgress,
              pagesProcessed: i + 1,
            });
          } catch (error) {
            console.error(`Failed to clone sub-page: ${subLink}`, error);
          }
        }
      }

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

  private async cloneSinglePage(
    projectId: string,
    url: string,
    method: "static" | "playwright",
    onProgress?: CloneProgressCallback
  ): Promise<void> {
    try {
      let html: string;

      if (method === "static") {
        const response = await fetch(url);
        html = await response.text();
      } else {
        const result = await playwrightService.renderPage(url);
        html = result.html;
      }

      const $ = cheerio.load(html);
      const urlObj = new URL(url);
      const pagePath = urlObj.pathname === '/' ? 'index' : urlObj.pathname.replace(/^\//, '').replace(/\//g, '_');
      
      // Save as separate HTML file
      const htmlFileName = `${pagePath}.html`;
      await fileManager.saveFile(projectId, htmlFileName, html);
      await storage.createFile({
        projectId,
        path: htmlFileName,
        content: html,
        type: "html",
        size: html.length,
      });
    } catch (error) {
      console.error(`Failed to clone page: ${url}`, error);
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

  async estimateClone(url: string, method: "static" | "playwright" = "static", crawlDepth: number = 0): Promise<{
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
      let estimatedSize =
        htmlSize +
        cssLinks.size * 50 * 1024 +
        jsScripts.size * 100 * 1024 +
        images.size * 200 * 1024;

      // Estimate time (in seconds)
      // Static: ~0.3s per resource, Playwright: ~0.8s per resource + 3-8s overhead
      let estimatedTime = totalResources * (method === "static" ? 0.3 : 0.8);
      if (method === "playwright") {
        estimatedTime += 3; // Browser launch overhead (reduced from 5s)
      }

      // If crawling sub-pages, multiply estimates
      if (crawlDepth > 0) {
        const estimatedSubPages = Math.min(10, totalResources / 5); // Rough estimate
        estimatedSize *= (1 + estimatedSubPages * 0.5); // Each sub-page ~50% of main page size
        estimatedTime += estimatedSubPages * (method === "static" ? 2 : 4); // Add time per sub-page
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
