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
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          purpose: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          purpose?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          purpose?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          assigned_to: string | null
          call_to_action: string | null
          campaign_id: string | null
          caption: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          created_by: string | null
          hashtags: string[]
          id: string
          meta_publish_ready: boolean
          notes: string | null
          on_screen_text: string | null
          posted_date: string | null
          product_id: string | null
          reviewer: string | null
          scheduled_date: string | null
          short_caption: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          meta_publish_ready?: boolean
          notes?: string | null
          on_screen_text?: string | null
          posted_date?: string | null
          product_id?: string | null
          reviewer?: string | null
          scheduled_date?: string | null
          short_caption?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          call_to_action?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          meta_publish_ready?: boolean
          notes?: string | null
          on_screen_text?: string | null
          posted_date?: string | null
          product_id?: string | null
          reviewer?: string | null
          scheduled_date?: string | null
          short_caption?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      content_media: {
        Row: {
          content_item_id: string
          id: string
          media_asset_id: string
          sort_order: number
        }
        Insert: {
          content_item_id: string
          id?: string
          media_asset_id: string
          sort_order?: number
        }
        Update: {
          content_item_id?: string
          id?: string
          media_asset_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_media_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_media_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      content_platforms: {
        Row: {
          content_item_id: string
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["platform"]
          post_url: string | null
          posted_at: string | null
        }
        Insert: {
          content_item_id: string
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
        }
        Update: {
          content_item_id?: string
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          post_url?: string | null
          posted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_platforms_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          captured_by: string | null
          created_at: string
          date_captured: string | null
          file_name: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          platform_crop_notes: string | null
          product_id: string | null
          source_notes: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          storage_path: string
          updated_at: string
          uploader_id: string | null
          usage_rights: Database["public"]["Enums"]["usage_rights"]
          usage_status: Database["public"]["Enums"]["usage_status"]
        }
        Insert: {
          alt_text?: string | null
          captured_by?: string | null
          created_at?: string
          date_captured?: string | null
          file_name: string
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          platform_crop_notes?: string | null
          product_id?: string | null
          source_notes?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          storage_path: string
          updated_at?: string
          uploader_id?: string | null
          usage_rights?: Database["public"]["Enums"]["usage_rights"]
          usage_status?: Database["public"]["Enums"]["usage_status"]
        }
        Update: {
          alt_text?: string | null
          captured_by?: string | null
          created_at?: string
          date_captured?: string | null
          file_name?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          platform_crop_notes?: string | null
          product_id?: string | null
          source_notes?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          storage_path?: string
          updated_at?: string
          uploader_id?: string | null
          usage_rights?: Database["public"]["Enums"]["usage_rights"]
          usage_status?: Database["public"]["Enums"]["usage_status"]
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connection_settings: {
        Row: {
          connected_status: string
          facebook_page_id: string | null
          id: string
          instagram_business_account_id: string | null
          last_sync_time: string | null
          meta_business_id: string | null
          notes: string | null
          permissions_checklist: Json
          token_expiration_date: string | null
          updated_at: string
        }
        Insert: {
          connected_status?: string
          facebook_page_id?: string | null
          id?: string
          instagram_business_account_id?: string | null
          last_sync_time?: string | null
          meta_business_id?: string | null
          notes?: string | null
          permissions_checklist?: Json
          token_expiration_date?: string | null
          updated_at?: string
        }
        Update: {
          connected_status?: string
          facebook_page_id?: string | null
          id?: string
          instagram_business_account_id?: string | null
          last_sync_time?: string | null
          meta_business_id?: string | null
          notes?: string | null
          permissions_checklist?: Json
          token_expiration_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          availability_status: Database["public"]["Enums"]["availability_status"]
          care_notes: string | null
          category: string | null
          content_priority: Database["public"]["Enums"]["content_priority"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_livestock: boolean
          name: string
          price: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          social_ready: boolean
          species_common_name: string | null
          tank_location: string | null
          updated_at: string
          website_ready: boolean
        }
        Insert: {
          availability_status?: Database["public"]["Enums"]["availability_status"]
          care_notes?: string | null
          category?: string | null
          content_priority?: Database["public"]["Enums"]["content_priority"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_livestock?: boolean
          name: string
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          social_ready?: boolean
          species_common_name?: string | null
          tank_location?: string | null
          updated_at?: string
          website_ready?: boolean
        }
        Update: {
          availability_status?: Database["public"]["Enums"]["availability_status"]
          care_notes?: string | null
          category?: string | null
          content_priority?: Database["public"]["Enums"]["content_priority"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_livestock?: boolean
          name?: string
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          social_ready?: boolean
          species_common_name?: string | null
          tank_location?: string | null
          updated_at?: string
          website_ready?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      publishing_checklists: {
        Row: {
          caption_ready: boolean
          content_item_id: string
          cta_ready: boolean
          hashtags_ready: boolean
          id: string
          manually_posted: boolean
          media_attached: boolean
          platform: Database["public"]["Enums"]["platform"]
          post_url_saved: boolean
          schedule_selected: boolean
          updated_at: string
        }
        Insert: {
          caption_ready?: boolean
          content_item_id: string
          cta_ready?: boolean
          hashtags_ready?: boolean
          id?: string
          manually_posted?: boolean
          media_attached?: boolean
          platform: Database["public"]["Enums"]["platform"]
          post_url_saved?: boolean
          schedule_selected?: boolean
          updated_at?: string
        }
        Update: {
          caption_ready?: boolean
          content_item_id?: string
          cta_ready?: boolean
          hashtags_ready?: boolean
          id?: string
          manually_posted?: boolean
          media_attached?: boolean
          platform?: Database["public"]["Enums"]["platform"]
          post_url_saved?: boolean
          schedule_selected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_checklists_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      can_edit_content: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "creator" | "reviewer"
      availability_status:
        | "available"
        | "sold"
        | "ordered"
        | "unavailable"
        | "unknown"
      campaign_status: "planning" | "active" | "complete" | "archived"
      content_priority: "low" | "medium" | "high"
      content_status:
        | "idea"
        | "needs_media"
        | "drafting"
        | "needs_review"
        | "approved"
        | "scheduled"
        | "posted"
        | "archived"
      content_type:
        | "photo"
        | "video"
        | "reel"
        | "story"
        | "carousel"
        | "live"
        | "blog"
        | "announcement"
        | "promo"
        | "educational"
        | "other"
      media_type: "image" | "video"
      platform:
        | "facebook"
        | "instagram"
        | "tiktok"
        | "youtube_shorts"
        | "google_business"
      product_type:
        | "dry_good"
        | "fish"
        | "coral"
        | "invert"
        | "service"
        | "brand"
        | "general_content_subject"
      source_type:
        | "phone_upload"
        | "camera_upload"
        | "vendor_asset"
        | "ai_generated"
        | "edited_asset"
      usage_rights: "owned" | "vendor_allowed" | "needs_permission" | "unknown"
      usage_status: "unused" | "in_use" | "archived"
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
      app_role: ["admin", "creator", "reviewer"],
      availability_status: [
        "available",
        "sold",
        "ordered",
        "unavailable",
        "unknown",
      ],
      campaign_status: ["planning", "active", "complete", "archived"],
      content_priority: ["low", "medium", "high"],
      content_status: [
        "idea",
        "needs_media",
        "drafting",
        "needs_review",
        "approved",
        "scheduled",
        "posted",
        "archived",
      ],
      content_type: [
        "photo",
        "video",
        "reel",
        "story",
        "carousel",
        "live",
        "blog",
        "announcement",
        "promo",
        "educational",
        "other",
      ],
      media_type: ["image", "video"],
      platform: [
        "facebook",
        "instagram",
        "tiktok",
        "youtube_shorts",
        "google_business",
      ],
      product_type: [
        "dry_good",
        "fish",
        "coral",
        "invert",
        "service",
        "brand",
        "general_content_subject",
      ],
      source_type: [
        "phone_upload",
        "camera_upload",
        "vendor_asset",
        "ai_generated",
        "edited_asset",
      ],
      usage_rights: ["owned", "vendor_allowed", "needs_permission", "unknown"],
      usage_status: ["unused", "in_use", "archived"],
    },
  },
} as const
