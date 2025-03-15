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
      settings: {
        Row: {
          id: number
          key: string
          value: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          key: string
          value: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          key?: string
          value?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          filename: string
          status: string
          progress: number
          current_page: number
          total_pages: number
          size: number
          type: string
          start_time: number | null
          end_time: number | null
          completion_time: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Database['public']['Tables']['documents']['Row'], 'id'>>
        Relationships: []
      }
      results: {
        Row: {
          id: string
          document_id: string
          page: number | null
          image_url: string | null
          text: string | null
          confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          page?: number | null
          image_url?: string | null
          text?: string | null
          confidence?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          page?: number | null
          image_url?: string | null
          text?: string | null
          confidence?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_storage_size: {
        Args: { bucket_name: string }
        Returns: number
      }
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