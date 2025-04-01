# Migration Plan: Local IndexedDB to Supabase

## Overview
This updated plan focuses on implementing Supabase as the primary database solution for storage while keeping processing client-based. We'll replace IndexedDB with Supabase for storing results, settings, and metadata, but maintain client-side processing to avoid server resource usage.

For detailed information about the database schema and structure, refer to the [database.MD](./database.MD) file.

## Current Architecture
- Frontend: Next.js with React
- Local Database: IndexedDB (via idb library)
- State Management: Zustand
- Main Features: Document upload, OCR processing, results viewing

## Target Architecture
- Frontend: Next.js with React (unchanged)
- Database: Supabase (PostgreSQL) for storage only
- Storage: Supabase Storage (for document files)
- Processing: Remains client-side
- State Management: Zustand (with Supabase integration)

## Implementation Steps

### Phase 1: Supabase Foundations ✅
- [x] 1.1 Install Supabase client library
- [x] 1.2 Configure Supabase environment variables
- [x] 1.3 Create Supabase schema and tables
- [x] 1.4 Setup Supabase client utility functions
- [x] 1.5 Create Supabase service class mirroring IndexedDB
- [x] 1.6 Create database factory for provider selection
- [x] 1.7 Create Supabase settings UI component

### Phase 2: Core Service Integration ✅
- [x] 2.1 Update QueueManager to use database factory instead of direct IndexedDB
- [x] 2.2 Create file storage adapter for Supabase storage
- [x] 2.3 Update QueueManager to use file storage adapter
- [x] 2.4 Update FileProcessor to work with remote files
- [x] 2.5 Update settings dialog to use database factory

### Phase 3: UI & Feature Integration ✅
- [x] 3.1 Update document list to handle remote URLs
- [x] 3.2 Create loading indicators for remote file operations
- [x] 3.3 Create file thumbnail component for previews
- [x] 3.4 Update document details view to handle remote URLs
- [x] 3.5 Add cache mechanisms for better offline support
  - [x] 3.5.1 Implement offline queue for database operations
  - [x] 3.5.2 Add localStorage fallback for queue and results
  - [x] 3.5.3 Create file caching system for Supabase Storage
  - [x] 3.5.4 Add cache management (clearing, size limits)
  - [x] 3.5.5 Implement online/offline detection and syncing
- [x] 3.6 Implement error handling and fallbacks for network issues
  - [x] 3.6.1 Create error boundary for network errors
  - [x] 3.6.2 Add retry mechanisms for failed operations
  - [x] 3.6.3 Implement user notifications for offline mode
  - [x] 3.6.4 Create network status indicator component

### Phase 4: Settings Integration & Storage
- [x] 4.1 Modify settings store to persist settings to Supabase
  - [x] 4.1.1 Create Supabase table for user settings
  - [x] 4.1.2 Update settings store to use database factory
  - [x] 4.1.3 Implement settings sync between devices
  - [x] 4.1.4 Add settings version control for compatibility
  - [x] 4.1.5 Fix server-side rendering issues with localStorage
  - [x] 4.1.6 Fix PDF.js worker issue using fake worker
  - [x] 4.1.7 Fix TypeScript errors in database interface
  - [x] 4.1.8 Improve error handling for optional database methods
- [ ] 4.2 Create settings migration utility for existing users
  - [ ] 4.2.1 Detect first-time Supabase users
  - [ ] 4.2.2 Migrate existing IndexedDB settings to Supabase
  - [ ] 4.2.3 Add settings backup/restore functionality
- [ ] 4.3 Implement connection status indicators
  - [ ] 4.3.1 Create status indicator component
  - [ ] 4.3.2 Add tooltips for connection details
  - [ ] 4.3.3 Implement animated transitions for status changes
- [ ] 4.4 Update stats component to show Supabase storage usage
  - [ ] 4.4.1 Add API for fetching Supabase storage stats
  - [ ] 4.4.2 Create visual storage usage indicators
  - [ ] 4.4.3 Add quota warning notifications
