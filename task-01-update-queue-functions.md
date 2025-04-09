# Task 1: Update Queue Functions to Use Documents Table

## Background
The database schema has been optimized, and the `queue` table has been merged into the `documents` table. Now, we need to update all queue-related functions to work with the new schema.

## Current Implementation
Currently, the application uses a separate `queue` table to manage document processing. The queue functions include:
- `db.getQueue()` - Gets all queue items for the current user
- `db.saveToQueue(status)` - Adds a document to the queue
- `db.removeFromQueue(id)` - Removes a document from the queue
- `db.updateQueueItem(id, updates)` - Updates a queue item

These functions are implemented in `lib/supabase-db.ts` and are used throughout the application, especially in the queue management and processing service.

## New Database Schema
In the new schema, the `documents` table has a `status` field that replaces the queue functionality:

```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued', 'error', 'cancelled')),
    progress FLOAT DEFAULT 0,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rate_limit_info JSONB
);
```

## Required Changes

### 1. Update `db.getQueue()`
This function should now query the `documents` table with status filtering.

**Current Implementation:**
```javascript
async getQueue() {
  const { data, error } = await this.supabase
    .from('queue')
    .select('*')
    .eq('user_id', this.userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching queue:', error);
    throw error;
  }

  return data || [];
}
```

**New Implementation:**
```javascript
async getQueue() {
  const { data, error } = await this.supabase
    .from('documents')
    .select('*')
    .eq('user_id', this.userId)
    .in('status', ['pending', 'processing', 'queued'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching queue:', error);
    throw error;
  }

  return data || [];
}
```

### 2. Update `db.addToQueue(document)`
This function should now insert into the `documents` table with status='queued'.

**Current Implementation:**
```javascript
async saveToQueue(status) {
  const { data, error } = await this.supabase
    .from('queue')
    .upsert({
      ...status,
      user_id: this.userId,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error saving to queue:', error);
    throw error;
  }

  return data;
}
```

**New Implementation:**
```javascript
async addToQueue(document) {
  const { data, error } = await this.supabase
    .from('documents')
    .insert({
      ...document,
      status: 'queued',
      user_id: this.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error adding to queue:', error);
    throw error;
  }

  return data;
}
```

### 3. Update `db.removeFromQueue(id)`
This function should now delete from the `documents` table.

**Current Implementation:**
```javascript
async removeFromQueue(id) {
  const { error } = await this.supabase
    .from('queue')
    .delete()
    .eq('id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error removing from queue:', error);
    throw error;
  }

  return true;
}
```

**New Implementation:**
```javascript
async removeFromQueue(id) {
  const { error } = await this.supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error removing from queue:', error);
    throw error;
  }

  return true;
}
```

### 4. Update `db.updateQueueItem(id, updates)`
This function should now update the `documents` table.

**Current Implementation:**
```javascript
async updateQueueItem(id, updates) {
  const { data, error } = await this.supabase
    .from('queue')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error updating queue item:', error);
    throw error;
  }

  return data;
}
```

**New Implementation:**
```javascript
async updateQueueItem(id, updates) {
  const { data, error } = await this.supabase
    .from('documents')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', this.userId);

  if (error) {
    console.error('Error updating queue item:', error);
    throw error;
  }

  return data;
}
```

## File Locations
These functions are located in:
- `lib/supabase-db.ts` - Main implementation of database functions
- `lib/database.ts` - Exports the database service

## Testing
After implementing these changes, test each function to ensure it works correctly with the new schema:

1. Test `db.getQueue()` to ensure it returns documents with the correct statuses
2. Test `db.addToQueue(document)` to ensure it adds a document to the queue with status='queued'
3. Test `db.removeFromQueue(id)` to ensure it removes a document from the queue
4. Test `db.updateQueueItem(id, updates)` to ensure it updates a document in the queue

## Notes
- Make sure to update any references to these functions in other parts of the application
- Ensure that all functions include proper user authentication and data isolation
- Consider adding caching for better performance
- Update any UI components that display queue items to work with the new data structure
