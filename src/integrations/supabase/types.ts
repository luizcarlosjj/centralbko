export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assignment_control: {
        Row: {
          id: string
          last_assigned_user_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pause_evidences: {
        Row: {
          created_at: string
          file_url: string
          id: string
          pause_log_id: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          pause_log_id: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          pause_log_id?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pause_evidences_pause_log_id_fkey"
            columns: ["pause_log_id"]
            isOneToOne: false
            referencedRelation: "pause_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pause_evidences_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pause_logs: {
        Row: {
          created_by: string
          description_text: string | null
          id: string
          pause_ended_at: string | null
          pause_reason_id: string
          pause_started_at: string
          paused_seconds: number
          ticket_id: string
        }
        Insert: {
          created_by: string
          description_text?: string | null
          id?: string
          pause_ended_at?: string | null
          pause_reason_id: string
          pause_started_at?: string
          paused_seconds?: number
          ticket_id: string
        }
        Update: {
          created_by?: string
          description_text?: string | null
          id?: string
          pause_ended_at?: string | null
          pause_reason_id?: string
          pause_started_at?: string
          paused_seconds?: number
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pause_logs_pause_reason_id_fkey"
            columns: ["pause_reason_id"]
            isOneToOne: false
            referencedRelation: "pause_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pause_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pause_reasons: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      pause_response_files: {
        Row: {
          created_at: string
          file_url: string
          id: string
          pause_response_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          pause_response_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          pause_response_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pause_response_files_pause_response_id_fkey"
            columns: ["pause_response_id"]
            isOneToOne: false
            referencedRelation: "pause_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      pause_responses: {
        Row: {
          created_at: string
          description_text: string
          id: string
          pause_log_id: string
          responded_by: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          description_text: string
          id?: string
          pause_log_id: string
          responded_by: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          description_text?: string
          id?: string
          pause_log_id?: string
          responded_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pause_responses_pause_log_id_fkey"
            columns: ["pause_log_id"]
            isOneToOne: false
            referencedRelation: "pause_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pause_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      requesters: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      setup_levels: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          label: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          label: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          label: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          label: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      ticket_status_logs: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_status: string
          old_status: string
          ticket_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_status: string
          old_status: string
          ticket_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_status?: string
          old_status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_status_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string | null
          id: string
          label: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          label: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          label?: string
          value?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assigned_analyst_id: string | null
          attachment_url: string | null
          base_name: string
          complexity: string | null
          created_at: string
          description: string
          finished_at: string | null
          id: string
          pause_started_at: string | null
          priority: string
          requester_name: string
          requester_user_id: string | null
          setup_level: string | null
          started_at: string | null
          status: string
          team: string | null
          total_execution_seconds: number
          total_paused_seconds: number
          type: string
        }
        Insert: {
          assigned_analyst_id?: string | null
          attachment_url?: string | null
          base_name: string
          complexity?: string | null
          created_at?: string
          description: string
          finished_at?: string | null
          id?: string
          pause_started_at?: string | null
          priority: string
          requester_name: string
          requester_user_id?: string | null
          setup_level?: string | null
          started_at?: string | null
          status?: string
          team?: string | null
          total_execution_seconds?: number
          total_paused_seconds?: number
          type: string
        }
        Update: {
          assigned_analyst_id?: string | null
          attachment_url?: string | null
          base_name?: string
          complexity?: string | null
          created_at?: string
          description?: string
          finished_at?: string | null
          id?: string
          pause_started_at?: string | null
          priority?: string
          requester_name?: string
          requester_user_id?: string | null
          setup_level?: string | null
          started_at?: string | null
          status?: string
          team?: string | null
          total_execution_seconds?: number
          total_paused_seconds?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_team_meta_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "supervisor" | "analyst" | "backoffice"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["supervisor", "analyst", "backoffice"],
    },
  },
} as const
