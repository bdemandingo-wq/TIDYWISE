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
      booking_checklist_items: {
        Row: {
          booking_checklist_id: string
          checklist_item_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          notes: string | null
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
        ]
      }
      booking_checklists: {
        Row: {
          booking_id: string
          completed_at: string | null
          created_at: string
          id: string
          staff_id: string | null
          template_id: string | null
        }
        Insert: {
          booking_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          staff_id?: string | null
          template_id?: string | null
        }
        Update: {
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
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
          photo_type: string | null
          photo_url: string
          staff_id: string | null
        }
        Insert: {
          booking_id: string
          caption?: string | null
          created_at?: string | null
          id?: string
          photo_type?: string | null
          photo_url: string
          staff_id?: string | null
        }
        Update: {
          booking_id?: string
          caption?: string | null
          created_at?: string | null
          id?: string
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
          cleaner_wage: number | null
          cleaner_wage_type: string | null
          created_at: string
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
          payment_intent_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
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
          cleaner_wage?: number | null
          cleaner_wage_type?: string | null
          created_at?: string
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
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
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
          cleaner_wage?: number | null
          cleaner_wage_type?: string | null
          created_at?: string
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
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
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
      business_settings: {
        Row: {
          accent_color: string | null
          allow_online_booking: boolean | null
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
        ]
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
          email: string
          first_name: string
          id: string
          last_name: string
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
          email: string
          first_name: string
          id?: string
          last_name: string
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
          email?: string
          first_name?: string
          id?: string
          last_name?: string
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
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          city: string | null
          created_at: string
          email: string
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
          city: string | null
          created_at: string
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
          city?: string | null
          created_at?: string
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
          city?: string | null
          created_at?: string
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
          points: number
          transaction_type: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          points: number
          transaction_type: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
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
      organization_email_settings: {
        Row: {
          created_at: string
          email_footer: string | null
          from_email: string
          from_name: string
          id: string
          organization_id: string
          reply_to_email: string | null
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
      organization_pricing_settings: {
        Row: {
          created_at: string
          demo_mode_enabled: boolean | null
          id: string
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
          created_at?: string
          demo_mode_enabled?: boolean | null
          id?: string
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
          created_at?: string
          demo_mode_enabled?: boolean | null
          id?: string
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
      sms_conversations: {
        Row: {
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
          direction: string
          id: string
          openphone_message_id: string | null
          organization_id: string
          sent_at: string
          status: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          openphone_message_id?: string | null
          organization_id: string
          sent_at?: string
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
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
      staff: {
        Row: {
          avatar_url: string | null
          base_wage: number | null
          bio: string | null
          calendar_color: string | null
          created_at: string
          ein: string | null
          email: string
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
          ein?: string | null
          email: string
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
          ein?: string | null
          email?: string
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
      team_messages: {
        Row: {
          booking_id: string | null
          channel: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
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
      get_user_organization_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
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
