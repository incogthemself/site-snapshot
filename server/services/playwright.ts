import { chromium, type Browser, type Page } from "playwright";

export class PlaywrightService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async renderPage(url: string): Promise<{ html: string; resources: string[] }> {
    await this.initialize();
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage();
    const resources: string[] = [];

    // Track all network requests
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      if (["stylesheet", "script", "image", "font"].includes(resourceType)) {
        resources.push(request.url());
      }
    });

    try {
      // Navigate and wait for network idle
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      // Get the fully rendered HTML
      const html = await page.content();

      return { html, resources };
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const playwrightService = new PlaywrightService();
