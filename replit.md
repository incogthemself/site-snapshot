# Website Cloner Application

## Overview

This is a full-stack web application that clones websites by downloading all their resources (HTML, CSS, JavaScript, images, fonts) and making them available for local viewing and editing. The application uses Playwright for headless browser rendering to capture fully-rendered pages including JavaScript-generated content, then packages everything into a downloadable archive.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Tooling**
- React with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and data fetching

**UI Components**
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for styling with custom dark theme
- Monaco Editor integration for in-browser code editing
- WebSocket client for real-time progress updates during cloning operations

**State Management**
- React Query handles all server state with configured options for refetching behavior
- Local component state using React hooks
- WebSocket for bidirectional communication to receive cloning progress updates

**Key Features**
- File explorer with tree structure navigation
- Live code editor with syntax highlighting
- Live preview iframe showing rendered HTML
- Responsive viewport modes (mobile, tablet, desktop)
- Real-time progress modal during website cloning with pause/resume controls
- Background downloading with progress persistence across page refreshes
- Success modal with download functionality
- Automatic progress recovery when returning to the application

### Backend Architecture

**Framework & Server**
- Express.js REST API server
- HTTP server with WebSocket support for real-time updates
- Vite middleware integration for development hot module replacement

**Core Services**

1. **Clone Service** (`server/services/clone.ts`)
   - Orchestrates the website cloning workflow
   - Uses Playwright to render pages with JavaScript execution
   - Parses HTML with Cheerio for resource extraction
   - Downloads CSS, JavaScript, images, and fonts
   - Rewrites URLs to work with local file paths
   - Reports progress through callback mechanism
   - Persists progress after each major step to storage
   - Supports pause/resume functionality
   - Checks for pause status before processing each file

2. **Playwright Service** (`server/services/playwright.ts`)
   - Manages headless Chromium browser instance
   - Renders pages with full JavaScript execution
   - Tracks network requests to identify all resources
   - Waits for network idle before capturing HTML

3. **File Manager Service** (`server/services/fileManager.ts`)
   - Manages project directory structure on filesystem
   - Handles file I/O operations (save, read, list)
   - Generates local file paths from URLs
   - Provides archiving functionality with archiver library

**API Architecture**
- RESTful endpoints under `/api` prefix
- WebSocket endpoint at `/ws` for progress streaming
- Request/response logging middleware
- JSON body parsing with raw body preservation
- Pause/Resume API endpoints: `POST /api/projects/:id/pause` and `POST /api/projects/:id/resume`
- Background cloning runs independently of client connection

**Data Storage**
- In-memory storage implementation (`MemStorage`) using Map data structures
- Interface-based storage abstraction (`IStorage`) for potential database migration
- Schema defined with Drizzle ORM for PostgreSQL (prepared for future use)
- Projects and files are the two main entities with one-to-many relationship

### Data Storage Solutions

**Current Implementation**
- In-memory Map-based storage for projects and files
- File system storage for actual cloned website content
- Projects stored at `./cloned_sites/{projectId}/`

**Future Database Integration**
- Drizzle ORM configured for PostgreSQL
- Schema defined in `shared/schema.ts` with projects and files tables
- Zod schemas for runtime validation
- Migration system ready via drizzle-kit

**Database Schema**
```
projects:
  - id (UUID primary key)
  - url (text)
  - name (text)
  - status (pending/processing/complete/error/paused)
  - totalFiles (integer)
  - totalSize (integer, bytes)
  - currentStep (text, nullable) - current cloning step
  - progressPercentage (integer) - 0-100 completion percentage
  - filesProcessed (integer) - number of files processed so far
  - isPaused (integer) - 0 = false, 1 = true
  - createdAt (timestamp)
  - completedAt (timestamp, nullable)
  - errorMessage (text, nullable)

files:
  - id (UUID primary key)
  - projectId (foreign key, cascade delete)
  - path (text)
  - content (text)
  - type (html/css/js/image/font/other)
  - size (integer, bytes)
  - createdAt (timestamp)
```

### Authentication and Authorization

Currently, the application has no authentication or authorization mechanisms. All API endpoints are publicly accessible. This is suitable for local development but would need to be addressed before deployment.

## External Dependencies

### Third-Party Services

**Playwright**
- Headless browser automation for rendering JavaScript-heavy websites
- Uses Chromium browser with sandboxing disabled for compatibility
- Provides network request tracking and page content extraction

### APIs and Libraries

**Frontend**
- Radix UI: Accessible component primitives
- Monaco Editor: Browser-based code editor (loaded from CDN)
- TanStack Query: Data fetching and caching
- Wouter: Minimal routing solution

**Backend**
- Express.js: Web application framework
- ws: WebSocket server implementation
- Cheerio: Fast HTML parsing and manipulation
- Archiver: ZIP file creation for downloads
- Playwright: Browser automation

### Database

**Neon Serverless PostgreSQL**
- Configured via `@neondatabase/serverless` driver
- Connection via `DATABASE_URL` environment variable
- Currently not actively used (in-memory storage active)
- Ready for migration when persistence is needed

### Development Tools

**Replit Integrations**
- `@replit/vite-plugin-runtime-error-modal`: Error overlay in development
- `@replit/vite-plugin-cartographer`: Source mapping
- `@replit/vite-plugin-dev-banner`: Development indicator

**Build Tools**
- TypeScript for type checking
- ESBuild for server bundling
- Vite for client bundling
- Tailwind CSS for utility-first styling

### Environment Configuration

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (for future database use)
- `NODE_ENV`: Set to "development" or "production"
- `REPL_ID`: Replit-specific identifier (optional, for development plugins)