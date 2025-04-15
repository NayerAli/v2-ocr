| table_name      |
| --------------- |
| user_settings   |
| user_profiles   |
| documents       |
| ocr_results     |
| system_settings |
| system_metadata |


| table_name      | column_name             | data_type                | is_nullable |
| --------------- | ----------------------- | ------------------------ | ----------- |
| system_metadata | updated_at              | timestamp with time zone | NO          |
| user_settings   | ocr_settings            | jsonb                    | YES         |
| user_settings   | processing_settings     | jsonb                    | YES         |
| user_settings   | upload_settings         | jsonb                    | YES         |
| user_settings   | display_settings        | jsonb                    | YES         |
| user_settings   | created_at              | timestamp with time zone | NO          |
| user_settings   | updated_at              | timestamp with time zone | NO          |
| user_profiles   | id                      | uuid                     | NO          |
| documents       | created_at              | timestamp with time zone | NO          |
| documents       | updated_at              | timestamp with time zone | NO          |
| documents       | rate_limit_info         | jsonb                    | YES         |
| ocr_results     | id                      | uuid                     | NO          |
| ocr_results     | document_id             | uuid                     | NO          |
| ocr_results     | user_id                 | uuid                     | NO          |
| ocr_results     | confidence              | double precision         | NO          |
| ocr_results     | processing_time         | double precision         | NO          |
| ocr_results     | page_number             | integer                  | NO          |
| ocr_results     | total_pages             | integer                  | YES         |
| ocr_results     | bounding_box            | jsonb                    | YES         |
| ocr_results     | created_at              | timestamp with time zone | NO          |
| system_settings | value                   | jsonb                    | NO          |
| system_settings | is_editable             | boolean                  | YES         |
| system_settings | created_at              | timestamp with time zone | NO          |
| system_settings | updated_at              | timestamp with time zone | NO          |
| system_metadata | value                   | jsonb                    | NO          |
| system_metadata | created_at              | timestamp with time zone | NO          |
| user_settings   | id                      | uuid                     | NO          |
| user_profiles   | preferences             | jsonb                    | YES         |
| user_profiles   | created_at              | timestamp with time zone | NO          |
| user_profiles   | updated_at              | timestamp with time zone | NO          |
| documents       | id                      | uuid                     | NO          |
| documents       | user_id                 | uuid                     | NO          |
| documents       | file_size               | integer                  | NO          |
| documents       | progress                | double precision         | YES         |
| documents       | current_page            | integer                  | YES         |
| documents       | total_pages             | integer                  | YES         |
| documents       | metadata                | jsonb                    | YES         |
| documents       | processing_started_at   | timestamp with time zone | YES         |
| documents       | processing_completed_at | timestamp with time zone | YES         |
| user_profiles   | email                   | text                     | NO          |
| user_profiles   | full_name               | text                     | YES         |
| user_profiles   | avatar_url              | text                     | YES         |
| user_profiles   | organization            | text                     | YES         |
| user_profiles   | role                    | text                     | YES         |
| ocr_results     | provider                | text                     | NO          |
| documents       | error                   | text                     | YES         |
| system_metadata | key                     | text                     | NO          |
| ocr_results     | image_url               | text                     | YES         |
| ocr_results     | text                    | text                     | NO          |
| documents       | filename                | text                     | NO          |
| documents       | original_filename       | text                     | NO          |
| system_settings | key                     | text                     | NO          |
| documents       | file_type               | text                     | NO          |
| documents       | storage_path            | text                     | NO          |
| documents       | thumbnail_path          | text                     | YES         |
| documents       | status                  | text                     | NO          |
| ocr_results     | language                | text                     | NO          |
| ocr_results     | error                   | text                     | YES         |


| routine_name                 | routine_definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| update_settings_direct       | 
DECLARE
  query TEXT;
  affected INTEGER;
BEGIN
  -- Restreindre les opérations uniquement sur la table user_settings
  IF p_table <> 'user_settings' THEN
    RAISE EXCEPTION 'Opération non autorisée : table %', p_table;
  END IF;

  -- Limiter les colonnes pouvant être mises à jour aux seuls settings autorisés
  IF p_field NOT IN ('ocr_settings', 'processing_settings', 'upload_settings', 'display_settings') THEN
    RAISE EXCEPTION 'Champ non autorisé : %', p_field;
  END IF;

  -- Construire la requête SQL dynamique sécurisée
  query := format('UPDATE public.%I SET %I = $1, updated_at = NOW() WHERE id = $2', p_table, p_field);
  
  -- Exécuter la requête avec les paramètres
  EXECUTE query USING p_value, p_id;
  
  -- Récupérer le nombre de lignes affectées
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Retourner TRUE si une ligne a été modifiée, FALSE sinon
  RETURN affected > 0;
END;
                                                                               |
| set_user_id_on_user_settings | 
BEGIN
    -- Set the user ID to the current user if not provided
    IF NEW.id IS NULL THEN
        NEW.id := auth.uid();
    END IF;
    RETURN NEW;
END;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| update_updated_at_column     | 
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| handle_new_user              | 
BEGIN
    -- Create default settings for the new user
    INSERT INTO public.user_settings (
        id,
        ocr_settings,
        processing_settings,
        upload_settings,
        display_settings
    ) VALUES (
        NEW.id,
        '{
            "provider": "google",
            "apiKey": "",
            "region": "",
            "language": "ar",
            "useSystemKey": true
        }'::jsonb,
        '{
            "maxConcurrentJobs": 3,
            "pagesPerChunk": 3,
            "concurrentChunks": 3,
            "retryAttempts": 2,
            "retryDelay": 1000
        }'::jsonb,
        '{
            "maxFileSize": 500,
            "allowedFileTypes": [".pdf", ".jpg", ".jpeg", ".png"],
            "maxSimultaneousUploads": 5
        }'::jsonb,
        '{
            "theme": "system",
            "fontSize": 14,
            "showConfidenceScores": true,
            "highlightUncertain": true
        }'::jsonb
    );
    RETURN NEW;
END;
 |


| table_name    | trigger_name                         | action_statement                                |
| ------------- | ------------------------------------ | ----------------------------------------------- |
| user_settings | set_user_id_on_user_settings_trigger | EXECUTE FUNCTION set_user_id_on_user_settings() |