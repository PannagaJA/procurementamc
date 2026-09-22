export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      approval_matrix_rules: {
        Row: {
          active: boolean | null;
          approval_role: string;
          category: string;
          created_at: string;
          id: string;
          method: string | null;
          min_quotations: number | null;
          per_month_limit: number | null;
          per_txn_limit: number | null;
          requires_rate_contract: boolean | null;
        };
        Insert: {
          active?: boolean | null;
          approval_role: string;
          category: string;
          created_at?: string;
          id?: string;
          method?: string | null;
          min_quotations?: number | null;
          per_month_limit?: number | null;
          per_txn_limit?: number | null;
          requires_rate_contract?: boolean | null;
        };
        Update: {
          active?: boolean | null;
          approval_role?: string;
          category?: string;
          created_at?: string;
          id?: string;
          method?: string | null;
          min_quotations?: number | null;
          per_month_limit?: number | null;
          per_txn_limit?: number | null;
          requires_rate_contract?: boolean | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          id: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          prefix: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      department_monthly_spend: {
        Row: {
          category: string;
          created_at: string;
          department_id: string;
          id: string;
          month: string;
          total_spent: number;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          department_id: string;
          id?: string;
          month: string;
          total_spent?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          department_id?: string;
          id?: string;
          month?: string;
          total_spent?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_monthly_spend_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          location_id: string | null;
          name: string;
          prefix: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          location_id?: string | null;
          name: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          location_id?: string | null;
          name?: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      deviation_approvals: {
        Row: {
          approved_at: string;
          approved_by: string | null;
          id: string;
          justification: string;
          po_id: string | null;
          pr_id: string | null;
          risk_assessment: string | null;
        };
        Insert: {
          approved_at?: string;
          approved_by?: string | null;
          id?: string;
          justification: string;
          po_id?: string | null;
          pr_id?: string | null;
          risk_assessment?: string | null;
        };
        Update: {
          approved_at?: string;
          approved_by?: string | null;
          id?: string;
          justification?: string;
          po_id?: string | null;
          pr_id?: string | null;
          risk_assessment?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deviation_approvals_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory: {
        Row: {
          approval_letter_date: string | null;
          approval_letter_photo_url: string | null;
          approval_letter_ref: string | null;
          asset_type: string | null;
          category_id: string | null;
          cost_per_unit: number | null;
          created_at: string;
          created_by: string | null;
          department: string | null;
          department_id: string | null;
          gps_latitude: number | null;
          gps_longitude: number | null;
          id: string;
          invoice_date: string | null;
          invoice_no: string | null;
          invoice_photo_url: string | null;
          item_code: string | null;
          item_name: string;
          item_photo_url: string | null;
          location_id: string | null;
          qr_code_url: string | null;
          quantity_available: number;
          remarks: string | null;
          room_no: string | null;
          sl_no: number;
          specifications: string | null;
          status: string;
          total_cost: number | null;
          updated_at: string;
          vendor_address: string | null;
          vendor_contact: string | null;
          vendor_name: string | null;
        };
        Insert: {
          approval_letter_date?: string | null;
          approval_letter_photo_url?: string | null;
          approval_letter_ref?: string | null;
          asset_type?: string | null;
          category_id?: string | null;
          cost_per_unit?: number | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          department_id?: string | null;
          gps_latitude?: number | null;
          gps_longitude?: number | null;
          id?: string;
          invoice_date?: string | null;
          invoice_no?: string | null;
          invoice_photo_url?: string | null;
          item_code?: string | null;
          item_name: string;
          item_photo_url?: string | null;
          location_id?: string | null;
          qr_code_url?: string | null;
          quantity_available?: number;
          remarks?: string | null;
          room_no?: string | null;
          sl_no?: number;
          specifications?: string | null;
          status?: string;
          total_cost?: number | null;
          updated_at?: string;
          vendor_address?: string | null;
          vendor_contact?: string | null;
          vendor_name?: string | null;
        };
        Update: {
          approval_letter_date?: string | null;
          approval_letter_photo_url?: string | null;
          approval_letter_ref?: string | null;
          asset_type?: string | null;
          category_id?: string | null;
          cost_per_unit?: number | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          department_id?: string | null;
          gps_latitude?: number | null;
          gps_longitude?: number | null;
          id?: string;
          invoice_date?: string | null;
          invoice_no?: string | null;
          invoice_photo_url?: string | null;
          item_code?: string | null;
          item_name?: string;
          item_photo_url?: string | null;
          location_id?: string | null;
          qr_code_url?: string | null;
          quantity_available?: number;
          remarks?: string | null;
          room_no?: string | null;
          sl_no?: number;
          specifications?: string | null;
          status?: string;
          total_cost?: number | null;
          updated_at?: string;
          vendor_address?: string | null;
          vendor_contact?: string | null;
          vendor_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_history: {
        Row: {
          action: string | null;
          changed_by: string | null;
          created_at: string;
          details: Json | null;
          id: string;
          inventory_id: string;
        };
        Insert: {
          action?: string | null;
          changed_by?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          inventory_id: string;
        };
        Update: {
          action?: string | null;
          changed_by?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          inventory_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_history_inventory_id_fkey";
            columns: ["inventory_id"];
            isOneToOne: false;
            referencedRelation: "inventory";
            referencedColumns: ["id"];
          },
        ];
      };
      library_books: {
        Row: {
          author: string | null;
          available: number;
          category: string | null;
          created_at: string;
          id: string;
          isbn: string | null;
          quantity: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          author?: string | null;
          available?: number;
          category?: string | null;
          created_at?: string;
          id?: string;
          isbn?: string | null;
          quantity?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          author?: string | null;
          available?: number;
          category?: string | null;
          created_at?: string;
          id?: string;
          isbn?: string | null;
          quantity?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      library_issues: {
        Row: {
          book_id: string;
          created_at: string;
          due_date: string | null;
          id: string;
          issue_date: string;
          member_id: string;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          issue_date?: string;
          member_id: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          issue_date?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_issues_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "library_books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_issues_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "library_members";
            referencedColumns: ["id"];
          },
        ];
      };
      library_members: {
        Row: {
          address: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          building: string | null;
          created_at: string;
          id: string;
          name: string;
          prefix: string | null;
          updated_at: string;
        };
        Insert: {
          building?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Update: {
          building?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          prefix?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          meta: Json | null;
          read: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          meta?: Json | null;
          read?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          meta?: Json | null;
          read?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      pr_approvals: {
        Row: {
          approver_id: string | null;
          approver_role: string;
          decided_at: string;
          decision: string;
          id: string;
          pr_id: string;
          remarks: string | null;
          stage: string;
        };
        Insert: {
          approver_id?: string | null;
          approver_role: string;
          decided_at?: string;
          decision: string;
          id?: string;
          pr_id: string;
          remarks?: string | null;
          stage: string;
        };
        Update: {
          approver_id?: string | null;
          approver_role?: string;
          decided_at?: string;
          decision?: string;
          id?: string;
          pr_id?: string;
          remarks?: string | null;
          stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pr_approvals_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      pr_line_items: {
        Row: {
          created_at: string;
          description: string;
          est_total: number;
          est_unit_price: number;
          id: string;
          net_qty_to_procure: number;
          pr_id: string;
          qty_in_stock: number;
          qty_required: number;
          unit: string | null;
        };
        Insert: {
          created_at?: string;
          description: string;
          est_total?: number;
          est_unit_price?: number;
          id?: string;
          net_qty_to_procure?: number;
          pr_id: string;
          qty_in_stock?: number;
          qty_required?: number;
          unit?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string;
          est_total?: number;
          est_unit_price?: number;
          id?: string;
          net_qty_to_procure?: number;
          pr_id?: string;
          qty_in_stock?: number;
          qty_required?: number;
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pr_line_items_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      procurement_config: {
        Row: {
          description: string | null;
          key: string;
          value: string;
        };
        Insert: {
          description?: string | null;
          key: string;
          value: string;
        };
        Update: {
          description?: string | null;
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_requisitions: {
        Row: {
          budget_head: string | null;
          category: string;
          created_at: string;
          current_approver_role: string | null;
          department_id: string | null;
          estimated_value: number;
          id: string;
          is_emergency: boolean;
          is_recurring: boolean;
          justification: string | null;
          market_survey_notes: string | null;
          pr_number: string | null;
          recurring_frequency: string | null;
          requested_by: string | null;
          routing_reason: string | null;
          scope: string;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          budget_head?: string | null;
          category: string;
          created_at?: string;
          current_approver_role?: string | null;
          department_id?: string | null;
          estimated_value?: number;
          id?: string;
          is_emergency?: boolean;
          is_recurring?: boolean;
          justification?: string | null;
          market_survey_notes?: string | null;
          pr_number?: string | null;
          recurring_frequency?: string | null;
          requested_by?: string | null;
          routing_reason?: string | null;
          scope: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          budget_head?: string | null;
          category?: string;
          created_at?: string;
          current_approver_role?: string | null;
          department_id?: string | null;
          estimated_value?: number;
          id?: string;
          is_emergency?: boolean;
          is_recurring?: boolean;
          justification?: string | null;
          market_survey_notes?: string | null;
          pr_number?: string | null;
          recurring_frequency?: string | null;
          requested_by?: string | null;
          routing_reason?: string | null;
          scope?: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      quotation_responses: {
        Row: {
          company_email: string | null;
          description: string | null;
          id: string;
          quotation_id: string;
          quotation_validity: string | null;
          submitted_at: string;
          terms_accepted: boolean | null;
          total_amount: number | null;
        };
        Insert: {
          company_email?: string | null;
          description?: string | null;
          id?: string;
          quotation_id: string;
          quotation_validity?: string | null;
          submitted_at?: string;
          terms_accepted?: boolean | null;
          total_amount?: number | null;
        };
        Update: {
          company_email?: string | null;
          description?: string | null;
          id?: string;
          quotation_id?: string;
          quotation_validity?: string | null;
          submitted_at?: string;
          terms_accepted?: boolean | null;
          total_amount?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "quotation_responses_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: true;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
        ];
      };
      quotations: {
        Row: {
          admin_status: string | null;
          category_id: string | null;
          company_email: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          last_reply_date: string | null;
          product_name: string | null;
          quantity: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_status?: string | null;
          category_id?: string | null;
          company_email: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          last_reply_date?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_status?: string | null;
          category_id?: string | null;
          company_email?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          last_reply_date?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_updates: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          id: string;
          status_from: string | null;
          status_to: string | null;
          ticket_id: string;
          updated_by: string | null;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          status_from?: string | null;
          status_to?: string | null;
          ticket_id: string;
          updated_by?: string | null;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          id?: string;
          status_from?: string | null;
          status_to?: string | null;
          ticket_id?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_updates_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          assigned_to: string | null;
          category: string | null;
          contact_number: string | null;
          created_at: string;
          created_by: string | null;
          department: string | null;
          email: string | null;
          id: string;
          issue_category: string | null;
          issue_description: string | null;
          name: string | null;
          priority: string;
          status: string;
          ticket_number: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          category?: string | null;
          contact_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          email?: string | null;
          id?: string;
          issue_category?: string | null;
          issue_description?: string | null;
          name?: string | null;
          priority?: string;
          status?: string;
          ticket_number?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string | null;
          contact_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          email?: string | null;
          id?: string;
          issue_category?: string | null;
          issue_description?: string | null;
          name?: string | null;
          priority?: string;
          status?: string;
          ticket_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          approval_notes: string | null;
          created_at: string;
          department_id: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          approval_notes?: string | null;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          approval_notes?: string | null;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_blacklist: {
        Row: {
          blacklisted_at: string;
          blacklisted_by: string | null;
          id: string;
          reason: string;
          vendor_id: string;
        };
        Insert: {
          blacklisted_at?: string;
          blacklisted_by?: string | null;
          id?: string;
          reason: string;
          vendor_id: string;
        };
        Update: {
          blacklisted_at?: string;
          blacklisted_by?: string | null;
          id?: string;
          reason?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_blacklist_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_documents: {
        Row: {
          doc_type: string;
          file_url: string;
          id: string;
          uploaded_at: string;
          vendor_id: string;
        };
        Insert: {
          doc_type: string;
          file_url: string;
          id?: string;
          uploaded_at?: string;
          vendor_id: string;
        };
        Update: {
          doc_type?: string;
          file_url?: string;
          id?: string;
          uploaded_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_evaluations: {
        Row: {
          decided_at: string;
          decided_by: string | null;
          decision: string;
          experience_past_performance: number | null;
          financial_reasonableness: number | null;
          id: string;
          notes: string | null;
          service_support: number | null;
          technical_capability: number | null;
          vendor_id: string;
        };
        Insert: {
          decided_at?: string;
          decided_by?: string | null;
          decision: string;
          experience_past_performance?: number | null;
          financial_reasonableness?: number | null;
          id?: string;
          notes?: string | null;
          service_support?: number | null;
          technical_capability?: number | null;
          vendor_id: string;
        };
        Update: {
          decided_at?: string;
          decided_by?: string | null;
          decision?: string;
          experience_past_performance?: number | null;
          financial_reasonableness?: number | null;
          id?: string;
          notes?: string | null;
          service_support?: number | null;
          technical_capability?: number | null;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_evaluations_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendors: {
        Row: {
          bank_details_json: Json | null;
          created_at: string;
          created_by: string | null;
          empanelled_on: string | null;
          empanelment_expiry: string | null;
          gst_number: string | null;
          id: string;
          name: string;
          pan_number: string | null;
          registered_address: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          bank_details_json?: Json | null;
          created_at?: string;
          created_by?: string | null;
          empanelled_on?: string | null;
          empanelment_expiry?: string | null;
          gst_number?: string | null;
          id?: string;
          name: string;
          pan_number?: string | null;
          registered_address?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          bank_details_json?: Json | null;
          created_at?: string;
          created_by?: string | null;
          empanelled_on?: string | null;
          empanelment_expiry?: string | null;
          gst_number?: string | null;
          id?: string;
          name?: string;
          pan_number?: string | null;
          registered_address?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_contracts: {
        Row: {
          approved_rates_json: Json;
          category: string;
          contract_number: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          title: string;
          updated_at: string;
          valid_from: string;
          valid_to: string;
          vendor_id: string;
        };
        Insert: {
          approved_rates_json?: Json;
          category: string;
          contract_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          title: string;
          updated_at?: string;
          valid_from: string;
          valid_to: string;
          vendor_id: string;
        };
        Update: {
          approved_rates_json?: Json;
          category?: string;
          contract_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          title?: string;
          updated_at?: string;
          valid_from?: string;
          valid_to?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rate_contracts_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      rfqs: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          pr_id: string;
          required_min_quotations: number;
          response_deadline: string | null;
          rfq_number: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          pr_id: string;
          required_min_quotations?: number;
          response_deadline?: string | null;
          rfq_number?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          pr_id?: string;
          required_min_quotations?: number;
          response_deadline?: string | null;
          rfq_number?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfqs_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
        ];
      };
      rfq_vendors: {
        Row: {
          created_at: string;
          id: string;
          response_received_at: string | null;
          rfq_id: string;
          sent_at: string | null;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          response_received_at?: string | null;
          rfq_id: string;
          sent_at?: string | null;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          response_received_at?: string | null;
          rfq_id?: string;
          sent_at?: string | null;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rfq_vendors_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rfq_vendors_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      quotation_lines: {
        Row: {
          created_at: string;
          delivery_days: number | null;
          description: string;
          id: string;
          meets_technical_spec: boolean;
          pr_line_item_id: string | null;
          quantity: number;
          quotation_ref: string | null;
          rfq_id: string;
          submitted_at: string;
          tax_amount: number;
          technical_remarks: string | null;
          total_price: number;
          unit: string | null;
          unit_price: number;
          vendor_id: string;
          warranty_months: number | null;
        };
        Insert: {
          created_at?: string;
          delivery_days?: number | null;
          description: string;
          id?: string;
          meets_technical_spec?: boolean;
          pr_line_item_id?: string | null;
          quantity?: number;
          quotation_ref?: string | null;
          rfq_id: string;
          submitted_at?: string;
          tax_amount?: number;
          technical_remarks?: string | null;
          total_price?: number;
          unit?: string | null;
          unit_price?: number;
          vendor_id: string;
          warranty_months?: number | null;
        };
        Update: {
          created_at?: string;
          delivery_days?: number | null;
          description?: string;
          id?: string;
          meets_technical_spec?: boolean;
          pr_line_item_id?: string | null;
          quantity?: number;
          quotation_ref?: string | null;
          rfq_id?: string;
          submitted_at?: string;
          tax_amount?: number;
          technical_remarks?: string | null;
          total_price?: number;
          unit?: string | null;
          unit_price?: number;
          vendor_id?: string;
          warranty_months?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "quotation_lines_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotation_lines_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      comparative_statements: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          cs_number: string | null;
          current_approver_role: string | null;
          id: string;
          is_lowest_price: boolean;
          negotiation_notes: string | null;
          non_lowest_rationale: string | null;
          pr_id: string | null;
          prepared_by: string | null;
          price_reasonableness_notes: string | null;
          recommended_total: number | null;
          recommended_vendor_id: string | null;
          rejection_remarks: string | null;
          rfq_id: string;
          routing_reason: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          cs_number?: string | null;
          current_approver_role?: string | null;
          id?: string;
          is_lowest_price?: boolean;
          negotiation_notes?: string | null;
          non_lowest_rationale?: string | null;
          pr_id?: string | null;
          prepared_by?: string | null;
          price_reasonableness_notes?: string | null;
          recommended_total?: number | null;
          recommended_vendor_id?: string | null;
          rejection_remarks?: string | null;
          rfq_id: string;
          routing_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          cs_number?: string | null;
          current_approver_role?: string | null;
          id?: string;
          is_lowest_price?: boolean;
          negotiation_notes?: string | null;
          non_lowest_rationale?: string | null;
          pr_id?: string | null;
          prepared_by?: string | null;
          price_reasonableness_notes?: string | null;
          recommended_total?: number | null;
          recommended_vendor_id?: string | null;
          rejection_remarks?: string | null;
          rfq_id?: string;
          routing_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comparative_statements_rfq_id_fkey";
            columns: ["rfq_id"];
            isOneToOne: false;
            referencedRelation: "rfqs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comparative_statements_recommended_vendor_id_fkey";
            columns: ["recommended_vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      cs_line_scores: {
        Row: {
          created_at: string;
          cs_id: string;
          delivery_score: number | null;
          id: string;
          notes: string | null;
          price_score: number | null;
          quoted_total: number;
          rank: number | null;
          technical_score: number | null;
          total_score: number | null;
          vendor_id: string;
          warranty_score: number | null;
        };
        Insert: {
          created_at?: string;
          cs_id: string;
          delivery_score?: number | null;
          id?: string;
          notes?: string | null;
          price_score?: number | null;
          quoted_total?: number;
          rank?: number | null;
          technical_score?: number | null;
          total_score?: number | null;
          vendor_id: string;
          warranty_score?: number | null;
        };
        Update: {
          created_at?: string;
          cs_id?: string;
          delivery_score?: number | null;
          id?: string;
          notes?: string | null;
          price_score?: number | null;
          quoted_total?: number;
          rank?: number | null;
          technical_score?: number | null;
          total_score?: number | null;
          vendor_id?: string;
          warranty_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cs_line_scores_cs_id_fkey";
            columns: ["cs_id"];
            isOneToOne: false;
            referencedRelation: "comparative_statements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cs_line_scores_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          cs_id: string | null;
          current_approver_role: string | null;
          delivery_timeline: string | null;
          department_id: string | null;
          id: string;
          issued_at: string | null;
          original_approver_role: string | null;
          payment_terms: string | null;
          po_number: string | null;
          pr_id: string;
          price: number;
          rate_contract_id: string | null;
          routing_reason: string | null;
          scope_of_supply: string | null;
          status: string;
          taxes: number;
          total_value: number;
          type: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          cs_id?: string | null;
          current_approver_role?: string | null;
          delivery_timeline?: string | null;
          department_id?: string | null;
          id?: string;
          issued_at?: string | null;
          original_approver_role?: string | null;
          payment_terms?: string | null;
          po_number?: string | null;
          pr_id: string;
          price?: number;
          rate_contract_id?: string | null;
          routing_reason?: string | null;
          scope_of_supply?: string | null;
          status?: string;
          taxes?: number;
          type: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          cs_id?: string | null;
          current_approver_role?: string | null;
          delivery_timeline?: string | null;
          department_id?: string | null;
          id?: string;
          issued_at?: string | null;
          original_approver_role?: string | null;
          payment_terms?: string | null;
          po_number?: string | null;
          pr_id?: string;
          price?: number;
          rate_contract_id?: string | null;
          routing_reason?: string | null;
          scope_of_supply?: string | null;
          status?: string;
          taxes?: number;
          type?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_cs_id_fkey";
            columns: ["cs_id"];
            isOneToOne: false;
            referencedRelation: "comparative_statements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      po_amendments: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          changed_fields_json: Json | null;
          created_at: string;
          created_by: string | null;
          id: string;
          new_approver_role: string | null;
          new_value_total: number;
          old_value_total: number;
          original_approver_role: string | null;
          po_id: string;
          reason: string;
          requires_reapproval: boolean;
          status: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          changed_fields_json?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          new_approver_role?: string | null;
          new_value_total: number;
          old_value_total: number;
          original_approver_role?: string | null;
          po_id: string;
          reason: string;
          requires_reapproval?: boolean;
          status?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          changed_fields_json?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          new_approver_role?: string | null;
          new_value_total?: number;
          old_value_total?: number;
          original_approver_role?: string | null;
          po_id?: string;
          reason?: string;
          requires_reapproval?: boolean;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "po_amendments_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_challans: {
        Row: {
          carrier_details: string | null;
          challan_number: string | null;
          created_at: string;
          id: string;
          items_json: Json;
          packages_count: number | null;
          po_id: string;
          received_at: string;
          received_by: string | null;
          remarks: string | null;
          updated_at: string;
          vendor_id: string | null;
        };
        Insert: {
          carrier_details?: string | null;
          challan_number?: string | null;
          created_at?: string;
          id?: string;
          items_json?: Json;
          packages_count?: number | null;
          po_id: string;
          received_at?: string;
          received_by?: string | null;
          remarks?: string | null;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          carrier_details?: string | null;
          challan_number?: string | null;
          created_at?: string;
          id?: string;
          items_json?: Json;
          packages_count?: number | null;
          po_id?: string;
          received_at?: string;
          received_by?: string | null;
          remarks?: string | null;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_challans_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_challans_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      grns: {
        Row: {
          accepted_value: number;
          created_at: string;
          delivery_challan_id: string;
          grn_number: string | null;
          id: string;
          po_id: string;
          prepared_at: string;
          prepared_by: string | null;
          rejection_reason: string | null;
          requires_technical_inspection: boolean;
          security_verified_at: string | null;
          security_verified_by: string | null;
          status: string;
          technical_verified_at: string | null;
          technical_verified_by: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_value?: number;
          created_at?: string;
          delivery_challan_id: string;
          grn_number?: string | null;
          id?: string;
          po_id: string;
          prepared_at?: string;
          prepared_by?: string | null;
          rejection_reason?: string | null;
          requires_technical_inspection?: boolean;
          security_verified_at?: string | null;
          security_verified_by?: string | null;
          status?: string;
          technical_verified_at?: string | null;
          technical_verified_by?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_value?: number;
          created_at?: string;
          delivery_challan_id?: string;
          grn_number?: string | null;
          id?: string;
          po_id?: string;
          prepared_at?: string;
          prepared_by?: string | null;
          rejection_reason?: string | null;
          requires_technical_inspection?: boolean;
          security_verified_at?: string | null;
          security_verified_by?: string | null;
          status?: string;
          technical_verified_at?: string | null;
          technical_verified_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grns_delivery_challan_id_fkey";
            columns: ["delivery_challan_id"];
            isOneToOne: false;
            referencedRelation: "delivery_challans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grns_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      grn_lines: {
        Row: {
          accepted_total: number;
          created_at: string;
          description: string;
          grn_id: string;
          id: string;
          inspection_remarks: string | null;
          qty_accepted: number;
          qty_delivered: number;
          qty_rejected: number;
          unit: string | null;
          unit_price: number;
        };
        Insert: {
          accepted_total?: number;
          created_at?: string;
          description: string;
          grn_id: string;
          id?: string;
          inspection_remarks?: string | null;
          qty_accepted?: number;
          qty_delivered?: number;
          qty_rejected?: number;
          unit?: string | null;
          unit_price?: number;
        };
        Update: {
          accepted_total?: number;
          created_at?: string;
          description?: string;
          grn_id?: string;
          id?: string;
          inspection_remarks?: string | null;
          qty_accepted?: number;
          qty_delivered?: number;
          qty_rejected?: number;
          unit?: string | null;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "grn_lines_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "grns";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          grn_id: string | null;
          gst_details_json: Json | null;
          hold_reason: string | null;
          id: string;
          invoice_amount: number;
          invoice_number: string;
          is_duplicate_check_passed: boolean;
          is_service_po: boolean;
          match_status: string;
          po_id: string;
          service_completion_cert_url: string | null;
          submitted_at: string;
          submitted_by: string | null;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          grn_id?: string | null;
          gst_details_json?: Json | null;
          hold_reason?: string | null;
          id?: string;
          invoice_amount: number;
          invoice_number: string;
          is_duplicate_check_passed?: boolean;
          is_service_po?: boolean;
          match_status?: string;
          po_id: string;
          service_completion_cert_url?: string | null;
          submitted_at?: string;
          submitted_by?: string | null;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          grn_id?: string | null;
          gst_details_json?: Json | null;
          hold_reason?: string | null;
          id?: string;
          invoice_amount?: number;
          invoice_number?: string;
          is_duplicate_check_passed?: boolean;
          is_service_po?: boolean;
          match_status?: string;
          po_id?: string;
          service_completion_cert_url?: string | null;
          submitted_at?: string;
          submitted_by?: string | null;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_grn_id_fkey";
            columns: ["grn_id"];
            isOneToOne: false;
            referencedRelation: "grns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string;
          external_ref: string | null;
          id: string;
          invoice_id: string;
          paid_at: string;
          paid_by: string | null;
          payment_mode: string;
          payment_terms_ref: string | null;
          po_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          external_ref?: string | null;
          id?: string;
          invoice_id: string;
          paid_at?: string;
          paid_by?: string | null;
          payment_mode?: string;
          payment_terms_ref?: string | null;
          po_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          external_ref?: string | null;
          id?: string;
          invoice_id?: string;
          paid_at?: string;
          paid_by?: string | null;
          payment_mode?: string;
          payment_terms_ref?: string | null;
          po_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      emergency_annual_ledger: {
        Row: {
          cap_limit: number;
          financial_year: string;
          id: string;
          running_total: number;
          updated_at: string;
        };
        Insert: {
          cap_limit?: number;
          financial_year: string;
          id?: string;
          running_total?: number;
          updated_at?: string;
        };
        Update: {
          cap_limit?: number;
          financial_year?: string;
          id?: string;
          running_total?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      emergency_procurements: {
        Row: {
          created_at: string;
          department_id: string | null;
          description: string;
          emergency_number: string | null;
          estimated_cost: number;
          evp_approval_status: string;
          evp_approved_at: string | null;
          evp_approved_by: string | null;
          financial_year: string;
          id: string;
          is_post_facto: boolean;
          price_reasonableness_note: string | null;
          pr_id: string | null;
          quotations_obtained_count: number | null;
          reason_standard_process_failed: string;
          register_entry_at: string;
          rejection_remarks: string | null;
          requested_by: string | null;
          updated_at: string;
          vendor_id: string | null;
        };
        Insert: {
          created_at?: string;
          department_id?: string | null;
          description: string;
          emergency_number?: string | null;
          estimated_cost: number;
          evp_approval_status?: string;
          evp_approved_at?: string | null;
          evp_approved_by?: string | null;
          financial_year: string;
          id?: string;
          is_post_facto?: boolean;
          price_reasonableness_note?: string | null;
          pr_id?: string | null;
          quotations_obtained_count?: number | null;
          reason_standard_process_failed: string;
          register_entry_at?: string;
          rejection_remarks?: string | null;
          requested_by?: string | null;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          description?: string;
          emergency_number?: string | null;
          estimated_cost?: number;
          evp_approval_status?: string;
          evp_approved_at?: string | null;
          evp_approved_by?: string | null;
          financial_year?: string;
          id?: string;
          is_post_facto?: boolean;
          price_reasonableness_note?: string | null;
          pr_id?: string | null;
          quotations_obtained_count?: number | null;
          reason_standard_process_failed?: string;
          register_entry_at?: string;
          rejection_remarks?: string | null;
          requested_by?: string | null;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "emergency_procurements_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emergency_procurements_pr_id_fkey";
            columns: ["pr_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requisitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emergency_procurements_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_ratings: {
        Row: {
          countersigned_by: string | null;
          created_at: string;
          evp_approved_by: string | null;
          id: string;
          notes: string | null;
          outcome: string;
          review_period: string;
          reviewed_by: string | null;
          section_a_score: number;
          section_b_score: number;
          section_c_score: number;
          section_d_score: number;
          section_e_score: number | null;
          section_f_score: number;
          updated_at: string;
          vendor_id: string;
          weighted_score: number;
        };
        Insert: {
          countersigned_by?: string | null;
          created_at?: string;
          evp_approved_by?: string | null;
          id?: string;
          notes?: string | null;
          outcome: string;
          review_period: string;
          reviewed_by?: string | null;
          section_a_score: number;
          section_b_score: number;
          section_c_score: number;
          section_d_score: number;
          section_e_score?: number | null;
          section_f_score: number;
          updated_at?: string;
          vendor_id: string;
          weighted_score: number;
        };
        Update: {
          countersigned_by?: string | null;
          created_at?: string;
          evp_approved_by?: string | null;
          id?: string;
          notes?: string | null;
          outcome?: string;
          review_period?: string;
          reviewed_by?: string | null;
          section_a_score?: number;
          section_b_score?: number;
          section_c_score?: number;
          section_d_score?: number;
          section_e_score?: number | null;
          section_f_score?: number;
          updated_at?: string;
          vendor_id?: string;
          weighted_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_ratings_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_challan_number: { Args: never; Returns: string };
      generate_cs_number: { Args: never; Returns: string };
      generate_emergency_number: { Args: never; Returns: string };
      generate_grn_number: { Args: never; Returns: string };
      generate_po_number: { Args: never; Returns: string };
      generate_pr_number: { Args: never; Returns: string };
      generate_rfq_number: { Args: never; Returns: string };
      generate_ticket_number: { Args: never; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role:
        | "admin"
        | "principle"
        | "principal"
        | "hod"
        | "librarian"
        | "viewer"
        | "user"
        | "evp"
        | "director_admin_finance"
        | "purchase_committee"
        | "procurement_officer"
        | "procurement_executive"
        | "stores"
        | "finance";
      ticket_priority: "low" | "medium" | "high";
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
        | "service-rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;
