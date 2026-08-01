# Growth Park - Business Development Platform

## Overview

Growth Park is a comprehensive business development platform that connects companies through a three-party ecosystem: AddBox (admin), Connectors (business development agents), and Supporters (service providers). The platform facilitates lead generation, meeting scheduling, contract management, and billing operations.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and production builds
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based authentication with role-based access control
- **File Handling**: Multer for file uploads with type validation
- **Security**: bcrypt for password hashing

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (Neon serverless)
- **Migrations**: Drizzle Kit for schema management
- **Connection**: Connection pooling with @neondatabase/serverless

## Key Components

### User Management System
- Multi-role authentication (AddBox, Connector, Supporter, Client)
- JWT token-based sessions with automatic refresh
- Role-based access control throughout the application
- Company-based user grouping for Connectors

### Lead Management
- Complete lead lifecycle tracking (進行中, 商談実施済み, 失注)
- Assignment to specific staff members (森尾, 宮本, 林, 福嶋)
- Meeting scheduling and outcome tracking
- File attachments for lead documentation

### Supporter Management
- Service provider registration with logo uploads
- Status management (アクティブ, ストップ)
- Service pricing and overview information
- Integration with lead assignment system

### Contract & Billing System
- Multi-tier commission structures
- Automated billing calculations based on meetings
- Monthly reporting and analytics
- Export functionality for financial records

### Notification System
- Slack integration for real-time notifications
- Email notifications via SendGrid
- In-app notification management
- Multi-channel alert system for new registrations

## Data Flow

### Lead Processing Flow
1. Connector creates lead entry with company and contact details
2. System assigns lead to appropriate Supporter based on service matching
3. Meeting scheduling coordinates between all parties
4. Outcome tracking updates lead status and triggers billing calculations
5. Contract fulfillment generates commission payments

### File Upload Flow
1. Client uploads files through drag-and-drop interface
2. Server validates file types and sizes
3. Files stored in local uploads directory with timestamp naming
4. Database stores file metadata and access URLs
5. Static file serving provides secure access to uploaded content

### Authentication Flow
1. User submits credentials via login form
2. Server validates against bcrypt-hashed passwords
3. JWT token generated with user role and permissions
4. Token stored in localStorage for session persistence
5. Protected routes verify token on each request

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL connection and query execution
- **drizzle-orm**: Type-safe database operations and schema management
- **@tanstack/react-query**: Server state management and caching
- **@hookform/resolvers**: Form validation with Zod schemas
- **@radix-ui/***: Accessible UI component primitives

### Integration Services
- **@slack/web-api**: Slack notifications for business events
- **@sendgrid/mail**: Email notification delivery
- **bcrypt**: Secure password hashing
- **jsonwebtoken**: JWT token generation and validation
- **multer**: File upload handling and validation

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Production bundling for server code
- **tailwindcss**: Utility-first styling framework
- **vite**: Frontend build tool and development server

## Deployment Strategy

### Environment Configuration
- **Development**: Local development with Vite dev server and tsx
- **Production**: Static frontend build with Node.js Express server
- **Database**: Neon PostgreSQL with connection pooling
- **File Storage**: Local filesystem storage with HTTP serving

### Build Process
1. Frontend builds to `dist/public` using Vite
2. Server code bundles to `dist/index.js` using esbuild
3. Database schema pushes using Drizzle Kit
4. Static assets served through Express middleware

### Replit Configuration
- **Modules**: nodejs-20, web, postgresql-16
- **Deployment**: Google Cloud Engine target
- **Port Configuration**: Internal 5000, external 80
- **Environment**: Auto-provisioned database with connection string

## Changelog

Changelog:
- June 16, 2025. Initial setup
- June 27, 2025. Added "日程確定" status to lead management with automatic status update when meeting date is entered
- April 7, 2026. Added Google Calendar integration for automatic event creation when lead status changes to "日程確定". Staff OAuth tokens stored in google_tokens table. Added meeting link (商談リンク追加) column to AddBox leads section.
- April 8, 2026. Added Frictio webhook integration (POST /api/webhooks/frictio). Only processes meeting.completed.beta events where トスアップ判定=○. Auto-creates leads with mapped fields: 企業名, 事業内容, 担当者役職, 支援先名(auto-matched to supporter), 繋いだ担当者(auto-matched to staff), ニーズ. Meeting date confirm button added to prevent accidental updates. Calendar event title changed to "トスアップ同席:支援先名×企業名 担当者名さま".

## User Preferences

Preferred communication style: Simple, everyday language.