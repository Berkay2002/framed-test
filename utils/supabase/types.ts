export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      game_players: {
        Row: {
          game_alias: string
          id: string
          is_host: boolean | null
          is_online: boolean | null
          joined_at: string | null
          last_seen: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          game_alias: string
          id?: string
          is_host?: boolean | null
          is_online?: boolean | null
          joined_at?: string | null
          last_seen?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          game_alias?: string
          id?: string
          is_host?: boolean | null
          is_online?: boolean | null
          joined_at?: string | null
          last_seen?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rooms: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string | null
          current_round: number | null
          host_id: string
          id: string
          impostor_id: string | null
          last_heartbeat: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          code: string
          completed_at?: string | null
          created_at?: string | null
          current_round?: number | null
          host_id: string
          id?: string
          impostor_id?: string | null
          last_heartbeat?: string | null
          started_at?: string | null
          status: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string | null
          current_round?: number | null
          host_id?: string
          id?: string
          impostor_id?: string | null
          last_heartbeat?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      game_rounds: {
        Row: {
          completed_at: string | null
          fake_image_url: string
          id: string
          real_image_url: string
          room_id: string
          round_number: number
          started_at: string | null
        }
        Insert: {
          completed_at?: string | null
          fake_image_url: string
          id?: string
          real_image_url: string
          room_id: string
          round_number: number
          started_at?: string | null
        }
        Update: {
          completed_at?: string | null
          fake_image_url?: string
          id?: string
          real_image_url?: string
          room_id?: string
          round_number?: number
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      image_titles: {
        Row: {
          category: string
          file_name: string | null
          file_path: string | null
          id: number
          title: string | null
        }
        Insert: {
          category: string
          file_name?: string | null
          file_path?: string | null
          id?: number
          title?: string | null
        }
        Update: {
          category?: string
          file_name?: string | null
          file_path?: string | null
          id?: number
          title?: string | null
        }
        Relationships: []
      }
      player_captions: {
        Row: {
          caption: string | null
          id: string
          player_id: string
          round_id: string
          submitted_at: string | null
        }
        Insert: {
          caption?: string | null
          id?: string
          player_id: string
          round_id: string
          submitted_at?: string | null
        }
        Update: {
          caption?: string | null
          id?: string
          player_id?: string
          round_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_captions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_captions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_votes: {
        Row: {
          id: string
          room_id: string
          voted_at: string | null
          voted_for_id: string
          voter_id: string
        }
        Insert: {
          id?: string
          room_id: string
          voted_at?: string | null
          voted_for_id: string
          voter_id: string
        }
        Update: {
          id?: string
          room_id?: string
          voted_at?: string | null
          voted_for_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_votes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_votes_voted_for_id_fkey"
            columns: ["voted_for_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
