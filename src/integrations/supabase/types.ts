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
          duration: number
          extras: Json | null
          frequency: string | null
          id: string
          is_draft: boolean | null
          location_id: string | null
          notes: string | null
          payment_intent_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          scheduled_at: string
          service_id: string | null
          square_footage: string | null
          staff_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["booking_status"]
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
          duration: number
          extras?: Json | null
          frequency?: string | null
          id?: string
          is_draft?: boolean | null
          location_id?: string | null
          notes?: string | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          scheduled_at: string
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
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
          duration?: number
          extras?: Json | null
          frequency?: string | null
          id?: string
          is_draft?: boolean | null
          location_id?: string | null
          notes?: string | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          scheduled_at?: string
          service_id?: string | null
          square_footage?: string | null
          staff_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
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
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
          id: string
          logo_url: string | null
          max_advance_booking_days: number | null
          minimum_notice_hours: number | null
          notify_cancellations: boolean | null
          notify_new_booking: boolean | null
          notify_reminders: boolean | null
          notify_sms: boolean | null
          primary_color: string | null
          reminder_email_body: string | null
          reminder_email_subject: string | null
          require_deposit: boolean | null
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
          id?: string
          logo_url?: string | null
          max_advance_booking_days?: number | null
          minimum_notice_hours?: number | null
          notify_cancellations?: boolean | null
          notify_new_booking?: boolean | null
          notify_reminders?: boolean | null
          notify_sms?: boolean | null
          primary_color?: string | null
          reminder_email_body?: string | null
          reminder_email_subject?: string | null
          require_deposit?: boolean | null
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
          id?: string
          logo_url?: string | null
          max_advance_booking_days?: number | null
          minimum_notice_hours?: number | null
          notify_cancellations?: boolean | null
          notify_new_booking?: boolean | null
          notify_reminders?: boolean | null
          notify_sms?: boolean | null
          primary_color?: string | null
          reminder_email_body?: string | null
          reminder_email_subject?: string | null
          require_deposit?: boolean | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
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
          resolution?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
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
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
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
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
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
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          created_at: string
          description: string | null
          id: string
          last_restocked_at: string | null
          min_quantity: number | null
          name: string
          quantity: number
          supplier: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          description?: string | null
          id?: string
          last_restocked_at?: string | null
          min_quantity?: number | null
          name: string
          quantity?: number
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string
          description?: string | null
          id?: string
          last_restocked_at?: string | null
          min_quantity?: number | null
          name?: string
          quantity?: number
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
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
          phone?: string | null
          service_area_zip_codes?: string[] | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
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
          revenue_booked?: number | null
          track_date?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      review_requests: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          opened_at: string | null
          platform: string | null
          rating: number | null
          responded_at: string | null
          review_text: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          opened_at?: string | null
          platform?: string | null
          rating?: number | null
          responded_at?: string | null
          review_text?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          opened_at?: string | null
          platform?: string | null
          rating?: number | null
          responded_at?: string | null
          review_text?: string | null
          sent_at?: string | null
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
        ]
      }
      service_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      staff: {
        Row: {
          avatar_url: string | null
          base_wage: number | null
          bio: string | null
          created_at: string
          ein: string | null
          email: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          name: string
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
          created_at?: string
          ein?: string | null
          email: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
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
          created_at?: string
          ein?: string | null
          email?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          percentage_rate?: number | null
          phone?: string | null
          ssn_last4?: string | null
          tax_classification?: string | null
          tax_document_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
        ]
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
