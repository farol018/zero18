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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          consumption_window_days: number
          coverage_days: number
          created_at: string | null
          id: string
          last_sync_at: string | null
          name: string
        }
        Insert: {
          consumption_window_days?: number
          coverage_days?: number
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          name: string
        }
        Update: {
          consumption_window_days?: number
          coverage_days?: number
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          name?: string
        }
        Relationships: []
      }
      consumption: {
        Row: {
          company_id: string
          consumption_date: string
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          source: string | null
        }
        Insert: {
          company_id: string
          consumption_date: string
          created_at?: string | null
          id?: string
          product_id: string
          quantity: number
          source?: string | null
        }
        Update: {
          company_id?: string
          consumption_date?: string
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumption_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "farol_inteligencia"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "consumption_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_normalized: {
        Row: {
          company_id: string
          consumption_date: string | null
          created_at: string | null
          id: string
          product_id: string | null
          quantity: number | null
          raw_id: string | null
          source_id: string | null
        }
        Insert: {
          company_id: string
          consumption_date?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number | null
          raw_id?: string | null
          source_id?: string | null
        }
        Update: {
          company_id?: string
          consumption_date?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number | null
          raw_id?: string | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumption_normalized_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      current_stock: {
        Row: {
          company_id: string
          product_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          product_id: string
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          company_id: string
          config: Json | null
          created_at: string | null
          id: string
          name: string | null
          type: string | null
        }
        Insert: {
          company_id: string
          config?: Json | null
          created_at?: string | null
          id?: string
          name?: string | null
          type?: string | null
        }
        Update: {
          company_id?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          name?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_items: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          import_id: string | null
          raw_data: Json | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          import_id?: string | null
          raw_data?: Json | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          import_id?: string | null
          raw_data?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          company_id: string
          config: Json | null
          created_at: string | null
          file_name: string | null
          finished_at: string | null
          id: string
          processed_at: string | null
          started_at: string | null
          status: string
          type: string
        }
        Insert: {
          company_id: string
          config?: Json | null
          created_at?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
          type: string
        }
        Update: {
          company_id?: string
          config?: Json | null
          created_at?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          processed_at?: string | null
          started_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_stock: {
        Row: {
          company_id: string | null
          external_id: string | null
          quantity: number | null
        }
        Insert: {
          company_id?: string | null
          external_id?: string | null
          quantity?: number | null
        }
        Update: {
          company_id?: string | null
          external_id?: string | null
          quantity?: number | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          company_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "farol_inteligencia"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string
          created_at: string | null
          external_reference: string | null
          id: string
          product_id: string
          quantity: number
          reference_id: string
          reference_type: string | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          external_reference?: string | null
          id?: string
          product_id: string
          quantity: number
          reference_id: string
          reference_type?: string | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          external_reference?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reference_id?: string
          reference_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "farol_inteligencia"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_external_mapping: {
        Row: {
          company_id: string
          created_at: string | null
          external_code: string
          id: string
          product_id: string | null
          source_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          external_code: string
          id?: string
          product_id?: string | null
          source_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          external_code?: string
          id?: string
          product_id?: string | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_external_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          company_id: string
          cost_price: number | null
          created_at: string | null
          external_id: string | null
          id: string
          name: string
          purchase_multiple: number | null
          sku: string | null
          supplier_id: string | null
          unit: string | null
        }
        Insert: {
          company_id: string
          cost_price?: number | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          name: string
          purchase_multiple?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit?: string | null
        }
        Update: {
          company_id?: string
          cost_price?: number | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          name?: string
          purchase_multiple?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "farol_pedido_fornecedor"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "fk_products_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id: string
          name?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          company_id: string
          id: string
          product_id: string | null
          purchase_id: string | null
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          company_id: string
          id?: string
          product_id?: string | null
          purchase_id?: string | null
          quantity: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string | null
          purchase_id?: string | null
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "farol_inteligencia"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          purchase_date: string
          supplier_id: string | null
          total: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          purchase_date: string
          supplier_id?: string | null
          total?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          purchase_date?: string
          supplier_id?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "farol_pedido_fornecedor"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_consumption_data: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          payload: Json
          processed: boolean | null
          source_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          source_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_consumption_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_consumption_data_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string
          created_at: string | null
          external_id: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      farol_inteligencia: {
        Row: {
          alerta: string | null
          consumo_medio_dia: number | null
          dias_estoque: number | null
          estoque_atual: number | null
          product_id: string | null
          product_name: string | null
          status_estoque: string | null
          sugestao_compra: number | null
        }
        Relationships: []
      }
      farol_lista_compra: {
        Row: {
          company_id: string | null
          consumo_dia: number | null
          dias_cobertura: number | null
          estoque_atual: number | null
          prioridade: number | null
          product_id: string | null
          product_name: string | null
          quantidade_sugerida: number | null
          status_farol: string | null
        }
        Relationships: []
      }
      farol_pedido_fornecedor: {
        Row: {
          consumo_dia: number | null
          dias_cobertura: number | null
          estoque_atual: number | null
          product_id: string | null
          product_name: string | null
          quantidade_sugerida: number | null
          status_farol: string | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Relationships: []
      }
      stock_analysis: {
        Row: {
          company_id: string | null
          consumo_7d: number | null
          consumo_dia: number | null
          cost_price: number | null
          dias_cobertura: number | null
          estoque_atual: number | null
          product_id: string | null
          product_name: string | null
          purchase_multiple: number | null
          quantidade_bruta: number | null
          quantidade_sugerida: number | null
          status_farol: string | null
        }
        Relationships: []
      }
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
    Enums: {},
  },
} as const
