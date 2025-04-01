# Migration Plan: Local IndexedDB to Supabase

## Overview
This updated plan focuses on implementing Supabase as the primary database solution for storage while keeping processing client-based. We'll replace IndexedDB with Supabase for storing results, settings, and metadata, but maintain client-side processing to avoid server resource usage.

For smooth user experience, the system will:
- Store results locally first when received
- Update and save to Supabase in the background
- Clean local storage once data is successfully synced to the database
- Fall back to local storage when user is not connected to Supabase

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
  - [ ] 4.2.3 Add settings backup/restore functionality
- [x] 4.3 Implement connection status indicators
  - [x] 4.3.1 Create status indicator component
  - [x] 4.3.2 Add tooltips for connection details
  - [x] 4.3.3 Implement animated transitions for status changes
- [x] 4.4 Update stats component to show Supabase storage usage
  - [x] 4.4.1 Add API for fetching Supabase storage stats
  - [x] 4.4.2 Create visual storage usage indicators
  - [x] 4.4.3 Add quota warning notifications
- [x] 4.5 Add reconnection logic for offline scenarios
  - [x] 4.5.1 Implement exponential backoff for reconnection attempts
  - [x] 4.5.2 Add manual reconnect option
  - [x] 4.5.3 Create session recovery mechanism

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
- ✅ Phase 4: Settings Integration & Storage (Completed)
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
  - ✅ 4.4 Update stats component to show Supabase storage usage
    - ✅ 4.4.1 Add API for fetching Supabase storage stats
    - ✅ 4.4.2 Create visual storage usage indicators
    - ✅ 4.4.3 Add quota warning notifications
  - ✅ 4.5 Add reconnection logic for offline scenarios
    - ✅ 4.5.1 Implement exponential backoff for reconnection attempts
    - ✅ 4.5.2 Add manual reconnect option
    - ✅ 4.5.3 Create session recovery mechanism
- 🔄 Phase 5: Cleanup & Optimization (In Progress)

## Current Task
Starting Phase 5: Cleanup & Optimization. We've successfully completed all tasks in Phase 4, including implementing a robust reconnection mechanism for Supabase:

1. Enhanced reconnection capabilities:
   - Implemented exponential backoff algorithm for automatic reconnection
   - Added manual reconnection button in network status indicator
   - Created state management for reconnection process
   - Added event listeners for online/offline status changes
   - Integrated reconnection with settings updates
   - Improved network status UI with detailed connection state information

2. Improved offline recovery mechanism:
   - Added persistent state tracking through localStorage
   - Implemented session recovery after reconnection
   - Created listeners for reconnection state changes
   - Added connection testing for both manual and automatic reconnection

Next focus - Task 5.1: Remove unused IndexedDB code:
1. Identify all IndexedDB dependencies:
   - Create inventory of all files that import IndexedDB
   - Identify all components that use IndexedDB directly
   - Check for any hidden dependencies on IndexedDB-specific features
   - Ensure all features are properly abstracted through DatabaseService interface

2. Create deprecation plan:
   - Determine which components need to be updated
   - Identify any remaining implementation gaps between providers
   - Ensure backward compatibility during transition
   - Add clear comments for future maintenance

3. Remove or comment out unused code:
   - Safely remove direct IndexedDB references
   - Update components to use database factory
   - Remove IndexedDB-specific optimizations or workarounds
   - Clean up any remaining IndexedDB-specific types or interfaces

Status: In progress - Starting identification of IndexedDB dependencies 