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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          avg_interval_days: number | null
          avg_price: number | null
          code: string
          created_at: string
          description: string
          id: string
          last_purchased_at: string | null
          purchase_count: number
          supplier: string | null
          total_quantity: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          avg_interval_days?: number | null
          avg_price?: number | null
          code: string
          created_at?: string
          description: string
          id?: string
          last_purchased_at?: string | null
          purchase_count?: number
          supplier?: string | null
          total_quantity?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          avg_interval_days?: number | null
          avg_price?: number | null
          code?: string
          created_at?: string
          description?: string
          id?: string
          last_purchased_at?: string | null
          purchase_count?: number
          supplier?: string | null
          total_quantity?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          request_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          request_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          request_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_requests: {
        Row: {
          approver_id: string | null
          arrived_at: string | null
          cost_center_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          description: string
          finalized_at: string | null
          id: string
          item_id: string | null
          justification: string
          needed_by: string
          number: string | null
          priority: Database["public"]["Enums"]["request_priority"]
          purchase_amount: number | null
          purchase_order_number: string | null
          purchased_at: string | null
          quantity: number
          requester_id: string
          sector_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          unit: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          arrived_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          description: string
          finalized_at?: string | null
          id?: string
          item_id?: string | null
          justification: string
          needed_by: string
          number?: string | null
          priority?: Database["public"]["Enums"]["request_priority"]
          purchase_amount?: number | null
          purchase_order_number?: string | null
          purchased_at?: string | null
          quantity: number
          requester_id: string
          sector_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          unit: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          arrived_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          description?: string
          finalized_at?: string | null
          id?: string
          item_id?: string | null
          justification?: string
          needed_by?: string
          number?: string | null
          priority?: Database["public"]["Enums"]["request_priority"]
          purchase_amount?: number | null
          purchase_order_number?: string | null
          purchased_at?: string | null
          quantity?: number
          requester_id?: string
          sector_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          path: string
          request_id: string
          size: number | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          path: string
          request_id: string
          size?: number | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          path?: string
          request_id?: string
          size?: number | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_history: {
        Row: {
          action: string
          created_at: string
          from_status: Database["public"]["Enums"]["request_status"] | null
          id: string
          request_id: string
          to_status: Database["public"]["Enums"]["request_status"] | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          request_id: string
          to_status?: Database["public"]["Enums"]["request_status"] | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["request_status"] | null
          id?: string
          request_id?: string
          to_status?: Database["public"]["Enums"]["request_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_items: {
        Row: {
          created_at: string
          description: string
          expected_price: number | null
          id: string
          item_id: string | null
          position: number
          quantity: number
          request_id: string
          unit: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description: string
          expected_price?: number | null
          id?: string
          item_id?: string | null
          position?: number
          quantity: number
          request_id: string
          unit: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          expected_price?: number | null
          id?: string
          item_id?: string | null
          position?: number
          quantity?: number
          request_id?: string
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "request_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_sequences: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      supplier_evaluations: {
        Row: {
          approved: boolean
          classification: Database["public"]["Enums"]["evaluation_class"]
          created_at: string
          days_late: number
          evaluation_date: string
          evaluator_id: string
          evaluator_name: string
          id: string
          nf: string | null
          number: string | null
          observation: string | null
          pct_missing: number
          pdf_path: string | null
          q1_conforme: boolean
          q2_prazo: boolean
          q3_quantidade: boolean
          q4_conservacao: boolean
          quality_issues: number
          request_id: string | null
          returned: boolean
          supplier: string
          total_points: number
          updated_at: string
        }
        Insert: {
          approved: boolean
          classification: Database["public"]["Enums"]["evaluation_class"]
          created_at?: string
          days_late?: number
          evaluation_date: string
          evaluator_id: string
          evaluator_name: string
          id?: string
          nf?: string | null
          number?: string | null
          observation?: string | null
          pct_missing?: number
          pdf_path?: string | null
          q1_conforme: boolean
          q2_prazo: boolean
          q3_quantidade: boolean
          q4_conservacao: boolean
          quality_issues?: number
          request_id?: string | null
          returned?: boolean
          supplier: string
          total_points: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          classification?: Database["public"]["Enums"]["evaluation_class"]
          created_at?: string
          days_late?: number
          evaluation_date?: string
          evaluator_id?: string
          evaluator_name?: string
          id?: string
          nf?: string | null
          number?: string | null
          observation?: string | null
          pct_missing?: number
          pdf_path?: string | null
          q1_conforme?: boolean
          q2_prazo?: boolean
          q3_quantidade?: boolean
          q4_conservacao?: boolean
          quality_issues?: number
          request_id?: string | null
          returned?: boolean
          supplier?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_evaluations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_sequences: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      sectors: {
        Row: {
          approver_id: string | null
          code: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          approver_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          approver_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_sector_approver: {
        Args: { _sector_id: string; _user_id: string }
        Returns: boolean
      }
      set_purchase_order: {
        Args: { p_number: string | null; p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "aprovador"
        | "solicitante"
        | "comprador"
        | "visualizador"
      evaluation_class: "otimo" | "bom" | "regular" | "insuficiente"
      request_priority: "baixa" | "media" | "alta"
      request_status:
        | "pendente"
        | "aprovado"
        | "parcial"
        | "comprado"
        | "negado"
        | "finalizado"
        | "cancelado"
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
      app_role: [
        "admin",
        "aprovador",
        "solicitante",
        "comprador",
        "visualizador",
      ],
      evaluation_class: ["otimo", "bom", "regular", "insuficiente"],
      request_priority: ["baixa", "media", "alta"],
      request_status: [
        "pendente",
        "aprovado",
        "parcial",
        "comprado",
        "negado",
        "finalizado",
        "cancelado",
      ],
    },
  },
} as const
