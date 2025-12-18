export interface Booking {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  service: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  staff: string;
  staffId: string;
  price: number;
  notes?: string;
  address?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalBookings: number;
  totalSpent: number;
  lastBooking?: string;
  createdAt: string;
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  isActive: boolean;
  color: string;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar?: string;
  services: string[];
  isActive: boolean;
  color: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface DaySchedule {
  date: string;
  bookings: Booking[];
}
