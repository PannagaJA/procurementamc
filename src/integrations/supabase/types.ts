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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          prefix: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          prefix?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          prefix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          name: string
          prefix: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          prefix?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          prefix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          approval_letter_date: string | null
          approval_letter_photo_url: string | null
          approval_letter_ref: string | null
          asset_type: string | null
          category_id: string | null
          cost_per_unit: number | null
          created_at: string
          created_by: string | null
          department: string | null
          department_id: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          invoice_date: string | null
          invoice_no: string | null
          invoice_photo_url: string | null
          item_code: string | null
          item_name: string
          item_photo_url: string | null
          location_id: string | null
          qr_code_url: string | null
          quantity_available: number
          remarks: string | null
          room_no: string | null
          sl_no: number
          specifications: string | null
          status: string
          total_cost: number | null
          updated_at: string
          vendor_address: string | null
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          approval_letter_date?: string | null
          approval_letter_photo_url?: string | null
          approval_letter_ref?: string | null
          asset_type?: string | null
          category_id?: string | null
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          department_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          invoice_photo_url?: string | null
          item_code?: string | null
          item_name: string
          item_photo_url?: string | null
          location_id?: string | null
          qr_code_url?: string | null
          quantity_available?: number
          remarks?: string | null
          room_no?: string | null
          sl_no?: number
          specifications?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          vendor_address?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          approval_letter_date?: string | null
          approval_letter_photo_url?: string | null
          approval_letter_ref?: string | null
          asset_type?: string | null
          category_id?: string | null
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          department_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          invoice_photo_url?: string | null
          item_code?: string | null
          item_name?: string
          item_photo_url?: string | null
          location_id?: string | null
          qr_code_url?: string | null
          quantity_available?: number
          remarks?: string | null
          room_no?: string | null
          sl_no?: number
          specifications?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          vendor_address?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_history: {
        Row: {
          action: string | null
          changed_by: string | null
          created_at: string
          details: Json | null
          id: string
          inventory_id: string
        }
        Insert: {
          action?: string | null
          changed_by?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          inventory_id: string
        }
        Update: {
          action?: string | null
          changed_by?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          inventory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_history_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          author: string | null
          available: number
          category: string | null
          created_at: string
          id: string
          isbn: string | null
          quantity: number
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          available?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          quantity?: number
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          available?: number
          category?: string | null
          created_at?: string
          id?: string
          isbn?: string | null
          quantity?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      library_issues: {
        Row: {
          book_id: string
          created_at: string
          due_date: string | null
          id: string
          issue_date: string
          member_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          member_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_issues_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "library_members"
            referencedColumns: ["id"]
          },
        ]
      }
      library_members: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          building: string | null
          created_at: string
          id: string
          name: string
          prefix: string | null
          updated_at: string
        }
        Insert: {
          building?: string | null
          created_at?: string
          id?: string
          name: string
          prefix?: string | null
          updated_at?: string
        }
        Update: {
          building?: string | null
          created_at?: string
          id?: string
          name?: string
          prefix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: Json | null
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: Json | null
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: Json | null
          read?: boolean
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotation_responses: {
        Row: {
          company_email: string | null
          description: string | null
          id: string
          quotation_id: string
          quotation_validity: string | null
          submitted_at: string
          terms_accepted: boolean | null
          total_amount: number | null
        }
        Insert: {
          company_email?: string | null
          description?: string | null
          id?: string
          quotation_id: string
          quotation_validity?: string | null
          submitted_at?: string
          terms_accepted?: boolean | null
          total_amount?: number | null
        }
        Update: {
          company_email?: string | null
          description?: string | null
          id?: string
          quotation_id?: string
          quotation_validity?: string | null
          submitted_at?: string
          terms_accepted?: boolean | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_responses_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: true
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          admin_status: string | null
          category_id: string | null
          company_email: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_reply_date: string | null
          product_name: string | null
          quantity: number | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_status?: string | null
          category_id?: string | null
          company_email: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_reply_date?: string | null
          product_name?: string | null
          quantity?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_status?: string | null
          category_id?: string | null
          company_email?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_reply_date?: string | null
          product_name?: string | null
          quantity?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_updates: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          status_from: string | null
          status_to: string | null
          ticket_id: string
          updated_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          status_from?: string | null
          status_to?: string | null
          ticket_id: string
          updated_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          status_from?: string | null
          status_to?: string | null
          ticket_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_updates_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          department: string | null
          email: string | null
          id: string
          issue_category: string | null
          issue_description: string | null
          name: string | null
          priority: string
          status: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          id?: string
          issue_category?: string | null
          issue_description?: string | null
          name?: string | null
          priority?: string
          status?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          id?: string
          issue_category?: string | null
          issue_description?: string | null
          name?: string | null
          priority?: string
          status?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_ticket_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "principle"
        | "principal"
        | "hod"
        | "librarian"
        | "viewer"
        | "user"
      ticket_priority: "low" | "medium" | "high"
      ticket_status:
        | "pending"
        | "in-progress"
        | "waiting-for-user"
        | "resolved"
        | "completed"
        | "pending_principal"
        | "procure-in-progress"
        | "procure-completed"
        | "procure-approved"
        | "procure-rejected"
        | "service-approved"
        | "service-rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "principle",
        "principal",
        "hod",
        "librarian",
        "viewer",
        "user",
      ],
      ticket_priority: ["low", "medium", "high"],
      ticket_status: [
        "pending",
        "in-progress",
        "waiting-for-user",
        "resolved",
        "completed",
        "pending_principal",
        "procure-in-progress",
        "procure-completed",
        "procure-approved",
        "procure-rejected",
        "service-approved",
        "service-rejected",
      ],
    },
  },
} as const
