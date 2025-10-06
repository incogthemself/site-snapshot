import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default("pending"), // pending, processing, complete, error, paused
  cloneMethod: text("clone_method").notNull().default("static"), // static, playwright, ai
  crawlDepth: integer("crawl_depth").default(0), // 0 = single page, 1+ = crawl sub-pages
  deviceProfiles: text("device_profiles").array().default(sql`ARRAY[]::text[]`), // for AI mode: mobile, tablet, desktop
  totalFiles: integer("total_files").default(0),
  totalSize: integer("total_size").default(0), // in bytes
  compressedSize: integer("compressed_size").default(0), // ZIP file size in bytes
  estimatedTime: integer("estimated_time").default(0), // in seconds
  estimatedSize: integer("estimated_size").default(0), // in bytes
  currentStep: text("current_step"),
  progressPercentage: integer("progress_percentage").default(0),
  filesProcessed: integer("files_processed").default(0),
  pagesProcessed: integer("pages_processed").default(0),
  generatedCode: text("generated_code"),
  isPaused: integer("is_paused").default(0), // 0 = false, 1 = true
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content"),
  type: text("type").notNull(), // html, css, js, image, font, other
  size: integer("size").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  url: true,
  name: true,
  displayName: true,
  cloneMethod: true,
  crawlDepth: true,
  deviceProfiles: true,
});

export const updateProjectNameSchema = z.object({
  displayName: z.string().min(1, "Name cannot be empty"),
});

export const insertFileSchema = createInsertSchema(files).pick({
  projectId: true,
  path: true,
  content: true,
  type: true,
  size: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;

export interface CloneProgress {
  projectId: string;
  step: string;
  progress: number;
  currentFile?: string;
  message: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
  fileType?: string;
}

export interface DeviceProfile {
  id: string;
  name: string;
  viewport: { width: number; height: number };
  userAgent?: string;
}

export interface AICloneProgress extends CloneProgress {
  generatedCode?: string;
  deviceProfile?: string;
}

export const deviceProfiles: DeviceProfile[] = [
  {
    id: "samsung-s20fe",
    name: "Samsung S20 FE",
    viewport: { width: 360, height: 800 },
    userAgent: "Mozilla/5.0 (Linux; Android 11; SM-G780F) AppleWebKit/537.36",
  },
  {
    id: "samsung-s23fe",
    name: "Samsung S23 FE",
    viewport: { width: 360, height: 780 },
    userAgent: "Mozilla/5.0 (Linux; Android 13; SM-S711B) AppleWebKit/537.36",
  },
  {
    id: "iphone-14",
    name: "iPhone 14",
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  },
  {
    id: "ipad",
    name: "iPad",
    viewport: { width: 768, height: 1024 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  },
  {
    id: "desktop",
    name: "Desktop (1920x1080)",
    viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  },
];
