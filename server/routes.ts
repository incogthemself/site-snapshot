import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { cloneService } from "./services/clone";
import { fileManager } from "./services/fileManager";
import { insertProjectSchema } from "@shared/schema";
import { WebSocketServer } from "ws";
import archiver from "archiver";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket for progress updates
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });

  // Broadcast progress to all connected clients
  function broadcastProgress(projectId: string, progress: any) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ projectId, ...progress }));
      }
    });
  }

  // Get all projects
  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch projects",
      });
    }
  });

  // Estimate clone before starting
  app.post("/api/estimate", async (req, res) => {
    try {
      const { url, cloneMethod } = req.body;
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      const estimate = await cloneService.estimateClone(
        url,
        cloneMethod || "static"
      );

      res.json(estimate);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to estimate",
      });
    }
  });

  // Create new project and start cloning
  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);

      // Get estimation first
      const cloneMethod = (data.cloneMethod || "playwright") as "static" | "playwright";
      const estimate = await cloneService.estimateClone(
        data.url,
        cloneMethod
      );

      const project = await storage.createProject({
        ...data,
        estimatedTime: estimate.estimatedTime,
        estimatedSize: estimate.estimatedSize,
      });

      // Start cloning in background
      cloneService
        .cloneWebsite(
          project.id,
          data.url,
          (progress, step, currentFile) => {
            broadcastProgress(project.id, {
              progress,
              step,
              currentFile,
            });
          },
          cloneMethod
        )
        .catch((error) => {
          console.error("Clone error:", error);
        });

      res.json(project);
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to create project",
      });
    }
  });

  // Get project by ID
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch project",
      });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await fileManager.deleteProject(req.params.id);
      await storage.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to delete project",
      });
    }
  });

  // Get files for a project
  app.get("/api/projects/:id/files", async (req, res) => {
    try {
      const files = await storage.getFilesByProject(req.params.id);
      res.json(files);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch files",
      });
    }
  });

  // Get file content
  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      res.json(file);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch file",
      });
    }
  });

  // Update file content
  app.patch("/api/files/:id", async (req, res) => {
    try {
      const { content } = req.body;
      await storage.updateFileContent(req.params.id, content);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to update file",
      });
    }
  });

  // Download project as ZIP
  app.get("/api/projects/:id/download", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const projectDir = path.join("./cloned_sites", req.params.id);

      res.attachment(`${project.name}.zip`);

      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      archive.on("error", (err) => {
        throw err;
      });

      archive.pipe(res);
      archive.directory(projectDir, false);
      await archive.finalize();
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to download project",
      });
    }
  });

  // Preview project (serve cloned site)
  app.use("/api/projects/:id/preview", (req, res) => {
    const projectDir = path.join("./cloned_sites", req.params.id);
    const indexPath = path.join(projectDir, "index.html");
    
    // Serve static files from the project directory
    const express = require("express");
    express.static(projectDir)(req, res, () => {
      res.sendFile(indexPath, (err: Error) => {
        if (err) {
          res.status(404).json({ message: "Preview not available" });
        }
      });
    });
  });

  // Pause project cloning
  app.post("/api/projects/:id/pause", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await storage.updateProjectStatus(req.params.id, "paused", {
        isPaused: 1,
      });

      const updatedProject = await storage.getProject(req.params.id);
      res.json(updatedProject);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to pause project",
      });
    }
  });

  // Resume project cloning
  app.post("/api/projects/:id/resume", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await storage.updateProjectStatus(req.params.id, "processing", {
        isPaused: 0,
      });

      // Resume cloning from where it left off
      cloneService
        .cloneWebsite(
          project.id,
          project.url,
          (progress, step, currentFile) => {
            broadcastProgress(project.id, {
              progress,
              step,
              currentFile,
            });
          },
          project.cloneMethod as "static" | "playwright" || "playwright"
        )
        .catch((error) => {
          console.error("Clone error:", error);
        });

      const updatedProject = await storage.getProject(req.params.id);
      res.json(updatedProject);
    } catch (error) {
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to resume project",
      });
    }
  });

  return httpServer;
}
