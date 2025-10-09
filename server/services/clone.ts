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
      let failedCount = 0;
      const errors: string[] = [];

      // Clear CSS visited set and path mapping for this clone session
      this.cssVisited.clear();
      this.cssUrlToLocalPath.clear();

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
          failedCount++;
          const errorMsg = `Font: ${href} - ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
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
          failedCount++;
          const errorMsg = `Icon: ${href} - ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
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

          const failedCountObj = { count: 0 };
          const processedCSS = await this.processCSS(
            projectId,
            content.toString(),
            absoluteUrl,
            localPath,
            url,
            failedCountObj,
            errors
          );
          failedCount += failedCountObj.count;

          // Only save if processedCSS is not empty (not already saved by earlier processing)
          if (processedCSS) {
            await fileManager.saveFile(projectId, `css/${localPath}`, Buffer.from(processedCSS));
            await storage.createFile({
              projectId,
              path: `css/${localPath}`,
              content: processedCSS,
              type: "css",
              size: processedCSS.length,
            });
          }

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
          failedCount++;
          const errorMsg = `CSS: ${href} - ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
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
          failedCount++;
          const errorMsg = `JavaScript: ${src} - ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
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
          failedCount++;
          const errorMsg = `Image: ${src} - ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`Failed to download image: ${src}`, error);
        }
      }

      // Rewrite inline style background-image URLs
      onProgress?.(88, "Rewriting inline styles");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Rewriting inline styles",
        progressPercentage: 88,
      });

      $("[style*='background']").each((_, el) => {
        const style = $(el).attr("style");
        if (style) {
          let updatedStyle = style;
          const urlMatches = style.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
          if (urlMatches) {
            urlMatches.forEach(match => {
              const originalUrl = match.replace(/url\(['"]?([^'")\s]+)['"]?\)/, '$1');
              if (originalUrl && !originalUrl.startsWith("data:")) {
                try {
                  const absoluteUrl = new URL(originalUrl, url).href;
                  const localPath = fileManager.getLocalPath(originalUrl, url);
                  const newUrl = `./images/${localPath}`;
                  updatedStyle = updatedStyle.replace(
                    new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                    newUrl
                  );
                } catch (error) {
                  console.error(`Failed to rewrite inline style URL: ${originalUrl}`, error);
                }
              }
            });
          }
          $(el).attr("style", updatedStyle);
        }
      });

      // Rewrite all absolute URLs to relative
      onProgress?.(90, "Finalizing HTML");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Finalizing HTML",
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

      const successRate = totalResources > 0 
        ? Math.round((downloadedCount / totalResources) * 100) 
        : 100;
      
      let completionMessage = `Clone complete - ${downloadedCount}/${totalResources} resources downloaded (${successRate}%)`;
      if (failedCount > 0) {
        completionMessage += ` - ${failedCount} resources failed but clone completed successfully`;
        console.warn(`Clone completed with ${failedCount} errors:`, errors.slice(0, 10));
      }

      await storage.updateProjectStatus(projectId, "complete", {
        totalFiles: allFiles.length,
        totalSize,
        currentStep: completionMessage,
        progressPercentage: 100,
      });

      onProgress?.(100, completionMessage);
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

  private parseCSSForResources(cssContent: string, cssUrl: string): {
    imports: string[];
    urls: string[];
  } {
    const imports: string[] = [];
    const urls: string[] = [];

    const importRegex = /@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?[^;]*;/g;
    let match;
    while ((match = importRegex.exec(cssContent)) !== null) {
      imports.push(match[1]);
    }

    const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
    while ((match = urlRegex.exec(cssContent)) !== null) {
      const urlPath = match[1];
      // Download all URLs except data URIs (including absolute http/https URLs)
      if (!urlPath.startsWith('data:')) {
        urls.push(urlPath);
      }
    }

    return { imports, urls };
  }

  private cssVisited = new Set<string>();
  private cssUrlToLocalPath = new Map<string, string>();

  private async processCSS(
    projectId: string,
    cssContent: string,
    cssUrl: string,
    cssLocalPath: string,
    baseUrl: string,
    failedCount?: { count: number },
    errors?: string[]
  ): Promise<string> {
    // If already processed, return early (file already saved)
    if (this.cssVisited.has(cssUrl)) {
      return "";  // Return empty - caller should not save
    }
    
    // Mark as being processed and store canonical path
    this.cssVisited.add(cssUrl);
    this.cssUrlToLocalPath.set(cssUrl, cssLocalPath);

    const { imports, urls } = this.parseCSSForResources(cssContent, cssUrl);
    let processedCSS = cssContent;

    // Process @import statements
    for (const importPath of imports) {
      try {
        const absoluteUrl = new URL(importPath, cssUrl).href;
        
        // Get or create canonical local path for this CSS URL
        let importLocalPath: string;
        if (this.cssUrlToLocalPath.has(absoluteUrl)) {
          // Already processed - reuse existing path
          importLocalPath = this.cssUrlToLocalPath.get(absoluteUrl)!;
        } else {
          // First time seeing this - create canonical path from the import URL itself
          importLocalPath = fileManager.getLocalPath(importPath, absoluteUrl);
          this.cssUrlToLocalPath.set(absoluteUrl, importLocalPath);
        }
        
        // If not yet visited, fetch and process it
        if (!this.cssVisited.has(absoluteUrl)) {
          const importContent = await this.fetchResource(absoluteUrl);
          
          // Recursively process the imported CSS first
          const recursivelyProcessed = await this.processCSS(
            projectId,
            importContent.toString(),
            absoluteUrl,
            importLocalPath,
            baseUrl,
            failedCount,
            errors
          );

          // Only save if recursivelyProcessed is not empty (not already saved)
          if (recursivelyProcessed) {
            const fullLocalPath = `css/${importLocalPath}`;
            await fileManager.saveFile(projectId, fullLocalPath, Buffer.from(recursivelyProcessed));
            await storage.createFile({
              projectId,
              path: fullLocalPath,
              content: recursivelyProcessed,
              type: "css",
              size: recursivelyProcessed.length,
            });
          }
        }

        // Calculate correct relative path from current CSS to imported CSS
        const cssDepth = cssLocalPath.split('/').length - 1;
        const relativePrefix = cssDepth > 0 ? '../'.repeat(cssDepth) : './';
        
        processedCSS = processedCSS.replace(
          new RegExp(`@import\\s+(?:url\\()?['"]?${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)?[^;]*;`, 'g'),
          `@import url('${relativePrefix}${importLocalPath}');`
        );
      } catch (error) {
        if (failedCount) failedCount.count++;
        const errorMsg = `CSS @import: ${importPath} - ${error instanceof Error ? error.message : 'Unknown error'}`;
        if (errors) errors.push(errorMsg);
        console.error(`Failed to download @import: ${importPath}`, error);
      }
    }

    // Process url() references
    for (const urlPath of urls) {
      try {
        const absoluteUrl = new URL(urlPath, cssUrl).href;
        const content = await this.fetchResource(absoluteUrl);
        const localPath = fileManager.getLocalPath(urlPath, cssUrl);
        
        const ext = localPath.split('.').pop()?.toLowerCase();
        let folder = 'css';
        let fileType: 'font' | 'image' | 'css' | 'other' = 'other';
        
        if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext || '')) {
          folder = 'fonts';
          fileType = 'font';
        } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext || '')) {
          folder = 'images';
          fileType = 'image';
        }

        const fullLocalPath = `${folder}/${localPath}`;
        await fileManager.saveFile(projectId, fullLocalPath, content);
        await storage.createFile({
          projectId,
          path: fullLocalPath,
          content: "",
          type: fileType,
          size: content.length,
        });

        // Calculate correct relative path from CSS file to resource
        const cssDepth = cssLocalPath.split('/').length - 1;
        const relativePrefix = cssDepth > 0 ? '../'.repeat(cssDepth + 1) : '../';
        const relativePath = `${relativePrefix}${folder}/${localPath}`;
        
        processedCSS = processedCSS.replace(
          new RegExp(`url\\(['"]?${urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\)`, 'g'),
          `url('${relativePath}')`
        );
      } catch (error) {
        if (failedCount) failedCount.count++;
        const errorMsg = `CSS resource: ${urlPath} - ${error instanceof Error ? error.message : 'Unknown error'}`;
        if (errors) errors.push(errorMsg);
        console.error(`Failed to download CSS resource: ${urlPath}`, error);
      }
    }

    return processedCSS;
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
