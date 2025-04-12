// This file serves as a bridge to switch between IndexedDB and Supabase
// Import from this file instead of directly from indexed-db.ts or supabase-db.ts

// Import the Supabase database service
import { db } from './database/database-service'

// Export the database service
export { db }
