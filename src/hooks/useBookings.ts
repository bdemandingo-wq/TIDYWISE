import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  created_at: string;
  updated_at: string;
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
  staff_id?: string;
  scheduled_at: string;
  duration: number;
  total_amount: number;
  deposit_paid?: number;
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  payment_status?: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_intent_id?: string;
  notes?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
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
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone),
          service:services(id, name, description, price, duration),
          staff:staff(id, name, email, phone)
        `)
        .order('scheduled_at', { ascending: false });

      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      return data as BookingWithDetails[];
    },
  });
}

export function useBookingsByDateRange(startDate: Date, endDate: Date) {
  return useQuery({
    queryKey: ['bookings', 'range', startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(id, first_name, last_name, email, phone),
          service:services(id, name, description, price, duration),
          staff:staff(id, name, email, phone)
        `)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error fetching bookings:', error);
        throw error;
      }

      return data as BookingWithDetails[];
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBookingData) => {
      const { data: booking, error } = await supabase
        .from('bookings')
        .insert(data)
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
    mutationFn: async ({ id, ...data }: Partial<CreateBookingData> & { id: string }) => {
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
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('last_name', { ascending: true });

      if (error) {
        console.error('Error fetching customers:', error);
        throw error;
      }

      return data;
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: NewCustomerData) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error('Error getting current user:', userError);
        throw userError;
      }

      if (!user) {
        throw new Error('You must be signed in to create a customer');
      }

      const { data: customer, error } = await supabase
        .from('customers')
        .insert({
          ...data,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating customer:', error);
        throw error;
      }

      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create customer: ${error.message}`);
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching services:', error);
        throw error;
      }

      return data;
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching staff:', error);
        throw error;
      }

      return data;
    },
  });
}
