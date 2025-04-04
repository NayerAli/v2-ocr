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
        }
      }
      metadata: {
        Row: {
          key: string
          value: Json
          created_at: string
        }
        Insert: {
          key: string
          value: Json
          created_at?: string
        }
        Update: {
          key?: string
          value?: Json
          created_at?: string
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
