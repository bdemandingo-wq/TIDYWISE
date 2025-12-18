import { Booking, Customer, Service, Staff } from '@/types/booking';

export const mockServices: Service[] = [
  {
    id: '1',
    name: 'Standard Cleaning',
    description: 'Regular house cleaning service',
    duration: 120,
    price: 150,
    category: 'Cleaning',
    isActive: true,
    color: '#3b82f6',
  },
  {
    id: '2',
    name: 'Deep Cleaning',
    description: 'Thorough deep cleaning of entire home',
    duration: 240,
    price: 300,
    category: 'Cleaning',
    isActive: true,
    color: '#10b981',
  },
  {
    id: '3',
    name: 'Move-In/Move-Out',
    description: 'Complete cleaning for moving',
    duration: 300,
    price: 400,
    category: 'Cleaning',
    isActive: true,
    color: '#8b5cf6',
  },
  {
    id: '4',
    name: 'Office Cleaning',
    description: 'Professional office cleaning',
    duration: 180,
    price: 200,
    category: 'Commercial',
    isActive: true,
    color: '#f59e0b',
  },
  {
    id: '5',
    name: 'Carpet Cleaning',
    description: 'Professional carpet deep clean',
    duration: 90,
    price: 120,
    category: 'Specialty',
    isActive: true,
    color: '#ec4899',
  },
];

export const mockStaff: Staff[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    phone: '(555) 123-4567',
    role: 'Senior Cleaner',
    services: ['1', '2', '3'],
    isActive: true,
    color: '#3b82f6',
  },
  {
    id: '2',
    name: 'Mike Chen',
    email: 'mike@example.com',
    phone: '(555) 234-5678',
    role: 'Cleaner',
    services: ['1', '4'],
    isActive: true,
    color: '#10b981',
  },
  {
    id: '3',
    name: 'Emily Davis',
    email: 'emily@example.com',
    phone: '(555) 345-6789',
    role: 'Senior Cleaner',
    services: ['1', '2', '5'],
    isActive: true,
    color: '#8b5cf6',
  },
  {
    id: '4',
    name: 'James Wilson',
    email: 'james@example.com',
    phone: '(555) 456-7890',
    role: 'Team Lead',
    services: ['1', '2', '3', '4', '5'],
    isActive: true,
    color: '#f59e0b',
  },
];

export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john.smith@email.com',
    phone: '(555) 111-2222',
    address: '123 Main St, New York, NY 10001',
    totalBookings: 12,
    totalSpent: 1800,
    lastBooking: '2024-12-15',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Lisa Anderson',
    email: 'lisa.a@email.com',
    phone: '(555) 222-3333',
    address: '456 Oak Ave, Brooklyn, NY 11201',
    totalBookings: 8,
    totalSpent: 2400,
    lastBooking: '2024-12-18',
    createdAt: '2024-03-20',
  },
  {
    id: '3',
    name: 'Robert Brown',
    email: 'rbrown@email.com',
    phone: '(555) 333-4444',
    address: '789 Pine Rd, Queens, NY 11375',
    totalBookings: 5,
    totalSpent: 750,
    lastBooking: '2024-12-10',
    createdAt: '2024-06-01',
  },
  {
    id: '4',
    name: 'Amanda White',
    email: 'amanda.w@email.com',
    phone: '(555) 444-5555',
    address: '321 Elm St, Manhattan, NY 10022',
    totalBookings: 15,
    totalSpent: 4500,
    lastBooking: '2024-12-17',
    createdAt: '2023-11-10',
  },
  {
    id: '5',
    name: 'David Lee',
    email: 'david.lee@email.com',
    phone: '(555) 555-6666',
    address: '654 Maple Dr, Bronx, NY 10451',
    totalBookings: 3,
    totalSpent: 450,
    lastBooking: '2024-12-05',
    createdAt: '2024-09-15',
  },
];

const generateBookings = (): Booking[] => {
  const bookings: Booking[] = [];
  const statuses: Booking['status'][] = ['pending', 'confirmed', 'completed', 'cancelled'];
  const times = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  
  // Generate bookings for the current week and next week
  const today = new Date();
  for (let i = -3; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    // 2-4 bookings per day
    const numBookings = Math.floor(Math.random() * 3) + 2;
    const usedTimes: string[] = [];
    
    for (let j = 0; j < numBookings; j++) {
      const customer = mockCustomers[Math.floor(Math.random() * mockCustomers.length)];
      const service = mockServices[Math.floor(Math.random() * mockServices.length)];
      const staff = mockStaff[Math.floor(Math.random() * mockStaff.length)];
      
      let time = times[Math.floor(Math.random() * times.length)];
      while (usedTimes.includes(time)) {
        time = times[Math.floor(Math.random() * times.length)];
      }
      usedTimes.push(time);
      
      const status = i < 0 ? (Math.random() > 0.1 ? 'completed' : 'cancelled') : 
                     i === 0 ? (Math.random() > 0.3 ? 'confirmed' : 'pending') :
                     (Math.random() > 0.5 ? 'confirmed' : 'pending');
      
      bookings.push({
        id: `booking-${dateStr}-${j}`,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        service: service.name,
        serviceId: service.id,
        date: dateStr,
        time,
        duration: service.duration,
        status,
        staff: staff.name,
        staffId: staff.id,
        price: service.price,
        address: customer.address,
        createdAt: new Date(date.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }
  
  return bookings.sort((a, b) => {
    if (a.date === b.date) {
      return a.time.localeCompare(b.time);
    }
    return a.date.localeCompare(b.date);
  });
};

export const mockBookings: Booking[] = generateBookings();
