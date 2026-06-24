# Fatera - Moscow Housing Optimization Application

## Overview

Fatera is a web application designed to help users find optimal housing locations in Moscow based on their daily travel patterns and important locations. The application uses an interactive map interface with AI-driven recommendations to visualize optimal zones for comfortable living.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (January 2025)

- **Priority System Removed**: Removed the 1-5 priority scale for attraction points to simplify the interface
- **Equal Weight Algorithm**: All attraction points now have equal importance in zone calculations
- **Improved Zone Algorithm**: Switched from circle-based to grid-based analysis for more realistic optimal areas
- **Added Home Type**: Added "дом" (home) as a point type with 🏠 emoji
- **Enhanced Notifications**: Added toast notifications for zone calculation results and error handling

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **Map Integration**: Leaflet for interactive mapping functionality
- **State Management**: TanStack Query (React Query) for server state management
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful API design
- **Storage**: In-memory storage implementation with interface for future database integration
- **Development Server**: Vite for development with HMR support

### Build System
- **Build Tool**: Vite for frontend bundling
- **TypeScript**: Full TypeScript support across client and server
- **Development**: TSX for TypeScript execution in development
- **Production**: esbuild for server bundling

## Key Components

### Data Models
- **Attraction Points**: User-defined important locations (home, work, study, fitness, etc.) with coordinates and travel time preferences
- **Zones**: Calculated optimal areas between attraction points with different quality levels (ideal, good, far)

### Core Features
1. **Interactive Map**: Leaflet-based map centered on Moscow for point selection and zone visualization
2. **Point Management**: Add, edit, and delete attraction points with type categorization including "дом" (home)
3. **Zone Calculation**: Grid-based algorithm to compute optimal living areas between multiple attraction points
4. **Travel Time Configuration**: Customizable travel time preferences per location (10-60 minutes)
5. **User Notifications**: Toast notifications for successful operations and error handling

### UI Components
- **Control Panel**: Collapsible sidebar for managing attraction points and settings
- **Map Container**: Main map interface with click-to-add functionality
- **Points List**: Management interface for existing attraction points
- **Zone Legend**: Visual guide for understanding zone quality indicators
- **Form Components**: Type-safe forms for adding/editing attraction points

## Data Flow

1. **Point Creation**: User clicks on map or manually enters address → Form validation → API call → Database storage → UI update
2. **Zone Calculation**: User triggers calculation → Server processes all points → Generates optimal zones → Returns zone data → Map visualization update
3. **Point Management**: Users can view, edit, or delete existing points through the control panel
4. **Real-time Updates**: TanStack Query handles cache invalidation and optimistic updates

## External Dependencies

### Frontend Dependencies
- **UI Libraries**: Radix UI components, Lucide React icons
- **Map**: Leaflet for interactive mapping
- **Forms**: React Hook Form with Hookform resolvers
- **Validation**: Zod for runtime type checking
- **HTTP Client**: Native fetch with TanStack Query wrapper

### Backend Dependencies
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **Database Driver**: Neon Database serverless driver
- **Validation**: Drizzle-Zod for schema validation
- **Session Management**: connect-pg-simple for PostgreSQL session store

### Development Tools
- **Replit Integration**: Custom Replit plugins for development environment
- **Error Handling**: Runtime error overlay for development
- **Code Quality**: TypeScript strict mode with comprehensive type checking

## Deployment Strategy

### Development
- Vite development server with HMR
- TSX for TypeScript execution
- In-memory storage for rapid prototyping
- Replit-specific development tooling

### Production
- Vite production build for static assets
- esbuild for server bundling with external package handling
- PostgreSQL database via Neon Database
- Environment-based configuration management

### Database Strategy
- **Current**: In-memory storage with interface-based design
- **Future**: PostgreSQL with Drizzle ORM
- **Migration Path**: Database schema already defined, storage interface allows seamless transition
- **Session Storage**: PostgreSQL-based session management ready for implementation

The application is designed with a clear separation between storage interface and implementation, making it easy to transition from development (in-memory) to production (PostgreSQL) storage solutions.