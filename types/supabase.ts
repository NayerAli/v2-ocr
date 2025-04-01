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
      documents: {
        Row: {
          id: string
          user_id: string | null
          filename: string
          file_type: string
          file_size: number
          file_url: string | null
          status: string
          start_time: number | null
          end_time: number | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          filename: string
          file_type: string
          file_size: number
          file_url?: string | null
          status: string
          start_time?: number | null
          end_time?: number | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          filename?: string
          file_type?: string
          file_size?: number
          file_url?: string | null
          status?: string
          start_time?: number | null
          end_time?: number | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      ocr_results: {
        Row: {
          id: string
          document_id: string
          page_number: number
          text: string | null
          confidence: number | null
          language: string | null
          processing_time: number | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          page_number: number
          text?: string | null
          confidence?: number | null
          language?: string | null
          processing_time?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          page_number?: number
          text?: string | null
          confidence?: number | null
          language?: string | null
          processing_time?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_document_id_fkey"
            columns: ["document_id"]
            referencedRelation: "documents"
            referencedColumns: ["id"]
          }
        ]
      }
      settings: {
        Row: {
          id: string
          user_id: string | null
          key: string
          value: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          key: string
          value: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          key?: string
          value?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
} 