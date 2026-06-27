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
      article_products: {
        Row: {
          article_id: string
          created_at: string
          inventory_item_id: string
          sort_order: number
        }
        Insert: {
          article_id: string
          created_at?: string
          inventory_item_id: string
          sort_order?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          inventory_item_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_products_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "v_public_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author_id: string | null
          body_md: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          hero_media_id: string | null
          id: string
          kind: Database["public"]["Enums"]["article_kind"]
          og_image_path: string | null
          publish_at: string | null
          published_by: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["article_status"]
          subtitle: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          hero_media_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["article_kind"]
          og_image_path?: string | null
          publish_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["article_status"]
          subtitle?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          hero_media_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["article_kind"]
          og_image_path?: string | null
          publish_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["article_status"]
          subtitle?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "content_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_public_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "content_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_public_authors"
            referencedColumns: ["id"]
          },
        ]
      }
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
      clover_connection: {
        Row: {
          base_url: string | null
          connected: boolean
          id: boolean
          last_import_at: string | null
          last_sale_synced_at: string | null
          merchant_id: string | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          connected?: boolean
          id?: boolean
          last_import_at?: string | null
          last_sale_synced_at?: string | null
          merchant_id?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          connected?: boolean
          id?: boolean
          last_import_at?: string | null
          last_sale_synced_at?: string | null
          merchant_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clover_credentials: {
        Row: {
          api_token: string | null
          base_url: string | null
          id: boolean
          merchant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_token?: string | null
          base_url?: string | null
          id?: boolean
          merchant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_token?: string | null
          base_url?: string | null
          id?: boolean
          merchant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      clover_item_links: {
        Row: {
          clover_category_id: string | null
          clover_category_name: string | null
          clover_code: string | null
          clover_item_id: string
          clover_modified_time: number | null
          clover_name: string | null
          clover_price_cents: number | null
          clover_price_type: string | null
          created_at: string
          id: string
          inventory_item_id: string | null
          last_pushed_at: string | null
          last_pushed_hash: string | null
          last_synced_at: string | null
          link_status: string
          updated_at: string
        }
        Insert: {
          clover_category_id?: string | null
          clover_category_name?: string | null
          clover_code?: string | null
          clover_item_id: string
          clover_modified_time?: number | null
          clover_name?: string | null
          clover_price_cents?: number | null
          clover_price_type?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          last_pushed_at?: string | null
          last_pushed_hash?: string | null
          last_synced_at?: string | null
          link_status?: string
          updated_at?: string
        }
        Update: {
          clover_category_id?: string | null
          clover_category_name?: string | null
          clover_code?: string | null
          clover_item_id?: string
          clover_modified_time?: number | null
          clover_name?: string | null
          clover_price_cents?: number | null
          clover_price_type?: string | null
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          last_pushed_at?: string | null
          last_pushed_hash?: string | null
          last_synced_at?: string | null
          link_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clover_item_links_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clover_item_links_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      clover_push_queue: {
        Row: {
          attempts: number
          content_hash: string
          created_at: string
          created_by: string | null
          done_at: string | null
          id: string
          inventory_item_id: string
          last_error: string | null
          op: string
          origin: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          content_hash: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          inventory_item_id: string
          last_error?: string | null
          op: string
          origin?: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          content_hash?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          inventory_item_id?: string
          last_error?: string | null
          op?: string
          origin?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clover_push_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clover_push_queue_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          filter: Json
          hero_media_id: string | null
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          filter?: Json
          hero_media_id?: string | null
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          filter?: Json
          hero_media_id?: string | null
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "inventory_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["primary_media_id"]
          },
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "v_public_media"
            referencedColumns: ["id"]
          },
        ]
      }
      content_authors: {
        Row: {
          avatar_media_id: string | null
          bio_md: string | null
          created_at: string
          credentials: string | null
          display_name: string
          id: string
          is_active: boolean
          links: Json
          profile_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_media_id?: string | null
          bio_md?: string | null
          created_at?: string
          credentials?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          links?: Json
          profile_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_media_id?: string | null
          bio_md?: string | null
          created_at?: string
          credentials?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          links?: Json
          profile_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_authors_avatar_media_id_fkey"
            columns: ["avatar_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_authors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          source_vendor_batch_id: string | null
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
          source_vendor_batch_id?: string | null
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
          source_vendor_batch_id?: string | null
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
          {
            foreignKeyName: "content_items_source_vendor_batch_id_fkey"
            columns: ["source_vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
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
      customers: {
        Row: {
          clover_customer_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string | null
          first_seen_at: string
          id: string
          last_name: string | null
          last_seen_at: string | null
          marketing_consent: boolean
          notes: string | null
          phone: string | null
          reef_club_enrolled_at: string | null
          updated_at: string
        }
        Insert: {
          clover_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          first_seen_at?: string
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          reef_club_enrolled_at?: string | null
          updated_at?: string
        }
        Update: {
          clover_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          first_seen_at?: string
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          reef_club_enrolled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description_md: string | null
          ends_at: string | null
          hero_media_id: string | null
          id: string
          location_id: string | null
          location_text: string | null
          og_image_path: string | null
          seo_description: string | null
          seo_title: string | null
          series_id: string | null
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          ends_at?: string | null
          hero_media_id?: string | null
          id?: string
          location_id?: string | null
          location_text?: string | null
          og_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          series_id?: string | null
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_md?: string | null
          ends_at?: string | null
          hero_media_id?: string | null
          id?: string
          location_id?: string | null
          location_text?: string | null
          og_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          series_id?: string | null
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "v_public_events"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer_md: string
          category: string | null
          created_at: string
          id: string
          is_published: boolean
          question: string
          related_article_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer_md: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          question: string
          related_article_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer_md?: string
          category?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          question?: string
          related_article_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "v_public_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_activity_logs: {
        Row: {
          action: Database["public"]["Enums"]["inventory_activity_action"]
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          inventory_item_id: string | null
          summary: string | null
          vendor_batch_id: string | null
          vendor_line_item_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["inventory_activity_action"]
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          inventory_item_id?: string | null
          summary?: string | null
          vendor_batch_id?: string | null
          vendor_line_item_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["inventory_activity_action"]
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          inventory_item_id?: string | null
          summary?: string | null
          vendor_batch_id?: string | null
          vendor_line_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_activity_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_activity_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_activity_logs_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_activity_logs_vendor_line_item_id_fkey"
            columns: ["vendor_line_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          attrs: Json
          availability_status: Database["public"]["Enums"]["inventory_availability_status"]
          category: string | null
          colony_gone: boolean
          colony_gone_at: string | null
          colony_gone_by: string | null
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          id: string
          is_house_line: boolean
          is_website_ready: boolean
          is_wysiwyg: boolean
          item_name: string
          item_type: Database["public"]["Enums"]["item_type"] | null
          live_sale_status: Database["public"]["Enums"]["inventory_live_sale_status"]
          location_id: string | null
          needs_photo: boolean
          notes: string | null
          origin_region: string | null
          pricing_status: Database["public"]["Enums"]["inventory_pricing_status"]
          product_id: string | null
          quantity_available: number
          quantity_lost: number
          quantity_on_hold: number
          quantity_received: number
          quantity_sold: number
          rack_position: string | null
          received_at: string | null
          received_by: string | null
          retail_price: number | null
          scientific_name: string | null
          size: string | null
          slug: string | null
          source_colony_id: string | null
          source_vendor_batch_id: string | null
          source_vendor_line_item_id: string | null
          specimen_notes: string | null
          subcategory: string | null
          updated_at: string
          vendor_id: string | null
          website_ready_later: boolean
          wholesale_cost: number | null
        }
        Insert: {
          attrs?: Json
          availability_status?: Database["public"]["Enums"]["inventory_availability_status"]
          category?: string | null
          colony_gone?: boolean
          colony_gone_at?: string | null
          colony_gone_by?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_house_line?: boolean
          is_website_ready?: boolean
          is_wysiwyg?: boolean
          item_name: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          live_sale_status?: Database["public"]["Enums"]["inventory_live_sale_status"]
          location_id?: string | null
          needs_photo?: boolean
          notes?: string | null
          origin_region?: string | null
          pricing_status?: Database["public"]["Enums"]["inventory_pricing_status"]
          product_id?: string | null
          quantity_available?: number
          quantity_lost?: number
          quantity_on_hold?: number
          quantity_received?: number
          quantity_sold?: number
          rack_position?: string | null
          received_at?: string | null
          received_by?: string | null
          retail_price?: number | null
          scientific_name?: string | null
          size?: string | null
          slug?: string | null
          source_colony_id?: string | null
          source_vendor_batch_id?: string | null
          source_vendor_line_item_id?: string | null
          specimen_notes?: string | null
          subcategory?: string | null
          updated_at?: string
          vendor_id?: string | null
          website_ready_later?: boolean
          wholesale_cost?: number | null
        }
        Update: {
          attrs?: Json
          availability_status?: Database["public"]["Enums"]["inventory_availability_status"]
          category?: string | null
          colony_gone?: boolean
          colony_gone_at?: string | null
          colony_gone_by?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_house_line?: boolean
          is_website_ready?: boolean
          is_wysiwyg?: boolean
          item_name?: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          live_sale_status?: Database["public"]["Enums"]["inventory_live_sale_status"]
          location_id?: string | null
          needs_photo?: boolean
          notes?: string | null
          origin_region?: string | null
          pricing_status?: Database["public"]["Enums"]["inventory_pricing_status"]
          product_id?: string | null
          quantity_available?: number
          quantity_lost?: number
          quantity_on_hold?: number
          quantity_received?: number
          quantity_sold?: number
          rack_position?: string | null
          received_at?: string | null
          received_by?: string | null
          retail_price?: number | null
          scientific_name?: string | null
          size?: string | null
          slug?: string | null
          source_colony_id?: string | null
          source_vendor_batch_id?: string | null
          source_vendor_line_item_id?: string | null
          specimen_notes?: string | null
          subcategory?: string | null
          updated_at?: string
          vendor_id?: string | null
          website_ready_later?: boolean
          wholesale_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_source_colony_id_fkey"
            columns: ["source_colony_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_source_colony_id_fkey"
            columns: ["source_colony_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_source_vendor_batch_id_fkey"
            columns: ["source_vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_source_vendor_line_item_id_fkey"
            columns: ["source_vendor_line_item_id"]
            isOneToOne: true
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_media: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string
          has_price_tag: boolean
          id: string
          inventory_item_id: string
          is_primary: boolean
          media_type: string
          notes: string | null
          ocr_extracted_at: string | null
          ocr_text: string | null
          storage_path: string
          tag: Database["public"]["Enums"]["inventory_media_tag"]
          updated_at: string
          uploader_id: string | null
          view: Database["public"]["Enums"]["media_view"] | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name: string
          has_price_tag?: boolean
          id?: string
          inventory_item_id: string
          is_primary?: boolean
          media_type?: string
          notes?: string | null
          ocr_extracted_at?: string | null
          ocr_text?: string | null
          storage_path: string
          tag?: Database["public"]["Enums"]["inventory_media_tag"]
          updated_at?: string
          uploader_id?: string | null
          view?: Database["public"]["Enums"]["media_view"] | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string
          has_price_tag?: boolean
          id?: string
          inventory_item_id?: string
          is_primary?: boolean
          media_type?: string
          notes?: string | null
          ocr_extracted_at?: string | null
          ocr_text?: string | null
          storage_path?: string
          tag?: Database["public"]["Enums"]["inventory_media_tag"]
          updated_at?: string
          uploader_id?: string | null
          view?: Database["public"]["Enums"]["media_view"] | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sale_events: {
        Row: {
          clover_item_name: string | null
          clover_line_item_id: string | null
          clover_order_id: string | null
          clover_payment_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          inventory_item_id: string | null
          kind: string
          notes: string | null
          qty: number
          sold_at: string
          source: string
          status: string
          total_cents: number | null
          unit_price_cents: number | null
        }
        Insert: {
          clover_item_name?: string | null
          clover_line_item_id?: string | null
          clover_order_id?: string | null
          clover_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          kind?: string
          notes?: string | null
          qty: number
          sold_at?: string
          source?: string
          status?: string
          total_cents?: number | null
          unit_price_cents?: number | null
        }
        Update: {
          clover_item_name?: string | null
          clover_line_item_id?: string | null
          clover_order_id?: string | null
          clover_payment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          inventory_item_id?: string | null
          kind?: string
          notes?: string | null
          qty?: number
          sold_at?: string
          source?: string
          status?: string
          total_cents?: number | null
          unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sale_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sale_events_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sale_events_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_config: {
        Row: {
          earn_percent: number
          enabled: boolean
          id: boolean
          tiers: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          earn_percent?: number
          enabled?: boolean
          id?: boolean
          tiers?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          earn_percent?: number
          enabled?: boolean
          id?: boolean
          tiers?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      loyalty_ledger: {
        Row: {
          amount_cents: number
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          sale_event_id: string | null
        }
        Insert: {
          amount_cents: number
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kind: string
          reason?: string | null
          sale_event_id?: string | null
        }
        Update: {
          amount_cents?: number
          channel?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kind?: string
          reason?: string | null
          sale_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_sale_event_id_fkey"
            columns: ["sale_event_id"]
            isOneToOne: false
            referencedRelation: "inventory_sale_events"
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
          species_key: string | null
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
          species_key?: string | null
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
          species_key?: string | null
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
      redirects: {
        Row: {
          created_at: string
          created_by: string | null
          from_path: string
          id: string
          is_active: boolean
          note: string | null
          status_code: number
          to_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_path: string
          id?: string
          is_active?: boolean
          note?: string | null
          status_code?: number
          to_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_path?: string
          id?: string
          is_active?: boolean
          note?: string | null
          status_code?: number
          to_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          announcement: string | null
          created_at: string
          data: Json
          default_og_image_path: string | null
          id: boolean
          site_title: string | null
          social: Json
          storage_base: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          announcement?: string | null
          created_at?: string
          data?: Json
          default_og_image_path?: string | null
          id?: boolean
          site_title?: string | null
          social?: Json
          storage_base?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          announcement?: string | null
          created_at?: string
          data?: Json
          default_og_image_path?: string | null
          id?: boolean
          site_title?: string | null
          social?: Json
          storage_base?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_credit_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          related_ref: string | null
          source: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kind: string
          reason?: string | null
          related_ref?: string | null
          source: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kind?: string
          reason?: string | null
          related_ref?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credit_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      store_location_media: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_primary: boolean
          location_id: string
          public_url: string
          sort_order: number
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id: string
          public_url: string
          sort_order?: number
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          location_id?: string
          public_url?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_location_media_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_location_media_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          area_code: string | null
          attrs: Json
          capacity_notes: string | null
          city: string | null
          country: string | null
          created_at: string
          hours: Json | null
          id: string
          is_active: boolean
          is_live_sale: boolean
          is_public: boolean
          kind: Database["public"]["Enums"]["store_location_kind"]
          lat: number | null
          lng: number | null
          location_code: string | null
          name: string
          notes: string | null
          parent_location_id: string | null
          phone: string | null
          planned: boolean
          postal_code: string | null
          primary_photo_url: string | null
          public_email: string | null
          region: string | null
          slug: string
          sort_order: number
          system_group_id: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          area_code?: string | null
          attrs?: Json
          capacity_notes?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          hours?: Json | null
          id?: string
          is_active?: boolean
          is_live_sale?: boolean
          is_public?: boolean
          kind?: Database["public"]["Enums"]["store_location_kind"]
          lat?: number | null
          lng?: number | null
          location_code?: string | null
          name: string
          notes?: string | null
          parent_location_id?: string | null
          phone?: string | null
          planned?: boolean
          postal_code?: string | null
          primary_photo_url?: string | null
          public_email?: string | null
          region?: string | null
          slug: string
          sort_order?: number
          system_group_id?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          area_code?: string | null
          attrs?: Json
          capacity_notes?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          hours?: Json | null
          id?: string
          is_active?: boolean
          is_live_sale?: boolean
          is_public?: boolean
          kind?: Database["public"]["Enums"]["store_location_kind"]
          lat?: number | null
          lng?: number | null
          location_code?: string | null
          name?: string
          notes?: string | null
          parent_location_id?: string | null
          phone?: string | null
          planned?: boolean
          postal_code?: string | null
          primary_photo_url?: string | null
          public_email?: string | null
          region?: string | null
          slug?: string
          sort_order?: number
          system_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_locations_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_locations_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_locations_system_group_id_fkey"
            columns: ["system_group_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_locations_system_group_id_fkey"
            columns: ["system_group_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          author_location: string | null
          author_name: string
          body: string
          collected_at: string | null
          created_at: string
          id: string
          is_published: boolean
          rating: number | null
          sort_order: number
          source: string | null
          updated_at: string
        }
        Insert: {
          author_location?: string | null
          author_name: string
          body: string
          collected_at?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating?: number | null
          sort_order?: number
          source?: string | null
          updated_at?: string
        }
        Update: {
          author_location?: string | null
          author_name?: string
          body?: string
          collected_at?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating?: number | null
          sort_order?: number
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tracked_coral_types: {
        Row: {
          coral_type: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          coral_type: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          coral_type?: string
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
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
      vendor_batch_charges: {
        Row: {
          amount: number
          charge_type: Database["public"]["Enums"]["vendor_batch_charge_type"]
          created_at: string
          id: string
          label: string | null
          notes: string | null
          quantity: number
          updated_at: string
          vendor_batch_id: string
        }
        Insert: {
          amount?: number
          charge_type?: Database["public"]["Enums"]["vendor_batch_charge_type"]
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          quantity?: number
          updated_at?: string
          vendor_batch_id: string
        }
        Update: {
          amount?: number
          charge_type?: Database["public"]["Enums"]["vendor_batch_charge_type"]
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          quantity?: number
          updated_at?: string
          vendor_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_batch_charges_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_batches: {
        Row: {
          arrival_date: string | null
          awb_number: string | null
          balance_due: number | null
          carrier: string | null
          created_at: string
          created_by: string | null
          customer_number: string | null
          extraction_status: Database["public"]["Enums"]["vendor_batch_extraction_status"]
          id: string
          intake_status: Database["public"]["Enums"]["vendor_batch_intake_status"]
          invoice_date: string | null
          invoice_discount: number | null
          invoice_number: string | null
          invoice_subtotal: number | null
          invoice_total: number | null
          is_quick_add: boolean
          notes: string | null
          order_number: string | null
          pdf_file_name: string | null
          pdf_storage_path: string | null
          po_number: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_order_number: string | null
          ship_date: string | null
          source_document_type: Database["public"]["Enums"]["vendor_batch_source_document_type"]
          terms: string | null
          tracking_number: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          arrival_date?: string | null
          awb_number?: string | null
          balance_due?: number | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_number?: string | null
          extraction_status?: Database["public"]["Enums"]["vendor_batch_extraction_status"]
          id?: string
          intake_status?: Database["public"]["Enums"]["vendor_batch_intake_status"]
          invoice_date?: string | null
          invoice_discount?: number | null
          invoice_number?: string | null
          invoice_subtotal?: number | null
          invoice_total?: number | null
          is_quick_add?: boolean
          notes?: string | null
          order_number?: string | null
          pdf_file_name?: string | null
          pdf_storage_path?: string | null
          po_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_number?: string | null
          ship_date?: string | null
          source_document_type?: Database["public"]["Enums"]["vendor_batch_source_document_type"]
          terms?: string | null
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          arrival_date?: string | null
          awb_number?: string | null
          balance_due?: number | null
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          customer_number?: string | null
          extraction_status?: Database["public"]["Enums"]["vendor_batch_extraction_status"]
          id?: string
          intake_status?: Database["public"]["Enums"]["vendor_batch_intake_status"]
          invoice_date?: string | null
          invoice_discount?: number | null
          invoice_number?: string | null
          invoice_subtotal?: number | null
          invoice_total?: number | null
          is_quick_add?: boolean
          notes?: string | null
          order_number?: string | null
          pdf_file_name?: string | null
          pdf_storage_path?: string | null
          po_number?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_order_number?: string | null
          ship_date?: string | null
          source_document_type?: Database["public"]["Enums"]["vendor_batch_source_document_type"]
          terms?: string | null
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_line_doa_photos: {
        Row: {
          created_at: string
          id: string
          kind: string
          storage_path: string
          uploaded_by: string | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          storage_path: string
          uploaded_by?: string | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
          uploaded_by?: string | null
          vendor_batch_id?: string
          vendor_line_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_line_doa_photos_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_doa_photos_vendor_line_item_id_fkey"
            columns: ["vendor_line_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_line_item_photos: {
        Row: {
          created_at: string
          id: string
          kind: string
          storage_path: string
          uploaded_by: string | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          storage_path: string
          uploaded_by?: string | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
          uploaded_by?: string | null
          vendor_batch_id?: string
          vendor_line_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_line_item_photos_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_item_photos_vendor_line_item_id_fkey"
            columns: ["vendor_line_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_line_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_retail_price: number | null
          assigned_location_id: string | null
          attrs: Json
          category: string | null
          clean_item_name: string | null
          converted_inventory_item_id: string | null
          created_at: string
          extraction_confidence: number | null
          extraction_warning: string | null
          has_discount: boolean
          id: string
          item_type: Database["public"]["Enums"]["item_type"] | null
          kind: Database["public"]["Enums"]["vendor_line_kind"]
          line_number: number | null
          line_total: number | null
          loss_reason: string | null
          lost_quantity: number
          notes: string | null
          origin_region: string | null
          override_retail_price: number | null
          pricing_status: Database["public"]["Enums"]["vendor_line_pricing_status"]
          quantity: number
          raw_description: string | null
          received_at: string | null
          received_by: string | null
          received_quantity: number | null
          reconciled_inventory_item_id: string | null
          reconciliation_notes: string | null
          reconciliation_status: string
          regular_price: number | null
          review_status: Database["public"]["Enums"]["vendor_line_review_status"]
          scientific_name: string | null
          size: string | null
          subcategory: string | null
          suggested_retail_3x: number | null
          suggested_retail_price: number | null
          updated_at: string
          vendor_batch_id: string
          vendor_id: string
          vendor_item_id: string | null
          vendor_sell_price: number | null
          wholesale_cost: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_retail_price?: number | null
          assigned_location_id?: string | null
          attrs?: Json
          category?: string | null
          clean_item_name?: string | null
          converted_inventory_item_id?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_warning?: string | null
          has_discount?: boolean
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          kind?: Database["public"]["Enums"]["vendor_line_kind"]
          line_number?: number | null
          line_total?: number | null
          loss_reason?: string | null
          lost_quantity?: number
          notes?: string | null
          origin_region?: string | null
          override_retail_price?: number | null
          pricing_status?: Database["public"]["Enums"]["vendor_line_pricing_status"]
          quantity?: number
          raw_description?: string | null
          received_at?: string | null
          received_by?: string | null
          received_quantity?: number | null
          reconciled_inventory_item_id?: string | null
          reconciliation_notes?: string | null
          reconciliation_status?: string
          regular_price?: number | null
          review_status?: Database["public"]["Enums"]["vendor_line_review_status"]
          scientific_name?: string | null
          size?: string | null
          subcategory?: string | null
          suggested_retail_3x?: number | null
          suggested_retail_price?: number | null
          updated_at?: string
          vendor_batch_id: string
          vendor_id: string
          vendor_item_id?: string | null
          vendor_sell_price?: number | null
          wholesale_cost?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_retail_price?: number | null
          assigned_location_id?: string | null
          attrs?: Json
          category?: string | null
          clean_item_name?: string | null
          converted_inventory_item_id?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_warning?: string | null
          has_discount?: boolean
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"] | null
          kind?: Database["public"]["Enums"]["vendor_line_kind"]
          line_number?: number | null
          line_total?: number | null
          loss_reason?: string | null
          lost_quantity?: number
          notes?: string | null
          origin_region?: string | null
          override_retail_price?: number | null
          pricing_status?: Database["public"]["Enums"]["vendor_line_pricing_status"]
          quantity?: number
          raw_description?: string | null
          received_at?: string | null
          received_by?: string | null
          received_quantity?: number | null
          reconciled_inventory_item_id?: string | null
          reconciliation_notes?: string | null
          reconciliation_status?: string
          regular_price?: number | null
          review_status?: Database["public"]["Enums"]["vendor_line_review_status"]
          scientific_name?: string | null
          size?: string | null
          subcategory?: string | null
          suggested_retail_3x?: number | null
          suggested_retail_price?: number | null
          updated_at?: string
          vendor_batch_id?: string
          vendor_id?: string
          vendor_item_id?: string | null
          vendor_sell_price?: number | null
          wholesale_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_line_items_assigned_location_id_fkey"
            columns: ["assigned_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_items_assigned_location_id_fkey"
            columns: ["assigned_location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_items_reconciled_inventory_item_id_fkey"
            columns: ["reconciled_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_items_reconciled_inventory_item_id_fkey"
            columns: ["reconciled_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_items_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vli_converted_fk"
            columns: ["converted_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vli_converted_fk"
            columns: ["converted_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_line_receive_logs: {
        Row: {
          actor_id: string | null
          assigned_location_id: string | null
          created_at: string
          id: string
          loss_reason: string | null
          lost_quantity: number | null
          note: string | null
          override_retail_price: number | null
          prev_assigned_location_id: string | null
          prev_loss_reason: string | null
          prev_lost_quantity: number | null
          prev_override_retail_price: number | null
          prev_received_quantity: number | null
          received_quantity: number | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Insert: {
          actor_id?: string | null
          assigned_location_id?: string | null
          created_at?: string
          id?: string
          loss_reason?: string | null
          lost_quantity?: number | null
          note?: string | null
          override_retail_price?: number | null
          prev_assigned_location_id?: string | null
          prev_loss_reason?: string | null
          prev_lost_quantity?: number | null
          prev_override_retail_price?: number | null
          prev_received_quantity?: number | null
          received_quantity?: number | null
          vendor_batch_id: string
          vendor_line_item_id: string
        }
        Update: {
          actor_id?: string | null
          assigned_location_id?: string | null
          created_at?: string
          id?: string
          loss_reason?: string | null
          lost_quantity?: number | null
          note?: string | null
          override_retail_price?: number | null
          prev_assigned_location_id?: string | null
          prev_loss_reason?: string | null
          prev_lost_quantity?: number | null
          prev_override_retail_price?: number | null
          prev_received_quantity?: number | null
          received_quantity?: number | null
          vendor_batch_id?: string
          vendor_line_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_line_receive_logs_assigned_location_id_fkey"
            columns: ["assigned_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_receive_logs_assigned_location_id_fkey"
            columns: ["assigned_location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_receive_logs_vendor_batch_id_fkey"
            columns: ["vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_line_receive_logs_vendor_line_item_id_fkey"
            columns: ["vendor_line_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_scrape_items: {
        Row: {
          available_at_source: boolean
          compare_at_price: number | null
          created_at: string
          external_handle: string | null
          external_id: string
          first_seen_at: string
          id: string
          imported_at: string | null
          imported_by: string | null
          imported_vendor_batch_id: string | null
          imported_vendor_line_item_id: string | null
          last_available_at: string | null
          last_price_change_at: string | null
          last_seen_at: string
          photo_path: string | null
          photo_source_url: string | null
          product_url: string | null
          raw_payload: Json
          source_id: string
          status: string
          title: string
          updated_at: string
          vendor_currency: string | null
          wholesale_cost: number | null
        }
        Insert: {
          available_at_source?: boolean
          compare_at_price?: number | null
          created_at?: string
          external_handle?: string | null
          external_id: string
          first_seen_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_vendor_batch_id?: string | null
          imported_vendor_line_item_id?: string | null
          last_available_at?: string | null
          last_price_change_at?: string | null
          last_seen_at?: string
          photo_path?: string | null
          photo_source_url?: string | null
          product_url?: string | null
          raw_payload?: Json
          source_id: string
          status?: string
          title: string
          updated_at?: string
          vendor_currency?: string | null
          wholesale_cost?: number | null
        }
        Update: {
          available_at_source?: boolean
          compare_at_price?: number | null
          created_at?: string
          external_handle?: string | null
          external_id?: string
          first_seen_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          imported_vendor_batch_id?: string | null
          imported_vendor_line_item_id?: string | null
          last_available_at?: string | null
          last_price_change_at?: string | null
          last_seen_at?: string
          photo_path?: string | null
          photo_source_url?: string | null
          product_url?: string | null
          raw_payload?: Json
          source_id?: string
          status?: string
          title?: string
          updated_at?: string
          vendor_currency?: string | null
          wholesale_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_scrape_items_imported_vendor_batch_id_fkey"
            columns: ["imported_vendor_batch_id"]
            isOneToOne: false
            referencedRelation: "vendor_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_scrape_items_imported_vendor_line_item_id_fkey"
            columns: ["imported_vendor_line_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_scrape_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "vendor_scrape_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_scrape_snapshots: {
        Row: {
          available: boolean
          compare_at_price: number | null
          created_at: string
          id: string
          observed_at: string
          raw_json: Json
          scrape_item_id: string
          source_id: string
          vendor_currency: string | null
          wholesale_cost: number | null
        }
        Insert: {
          available: boolean
          compare_at_price?: number | null
          created_at?: string
          id?: string
          observed_at?: string
          raw_json?: Json
          scrape_item_id: string
          source_id: string
          vendor_currency?: string | null
          wholesale_cost?: number | null
        }
        Update: {
          available?: boolean
          compare_at_price?: number | null
          created_at?: string
          id?: string
          observed_at?: string
          raw_json?: Json
          scrape_item_id?: string
          source_id?: string
          vendor_currency?: string | null
          wholesale_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_scrape_snapshots_scrape_item_id_fkey"
            columns: ["scrape_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_scrape_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_scrape_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "vendor_scrape_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_scrape_sources: {
        Row: {
          auth_method: string
          cadence: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          last_item_count: number | null
          last_scrape_error: string | null
          last_scrape_status: string | null
          last_scraped_at: string | null
          name: string
          notes: string | null
          prefer_firecrawl: boolean
          source_url: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          auth_method?: string
          cadence?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_item_count?: number | null
          last_scrape_error?: string | null
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          name: string
          notes?: string | null
          prefer_firecrawl?: boolean
          source_url: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          auth_method?: string
          cadence?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_item_count?: number | null
          last_scrape_error?: string | null
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          name?: string
          notes?: string | null
          prefer_firecrawl?: boolean
          source_url?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_scrape_sources_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_carrier: string | null
          default_terms: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_carrier?: string | null
          default_terms?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_carrier?: string | null
          default_terms?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      workspace_ai_settings: {
        Row: {
          fallback_to_lovable: boolean
          gemini_api_key: string | null
          gemini_model_flash: string | null
          gemini_model_pro: string | null
          id: string
          last_error: string | null
          last_used_at: string | null
          last_used_provider: string | null
          openai_api_key: string | null
          openai_model_flash: string | null
          openai_model_pro: string | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fallback_to_lovable?: boolean
          gemini_api_key?: string | null
          gemini_model_flash?: string | null
          gemini_model_pro?: string | null
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          last_used_provider?: string | null
          openai_api_key?: string | null
          openai_model_flash?: string | null
          openai_model_pro?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fallback_to_lovable?: boolean
          gemini_api_key?: string | null
          gemini_model_flash?: string | null
          gemini_model_pro?: string | null
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          last_used_provider?: string | null
          openai_api_key?: string | null
          openai_model_flash?: string | null
          openai_model_pro?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      workspace_content_settings: {
        Row: {
          id: string
          updated_at: string
          updated_by: string | null
          vendor_photos_ok: boolean
          vendor_photos_ok_attested_at: string | null
          vendor_photos_ok_attested_by: string | null
        }
        Insert: {
          id?: string
          updated_at?: string
          updated_by?: string | null
          vendor_photos_ok?: boolean
          vendor_photos_ok_attested_at?: string | null
          vendor_photos_ok_attested_by?: string | null
        }
        Update: {
          id?: string
          updated_at?: string
          updated_by?: string | null
          vendor_photos_ok?: boolean
          vendor_photos_ok_attested_at?: string | null
          vendor_photos_ok_attested_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_public_article_products: {
        Row: {
          article_id: string | null
          inventory_item_id: string | null
          sort_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_products_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "v_public_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_products_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_articles: {
        Row: {
          author_id: string | null
          body_md: string | null
          excerpt: string | null
          hero_media_id: string | null
          id: string | null
          kind: string | null
          og_image_path: string | null
          publish_at: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string | null
          subtitle: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          body_md?: string | null
          excerpt?: string | null
          hero_media_id?: string | null
          id?: string | null
          kind?: never
          og_image_path?: string | null
          publish_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          body_md?: string | null
          excerpt?: string | null
          hero_media_id?: string | null
          id?: string | null
          kind?: never
          og_image_path?: string | null
          publish_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "content_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_public_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "content_authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_public_authors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_authors: {
        Row: {
          avatar_media_id: string | null
          bio_md: string | null
          credentials: string | null
          display_name: string | null
          id: string | null
          links: Json | null
          slug: string | null
        }
        Insert: {
          avatar_media_id?: string | null
          bio_md?: string | null
          credentials?: string | null
          display_name?: string | null
          id?: string | null
          links?: Json | null
          slug?: string | null
        }
        Update: {
          avatar_media_id?: string | null
          bio_md?: string | null
          credentials?: string | null
          display_name?: string | null
          id?: string | null
          links?: Json | null
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_authors_avatar_media_id_fkey"
            columns: ["avatar_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_collections: {
        Row: {
          description: string | null
          filter: Json | null
          hero_media_id: string | null
          hero_media_path: string | null
          id: string | null
          slug: string | null
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "inventory_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["primary_media_id"]
          },
          {
            foreignKeyName: "collections_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "v_public_media"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_events: {
        Row: {
          description_md: string | null
          ends_at: string | null
          hero_media_id: string | null
          id: string | null
          location_id: string | null
          location_text: string | null
          og_image_path: string | null
          seo_description: string | null
          seo_title: string | null
          series_id: string | null
          slug: string | null
          starts_at: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          description_md?: string | null
          ends_at?: string | null
          hero_media_id?: string | null
          id?: string | null
          location_id?: string | null
          location_text?: string | null
          og_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          series_id?: string | null
          slug?: string | null
          starts_at?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          description_md?: string | null
          ends_at?: string | null
          hero_media_id?: string | null
          id?: string | null
          location_id?: string | null
          location_text?: string | null
          og_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          series_id?: string | null
          slug?: string | null
          starts_at?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_hero_media_id_fkey"
            columns: ["hero_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "v_public_events"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_faqs: {
        Row: {
          answer_md: string | null
          category: string | null
          id: string | null
          question: string | null
          related_article_id: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          answer_md?: string | null
          category?: string | null
          id?: string | null
          question?: string | null
          related_article_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          answer_md?: string | null
          category?: string | null
          id?: string | null
          question?: string | null
          related_article_id?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faqs_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faqs_related_article_id_fkey"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "v_public_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_inventory: {
        Row: {
          attrs: Json | null
          availability_status:
            | Database["public"]["Enums"]["inventory_availability_status"]
            | null
          care_notes: string | null
          compare_at_price: number | null
          description: string | null
          id: string | null
          is_house_line: boolean | null
          is_wysiwyg: boolean | null
          item_name: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          location_id: string | null
          primary_media_id: string | null
          primary_media_path: string | null
          primary_media_view: Database["public"]["Enums"]["media_view"] | null
          product_id: string | null
          retail_price: number | null
          scientific_name: string | null
          slug: string | null
          specimen_notes: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_public_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          hours: Json | null
          id: string | null
          kind: Database["public"]["Enums"]["store_location_kind"] | null
          lat: number | null
          lng: number | null
          name: string | null
          phone: string | null
          postal_code: string | null
          primary_photo_url: string | null
          public_email: string | null
          region: string | null
          slug: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          hours?: Json | null
          id?: string | null
          kind?: Database["public"]["Enums"]["store_location_kind"] | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_photo_url?: string | null
          public_email?: string | null
          region?: string | null
          slug?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          hours?: Json | null
          id?: string | null
          kind?: Database["public"]["Enums"]["store_location_kind"] | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_photo_url?: string | null
          public_email?: string | null
          region?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      v_public_media: {
        Row: {
          created_at: string | null
          id: string | null
          inventory_item_id: string | null
          is_primary: boolean | null
          storage_path: string | null
          view: Database["public"]["Enums"]["media_view"] | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_media_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "v_public_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      v_public_redirects: {
        Row: {
          from_path: string | null
          status_code: number | null
          to_path: string | null
        }
        Insert: {
          from_path?: string | null
          status_code?: number | null
          to_path?: string | null
        }
        Update: {
          from_path?: string | null
          status_code?: number | null
          to_path?: string | null
        }
        Relationships: []
      }
      v_public_site_settings: {
        Row: {
          announcement: string | null
          data: Json | null
          default_og_image_path: string | null
          service_areas: Json | null
          site_title: string | null
          social: Json | null
          storage_base: string | null
          tagline: string | null
          updated_at: string | null
        }
        Insert: {
          announcement?: string | null
          data?: never
          default_og_image_path?: string | null
          service_areas?: never
          site_title?: string | null
          social?: Json | null
          storage_base?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Update: {
          announcement?: string | null
          data?: never
          default_og_image_path?: string | null
          service_areas?: never
          site_title?: string | null
          social?: Json | null
          storage_base?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_public_testimonials: {
        Row: {
          author_location: string | null
          author_name: string | null
          body: string | null
          collected_at: string | null
          id: string | null
          rating: number | null
          sort_order: number | null
          source: string | null
        }
        Insert: {
          author_location?: string | null
          author_name?: string | null
          body?: string | null
          collected_at?: string | null
          id?: string | null
          rating?: number | null
          sort_order?: number | null
          source?: string | null
        }
        Update: {
          author_location?: string | null
          author_name?: string | null
          body?: string | null
          collected_at?: string | null
          id?: string | null
          rating?: number | null
          sort_order?: number | null
          source?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_store_credit: {
        Args: {
          _amount_cents: number
          _customer_id: string
          _reason: string
          _related_ref?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          related_ref: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "store_credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_inventory_sale: {
        Args: {
          _clover_item_name?: string
          _clover_line_item_id?: string
          _clover_order_id?: string
          _clover_payment_id?: string
          _customer_id?: string
          _inventory_item_id: string
          _kind?: string
          _qty: number
          _source?: string
          _unit_price_cents?: number
          _user_id?: string
        }
        Returns: {
          duplicate: boolean
          earn_cents: number
          sale_event_id: string
        }[]
      }
      can_edit_content: { Args: { _user_id: string }; Returns: boolean }
      compute_inventory_website_ready: {
        Args: { _item: Database["public"]["Tables"]["inventory_items"]["Row"] }
        Returns: boolean
      }
      customer_loyalty_summary: {
        Args: { _customer_id: string }
        Returns: {
          annual_spend_cents: number
          balance_cents: number
        }[]
      }
      customers_with_spend: {
        Args: { _limit?: number; _q?: string }
        Returns: {
          email: string
          first_name: string
          id: string
          last_name: string
          last_purchase_at: string
          last_seen_at: string
          marketing_consent: boolean
          order_count: number
          phone: string
          spend_cents: number
        }[]
      }
      decrement_inventory_stock: {
        Args: { _id: string; _qty: number }
        Returns: {
          availability_status: string
          quantity_available: number
          quantity_sold: number
        }[]
      }
      grant_store_credit: {
        Args: {
          _amount_cents: number
          _customer_id: string
          _reason?: string
          _related_ref?: string
          _source: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          related_ref: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "store_credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_dev: { Args: { _user_id: string }; Returns: boolean }
      is_floor_staff_or_above: { Args: { _user_id: string }; Returns: boolean }
      loyalty_redeem: {
        Args: {
          _amount_cents: number
          _channel?: string
          _customer_id: string
          _reason?: string
        }
        Returns: {
          amount_cents: number
          channel: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          sale_event_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_inventory_loss: {
        Args: {
          _inventory_item_id: string
          _note?: string
          _qty: number
          _reason: string
        }
        Returns: {
          availability_status: string
          quantity_available: number
          quantity_lost: number
        }[]
      }
      record_trade_in: {
        Args: {
          _customer_id: string
          _lines: Json
          _location_id: string
          _new_customer: Json
          _note?: string
        }
        Returns: Json
      }
      redeem_store_credit: {
        Args: {
          _amount_cents: number
          _customer_id: string
          _reason?: string
          _related_ref?: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          reason: string | null
          related_ref: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "store_credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_customers_for_staff: {
        Args: { _q?: string }
        Returns: {
          email: string
          first_name: string
          id: string
          last_name: string
          last_seen_at: string
          phone: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_credit_summary: {
        Args: { _customer_id: string }
        Returns: {
          balance_cents: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "creator"
        | "reviewer"
        | "manager"
        | "floor_staff"
        | "viewer"
        | "dev"
      article_kind:
        | "care_guide"
        | "event_recap"
        | "news"
        | "species_spotlight"
        | "how_to"
        | "other"
      article_status: "draft" | "in_review" | "published" | "archived"
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
      event_status: "draft" | "published" | "cancelled" | "archived"
      inventory_activity_action:
        | "created"
        | "updated"
        | "status_change"
        | "location_change"
        | "quantity_change"
        | "pricing_change"
        | "converted_from_line"
        | "note"
        | "loss"
        | "trade_in"
        | "media_change"
        | "website_ready_change"
      inventory_availability_status:
        | "incoming"
        | "quarantine"
        | "needs_id"
        | "available"
        | "on_hold"
        | "sold_out"
        | "not_for_sale"
        | "dead_lost"
      inventory_live_sale_status:
        | "not_eligible"
        | "eligible"
        | "staged"
        | "live"
        | "ended"
      inventory_media_tag: "internal" | "social" | "website" | "live_sale"
      inventory_pricing_status: "not_priced" | "approved"
      item_type:
        | "fish"
        | "coral"
        | "invert"
        | "dry_good"
        | "live_rock"
        | "equipment"
        | "other"
      media_type: "image" | "video"
      media_view: "daylight" | "actinic" | "video_still" | "other"
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
      store_location_kind:
        | "display_tank"
        | "coral_flat"
        | "live_sale_tank"
        | "quarantine"
        | "holding"
        | "dry_goods"
        | "back_of_house"
        | "other"
        | "zone"
        | "room"
        | "rack"
        | "shelf"
        | "freezer"
        | "cooler"
        | "bin"
        | "fish_system"
        | "coral_system"
        | "frag_tank"
        | "growout_tank"
        | "offsite_storage"
        | "support_station"
        | "bulk_storage"
      usage_rights: "owned" | "vendor_allowed" | "needs_permission" | "unknown"
      usage_status: "unused" | "in_use" | "archived"
      vendor_batch_charge_type:
        | "freight"
        | "packaging"
        | "heat_pack"
        | "box"
        | "fuel_surcharge"
        | "discount"
        | "credit"
        | "tax"
        | "other"
      vendor_batch_extraction_status:
        | "not_started"
        | "manual"
        | "ai_pending"
        | "ai_done"
        | "failed"
      vendor_batch_intake_status:
        | "draft"
        | "uploaded"
        | "parsing"
        | "review"
        | "approved"
        | "converted"
        | "archived"
      vendor_batch_source_document_type:
        | "invoice"
        | "order_sheet"
        | "packing_list"
        | "manual_entry"
        | "other"
        | "scrape"
      vendor_line_kind: "sellable" | "charge"
      vendor_line_pricing_status: "not_priced" | "suggested" | "approved"
      vendor_line_review_status:
        | "pending"
        | "approved"
        | "rejected"
        | "needs_info"
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
        "creator",
        "reviewer",
        "manager",
        "floor_staff",
        "viewer",
        "dev",
      ],
      article_kind: [
        "care_guide",
        "event_recap",
        "news",
        "species_spotlight",
        "how_to",
        "other",
      ],
      article_status: ["draft", "in_review", "published", "archived"],
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
      event_status: ["draft", "published", "cancelled", "archived"],
      inventory_activity_action: [
        "created",
        "updated",
        "status_change",
        "location_change",
        "quantity_change",
        "pricing_change",
        "converted_from_line",
        "note",
        "loss",
        "trade_in",
        "media_change",
        "website_ready_change",
      ],
      inventory_availability_status: [
        "incoming",
        "quarantine",
        "needs_id",
        "available",
        "on_hold",
        "sold_out",
        "not_for_sale",
        "dead_lost",
      ],
      inventory_live_sale_status: [
        "not_eligible",
        "eligible",
        "staged",
        "live",
        "ended",
      ],
      inventory_media_tag: ["internal", "social", "website", "live_sale"],
      inventory_pricing_status: ["not_priced", "approved"],
      item_type: [
        "fish",
        "coral",
        "invert",
        "dry_good",
        "live_rock",
        "equipment",
        "other",
      ],
      media_type: ["image", "video"],
      media_view: ["daylight", "actinic", "video_still", "other"],
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
      store_location_kind: [
        "display_tank",
        "coral_flat",
        "live_sale_tank",
        "quarantine",
        "holding",
        "dry_goods",
        "back_of_house",
        "other",
        "zone",
        "room",
        "rack",
        "shelf",
        "freezer",
        "cooler",
        "bin",
        "fish_system",
        "coral_system",
        "frag_tank",
        "growout_tank",
        "offsite_storage",
        "support_station",
        "bulk_storage",
      ],
      usage_rights: ["owned", "vendor_allowed", "needs_permission", "unknown"],
      usage_status: ["unused", "in_use", "archived"],
      vendor_batch_charge_type: [
        "freight",
        "packaging",
        "heat_pack",
        "box",
        "fuel_surcharge",
        "discount",
        "credit",
        "tax",
        "other",
      ],
      vendor_batch_extraction_status: [
        "not_started",
        "manual",
        "ai_pending",
        "ai_done",
        "failed",
      ],
      vendor_batch_intake_status: [
        "draft",
        "uploaded",
        "parsing",
        "review",
        "approved",
        "converted",
        "archived",
      ],
      vendor_batch_source_document_type: [
        "invoice",
        "order_sheet",
        "packing_list",
        "manual_entry",
        "other",
        "scrape",
      ],
      vendor_line_kind: ["sellable", "charge"],
      vendor_line_pricing_status: ["not_priced", "suggested", "approved"],
      vendor_line_review_status: [
        "pending",
        "approved",
        "rejected",
        "needs_info",
      ],
    },
  },
} as const
