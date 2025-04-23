# Database Statistics Update Summary

## Overview
This update improves the database statistics calculation to directly query the database for accurate statistics without any assumptions, as requested.

## Changes Made

### 1. Updated `getDatabaseStats` Function
- Modified the function to query actual data from the database tables
- Added fallback mechanisms for backward compatibility
- Improved error handling and logging

### 2. Added SQL Functions for Efficient Calculations
- Created `get_total_file_size()` function to calculate total file size directly in the database
- Created `get_total_ocr_size()` function to calculate total OCR text size directly in the database
- These functions improve performance by doing calculations at the database level

### 3. Improved Metadata Handling
- Updated to use `system_metadata` table as the primary source for last cleared date
- Added fallback to the legacy `metadata` table for backward compatibility
- Improved parsing of jsonb values from the database

## Technical Details

### SQL Functions
Two new SQL functions were created:

1. **get_total_file_size()**
   ```sql
   CREATE OR REPLACE FUNCTION public.get_total_file_size()
   RETURNS bigint
   LANGUAGE sql
   SECURITY DEFINER
   AS $$
     SELECT COALESCE(SUM(file_size), 0)::bigint
     FROM public.documents;
   $$;
   ```

2. **get_total_ocr_size()**
   ```sql
   CREATE OR REPLACE FUNCTION public.get_total_ocr_size()
   RETURNS bigint
   LANGUAGE sql
   SECURITY DEFINER
   AS $$
     SELECT COALESCE(SUM(LENGTH(text)), 0)::bigint
     FROM public.ocr_results;
   $$;
   ```

### JavaScript Implementation
The updated `getDatabaseStats` function now:
1. Gets document count from the `documents` table
2. Gets OCR results count from the `ocr_results` table
3. Gets last cleared date from `system_metadata` or `metadata` tables
4. Calculates total file size using the `get_total_file_size()` SQL function with a JavaScript fallback
5. Calculates total OCR size using the `get_total_ocr_size()` SQL function with a JavaScript fallback
6. Returns accurate statistics based on actual database data

## Benefits
- More accurate storage statistics based on actual data
- Better performance by leveraging database-level calculations
- Improved reliability with fallback mechanisms
- No assumptions or estimations used in calculations
