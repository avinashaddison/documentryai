# AIVideo.sys - AI Video Generation Platform

## Overview

AIVideo.sys is a web-based AI video generation platform that converts user-entered titles into full cinematic videos. The system uses a modular pipeline that generates stories, audio, images, and performs automated video editing. The platform features a documentary/film maker interface with real-time progress tracking and a timeline-based video editor.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Build**: esbuild for production bundling with selective dependency bundling

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `db:push` command
- **Connection**: `pg` client with connection pooling

### AI Integration Pipeline
The video generation follows a multi-step pipeline:
1. **Story Generation**: Claude API (Anthropic) via Replit AI integration for narrative creation
2. **Chapter Generation**: Sequential chapter content based on story framework
3. **Image Generation**: Replicate API supporting Ideogram and Flux models
4. **Video Processing**: Python scripts using MoviePy and PySceneDetect for assembly

### Key Design Patterns
- **Shared Schema**: Database types and Zod validation schemas shared between frontend and backend
- **Storage Interface**: Abstract `IStorage` interface in `server/storage.ts` for database operations
- **Modular Generation**: Each generation step (story, images, video) has dedicated modules
- **Progress Tracking**: Real-time project status updates with generation logs

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # UI components (shadcn/ui based)
│   ├── pages/           # Route pages
│   └── lib/             # Utilities and query client
├── server/              # Express backend
│   ├── python/          # Video processing scripts
│   └── replit_integrations/  # Chat and batch processing utilities
├── shared/              # Shared types and schemas
└── migrations/          # Database migrations
```

## External Dependencies

### AI Services
- **Anthropic Claude**: Story and chapter generation via `@anthropic-ai/sdk`
  - Uses Replit AI integration environment variables
  - Models: claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5
- **Replicate**: Image generation and model hosting
  - Supports Ideogram v3 and Flux Pro models
  - Token configured via `REPLICATE_API_TOKEN`

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage for Express

### Video Processing (Python)
- **MoviePy**: Video editing, compositing, and effects
- **PySceneDetect**: Automatic scene detection
- **PIL/Pillow**: Image processing

### Frontend Libraries
- **Embla Carousel**: Carousel components
- **React Day Picker**: Calendar/date selection
- **React Hook Form + Zod**: Form validation
- **Vaul**: Drawer components

### Development Tools
- **Vite**: Development server with HMR
- **tsx**: TypeScript execution for development
- **drizzle-kit**: Database migration tooling