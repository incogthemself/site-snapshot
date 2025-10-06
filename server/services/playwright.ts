import { chromium, type Browser, type Page } from "playwright";

export class PlaywrightService {
  private browser: Browser | null = null;
  private currentPage: Page | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async renderPage(
    url: string, 
    onProgress?: (progress: number) => void,
    options?: {
      viewport?: { width: number; height: number };
      userAgent?: string;
    }
  ): Promise<{ html: string; resources: string[] }> {
    await this.initialize();
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage({
      viewport: options?.viewport,
      userAgent: options?.userAgent,
    });
    this.currentPage = page;
    
    const resources: string[] = [];
    let requestCount = 0;
    let responseCount = 0;

    // Track all network requests
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      if (["stylesheet", "script", "image", "font"].includes(resourceType)) {
        resources.push(request.url());
        requestCount++;
      }
    });

    // Track responses to calculate progress
    page.on("response", () => {
      responseCount++;
      if (requestCount > 0 && onProgress) {
        const progress = Math.min(responseCount / Math.max(requestCount, 1), 0.95);
        onProgress(progress);
      }
    });

    try {
      onProgress?.(0.1);
      
      // Navigate and wait for network idle
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      onProgress?.(1);

      // Get the fully rendered HTML
      const html = await page.content();

      return { html, resources };
    } finally {
      if (page !== this.currentPage) {
        await page.close();
      }
    }
  }

  async getPage(): Promise<Page | null> {
    return this.currentPage;
  }

  async closePage(): Promise<void> {
    if (this.currentPage) {
      await this.currentPage.close();
      this.currentPage = null;
    }
  }

  async close(): Promise<void> {
    await this.closePage();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const playwrightService = new PlaywrightService();
