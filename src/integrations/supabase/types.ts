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
      abandoned_bookings: {
        Row: {
          converted: boolean | null
          converted_at: string | null
          created_at: string
          email: string | null
          first_name: string | null
          followup_sent: boolean | null
          followup_sent_at: string | null
          id: string
          last_name: string | null
          organization_id: string
          phone: string | null
          service_id: string | null
          session_token: string
          step_reached: number | null
          updated_at: string
        }
        Insert: {
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          followup_sent?: boolean | null
          followup_sent_at?: string | null
          id?: string
          last_name?: string | null
          organization_id: string
          phone?: string | null
          service_id?: string | null
          session_token: string
          step_reached?: number | null
          updated_at?: string
        }
        Update: {
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          followup_sent?: boolean | null
          followup_sent_at?: string | null
          id?: string
          last_name?: string | null
          organization_id?: string
          phone?: string | null
          service_id?: string | null
          session_token?: string
          step_reached?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          organization_name: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          organization_name?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          organization_name?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
        }
        Relationships: []
      }
      additional_charges: {
        Row: {
          booking_id: string
          charge_amount: number
          charge_name: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          organization_id: string | null
        }
        Insert: {
          booking_id: string
          charge_amount: number
          charge_name: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
        }
        Update: {
          booking_id?: string
          charge_amount?: number
          charge_name?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "additional_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_charges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_booking_request_notifications: {
        Row: {
          booking_request_id: string
          created_at: string
          id: string
          is_read: boolean | null
          organization_id: string
        }
        Insert: {
          booking_request_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          organization_id: string
        }
        Update: {
          booking_request_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_booking_request_notifications_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "client_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_booking_request_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_chat_conversations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_chat_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          organization_id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          organization_id: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "admin_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_chat_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calculation_log: {
        Row: {
          calculation_type: string
          completed_at: string | null
          error_message: string | null
          id: string
          organization_id: string
          records_processed: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          calculation_type: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organization_id: string
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          calculation_type?: string
          completed_at?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_calculation_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminder_intervals: {
        Row: {
          created_at: string
          hours_before: number
          id: string
          is_active: boolean
          label: string
          organization_id: string
          send_to_cleaner: boolean
          send_to_client: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          hours_before: number
          id?: string
          is_active?: boolean
          label: string
          organization_id: string
          send_to_cleaner?: boolean
          send_to_client?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          hours_before?: number
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          send_to_cleaner?: boolean
          send_to_client?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminder_intervals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automated_campaigns: {
        Row: {
          body: string
          created_at: string
          days_inactive: number | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          organization_id: string | null
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          days_inactive?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          organization_id?: string | null
          subject: string
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          days_inactive?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          organization_id?: string | null
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automated_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automated_review_sms_queue: {
        Row: {
          booking_id: string
          created_at: string
          customer_id: string | null
          error: string | null
          id: string
          organization_id: string
          send_at: string
          sent: boolean
          sent_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          organization_id: string
          send_at: string
          sent?: boolean
          sent_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          organization_id?: string
          send_at?: string
          sent?: boolean
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automated_review_sms_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_review_sms_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          excerpt: string
          id: string
          is_featured: boolean
          is_published: boolean
          meta_description: string | null
          meta_title: string | null
          published_at: string
          read_time: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          excerpt: string
          id?: string
          is_featured?: boolean
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string
          read_time?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          excerpt?: string
          id?: string
          is_featured?: boolean
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string
          read_time?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_checklist_items: {
        Row: {
          booking_checklist_id: string
          checklist_item_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          notes: string | null
          organization_id: string | null
          photo_url: string | null
          title: string
        }
        Insert: {
          booking_checklist_id: string
          checklist_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          organization_id?: string | null
          photo_url?: string | null
          title: string
        }
        Update: {
          booking_checklist_id?: string
          checklist_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          organization_id?: string | null
          photo_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_checklist_items_booking_checklist_id_fkey"
            columns: ["booking_checklist_id"]
            isOneToOne: false
            referencedRelation: "booking_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklist_items_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_checklists: {
        Row: {
          booking_id: string
          completed_at: string | null
          created_at: string
          id: string
          organization_id: string | null
          staff_id: string | null
          template_id: string | null
        }
        Insert: {
          booking_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          staff_id?: string | null
          template_id?: string | null
        }
        Update: {
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          staff_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_checklists_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklists_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklists_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_photos: {
        Row: {
          booking_id: string
          caption: string | null
          created_at: string | null
          id: string
          organization_id: string | null
          photo_type: string | null
          photo_url: string
          staff_id: string | null
        }
        Insert: {
          booking_id: string
          caption?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          photo_type?: string | null
          photo_url: string
          staff_id?: string | null
        }
        Update: {
          booking_id?: string
          caption?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          photo_type?: string | null
          photo_url?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_photos_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_photos_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_reminder_log: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          organization_id: string
          recipient_phone: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          organization_id: string
          recipient_phone: string
          reminder_type: string
          sent_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          recipient_phone?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminder_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_reminder_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_team_assignments: {
        Row: {
          booking_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          organization_id: string | null
          pay_share: number | null
          staff_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          organization_id?: string | null
          pay_share?: number | null
          staff_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          organization_id?: string | null
          pay_share?: number | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_team_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_team_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_team_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_team_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address: string | null
          apt_suite: string | null
          bathrooms: string | null
          bedrooms: string | null
          booking_number: number
          city: string | null
          cleaner_actual_payment: number | null
          cleaner_checkin_at: string | null
          cleaner_checkin_lat: number | null
          cleaner_checkin_lng: number | null
          cleaner_checkout_at: string | null
          cleaner_override_hours: number | null
          cleaner_pay_expected: number | null
          cleaner_wage: number | null
          cleaner_wage_type: string | null
          created_at: string
          custom_frequency_days: number | null
          customer_id: string | null
          deposit_paid: number | null
          discount_amount: number | null
          discount_id: string | null
          duration: number
          extras: Json | null
          frequency: string | null
          id: string
          is_draft: boolean | null
          is_test: boolean | null
          location_id: string | null
          notes: string | null
          organization_id: string | null
          pay_base_amount: number | null
          pay_base_mode: string | null
          pay_last_saved_at: string | null
          pay_last_saved_by: string | null
          pay_locked: boolean | null
          payment_intent_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          recurring_days_of_week: number[] | null
          scheduled_at: string
          service_id: string | null
          square_footage: string | null
          staff_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["booking_status"]
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          apt_suite?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          booking_number?: number
          city?: string | null
          cleaner_actual_payment?: number | null
          cleaner_checkin_at?: string | null
          cleaner_checkin_lat?: number | null
          cleaner_checkin_lng?: number | null
          cleaner_checkout_at?: string | null
          cleaner_override_hours?: number | null
          cleaner_pay_expected?: number | null
          cleaner_wage?: number | null
          cleaner_wage_type?: string | null
          created_at?: string
          custom_frequency_days?: number | null
          customer_id?: string | null
          deposit_paid?: number | null
          discount_amount?: number | null
          discount_id?: string | null
          duration: number
          extras?: Json | null
          frequency?: string | null
          id?: string
          is_draft?: boolean | null
          is_test?: boolean | null
          location_id?: string | null
          notes?: string | null
          organization_id?: string | null
          pay_base_amount?: number | null
          pay_base_mode?: string | null
          pay_last_saved_at?: string | null
          pay_last_saved_by?: string | null
          pay_locked?: boolean | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_days_of_week?: number[] | null
          scheduled_at: string
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          apt_suite?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          booking_number?: number
          city?: string | null
          cleaner_actual_payment?: number | null
          cleaner_checkin_at?: string | null
          cleaner_checkin_lat?: number | null
          cleaner_checkin_lng?: number | null
          cleaner_checkout_at?: string | null
          cleaner_override_hours?: number | null
          cleaner_pay_expected?: number | null
          cleaner_wage?: number | null
          cleaner_wage_type?: string | null
          created_at?: string
          custom_frequency_days?: number | null
          customer_id?: string | null
          deposit_paid?: number | null
          discount_amount?: number | null
          discount_id?: string | null
          duration?: number
          extras?: Json | null
          frequency?: string | null
          id?: string
          is_draft?: boolean | null
          is_test?: boolean | null
          location_id?: string | null
          notes?: string | null
          organization_id?: string | null
          pay_base_amount?: number | null
          pay_base_mode?: string | null
          pay_last_saved_at?: string | null
          pay_last_saved_by?: string | null
          pay_locked?: boolean | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          recurring_days_of_week?: number[] | null
          scheduled_at?: string
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      business_intelligence: {
        Row: {
          avg_lead_conversion_rate: number | null
          best_converting_day: string | null
          best_converting_source: string | null
          best_converting_time: string | null
          bookings_needed_for_goal: number | null
          created_at: string | null
          id: string
          last_calculated_at: string | null
          optimal_price_range_high: number | null
          optimal_price_range_low: number | null
          optimal_response_window_minutes: number | null
          organization_id: string
          peak_demand_periods: Json | null
          predicted_monthly_revenue: number | null
          price_win_rate: number | null
          recommendations: Json | null
          revenue_goal_probability: number | null
          seasonal_factors: Json | null
          top_insights: Json | null
          updated_at: string | null
        }
        Insert: {
          avg_lead_conversion_rate?: number | null
          best_converting_day?: string | null
          best_converting_source?: string | null
          best_converting_time?: string | null
          bookings_needed_for_goal?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          optimal_price_range_high?: number | null
          optimal_price_range_low?: number | null
          optimal_response_window_minutes?: number | null
          organization_id: string
          peak_demand_periods?: Json | null
          predicted_monthly_revenue?: number | null
          price_win_rate?: number | null
          recommendations?: Json | null
          revenue_goal_probability?: number | null
          seasonal_factors?: Json | null
          top_insights?: Json | null
          updated_at?: string | null
        }
        Update: {
          avg_lead_conversion_rate?: number | null
          best_converting_day?: string | null
          best_converting_source?: string | null
          best_converting_time?: string | null
          bookings_needed_for_goal?: number | null
          created_at?: string | null
          id?: string
          last_calculated_at?: string | null
          optimal_price_range_high?: number | null
          optimal_price_range_low?: number | null
          optimal_response_window_minutes?: number | null
          organization_id?: string
          peak_demand_periods?: Json | null
          predicted_monthly_revenue?: number | null
          price_win_rate?: number | null
          recommendations?: Json | null
          revenue_goal_probability?: number | null
          seasonal_factors?: Json | null
          top_insights?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_intelligence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          accent_color: string | null
          allow_online_booking: boolean | null
          app_url: string | null
          booking_buffer_minutes: number | null
          cancellation_policy: string | null
          cancellation_window_hours: number | null
          company_address: string | null
          company_city: string | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          company_state: string | null
          company_zip: string | null
          confirmation_email_body: string | null
          confirmation_email_subject: string | null
          created_at: string
          currency: string | null
          google_review_url: string | null
          id: string
          logo_url: string | null
          max_advance_booking_days: number | null
          minimum_notice_hours: number | null
          notify_cancellations: boolean | null
          notify_new_booking: boolean | null
          notify_reminders: boolean | null
          notify_sms: boolean | null
          organization_id: string | null
          payroll_custom_days: number[] | null
          payroll_frequency: string
          payroll_start_day: number
          primary_color: string | null
          reminder_email_body: string | null
          reminder_email_subject: string | null
          require_deposit: boolean | null
          resend_api_key: string | null
          review_sms_template: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          allow_online_booking?: boolean | null
          app_url?: string | null
          booking_buffer_minutes?: number | null
          cancellation_policy?: string | null
          cancellation_window_hours?: number | null
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          company_state?: string | null
          company_zip?: string | null
          confirmation_email_body?: string | null
          confirmation_email_subject?: string | null
          created_at?: string
          currency?: string | null
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          max_advance_booking_days?: number | null
          minimum_notice_hours?: number | null
          notify_cancellations?: boolean | null
          notify_new_booking?: boolean | null
          notify_reminders?: boolean | null
          notify_sms?: boolean | null
          organization_id?: string | null
          payroll_custom_days?: number[] | null
          payroll_frequency?: string
          payroll_start_day?: number
          primary_color?: string | null
          reminder_email_body?: string | null
          reminder_email_subject?: string | null
          require_deposit?: boolean | null
          resend_api_key?: string | null
          review_sms_template?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          allow_online_booking?: boolean | null
          app_url?: string | null
          booking_buffer_minutes?: number | null
          cancellation_policy?: string | null
          cancellation_window_hours?: number | null
          company_address?: string | null
          company_city?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          company_state?: string | null
          company_zip?: string | null
          confirmation_email_body?: string | null
          confirmation_email_subject?: string | null
          created_at?: string
          currency?: string | null
          google_review_url?: string | null
          id?: string
          logo_url?: string | null
          max_advance_booking_days?: number | null
          minimum_notice_hours?: number | null
          notify_cancellations?: boolean | null
          notify_new_booking?: boolean | null
          notify_reminders?: boolean | null
          notify_sms?: boolean | null
          organization_id?: string | null
          payroll_custom_days?: number[] | null
          payroll_frequency?: string
          payroll_start_day?: number
          primary_color?: string | null
          reminder_email_body?: string | null
          reminder_email_subject?: string | null
          require_deposit?: boolean | null
          resend_api_key?: string | null
          review_sms_template?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_emails: {
        Row: {
          campaign_id: string | null
          clicked_at: string | null
          customer_id: string | null
          email: string
          id: string
          opened_at: string | null
          organization_id: string | null
          sent_at: string
          status: string
        }
        Insert: {
          campaign_id?: string | null
          clicked_at?: string | null
          customer_id?: string | null
          email: string
          id?: string
          opened_at?: string | null
          organization_id?: string | null
          sent_at?: string
          status?: string
        }
        Update: {
          campaign_id?: string | null
          clicked_at?: string | null
          customer_id?: string | null
          email?: string
          id?: string
          opened_at?: string | null
          organization_id?: string | null
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "automated_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_emails_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sms_sends: {
        Row: {
          campaign_id: string | null
          campaign_type: string | null
          converted: boolean | null
          converted_at: string | null
          customer_id: string | null
          id: string
          message_content: string | null
          organization_id: string | null
          phone_number: string | null
          sent_at: string
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_type?: string | null
          converted?: boolean | null
          converted_at?: string | null
          customer_id?: string | null
          id?: string
          message_content?: string | null
          organization_id?: string | null
          phone_number?: string | null
          sent_at?: string
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          campaign_type?: string | null
          converted?: boolean | null
          converted_at?: string | null
          customer_id?: string | null
          id?: string
          message_content?: string | null
          organization_id?: string | null
          phone_number?: string | null
          sent_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sms_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "automated_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sms_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sms_sends_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_audit_log: {
        Row: {
          amount_cents: number | null
          booking_id: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          failure_reason: string | null
          id: string
          match_status: string
          organization_id: string
          payment_method_id: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          failure_reason?: string | null
          id?: string
          match_status: string
          organization_id: string
          payment_method_id?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          failure_reason?: string | null
          id?: string
          match_status?: string
          organization_id?: string
          payment_method_id?: string | null
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          requires_photo: boolean | null
          sort_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          requires_photo?: boolean | null
          sort_order?: number | null
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          requires_photo?: boolean | null
          sort_order?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          organization_id: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          organization_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          organization_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          organization_id: string | null
          staff_id: string
          title: string
          type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          organization_id?: string | null
          staff_id: string
          title: string
          type?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string | null
          staff_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_booking_requests: {
        Row: {
          admin_response_note: string | null
          client_user_id: string
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          requested_date: string
          responded_at: string | null
          responded_by: string | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_response_note?: string | null
          client_user_id: string
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          requested_date: string
          responded_at?: string | null
          responded_by?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_response_note?: string | null
          client_user_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          requested_date?: string
          responded_at?: string | null
          responded_by?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_booking_requests_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_booking_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_feedback: {
        Row: {
          created_at: string
          customer_name: string
          feedback_date: string
          followup_needed: boolean | null
          id: string
          is_resolved: boolean | null
          issue_description: string | null
          organization_id: string | null
          resolution: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          feedback_date?: string
          followup_needed?: boolean | null
          id?: string
          is_resolved?: boolean | null
          issue_description?: string | null
          organization_id?: string | null
          resolution?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          feedback_date?: string
          followup_needed?: boolean | null
          id?: string
          is_resolved?: boolean | null
          issue_description?: string | null
          organization_id?: string | null
          resolution?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          client_user_id: string
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          organization_id: string
          related_request_id: string | null
          title: string
          type: string
        }
        Insert: {
          client_user_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          organization_id: string
          related_request_id?: string | null
          title: string
          type?: string
        }
        Update: {
          client_user_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          organization_id?: string
          related_request_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_feedback: {
        Row: {
          booking_id: string | null
          client_user_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          organization_id: string
          rating: number
        }
        Insert: {
          booking_id?: string | null
          client_user_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          organization_id: string
          rating: number
        }
        Update: {
          booking_id?: string | null
          client_user_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          organization_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_feedback_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_sessions: {
        Row: {
          client_user_id: string | null
          created_at: string
          customer_email: string | null
          duration_seconds: number
          id: string
          is_active: boolean
          organization_id: string | null
          session_end: string | null
          session_start: string
          updated_at: string
        }
        Insert: {
          client_user_id?: string | null
          created_at?: string
          customer_email?: string | null
          duration_seconds?: number
          id?: string
          is_active?: boolean
          organization_id?: string | null
          session_end?: string | null
          session_start?: string
          updated_at?: string
        }
        Update: {
          client_user_id?: string | null
          created_at?: string
          customer_email?: string | null
          duration_seconds?: number
          id?: string
          is_active?: boolean
          organization_id?: string | null
          session_end?: string | null
          session_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_sessions_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          must_change_password: boolean | null
          organization_id: string | null
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          organization_id?: string | null
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          organization_id?: string | null
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tier_settings: {
        Row: {
          benefits: Json | null
          color: string | null
          created_at: string
          id: string
          max_spending: number | null
          min_spending: number
          organization_id: string
          tier_name: string
          tier_order: number
          updated_at: string
        }
        Insert: {
          benefits?: Json | null
          color?: string | null
          created_at?: string
          id?: string
          max_spending?: number | null
          min_spending?: number
          organization_id: string
          tier_name: string
          tier_order?: number
          updated_at?: string
        }
        Update: {
          benefits?: Json | null
          color?: string | null
          created_at?: string
          id?: string
          max_spending?: number | null
          min_spending?: number
          organization_id?: string
          tier_name?: string
          tier_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tier_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_frequencies: {
        Row: {
          created_at: string
          days_of_week: number[] | null
          id: string
          interval_days: number
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          id?: string
          interval_days: number
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          id?: string
          interval_days?: number
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_frequencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_intelligence: {
        Row: {
          ai_insights: Json | null
          behavior_patterns: Json | null
          churn_risk_level: string | null
          churn_risk_score: number | null
          created_at: string | null
          customer_id: string
          days_since_last_contact: number | null
          id: string
          is_vip: boolean | null
          last_calculated_at: string | null
          next_booking_probability: number | null
          organization_id: string
          predicted_lifetime_value: number | null
          predicted_next_booking_date: string | null
          predicted_review_score: number | null
          recommended_services: Json | null
          sentiment_score: number | null
          sentiment_trend: string | null
          updated_at: string | null
          upsell_potential_score: number | null
          vip_reason: string | null
        }
        Insert: {
          ai_insights?: Json | null
          behavior_patterns?: Json | null
          churn_risk_level?: string | null
          churn_risk_score?: number | null
          created_at?: string | null
          customer_id: string
          days_since_last_contact?: number | null
          id?: string
          is_vip?: boolean | null
          last_calculated_at?: string | null
          next_booking_probability?: number | null
          organization_id: string
          predicted_lifetime_value?: number | null
          predicted_next_booking_date?: string | null
          predicted_review_score?: number | null
          recommended_services?: Json | null
          sentiment_score?: number | null
          sentiment_trend?: string | null
          updated_at?: string | null
          upsell_potential_score?: number | null
          vip_reason?: string | null
        }
        Update: {
          ai_insights?: Json | null
          behavior_patterns?: Json | null
          churn_risk_level?: string | null
          churn_risk_score?: number | null
          created_at?: string | null
          customer_id?: string
          days_since_last_contact?: number | null
          id?: string
          is_vip?: boolean | null
          last_calculated_at?: string | null
          next_booking_probability?: number | null
          organization_id?: string
          predicted_lifetime_value?: number | null
          predicted_next_booking_date?: string | null
          predicted_review_score?: number | null
          recommended_services?: Json | null
          sentiment_score?: number | null
          sentiment_trend?: string | null
          updated_at?: string | null
          upsell_potential_score?: number | null
          vip_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_intelligence_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_intelligence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_loyalty: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          lifetime_points: number | null
          points: number | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          lifetime_points?: number | null
          points?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          lifetime_points?: number | null
          points?: number | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_loyalty_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          credits: number | null
          customer_status: string
          email: string
          first_name: string
          id: string
          is_recurring: boolean
          last_name: string
          marketing_status: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          credits?: number | null
          customer_status?: string
          email: string
          first_name: string
          id?: string
          is_recurring?: boolean
          last_name: string
          marketing_status?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          credits?: number | null
          customer_status?: string
          email?: string
          first_name?: string
          id?: string
          is_recurring?: boolean
          last_name?: string
          marketing_status?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          customer_name: string
          customer_phone: string | null
          id: string
          organization_id: string
          paid_at: string | null
          payment_intent_id: string | null
          sms_sent_at: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          payment_intent_id?: string | null
          sms_sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          sms_sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          code: string
          created_at: string
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          is_test: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          organization_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          is_test?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          organization_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          is_test?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          organization_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          organization_id: string | null
          receipt_url: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          organization_id?: string | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          organization_id?: string | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_lead_webhook_events: {
        Row: {
          created_at: string
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      help_videos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_recommended: boolean | null
          loom_url: string
          organization_id: string | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_recommended?: boolean | null
          loom_url: string
          organization_id?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_recommended?: boolean | null
          loom_url?: string
          organization_id?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_custom_fields: {
        Row: {
          created_at: string
          field_name: string
          field_type: string
          id: string
          is_required: boolean | null
          options: Json | null
          organization_id: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_name: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_name?: string
          field_type?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          organization_id?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_custom_fields_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          created_at: string
          custom_fields: Json | null
          description: string | null
          id: string
          last_restocked_at: string | null
          min_quantity: number | null
          name: string
          organization_id: string | null
          quantity: number
          supplier: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          custom_fields?: Json | null
          description?: string | null
          id?: string
          last_restocked_at?: string | null
          min_quantity?: number | null
          name: string
          organization_id?: string | null
          quantity?: number
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          custom_fields?: Json | null
          description?: string | null
          id?: string
          last_restocked_at?: string | null
          min_quantity?: number | null
          name?: string
          organization_id?: string | null
          quantity?: number
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          organization_id: string | null
          quantity: number
          service_id: string | null
          sort_order: number | null
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          organization_id?: string | null
          quantity?: number
          service_id?: string | null
          sort_order?: number | null
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          organization_id?: string | null
          quantity?: number
          service_id?: string | null
          sort_order?: number | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_reminders: {
        Row: {
          created_at: string
          days_after_due: number
          id: string
          is_active: boolean | null
          organization_id: string
          send_email: boolean | null
          send_sms: boolean | null
        }
        Insert: {
          created_at?: string
          days_after_due?: number
          id?: string
          is_active?: boolean | null
          organization_id: string
          send_email?: boolean | null
          send_sms?: boolean | null
        }
        Update: {
          created_at?: string
          days_after_due?: number
          id?: string
          is_active?: boolean | null
          organization_id?: string
          send_email?: boolean | null
          send_sms?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          address: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number | null
          discount_percent: number | null
          due_date: string | null
          id: string
          invoice_number: number
          is_recurring: boolean | null
          lead_id: string | null
          notes: string | null
          organization_id: string | null
          paid_at: string | null
          recurring_interval: string | null
          scheduled_send_at: string | null
          send_copy_to_self: boolean | null
          sent_at: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number | null
          tax_percent: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: number
          is_recurring?: boolean | null
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          recurring_interval?: string | null
          scheduled_send_at?: string | null
          send_copy_to_self?: boolean | null
          sent_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_percent?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          due_date?: string | null
          id?: string
          invoice_number?: number
          is_recurring?: boolean | null
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          recurring_interval?: string | null
          scheduled_send_at?: string | null
          send_copy_to_self?: boolean | null
          sent_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_percent?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_intelligence: {
        Row: {
          ai_insights: Json | null
          behavior_patterns: Json | null
          conversion_score: number | null
          created_at: string | null
          engagement_score: number | null
          id: string
          is_hot_lead: boolean | null
          last_calculated_at: string | null
          lead_id: string
          organization_id: string
          predicted_conversion_rate: number | null
          preferred_contact_method: string | null
          recommended_followup_time: string | null
          updated_at: string | null
          urgency_score: number | null
        }
        Insert: {
          ai_insights?: Json | null
          behavior_patterns?: Json | null
          conversion_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          is_hot_lead?: boolean | null
          last_calculated_at?: string | null
          lead_id: string
          organization_id: string
          predicted_conversion_rate?: number | null
          preferred_contact_method?: string | null
          recommended_followup_time?: string | null
          updated_at?: string | null
          urgency_score?: number | null
        }
        Update: {
          ai_insights?: Json | null
          behavior_patterns?: Json | null
          conversion_score?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          is_hot_lead?: boolean | null
          last_calculated_at?: string | null
          lead_id?: string
          organization_id?: string
          predicted_conversion_rate?: number | null
          preferred_contact_method?: string | null
          recommended_followup_time?: string | null
          updated_at?: string | null
          urgency_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_intelligence_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_intelligence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          city: string | null
          created_at: string
          email: string
          estimated_value: number | null
          id: string
          message: string | null
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          service_interest: string | null
          source: string | null
          state: string | null
          status: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          email: string
          estimated_value?: number | null
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          service_interest?: string | null
          source?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          email?: string
          estimated_value?: number | null
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          service_interest?: string | null
          source?: string | null
          state?: string | null
          status?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          apt_suite: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          name: string
          organization_id: string | null
          phone: string | null
          service_area_zip_codes: string[] | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          apt_suite?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name: string
          organization_id?: string | null
          phone?: string | null
          service_area_zip_codes?: string[] | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          apt_suite?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          service_area_zip_codes?: string[] | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          booking_id: string | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          id: string
          organization_id: string | null
          points: number
          transaction_type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          points: number
          transaction_type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          points?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_sentiment_log: {
        Row: {
          analyzed_at: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          key_topics: Json | null
          lead_id: string | null
          message_direction: string
          message_preview: string | null
          message_source: string
          organization_id: string
          sentiment_label: string | null
          sentiment_score: number | null
          urgency_detected: boolean | null
        }
        Insert: {
          analyzed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          key_topics?: Json | null
          lead_id?: string | null
          message_direction: string
          message_preview?: string | null
          message_source: string
          organization_id: string
          sentiment_label?: string | null
          sentiment_score?: number | null
          urgency_detected?: boolean | null
        }
        Update: {
          analyzed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          key_topics?: Json | null
          lead_id?: string | null
          message_direction?: string
          message_preview?: string | null
          message_source?: string
          organization_id?: string
          sentiment_label?: string | null
          sentiment_score?: number | null
          urgency_detected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "message_sentiment_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sentiment_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sentiment_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_import_rows: {
        Row: {
          created_at: string
          created_record_id: string | null
          duplicate_of: string | null
          id: string
          import_id: string
          mapped_data: Json
          organization_id: string
          raw_data: Json
          row_number: number
          status: string
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          created_record_id?: string | null
          duplicate_of?: string | null
          id?: string
          import_id: string
          mapped_data?: Json
          organization_id: string
          raw_data?: Json
          row_number: number
          status?: string
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          created_record_id?: string | null
          duplicate_of?: string | null
          id?: string
          import_id?: string
          mapped_data?: Json
          organization_id?: string
          raw_data?: Json
          row_number?: number
          status?: string
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "migration_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_imports: {
        Row: {
          completed_at: string | null
          created_at: string
          data_type: string
          duplicate_rows: number | null
          error_log: Json | null
          error_rows: number | null
          field_mapping: Json | null
          id: string
          import_summary: Json | null
          imported_rows: number | null
          organization_id: string
          original_filename: string | null
          skipped_rows: number | null
          source: string
          started_at: string | null
          status: string
          total_rows: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_type: string
          duplicate_rows?: number | null
          error_log?: Json | null
          error_rows?: number | null
          field_mapping?: Json | null
          id?: string
          import_summary?: Json | null
          imported_rows?: number | null
          organization_id: string
          original_filename?: string | null
          skipped_rows?: number | null
          source: string
          started_at?: string | null
          status?: string
          total_rows?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_type?: string
          duplicate_rows?: number | null
          error_log?: Json | null
          error_rows?: number | null
          field_mapping?: Json | null
          id?: string
          import_summary?: Json | null
          imported_rows?: number | null
          organization_id?: string
          original_filename?: string | null
          skipped_rows?: number | null
          source?: string
          started_at?: string | null
          status?: string
          total_rows?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_sync_queue: {
        Row: {
          action: string
          created_at: string
          id: string
          organization_id: string
          record_data: Json
          synced: boolean | null
          synced_at: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          organization_id: string
          record_data: Json
          synced?: boolean | null
          synced_at?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          organization_id?: string
          record_data?: Json
          synced?: boolean | null
          synced_at?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_sync_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_tracker: {
        Row: {
          closed_deals: number | null
          cold_calls_made: number | null
          cold_emails_sent: number | null
          created_at: string
          id: string
          incoming_calls: number | null
          jobs_completed: number | null
          leads_followed_up: number | null
          notes: string | null
          organization_id: string | null
          revenue_booked: number | null
          track_date: string
          updated_at: string
        }
        Insert: {
          closed_deals?: number | null
          cold_calls_made?: number | null
          cold_emails_sent?: number | null
          created_at?: string
          id?: string
          incoming_calls?: number | null
          jobs_completed?: number | null
          leads_followed_up?: number | null
          notes?: string | null
          organization_id?: string | null
          revenue_booked?: number | null
          track_date?: string
          updated_at?: string
        }
        Update: {
          closed_deals?: number | null
          cold_calls_made?: number | null
          cold_emails_sent?: number | null
          created_at?: string
          id?: string
          incoming_calls?: number | null
          jobs_completed?: number | null
          leads_followed_up?: number | null
          notes?: string | null
          organization_id?: string | null
          revenue_booked?: number | null
          track_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_tracker_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_stripe_settings: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          is_connected: boolean | null
          organization_id: string
          stripe_account_id: string | null
          stripe_publishable_key: string | null
          stripe_secret_key: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean | null
          organization_id: string
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean | null
          organization_id?: string
          stripe_account_id?: string | null
          stripe_publishable_key?: string | null
          stripe_secret_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_stripe_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_automations: {
        Row: {
          automation_type: string
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          automation_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          automation_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_email_domains: {
        Row: {
          created_at: string
          dns_records: Json | null
          domain_name: string
          id: string
          organization_id: string
          resend_domain_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dns_records?: Json | null
          domain_name: string
          id?: string
          organization_id: string
          resend_domain_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dns_records?: Json | null
          domain_name?: string
          id?: string
          organization_id?: string
          resend_domain_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_email_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_email_settings: {
        Row: {
          created_at: string
          email_footer: string | null
          from_email: string
          from_name: string
          id: string
          organization_id: string
          reply_to_email: string | null
          resend_api_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_footer?: string | null
          from_email: string
          from_name: string
          id?: string
          organization_id: string
          reply_to_email?: string | null
          resend_api_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_footer?: string | null
          from_email?: string
          from_name?: string
          id?: string
          organization_id?: string
          reply_to_email?: string | null
          resend_api_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_email_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invoice_settings: {
        Row: {
          accept_ach: boolean | null
          accept_cards: boolean | null
          accept_cash: boolean | null
          accept_checks: boolean | null
          accept_paypal: boolean | null
          ach_fee_fixed: number | null
          ach_fee_percent: number | null
          card_fee_fixed: number | null
          card_fee_percent: number | null
          created_at: string
          default_billable_hours: number | null
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          accept_ach?: boolean | null
          accept_cards?: boolean | null
          accept_cash?: boolean | null
          accept_checks?: boolean | null
          accept_paypal?: boolean | null
          ach_fee_fixed?: number | null
          ach_fee_percent?: number | null
          card_fee_fixed?: number | null
          card_fee_percent?: number | null
          created_at?: string
          default_billable_hours?: number | null
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          accept_ach?: boolean | null
          accept_cards?: boolean | null
          accept_cash?: boolean | null
          accept_checks?: boolean | null
          accept_paypal?: boolean | null
          ach_fee_fixed?: number | null
          ach_fee_percent?: number | null
          card_fee_fixed?: number | null
          card_fee_percent?: number | null
          created_at?: string
          default_billable_hours?: number | null
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invoice_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_mobile_nav_settings: {
        Row: {
          created_at: string
          id: string
          items: Json
          organization_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          organization_id: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          organization_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_mobile_nav_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_pricing_settings: {
        Row: {
          booking_form_theme: string
          created_at: string
          demo_mode_enabled: boolean | null
          form_accent_color: string | null
          form_bg_color: string | null
          form_button_color: string | null
          form_button_text_color: string | null
          form_card_color: string | null
          form_text_color: string | null
          id: string
          loyalty_program_enabled: boolean
          organization_id: string
          sales_tax_percent: number | null
          show_addons_on_booking: boolean | null
          show_bed_bath_on_booking: boolean | null
          show_frequency_discount: boolean | null
          show_home_condition: boolean | null
          show_pet_options: boolean | null
          show_sqft_on_booking: boolean | null
          updated_at: string
        }
        Insert: {
          booking_form_theme?: string
          created_at?: string
          demo_mode_enabled?: boolean | null
          form_accent_color?: string | null
          form_bg_color?: string | null
          form_button_color?: string | null
          form_button_text_color?: string | null
          form_card_color?: string | null
          form_text_color?: string | null
          id?: string
          loyalty_program_enabled?: boolean
          organization_id: string
          sales_tax_percent?: number | null
          show_addons_on_booking?: boolean | null
          show_bed_bath_on_booking?: boolean | null
          show_frequency_discount?: boolean | null
          show_home_condition?: boolean | null
          show_pet_options?: boolean | null
          show_sqft_on_booking?: boolean | null
          updated_at?: string
        }
        Update: {
          booking_form_theme?: string
          created_at?: string
          demo_mode_enabled?: boolean | null
          form_accent_color?: string | null
          form_bg_color?: string | null
          form_button_color?: string | null
          form_button_text_color?: string | null
          form_card_color?: string | null
          form_text_color?: string | null
          id?: string
          loyalty_program_enabled?: boolean
          organization_id?: string
          sales_tax_percent?: number | null
          show_addons_on_booking?: boolean | null
          show_bed_bath_on_booking?: boolean | null
          show_frequency_discount?: boolean | null
          show_home_condition?: boolean | null
          show_pet_options?: boolean | null
          show_sqft_on_booking?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_pricing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_sms_settings: {
        Row: {
          created_at: string
          id: string
          openphone_api_key: string | null
          openphone_phone_number_id: string | null
          organization_id: string
          reminder_hours_before: number | null
          sms_appointment_reminder: boolean | null
          sms_booking_confirmation: boolean | null
          sms_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          openphone_api_key?: string | null
          openphone_phone_number_id?: string | null
          organization_id: string
          reminder_hours_before?: number | null
          sms_appointment_reminder?: boolean | null
          sms_booking_confirmation?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          openphone_api_key?: string | null
          openphone_phone_number_id?: string | null
          organization_id?: string
          reminder_hours_before?: number | null
          sms_appointment_reminder?: boolean | null
          sms_booking_confirmation?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_sms_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      page_seo_metadata: {
        Row: {
          canonical_url: string | null
          created_at: string
          id: string
          meta_description: string | null
          no_index: boolean | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          organization_id: string | null
          page_path: string
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          no_index?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          organization_id?: string | null
          page_path: string
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          no_index?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          organization_id?: string | null
          page_path?: string
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_seo_metadata_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_audit_log: {
        Row: {
          action: string
          affected_booking_ids: string[] | null
          created_at: string
          details: Json | null
          id: string
          organization_id: string
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          action: string
          affected_booking_ids?: string[] | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          user_id: string
        }
        Update: {
          action?: string
          affected_booking_ids?: string[] | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_payments: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          organization_id: string | null
          paid_at: string
          paid_by: string
          staff_id: string
          week_start: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          organization_id?: string | null
          paid_at?: string
          paid_by: string
          staff_id: string
          week_start: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          organization_id?: string | null
          paid_at?: string
          paid_by?: string
          staff_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          created_at: string
          id: string
          include_taxes_in_pay_base: boolean
          include_tips_in_pay_base: boolean
          labor_percent_warning_threshold: number
          margin_percent_good_threshold: number
          organization_id: string
          payroll_week_start_day: string
          processing_fee_mode: string
          processing_fee_percent: number
          updated_at: string
          vendor_cost_flat: number | null
          vendor_cost_mode: string
          vendor_cost_percent: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          include_taxes_in_pay_base?: boolean
          include_tips_in_pay_base?: boolean
          labor_percent_warning_threshold?: number
          margin_percent_good_threshold?: number
          organization_id: string
          payroll_week_start_day?: string
          processing_fee_mode?: string
          processing_fee_percent?: number
          updated_at?: string
          vendor_cost_flat?: number | null
          vendor_cost_mode?: string
          vendor_cost_percent?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          include_taxes_in_pay_base?: boolean
          include_tips_in_pay_base?: boolean
          labor_percent_warning_threshold?: number
          margin_percent_good_threshold?: number
          organization_id?: string
          payroll_week_start_day?: string
          processing_fee_mode?: string
          processing_fee_percent?: number
          updated_at?: string
          vendor_cost_flat?: number | null
          vendor_cost_mode?: string
          vendor_cost_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pnl_settings: {
        Row: {
          annual_revenue_goal: number | null
          avg_job_size_goal: number | null
          churn_rate_goal: number | null
          closing_rate_goal: number | null
          contractor_percent: number | null
          created_at: string
          credit_card_percent: number | null
          direct_mail_spend: Json | null
          facebook_ads_spend: Json | null
          first_time_to_recurring_goal: number | null
          fixed_cost_goal: number | null
          fixed_overhead_items: Json | null
          goal_first_time_revenue_amount: number | null
          goal_repeat_revenue_amount: number | null
          goal_repeat_revenue_percent: number | null
          google_lsa_spend: Json | null
          id: string
          last_year_revenue: number | null
          local_marketing_spend: Json | null
          marketing_channel_names: Json
          marketing_percent_of_revenue: number | null
          monthly_first_time_goals: Json | null
          monthly_fixed_cost_goals: Json | null
          monthly_inbound_leads_goals: Json | null
          monthly_marketing_budget: Json | null
          monthly_recurring_goals: Json | null
          monthly_sales_goals: Json | null
          net_profit_goal_percent: number | null
          organization_id: string | null
          other_online_spend: Json | null
          recruiting_costs: Json | null
          refunds_percent: number | null
          target_cpa: number | null
          target_cpl: number | null
          updated_at: string
          variable_overhead_items: Json | null
          year: number
        }
        Insert: {
          annual_revenue_goal?: number | null
          avg_job_size_goal?: number | null
          churn_rate_goal?: number | null
          closing_rate_goal?: number | null
          contractor_percent?: number | null
          created_at?: string
          credit_card_percent?: number | null
          direct_mail_spend?: Json | null
          facebook_ads_spend?: Json | null
          first_time_to_recurring_goal?: number | null
          fixed_cost_goal?: number | null
          fixed_overhead_items?: Json | null
          goal_first_time_revenue_amount?: number | null
          goal_repeat_revenue_amount?: number | null
          goal_repeat_revenue_percent?: number | null
          google_lsa_spend?: Json | null
          id?: string
          last_year_revenue?: number | null
          local_marketing_spend?: Json | null
          marketing_channel_names?: Json
          marketing_percent_of_revenue?: number | null
          monthly_first_time_goals?: Json | null
          monthly_fixed_cost_goals?: Json | null
          monthly_inbound_leads_goals?: Json | null
          monthly_marketing_budget?: Json | null
          monthly_recurring_goals?: Json | null
          monthly_sales_goals?: Json | null
          net_profit_goal_percent?: number | null
          organization_id?: string | null
          other_online_spend?: Json | null
          recruiting_costs?: Json | null
          refunds_percent?: number | null
          target_cpa?: number | null
          target_cpl?: number | null
          updated_at?: string
          variable_overhead_items?: Json | null
          year?: number
        }
        Update: {
          annual_revenue_goal?: number | null
          avg_job_size_goal?: number | null
          churn_rate_goal?: number | null
          closing_rate_goal?: number | null
          contractor_percent?: number | null
          created_at?: string
          credit_card_percent?: number | null
          direct_mail_spend?: Json | null
          facebook_ads_spend?: Json | null
          first_time_to_recurring_goal?: number | null
          fixed_cost_goal?: number | null
          fixed_overhead_items?: Json | null
          goal_first_time_revenue_amount?: number | null
          goal_repeat_revenue_amount?: number | null
          goal_repeat_revenue_percent?: number | null
          google_lsa_spend?: Json | null
          id?: string
          last_year_revenue?: number | null
          local_marketing_spend?: Json | null
          marketing_channel_names?: Json
          marketing_percent_of_revenue?: number | null
          monthly_first_time_goals?: Json | null
          monthly_fixed_cost_goals?: Json | null
          monthly_inbound_leads_goals?: Json | null
          monthly_marketing_budget?: Json | null
          monthly_recurring_goals?: Json | null
          monthly_sales_goals?: Json | null
          net_profit_goal_percent?: number | null
          organization_id?: string | null
          other_online_spend?: Json | null
          recruiting_costs?: Json | null
          refunds_percent?: number | null
          target_cpa?: number | null
          target_cpl?: number | null
          updated_at?: string
          variable_overhead_items?: Json | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pnl_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          accepted_at: string | null
          address: string | null
          bathrooms: string | null
          bedrooms: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number | null
          discount_percent: number | null
          extras: Json | null
          id: string
          lead_id: string | null
          notes: string | null
          organization_id: string | null
          quote_number: number
          service_id: string | null
          square_footage: string | null
          state: string | null
          status: string | null
          subtotal: number
          total_amount: number
          updated_at: string
          valid_until: string | null
          zip_code: string | null
        }
        Insert: {
          accepted_at?: string | null
          address?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          extras?: Json | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          quote_number?: number
          service_id?: string | null
          square_footage?: string | null
          state?: string | null
          status?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          zip_code?: string | null
        }
        Update: {
          accepted_at?: string | null
          address?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          extras?: Json | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          quote_number?: number
          service_id?: string | null
          square_footage?: string | null
          state?: string | null
          status?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      rebooking_reminder_queue: {
        Row: {
          booking_id: string
          cancelled: boolean
          cancelled_reason: string | null
          created_at: string
          customer_id: string
          defer_count: number
          deferred_until: string | null
          error: string | null
          id: string
          organization_id: string
          send_at: string
          sent: boolean
          sent_at: string | null
        }
        Insert: {
          booking_id: string
          cancelled?: boolean
          cancelled_reason?: string | null
          created_at?: string
          customer_id: string
          defer_count?: number
          deferred_until?: string | null
          error?: string | null
          id?: string
          organization_id: string
          send_at: string
          sent?: boolean
          sent_at?: string | null
        }
        Update: {
          booking_id?: string
          cancelled?: boolean
          cancelled_reason?: string | null
          created_at?: string
          customer_id?: string
          defer_count?: number
          deferred_until?: string | null
          error?: string | null
          id?: string
          organization_id?: string
          send_at?: string
          sent?: boolean
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rebooking_reminder_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rebooking_reminder_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rebooking_reminder_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_bookings: {
        Row: {
          address: string | null
          bathrooms: string | null
          bedrooms: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          extras: Json | null
          frequency: string
          id: string
          is_active: boolean
          last_generated_at: string | null
          next_scheduled_at: string | null
          notes: string | null
          organization_id: string | null
          preferred_day: number | null
          preferred_time: string | null
          recurring_days_of_week: number[] | null
          service_id: string | null
          square_footage: string | null
          staff_id: string | null
          state: string | null
          total_amount: number
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          extras?: Json | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          next_scheduled_at?: string | null
          notes?: string | null
          organization_id?: string | null
          preferred_day?: number | null
          preferred_time?: string | null
          recurring_days_of_week?: number[] | null
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          total_amount?: number
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          bathrooms?: string | null
          bedrooms?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          extras?: Json | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          next_scheduled_at?: string | null
          notes?: string | null
          organization_id?: string | null
          preferred_day?: number | null
          preferred_time?: string | null
          recurring_days_of_week?: number[] | null
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          total_amount?: number
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_offer_queue: {
        Row: {
          booking_id: string
          cancelled: boolean
          cancelled_reason: string | null
          created_at: string
          customer_id: string
          defer_count: number
          deferred_until: string | null
          error: string | null
          id: string
          organization_id: string
          send_at: string
          sent: boolean
          sent_at: string | null
        }
        Insert: {
          booking_id: string
          cancelled?: boolean
          cancelled_reason?: string | null
          created_at?: string
          customer_id: string
          defer_count?: number
          deferred_until?: string | null
          error?: string | null
          id?: string
          organization_id: string
          send_at: string
          sent?: boolean
          sent_at?: string | null
        }
        Update: {
          booking_id?: string
          cancelled?: boolean
          cancelled_reason?: string | null
          created_at?: string
          customer_id?: string
          defer_count?: number
          deferred_until?: string | null
          error?: string | null
          id?: string
          organization_id?: string
          send_at?: string
          sent?: boolean
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_offer_queue_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_offer_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          credit_amount: number
          credit_awarded: boolean | null
          expires_at: string | null
          id: string
          organization_id: string | null
          referral_code: string
          referred_customer_id: string | null
          referred_email: string
          referred_name: string | null
          referrer_customer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          credit_amount?: number
          credit_awarded?: boolean | null
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          referral_code: string
          referred_customer_id?: string | null
          referred_email: string
          referred_name?: string | null
          referrer_customer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          credit_amount?: number
          credit_awarded?: boolean | null
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          referral_code?: string
          referred_customer_id?: string | null
          referred_email?: string
          referred_name?: string | null
          referrer_customer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_customer_id_fkey"
            columns: ["referred_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_customer_id_fkey"
            columns: ["referrer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          google_review_url: string | null
          id: string
          opened_at: string | null
          platform: string | null
          rating: number | null
          responded_at: string | null
          review_link_token: string | null
          review_text: string | null
          sent_at: string | null
          staff_id: string | null
          status: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          google_review_url?: string | null
          id?: string
          opened_at?: string | null
          platform?: string | null
          rating?: number | null
          responded_at?: string | null
          review_link_token?: string | null
          review_text?: string | null
          sent_at?: string | null
          staff_id?: string | null
          status?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          google_review_url?: string | null
          id?: string
          opened_at?: string | null
          platform?: string | null
          rating?: number | null
          responded_at?: string | null
          review_link_token?: string | null
          review_text?: string | null
          sent_at?: string | null
          staff_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_pricing: {
        Row: {
          bedroom_pricing: Json | null
          created_at: string
          extras: Json | null
          home_condition_options: Json | null
          id: string
          minimum_price: number | null
          organization_id: string
          pet_options: Json | null
          service_id: string
          sqft_prices: Json | null
          updated_at: string
        }
        Insert: {
          bedroom_pricing?: Json | null
          created_at?: string
          extras?: Json | null
          home_condition_options?: Json | null
          id?: string
          minimum_price?: number | null
          organization_id: string
          pet_options?: Json | null
          service_id: string
          sqft_prices?: Json | null
          updated_at?: string
        }
        Update: {
          bedroom_pricing?: Json | null
          created_at?: string
          extras?: Json | null
          home_condition_options?: Json | null
          id?: string
          minimum_price?: number | null
          organization_id?: string
          pet_options?: Json | null
          service_id?: string
          sqft_prices?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_pricing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_pricing_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          created_at: string
          deposit_amount: number | null
          description: string | null
          duration: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          organization_id: string | null
          price: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          description?: string | null
          duration?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          organization_id?: string | null
          price?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          description?: string | null
          duration?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string | null
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      short_urls: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string | null
          target_url: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          target_url: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_urls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          conversation_type: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          id: string
          last_message_at: string
          organization_id: string
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          conversation_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          id?: string
          last_message_at?: string
          organization_id: string
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          conversation_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          id?: string
          last_message_at?: string
          organization_id?: string
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          delivery_status: string | null
          direction: string
          id: string
          media_urls: string[] | null
          openphone_message_id: string | null
          organization_id: string
          sent_at: string
          status: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          direction: string
          id?: string
          media_urls?: string[] | null
          openphone_message_id?: string | null
          organization_id: string
          sent_at?: string
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          direction?: string
          id?: string
          media_urls?: string[] | null
          openphone_message_id?: string | null
          organization_id?: string
          sent_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          organization_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          avatar_url: string | null
          base_wage: number | null
          bio: string | null
          calendar_color: string | null
          created_at: string
          default_hours: number | null
          ein: string | null
          email: string
          home_address: string | null
          home_latitude: number | null
          home_longitude: number | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          percentage_rate: number | null
          phone: string | null
          ssn_last4: string | null
          tax_classification: string | null
          tax_document_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          base_wage?: number | null
          bio?: string | null
          calendar_color?: string | null
          created_at?: string
          default_hours?: number | null
          ein?: string | null
          email: string
          home_address?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          percentage_rate?: number | null
          phone?: string | null
          ssn_last4?: string | null
          tax_classification?: string | null
          tax_document_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          base_wage?: number | null
          bio?: string | null
          calendar_color?: string | null
          created_at?: string
          default_hours?: number | null
          ein?: string | null
          email?: string
          home_address?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          percentage_rate?: number | null
          phone?: string | null
          ssn_last4?: string | null
          tax_classification?: string | null
          tax_document_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          document_type: string
          file_name: string
          file_path: string
          id: string
          organization_id: string
          staff_id: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          document_type?: string
          file_name: string
          file_path: string
          id?: string
          organization_id: string
          staff_id: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          document_type?: string
          file_name?: string
          file_path?: string
          id?: string
          organization_id?: string
          staff_id?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          id?: string
          service_id: string
          staff_id: string
        }
        Update: {
          id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          level: string
          message: string
          organization_id: string | null
          request_id: string | null
          source: string
          stack_trace: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message: string
          organization_id?: string | null
          request_id?: string | null
          source: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message?: string
          organization_id?: string | null
          request_id?: string | null
          source?: string
          stack_trace?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_and_notes: {
        Row: {
          content: string
          created_at: string
          due_date: string | null
          id: string
          is_completed: boolean | null
          last_reset_at: string | null
          organization_id: string | null
          sort_order: number | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          last_reset_at?: string | null
          organization_id?: string | null
          sort_order?: number | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          last_reset_at?: string | null
          organization_id?: string | null
          sort_order?: number | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_and_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          booking_id: string | null
          channel: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          organization_id: string | null
          sender_id: string
          sender_type: string
        }
        Insert: {
          booking_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          organization_id?: string | null
          sender_id: string
          sender_type: string
        }
        Update: {
          booking_id?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          organization_id?: string | null
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          amount: number | null
          booking_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          organization_id: string
          paid_at: string | null
          payment_intent_id: string | null
          sms_sent_at: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          booking_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          payment_intent_id?: string | null
          sms_sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          booking_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          sms_sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          preference_key: string
          preference_value: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      user_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          session_end: string | null
          session_start: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          session_end?: string | null
          session_start?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          session_end?: string | null
          session_start?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      working_hours: {
        Row: {
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean
          staff_id: string | null
          start_time: string
        }
        Insert: {
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean
          staff_id?: string | null
          start_time: string
        }
        Update: {
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean
          staff_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      staff_safe: {
        Row: {
          avatar_url: string | null
          base_wage: number | null
          bio: string | null
          created_at: string | null
          ein: string | null
          email: string | null
          hourly_rate: number | null
          id: string | null
          is_active: boolean | null
          name: string | null
          organization_id: string | null
          percentage_rate: number | null
          phone: string | null
          ssn_last4: string | null
          tax_classification: string | null
          tax_document_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          base_wage?: never
          bio?: string | null
          created_at?: string | null
          ein?: never
          email?: string | null
          hourly_rate?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          organization_id?: string | null
          percentage_rate?: never
          phone?: string | null
          ssn_last4?: never
          tax_classification?: never
          tax_document_url?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          base_wage?: never
          bio?: string | null
          created_at?: string | null
          ein?: never
          email?: string | null
          hourly_rate?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          organization_id?: string | null
          percentage_rate?: never
          phone?: string | null
          ssn_last4?: never
          tax_classification?: never
          tax_document_url?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_client_portal_location: {
        Args: {
          p_address: string
          p_apt_suite?: string
          p_city?: string
          p_client_user_id: string
          p_is_primary?: boolean
          p_name: string
          p_state?: string
          p_zip_code?: string
        }
        Returns: string
      }
      change_client_portal_password: {
        Args: {
          p_current_password: string
          p_new_password: string
          p_user_id: string
        }
        Returns: Json
      }
      client_cancel_booking: {
        Args: { p_booking_id: string; p_customer_id: string }
        Returns: Json
      }
      create_booking_from_request: {
        Args: {
          p_customer_id: string
          p_duration?: number
          p_organization_id: string
          p_request_id: string
          p_scheduled_at: string
          p_service_id: string
        }
        Returns: string
      }
      delete_client_booking_request: {
        Args: { p_client_user_id: string; p_request_id: string }
        Returns: boolean
      }
      delete_client_portal_location: {
        Args: { p_client_user_id: string; p_location_id: string }
        Returns: boolean
      }
      delete_client_portal_notification: {
        Args: { p_client_user_id: string; p_notification_id: string }
        Returns: boolean
      }
      get_client_portal_bookings: {
        Args: { p_customer_id: string }
        Returns: {
          address: string
          booking_number: number
          id: string
          scheduled_at: string
          service_name: string
          status: string
          total_amount: number
        }[]
      }
      get_client_portal_locations: {
        Args: { p_customer_id: string }
        Returns: {
          address: string
          apt_suite: string
          city: string
          id: string
          is_primary: boolean
          name: string
          state: string
          zip_code: string
        }[]
      }
      get_client_portal_notifications: {
        Args: { p_client_user_id: string }
        Returns: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
        }[]
      }
      get_client_portal_requests: {
        Args: { p_client_user_id: string }
        Returns: {
          admin_response_note: string
          created_at: string
          id: string
          notes: string
          requested_date: string
          service_name: string
          status: string
        }[]
      }
      get_client_portal_user_data: {
        Args: { p_email: string }
        Returns: {
          customer_id: string
          email: string
          first_name: string
          is_active: boolean
          last_name: string
          loyalty_lifetime_points: number
          loyalty_points: number
          loyalty_tier: string
          must_change_password: boolean
          organization_id: string
          phone: string
          property_type: string
          user_id: string
          username: string
        }[]
      }
      get_client_tax_report: {
        Args: { p_client_user_id: string; p_year?: number }
        Returns: {
          address: string
          booking_date: string
          payment_status: string
          service_name: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }[]
      }
      get_loyalty_tier_info: {
        Args: { p_organization_id: string }
        Returns: {
          benefits: Json
          color: string
          max_spending: number
          min_spending: number
          tier_name: string
          tier_order: number
        }[]
      }
      get_user_organization_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_client_portal_password: {
        Args: { p_password: string }
        Returns: string
      }
      is_client_portal_user: {
        Args: { _client_user_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      mark_client_notification_read: {
        Args: { p_client_user_id: string; p_notification_id: string }
        Returns: boolean
      }
      reset_client_portal_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: boolean
      }
      reset_daily_tasks: { Args: never; Returns: undefined }
      staff_can_view_customer: {
        Args: { _customer_id: string; _org_id: string }
        Returns: boolean
      }
      submit_client_booking_request: {
        Args: {
          p_client_user_id: string
          p_customer_id: string
          p_notes?: string
          p_organization_id: string
          p_requested_date: string
          p_service_id?: string
        }
        Returns: string
      }
      update_client_portal_last_login: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_client_portal_profile: {
        Args: {
          p_client_user_id: string
          p_first_name: string
          p_last_name: string
          p_phone?: string
        }
        Returns: boolean
      }
      validate_client_portal_login: {
        Args: { p_email: string; p_password: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "user"
      booking_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      payment_status: "pending" | "partial" | "paid" | "refunded"
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
      app_role: ["admin", "staff", "user"],
      booking_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      payment_status: ["pending", "partial", "paid", "refunded"],
    },
  },
} as const
