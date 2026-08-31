// ============================================================
// Aus dem Supabase-Schema erzeugt — nicht von Hand ändern
// ============================================================
// Neu erzeugen mit: supabase gen types typescript --project-id rtqwiezmogooqktseqlf
// (oder über den Supabase-MCP-Server).
//
// Das ist der Grund, warum hier kein ORM steht: Typsicherheit gibt es umsonst
// aus dem Schema, ohne Verbindungsstring und ohne natives Query-Modul.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      devices: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          name: string
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          last_seen_at?: string
          name: string
          platform: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          name?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      number_sequences: {
        Row: { kind: string; next_value: number; user_id: string; year: number }
        Insert: { kind: string; next_value: number; user_id: string; year: number }
        Update: { kind?: string; next_value?: number; user_id?: string; year?: number }
        Relationships: []
      }
      sync_keys: {
        Row: { kdf: Json; kind: string; updated_at: string; user_id: string; wrapped_dek: string }
        Insert: { kdf: Json; kind: string; updated_at?: string; user_id: string; wrapped_dek: string }
        Update: { kdf?: Json; kind?: string; updated_at?: string; user_id?: string; wrapped_dek?: string }
        Relationships: []
      }
      sync_ops: {
        Row: {
          created_at: string
          device_id: string
          lamport: number
          payload: string
          seq: number
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          lamport: number
          payload: string
          seq?: never
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          lamport?: number
          payload?: string
          seq?: never
          user_id?: string
        }
        Relationships: []
      }
      sync_snapshots: {
        Row: { created_at: string; payload: string; up_to_seq: number; user_id: string }
        Insert: { created_at?: string; payload: string; up_to_seq: number; user_id: string }
        Update: { created_at?: string; payload?: string; up_to_seq?: number; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      allocate_number: {
        Args: { p_count?: number; p_kind: string; p_year: number }
        Returns: number
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
