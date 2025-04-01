# OCR App Supabase Database Schema

This document outlines the database schema for the OCR application. The database is hosted on Supabase and consists of several tables to store documents, OCR results, and application settings.

## Tables

### 1. `documents`

Stores information about uploaded documents for OCR processing.

| Column      | Type      | Description                               | Constraints          |
|-------------|-----------|-------------------------------------------|----------------------|
| id          | UUID      | Unique identifier for the document        | PRIMARY KEY          |
| user_id     | UUID      | Reference to user who owns the document   | FOREIGN KEY, NULLABLE|
| filename    | TEXT      | Original filename                         | NOT NULL             |
| file_type   | TEXT      | MIME type of the file                     | NOT NULL             |
| file_size   | INTEGER   | Size of the file in bytes                 | NOT NULL             |
| file_url    | TEXT      | URL to access the file (in Supabase Storage) | NULLABLE          |
| status      | TEXT      | Processing status (pending, processing, completed, error) | NOT NULL |
| start_time  | BIGINT    | Processing start timestamp                | NULLABLE             |
| end_time    | BIGINT    | Processing end timestamp                  | NULLABLE             |
| error       | TEXT      | Error message if processing failed        | NULLABLE             |
| created_at  | TIMESTAMP | Record creation timestamp                 | DEFAULT NOW()        |
| updated_at  | TIMESTAMP | Record last update timestamp              | DEFAULT NOW()        |

Indexes:
- `idx_documents_user_id` - Index on user_id for faster lookup
- `idx_documents_status` - Index on status for filtering
- `idx_documents_created_at` - Index on created_at for sorting

### 2. `ocr_results`

Stores the results of OCR processing for each page of a document.

| Column          | Type      | Description                               | Constraints          |
|-----------------|-----------|-------------------------------------------|----------------------|
| id              | UUID      | Unique identifier for the result          | PRIMARY KEY          |
| document_id     | UUID      | Reference to the document                 | FOREIGN KEY          |
| page_number     | INTEGER   | Page number in the document               | NOT NULL             |
| text            | TEXT      | Extracted text content                    | NULLABLE             |
| confidence      | REAL      | Confidence score of OCR extraction        | NULLABLE             |
| language        | TEXT      | Detected language of the text             | NULLABLE             |
| processing_time | INTEGER   | Time taken to process in milliseconds     | NULLABLE             |
| created_at      | TIMESTAMP | Record creation timestamp                 | DEFAULT NOW()        |

Indexes:
- `idx_ocr_results_document_id` - Index on document_id for faster lookup

### 3. `settings`

Stores application settings, both global and user-specific.

| Column      | Type      | Description                               | Constraints          |
|-------------|-----------|-------------------------------------------|----------------------|
| id          | UUID      | Unique identifier for the setting         | PRIMARY KEY          |
| user_id     | UUID      | Reference to user who owns the setting    | FOREIGN KEY, NULLABLE|
| key         | TEXT      | Setting key/name                          | NOT NULL             |
| value       | JSONB     | Setting value as JSON                     | NOT NULL             |
| created_at  | TIMESTAMP | Record creation timestamp                 | DEFAULT NOW()        |
| updated_at  | TIMESTAMP | Record last update timestamp              | DEFAULT NOW()        |

Indexes:
- `idx_settings_user_id_key` - Composite index on user_id and key for faster lookup

Note: There are two versions of the settings table defined in the migrations. The most recent one (20240403_setup_settings.sql) removes the user_id column and makes the key unique globally, suitable for application-wide settings.

## Row Level Security (RLS) Policies

All tables have Row Level Security enabled with the following policies:

### documents Table Policies

- **Select**: Users can view their own documents or documents with NULL user_id
- **Insert**: Users can insert their own documents or documents with NULL user_id
- **Update**: Users can update their own documents or documents with NULL user_id
- **Delete**: Users can delete their own documents or documents with NULL user_id

### ocr_results Table Policies

- **Select**: Users can view results for documents they own
- **Insert**: Users can insert results for documents they own
- **Update**: Users can update results for documents they own
- **Delete**: Users can delete results for documents they own

### settings Table Policies

Two sets of policies exist depending on which migration is active:

1. From 20240331_initial_schema.sql:
   - **Select**: Users can view their own settings or settings with NULL user_id
   - **Insert**: Users can insert their own settings or settings with NULL user_id
   - **Update**: Users can update their own settings or settings with NULL user_id
   - **Delete**: Users can delete their own settings or settings with NULL user_id

2. From 20240403_setup_settings.sql:
   - **Select**: All users can read all settings
   - **Insert/Update/Delete**: Only authenticated users can modify settings

## Triggers

The following triggers are set up for automatic timestamp updates:

1. `documents_updated_at`: Updates the `updated_at` column whenever a document record is modified
2. `settings_updated_at`: Updates the `updated_at` column whenever a settings record is modified

## Data Flow for Settings

The settings table is used for:

1. Application-wide settings with key `schema_version` 
2. User settings with key `user-settings` containing the serialized application settings

The frontend accesses settings through:
1. Local storage (primary)
2. Supabase settings table (when connected and enabled)

## Storage Integration

Document files are stored in Supabase Storage, with the `file_url` column in the `documents` table pointing to the storage location. The storage bucket structure is:

- `documents/` - Root folder for all document files
  - `{user_id}/` - Subfolder for each user
    - `{document_id}.{extension}` - Individual document files

## Initialization

The database is initialized with:
1. A default `schema_version` setting with value `{"version": 1}`
2. All necessary tables, indexes, and security policies

## Migration Strategy

When migrating from IndexedDB to Supabase:
1. Settings are transferred as JSON objects with the key `user-settings`
2. Documents and OCR results are migrated preserving their relationships
3. No user data needs to be migrated for this initial deployment 