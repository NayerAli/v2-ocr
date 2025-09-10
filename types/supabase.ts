export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      queue: {
        Row: {
          id: string
          filename: string
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress: number | null
          error: string | null
          size: number | null
          type: string | null
          current_page: number | null
          total_pages: number | null
          start_time: number | null
          end_time: number | null
          completion_time: number | null
          metadata: Json | null
          created_at: string
          updated_at: string
          rate_limit_info: Json | null
          user_id: string | null
        }
        Insert: {
          id: string
          filename: string
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress?: number | null
          error?: string | null
          size?: number | null
          type?: string | null
          current_page?: number | null
          total_pages?: number | null
          start_time?: number | null
          end_time?: number | null
          completion_time?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          rate_limit_info?: Json | null
          user_id?: string | null
        }
        Update: {
          id?: string
          filename?: string
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress?: number | null
          error?: string | null
          size?: number | null
          type?: string | null
          current_page?: number | null
          total_pages?: number | null
          start_time?: number | null
          end_time?: number | null
          completion_time?: number | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          rate_limit_info?: Json | null
          user_id?: string | null
        }
      }
      results: {
        Row: {
          id: string
          document_id: string
          text: string
          confidence: number
          language: string
          processing_time: number
          page_number: number
          total_pages: number | null
          image_url: string | null
          bounding_box: Json | null
          error: string | null
          rate_limit_info: Json | null
          created_at: string
          provider: string
          user_id: string | null
        }
        Insert: {
          id: string
          document_id: string
          text: string
          confidence: number
          language: string
          processing_time: number
          page_number: number
          total_pages?: number | null
          image_url?: string | null
          bounding_box?: Json | null
          error?: string | null
          rate_limit_info?: Json | null
          created_at?: string
          provider: string
          user_id?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          text?: string
          confidence?: number
          language?: string
          processing_time?: number
          page_number?: number
          total_pages?: number | null
          image_url?: string | null
          bounding_box?: Json | null
          error?: string | null
          rate_limit_info?: Json | null
          created_at?: string
          provider?: string
          user_id?: string | null
        }
      }
      // Provide ocr_results with the same shape to align with current code
      ocr_results: {
        Row: {
          id: string
          document_id: string
          text: string
          confidence: number
          language: string
          processing_time: number
          page_number: number
          total_pages: number | null
          image_url: string | null
          bounding_box: Json | null
          error: string | null
          rate_limit_info: Json | null
          created_at: string
          provider: string
          user_id: string | null
        }
        Insert: {
          id: string
          document_id: string
          text: string
          confidence: number
          language: string
          processing_time: number
          page_number: number
          total_pages?: number | null
          image_url?: string | null
          bounding_box?: Json | null
          error?: string | null
          rate_limit_info?: Json | null
          created_at?: string
          provider: string
          user_id?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          text?: string
          confidence?: number
          language?: string
          processing_time?: number
          page_number?: number
          total_pages?: number | null
          image_url?: string | null
          bounding_box?: Json | null
          error?: string | null
          rate_limit_info?: Json | null
          created_at?: string
          provider?: string
          user_id?: string | null
        }
      }
      documents: {
        Row: {
          id: string
          filename: string
          original_filename: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress: number | null
          current_page: number | null
          total_pages: number | null
          file_size: number | null
          file_type: string | null
          storage_path: string | null
          thumbnail_path: string | null
          error: string | null
          created_at: string
          updated_at: string
          processing_started_at: string | null
          processing_completed_at: string | null
          user_id: string | null
        }
        Insert: {
          id: string
          filename: string
          original_filename?: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress?: number | null
          current_page?: number | null
          total_pages?: number | null
          file_size?: number | null
          file_type?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          processing_started_at?: string | null
          processing_completed_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          filename?: string
          original_filename?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'queued' | 'error' | 'cancelled'
          progress?: number | null
          current_page?: number | null
          total_pages?: number | null
          file_size?: number | null
          file_type?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          processing_started_at?: string | null
          processing_completed_at?: string | null
          user_id?: string | null
        }
      }
      metadata: {
        Row: {
          key: string
          value: Json
          created_at: string
          user_id: string | null
        }
        Insert: {
          key: string
          value: Json
          created_at?: string
          user_id?: string | null
        }
        Update: {
          key?: string
          value?: Json
          created_at?: string
          user_id?: string | null
        }
      }
      settings: {
        Row: {
          id: string
          category: string
          data: Json
          is_editable: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          category: string
          data: Json
          is_editable?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string
          data?: Json
          is_editable?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
