# Website Cloner Application

## Overview

This is a full-stack web application that clones websites with three powerful modes: static HTML capture, dynamic Playwright-based rendering, and AI-powered code generation. The AI mode uses GPT-5 to create pixel-perfect responsive clones for multiple device profiles with real-time code streaming.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Enhancements (October 2025)

### Latest Updates (October 7, 2025)
- **Mobile-First Responsive Design**: Enhanced viewport settings with proper scaling (max-scale 5.0) and mobile-specific meta tags for better user experience
- **Streamlined UI**: Removed dropdown selector, all cloning modes now accessible through unified settings dialog
- **Enhanced Cloning Accuracy**: 
  - Captures fonts from link tags for typography preservation
  - Downloads favicons and app icons for complete branding
  - Extracts background images from inline styles for pixel-perfect layouts
  - Improved resource discovery for 1:1 website replication
- **Project Management**: Inline project renaming with edit/confirm/cancel controls, hover-to-show edit button
- **Settings Dialog Enhancement**: Unified interface for all three cloning modes (Static, Playwright, AI) with device profile selection for AI mode

### AI-Powered Cloning Mode
- **AI Mode (Best)**: Uses OpenAI GPT-5 to generate truly 1:1 responsive code
- Multi-device profile support:
  - Samsung S20FE (360x800px)
  - Samsung S23FE (360x780px)
  - iPhone (390x844px)
  - iPad (820x1180px)
  - Desktop (1920x1080px)
- Real-time code streaming with live display
- AI adjustment prompts to modify clones while maintaining visual fidelity
- Screenshot-based analysis for pixel-perfect recreation

### Clone Method Selection
- **Static Mirror Mode**: Fast cloning using Cheerio without headless browser - 2-3x faster, now captures fonts, icons, and background images
- **Dynamic Clone Mode (Playwright)**: Headless browser rendering for JavaScript-heavy sites with enhanced resource discovery
- **AI Mode (Best)**: GPT-5 powered responsive code generation with device profiles for pixel-perfect recreation

### Real-Time Code Display
- Live code generation shown in progress modal
- Syntax-highlighted code display
- Device profile indicator
- Streaming updates with "Live" indicator
- Auto-scrolling code viewer

### Estimation System
- Pre-clone estimation shows:
  - Estimated time to complete (in seconds/minutes)
  - Estimated ZIP file size (in KB/MB)
  - Number of resources to download
- Estimation runs before starting the clone

### Concurrent Cloning
- Multiple sites can be cloned simultaneously
- Each clone runs independently in the background
- Progress tracked separately for each project
- Toast notifications for background clones that complete
- Active clones tracked with per-project progress maps

### Site Preview
- 1:1 preview of cloned websites after download
- Preview opens in a modal dialog with iframe
- Refresh and open-in-new-tab options available
- Static file serving from cloned site directory

### User Interface
- Settings dialog to choose between static/dynamic/AI cloning modes
- Estimate dialog shows predictions before cloning starts
- Preview button appears when a project is complete
- Real-time progress tracking with step-by-step updates
- Status bar shows actual file size and count

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
- Progress state includes generatedCode and deviceProfile for AI streaming

**Key Features**
- File explorer with tree structure navigation
- Live code editor with syntax highlighting
- Live preview iframe showing rendered HTML
- Responsive viewport modes (mobile, tablet, desktop)
- Real-time progress modal during website cloning with pause/resume controls
- AI code generation display with streaming support
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

2. **AI Clone Service** (`server/services/aiClone.ts`)
   - Uses OpenAI GPT-5 for intelligent code generation
   - Captures screenshots of target website for visual analysis
   - Generates device-specific responsive code
   - Streams code generation progress via WebSocket
   - Supports post-clone AI adjustments
   - Creates pixel-perfect recreations using visual analysis

3. **Playwright Service** (`server/services/playwright.ts`)
   - Manages headless Chromium browser instance
   - Renders pages with full JavaScript execution
   - Tracks network requests to identify all resources
   - Waits for network idle before capturing HTML

4. **File Manager Service** (`server/services/fileManager.ts`)
   - Manages project directory structure on filesystem
   - Handles file I/O operations (save, read, list)
   - Generates local file paths from URLs
   - Provides archiving functionality with archiver library

**API Architecture**
- RESTful endpoints under `/api` prefix
- WebSocket endpoint at `/ws` for progress streaming
- AI cloning endpoint: `POST /api/clone/ai`
- AI adjustment endpoint: `POST /api/projects/:id/adjust`
- Project name update: `PATCH /api/projects/:id/name`
- Request/response logging middleware
- JSON body parsing with raw body preservation
- Pause/Resume API endpoints: `POST /api/projects/:id/pause` and `POST /api/projects/:id/resume`

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
  - displayName (text) - editable project display name
  - cloneMethod (static/playwright/ai)
  - deviceProfiles (text array) - for AI mode
  - generatedCode (text) - AI-generated code
  - compressedSize (integer) - ZIP file size
  - status (pending/processing/complete/error/paused)
  - totalFiles (integer)
  - totalSize (integer, bytes)
  - currentStep (text, nullable)
  - progressPercentage (integer)
  - filesProcessed (integer)
  - isPaused (integer)
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

**OpenAI**
- GPT-5 model for AI-powered code generation
- Visual analysis of website screenshots
- Streaming API for real-time code generation
- Configured via OPENAI_API_KEY environment variable

**Playwright**
- Headless browser automation for rendering JavaScript-heavy websites
- Uses Chromium browser with sandboxing disabled for compatibility
- Provides network request tracking and page content extraction
- Screenshot capture for AI mode

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
- OpenAI SDK: AI code generation

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
- `OPENAI_API_KEY`: OpenAI API key for AI cloning mode
- `DATABASE_URL`: PostgreSQL connection string (for future database use)
- `NODE_ENV`: Set to "development" or "production"
- `REPL_ID`: Replit-specific identifier (optional, for development plugins)

## Mobile Responsiveness

The application is fully responsive with specific optimizations for mobile devices:

### Target Devices
- Samsung S20FE: 360x800px (primary mobile target)
- Samsung S23FE: 360x780px
- iPhone: 390x844px
- iPad: 820x1180px

### Mobile Optimizations
- No horizontal scrolling on any device
- Touch-friendly minimum tap targets (44px)
- Responsive breakpoints at 640px, 768px, 1024px
- Optimized layouts for portrait and landscape orientations
- Mobile-first CSS approach

### CSS Breakpoints
- Mobile: 360px-639px
- Tablet: 640px-1023px
- Desktop: 1024px+

## Project Structure

```
client/               # Frontend React application
  src/
    components/       # Reusable UI components
      ProgressModal.tsx  # Progress display with AI code streaming
    pages/            # Page components
      home.tsx        # Main application page
    lib/              # Utility libraries
    index.css         # Global styles and theme

server/               # Backend Express application
  services/
    clone.ts          # Static/Playwright cloning service
    aiClone.ts        # AI-powered cloning service
    playwright.ts     # Browser automation service
    fileManager.ts    # File system operations
  routes.ts           # API endpoints
  storage.ts          # Data storage interface
  index.ts            # Server entry point

shared/               # Shared types and schemas
  schema.ts           # Database schema and types

cloned_sites/         # Cloned website storage directory
```

## Future Enhancements

### Pending Features
- Project name editing in UI
- Enhanced static/playwright cloning with inline styles and @import support
- Database migration from in-memory to PostgreSQL
- User authentication and authorization
- Project sharing and collaboration
- Version control for cloned sites
- Advanced AI adjustment prompts UI
- Export to various frameworks (React, Vue, etc.)
