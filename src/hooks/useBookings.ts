import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { Json } from '@/integrations/supabase/types';

export interface BookingWithDetails {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  total_amount: number;
  deposit_paid: number | null;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_intent_id: string | null;
  notes: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  apt_suite: string | null;
  frequency: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  square_footage: string | null;
  extras: Json | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  staff_id: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  service: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    duration: number;
  } | null;
  staff: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
}

export interface CreateBookingData {
  customer_id?: string;
  service_id?: string;
  staff_id?: string | null;
  scheduled_at: string;
  duration: number;
  total_amount: number;
  deposit_paid?: number;
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  payment_status?: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_intent_id?: string;
  notes?: string | null;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  apt_suite?: string;
  frequency?: string;
  bedrooms?: string;
  bathrooms?: string;
  square_footage?: string;
  extras?: Json;
  is_draft?: boolean;
  cleaner_wage?: number | null;
  cleaner_wage_type?: string | null;
  cleaner_override_hours?: number | null;
  cleaner_actual_payment?: number | null;
}

export interface UpdateBookingData {
  id: string;
  customer_id?: string;
  service_id?: string;
  staff_id?: string | null;
  scheduled_at?: string;
  duration?: number;
  total_amount?: number;
  deposit_paid?: number | null;
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  payment_status?: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_intent_id?: string | null;
  notes?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  apt_suite?: string | null;
  frequency?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  square_footage?: string | null;
  extras?: Json | null;
  is_draft?: boolean;
  cleaner_wage?: number | null;
  cleaner_wage_type?: string | null;
  cleaner_override_hours?: number | null;
  cleaner_actual_payment?: number | null;
}

export interface NewCustomerData {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export function useBookings() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ['bookings', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone),
          service:services(id, name, description, price, duration),
          staff:staff(id, name, email, phone)
        `)
        .eq('organization_id', organizationId)
        .order('scheduled_at', { ascending: false })
        .limit(500); // Pagination limit for performance

      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      return data as BookingWithDetails[];
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2, // 2 minutes - bookings change frequently
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  });
}

export function useBookingsByDateRange(startDate: Date, endDate: Date) {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ['bookings', 'range', organizationId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone),
          service:services(id, name, description, price, duration),
          staff:staff(id, name, email, phone)
        `)
        .eq('organization_id', organizationId)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      return data as BookingWithDetails[];
    },
    enabled: !!organizationId,
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();

  return useMutation({
    mutationFn: async (data: CreateBookingData) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({ ...data, organization_id: organization.id })
        .select()
        .single();

      if (error) {
        console.error('Error creating booking:', error);
        throw error;
      }

      return booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Booking created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create booking: ${error.message}`);
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateBookingData) => {
      const { data: booking, error } = await supabase
        .from('bookings')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating booking:', error);
        throw error;
      }

      return booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Booking updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update booking: ${error.message}`);
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting booking:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Booking deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete booking: ${error.message}`);
    },
  });
}

export function useCustomers() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ['customers', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1000); // Pagination limit

      if (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }

      return data;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5, // 5 minutes - customers change less frequently
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();

  return useMutation({
    mutationFn: async (data: NewCustomerData) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }

      // Create the customer
      const { data: customer, error } = await supabase
        .from('customers')
        .insert({ ...data, organization_id: organization.id })
        .select()
        .single();

      if (error) {
        console.error('Error creating customer:', error);
        throw error;
      }

      // Auto-create a corresponding lead entry
      const leadData = {
        name: `${data.first_name} ${data.last_name}`.trim(),
        email: data.email,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        source: 'customer_import',
        status: 'new',
        organization_id: organization.id,
      };

      const { error: leadError } = await supabase
        .from('leads')
        .insert(leadData);

      if (leadError) {
        console.warn('Lead auto-creation failed:', leadError.message);
        // Don't throw - customer was created successfully
      }

      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Customer added and new lead created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create customer: ${error.message}`);
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting customer:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete customer: ${error.message}`);
    },
  });
}

export function useServices() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ['services', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching services:', error);
        throw error;
      }

      return data;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10, // 10 minutes - services rarely change
    gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
  });
}

export function useStaff() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: ['staff', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return [];
      }
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching staff:', error);
        throw error;
      }

      return data;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
  });
}