- [ ] 4.5 Add reconnection logic for offline scenarios
  - [ ] 4.5.1 Implement exponential backoff for reconnection attempts
  - [ ] 4.5.2 Add manual reconnect option
  - [ ] 4.5.3 Create session recovery mechanism

### Phase 5: Cleanup & Optimization
- [ ] 5.1 Remove unused IndexedDB code
  - [ ] 5.1.1 Identify all IndexedDB dependencies
  - [ ] 5.1.2 Create deprecation plan for IndexedDB
  - [ ] 5.1.3 Remove or comment out unused code
- [ ] 5.2 Optimize Supabase queries for performance
  - [ ] 5.2.1 Add indexing for common queries
  - [ ] 5.2.2 Implement query batching for bulk operations
  - [ ] 5.2.3 Add response time monitoring
- [ ] 5.3 Test all features with both storage providers
  - [ ] 5.3.1 Create test matrix for all features
  - [ ] 5.3.2 Validate functionality with both providers
  - [ ] 5.3.3 Document any differences or limitations
- [ ] 5.4 Add comprehensive error handling
  - [ ] 5.4.1 Create error logging service
  - [ ] 5.4.2 Implement user-friendly error messages
  - [ ] 5.4.3 Add error reporting mechanism
- [ ] 5.5 Final testing and refinements
  - [ ] 5.5.1 Conduct end-to-end testing
  - [ ] 5.5.2 Optimize for performance
  - [ ] 5.5.3 Finalize documentation

## Progress Tracking
- ✅ Phase 1: Supabase Foundations (Completed)
- ✅ Phase 2: Core Service Integration (Completed)
- ✅ Phase 3: UI & Feature Integration (Completed)
- 🔄 Phase 4: Settings Integration & Storage (In Progress)
  - ✅ 4.1.1 Create Supabase table for user settings
  - ✅ 4.1.2 Update settings store to use database factory
  - ✅ 4.1.3 Implement settings sync between devices
  - ✅ 4.1.4 Add settings version control for compatibility
  - ✅ 4.1.5 Fix server-side rendering issues with localStorage
  - ✅ 4.1.6 Fix PDF.js worker issue using fake worker
  - ✅ 4.1.7 Fix TypeScript errors in database interface
  - ✅ 4.1.8 Improve error handling for optional database methods
  - ✅ 4.3 Implement connection status indicators
    - ✅ 4.3.1 Create status indicator component
    - ✅ 4.3.2 Add tooltips for connection details
    - ✅ 4.3.3 Implement animated transitions for status changes
    - ✅ 4.3.4 Persist connection status between sessions
  - ⬜ 4.2 Create settings migration utility for existing users
  - ⬜ 4.4 Update stats component to show Supabase storage usage
  - ⬜ 4.5 Add reconnection logic for offline scenarios
- ⬜ Phase 5: Cleanup & Optimization (Not Started)

## Current Task
Continuing with Phase 4: Settings Integration & Storage. We've successfully updated the settings store to persist settings to Supabase and enhanced the connection status indicators:

1. Improved the connection status persistence:
   - Added connectionStatus field to database settings
   - Persisted connection status between application sessions
   - Auto-test connection when reopening settings dialog
   - Enhanced visual feedback for connection state changes

2. Enhanced the Supabase settings UI:
   - Redesigned the connection status panel with clear visual states
   - Added animated transitions between connection states
   - Improved feedback for testing and syncing operations
   - Added test button even when Supabase is not active

3. Fixed network status component interaction:
   - Synchronized network status with persisted connection state
   - Added more robust connection testing

Next steps:
1. Complete implementation of settings migration utility (4.2)
   - Create a migration dialog/component that shows on first Supabase connection
   - Implement logic to copy IndexedDB settings to Supabase
   - Add option to skip migration

2. Update stats component to show Supabase storage usage (4.4)
   - Add API for fetching Supabase storage stats
   - Create visual storage usage indicators
   - Add quota warning notifications

Status: In progress - Improved connection status persistence and visual feedback 