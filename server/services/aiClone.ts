import OpenAI from "openai";
import { playwrightService } from "./playwright";
import { fileManager } from "./fileManager";
import { storage } from "../storage";
import { deviceProfiles, type DeviceProfile } from "@shared/schema";

// Lazy initialization of OpenAI client to avoid startup errors when API key is missing
let openaiInstance: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment variables.");
    }
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

interface AICloneCallback {
  (progress: number, step: string, generatedCode?: string, deviceProfile?: string): void;
}

export class AICloneService {
  async cloneWithAI(
    projectId: string,
    url: string,
    selectedDeviceProfiles: string[],
    onProgress?: AICloneCallback
  ): Promise<void> {
    try {
      onProgress?.(5, "Initializing AI cloning...");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Initializing AI cloning...",
        progressPercentage: 5,
      });

      await playwrightService.initialize();

      const deviceProfileObjects = deviceProfiles.filter((dp) =>
        selectedDeviceProfiles.includes(dp.id)
      );

      if (deviceProfileObjects.length === 0) {
        deviceProfileObjects.push(deviceProfiles[0]);
      }

      const totalDevices = deviceProfileObjects.length;
      let completedDevices = 0;

      for (const deviceProfile of deviceProfileObjects) {
        const project = await storage.getProject(projectId);
        if (project?.isPaused === 1) {
          await storage.updateProjectStatus(projectId, "paused");
          return;
        }

        const deviceProgress = Math.floor(
          10 + (completedDevices / totalDevices) * 80
        );
        onProgress?.(
          deviceProgress,
          `Capturing ${deviceProfile.name} layout...`,
          undefined,
          deviceProfile.id
        );
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: `Capturing ${deviceProfile.name} layout...`,
          progressPercentage: deviceProgress,
        });

        const snapshot = await this.captureDeviceSnapshot(url, deviceProfile);

        onProgress?.(
          deviceProgress + 5,
          `Analyzing ${deviceProfile.name} DOM structure...`,
          undefined,
          deviceProfile.id
        );
        await storage.updateProjectStatus(projectId, "processing", {
          currentStep: `Analyzing ${deviceProfile.name} DOM structure...`,
          progressPercentage: deviceProgress + 5,
        });

        const generatedCode = await this.generateResponsiveCode(
          snapshot,
          deviceProfile,
          url,
          (codeChunk) => {
            onProgress?.(
              deviceProgress + 10,
              `Generating code for ${deviceProfile.name}...`,
              codeChunk,
              deviceProfile.id
            );
          }
        );

        await this.saveGeneratedFiles(
          projectId,
          generatedCode,
          deviceProfile.id
        );

        completedDevices++;
      }

      onProgress?.(95, "Finalizing AI clone...");
      await storage.updateProjectStatus(projectId, "processing", {
        currentStep: "Finalizing AI clone...",
        progressPercentage: 95,
      });

      const allFiles = await storage.getFilesByProject(projectId);
      const totalSize = allFiles.reduce((sum, file) => sum + (file.size || 0), 0);

      await storage.updateProjectStatus(projectId, "complete", {
        totalFiles: allFiles.length,
        totalSize,
        currentStep: "AI clone complete",
        progressPercentage: 100,
      });

      onProgress?.(100, "AI clone complete");
    } catch (error) {
      await storage.updateProjectStatus(projectId, "error", {
        errorMessage: error instanceof Error ? error.message : "AI cloning failed",
      });
      throw error;
    }
  }

  private async captureDeviceSnapshot(
    url: string,
    deviceProfile: DeviceProfile
  ): Promise<{
    html: string;
    computedStyles: any;
    screenshot: string;
    viewport: { width: number; height: number };
  }> {
    const result = await playwrightService.renderPage(url, undefined, {
      viewport: deviceProfile.viewport,
      userAgent: deviceProfile.userAgent,
    });

    const page = await playwrightService.getPage();
    if (!page) {
      throw new Error("Browser page not available");
    }

    const computedStyles = await page.evaluate(() => {
      const elements = document.querySelectorAll("*");
      const styles: any = {};
      elements.forEach((el, idx) => {
        const computed = window.getComputedStyle(el);
        styles[idx] = {
          tag: el.tagName.toLowerCase(),
          className: el.className,
          id: el.id,
          display: computed.display,
          position: computed.position,
          width: computed.width,
          height: computed.height,
          margin: computed.margin,
          padding: computed.padding,
          fontSize: computed.fontSize,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        };
      });
      return styles;
    });

    const screenshot = await page.screenshot({
      fullPage: true,
    });

    return {
      html: result.html,
      computedStyles,
      screenshot: screenshot.toString("base64"),
      viewport: deviceProfile.viewport,
    };
  }

  private async generateResponsiveCode(
    snapshot: {
      html: string;
      computedStyles: any;
      screenshot: string;
      viewport: { width: number; height: number };
    },
    deviceProfile: DeviceProfile,
    originalUrl: string,
    onCodeChunk?: (code: string) => void
  ): Promise<{ html: string; css: string; js: string }> {
    const prompt = `You are an expert web developer tasked with creating a pixel-perfect 1:1 recreation of a website for ${deviceProfile.name} (${snapshot.viewport.width}x${snapshot.viewport.height}px).

Original URL: ${originalUrl}

Your task:
1. Analyze the provided HTML structure and computed styles
2. Generate clean, responsive HTML/CSS/JS that exactly replicates the visual appearance
3. Ensure all interactive elements (buttons, links) maintain their original functionality
4. Create responsive code optimized for ${snapshot.viewport.width}px width
5. Preserve all hyperlinks and button actions from the original site
6. Match fonts, colors, spacing, and layout exactly

HTML Structure (simplified):
${snapshot.html.substring(0, 5000)}...

Computed Styles Sample:
${JSON.stringify(Object.values(snapshot.computedStyles).slice(0, 50), null, 2)}

Requirements:
- Output valid HTML5, CSS3, and vanilla JavaScript
- Use modern CSS (flexbox, grid) for layout
- Ensure no horizontal scrolling on ${snapshot.viewport.width}px viewport
- All content should be vertically scrollable if needed
- Preserve original color schemes and typography
- Include all necessary media queries

Respond with a JSON object containing:
{
  "html": "complete HTML code",
  "css": "complete CSS code", 
  "js": "complete JavaScript code (if needed)"
}`;

    const openai = getOpenAIClient();
    const stream = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You are an expert web developer who creates pixel-perfect website recreations. Always respond with valid JSON containing html, css, and js fields.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${snapshot.screenshot}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
      if (onCodeChunk && content) {
        onCodeChunk(content);
      }
    }

    try {
      const result = JSON.parse(fullResponse);
      return {
        html: result.html || "",
        css: result.css || "",
        js: result.js || "",
      };
    } catch (error) {
      throw new Error("Failed to parse AI response: " + error);
    }
  }

  private async saveGeneratedFiles(
    projectId: string,
    code: { html: string; css: string; js: string },
    deviceProfileId: string
  ): Promise<void> {
    const prefix = deviceProfileId === "desktop" ? "" : `${deviceProfileId}_`;

    if (code.html) {
      const htmlPath = `${prefix}index.html`;
      await fileManager.saveFile(projectId, htmlPath, code.html);
      await storage.createFile({
        projectId,
        path: htmlPath,
        content: code.html,
        type: "html",
        size: code.html.length,
      });
    }

    if (code.css) {
      const cssPath = `${prefix}styles.css`;
      await fileManager.saveFile(projectId, cssPath, code.css);
      await storage.createFile({
        projectId,
        path: cssPath,
        content: code.css,
        type: "css",
        size: code.css.length,
      });
    }

    if (code.js) {
      const jsPath = `${prefix}script.js`;
      await fileManager.saveFile(projectId, jsPath, code.js);
      await storage.createFile({
        projectId,
        path: jsPath,
        content: code.js,
        type: "js",
        size: code.js.length,
      });
    }
  }

  async adjustClonedSite(
    projectId: string,
    userPrompt: string,
    deviceProfileId: string
  ): Promise<{ html: string; css: string; js: string }> {
    const files = await storage.getFilesByProject(projectId);
    const prefix = deviceProfileId === "desktop" ? "" : `${deviceProfileId}_`;

    const htmlFile = files.find((f) => f.path === `${prefix}index.html`);
    const cssFile = files.find((f) => f.path === `${prefix}styles.css`);
    const jsFile = files.find((f) => f.path === `${prefix}script.js`);

    const currentCode = {
      html: htmlFile?.content || "",
      css: cssFile?.content || "",
      js: jsFile?.content || "",
    };

    const adjustmentPrompt = `You are adjusting a previously cloned website. The user wants the following changes while maintaining the exact same visual appearance:

User Request: ${userPrompt}

Current Code:
HTML:
${currentCode.html.substring(0, 3000)}...

CSS:
${currentCode.css.substring(0, 2000)}...

JS:
${currentCode.js.substring(0, 1000)}...

Make the requested changes while ensuring:
1. The visual appearance remains identical (1:1)
2. Layout, spacing, colors, and fonts stay the same
3. Only modify what the user specifically requested
4. Maintain all responsive behavior

Respond with a JSON object containing the updated code:
{
  "html": "updated HTML code",
  "css": "updated CSS code",
  "js": "updated JavaScript code"
}`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "You are an expert web developer who makes precise adjustments to code while preserving visual appearance. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: adjustmentPrompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    if (result.html && htmlFile) {
      await storage.updateFileContent(htmlFile.id, result.html);
      await fileManager.saveFile(projectId, htmlFile.path, result.html);
    }

    if (result.css && cssFile) {
      await storage.updateFileContent(cssFile.id, result.css);
      await fileManager.saveFile(projectId, cssFile.path, result.css);
    }

    if (result.js && jsFile) {
      await storage.updateFileContent(jsFile.id, result.js);
      await fileManager.saveFile(projectId, jsFile.path, result.js);
    }

    return {
      html: result.html || currentCode.html,
      css: result.css || currentCode.css,
      js: result.js || currentCode.js,
    };
  }
}

export const aiCloneService = new AICloneService();
