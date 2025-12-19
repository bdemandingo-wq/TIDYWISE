// Pricing data from rate sheet - based on square footage ranges

export const squareFootageRanges = [
  { label: 'Up to 750 sf', maxSqFt: 750 },
  { label: 'Up to 1000 sf', maxSqFt: 1000 },
  { label: 'Up to 1250 sf', maxSqFt: 1250 },
  { label: 'Up to 1500 sf', maxSqFt: 1500 },
  { label: 'Up to 1800 sf', maxSqFt: 1800 },
  { label: 'Up to 2100 sf', maxSqFt: 2100 },
  { label: 'Up to 2400 sf', maxSqFt: 2400 },
  { label: 'Up to 2700 sf', maxSqFt: 2700 },
  { label: 'Up to 3000 sf', maxSqFt: 3000 },
  { label: 'Up to 3300 sf', maxSqFt: 3300 },
  { label: 'Up to 3600 sf', maxSqFt: 3600 },
  { label: 'Up to 4000 sf', maxSqFt: 4000 },
  { label: 'Up to 4400 sf', maxSqFt: 4400 },
  { label: 'Up to 4800 sf', maxSqFt: 4800 },
  { label: 'Up to 5200 sf', maxSqFt: 5200 },
  { label: 'Up to 5600 sf', maxSqFt: 5600 },
  { label: 'Up to 6000 sf', maxSqFt: 6000 },
];

export type CleaningServiceType = 
  | 'deep_clean' 
  | 'standard_clean' 
  | 'monthly_clean' 
  | 'biweekly_clean' 
  | 'weekly_clean' 
  | 'move_in_out' 
  | 'construction'
  | 'airbnb';

export interface CleaningService {
  id: CleaningServiceType;
  name: string;
  description: string;
  color: string;
  minimumPrice: number;
  prices: number[]; // Indexed by squareFootageRanges index
}

export const cleaningServices: CleaningService[] = [
  {
    id: 'deep_clean',
    name: 'Deep Clean (First Cleaning)',
    description: 'Thorough first-time deep cleaning including inside oven',
    color: '#3b82f6',
    minimumPrice: 200,
    prices: [208, 243, 278, 313, 348, 383, 438, 493, 548, 603, 658, 713, 768, 823, 878, 933, 988],
  },
  {
    id: 'standard_clean',
    name: 'Standard Clean',
    description: 'Regular maintenance cleaning for your home',
    color: '#10b981',
    minimumPrice: 150,
    prices: [108, 143, 178, 213, 248, 283, 313, 368, 423, 478, 533, 588, 643, 698, 753, 808, 863],
  },
  {
    id: 'move_in_out',
    name: 'Move In/Move Out Clean',
    description: 'Deep clean + $75 for move-in or move-out, includes fridge cleaning',
    color: '#06b6d4',
    minimumPrice: 300,
    prices: [283, 318, 353, 388, 423, 458, 513, 568, 623, 678, 733, 788, 843, 898, 953, 1008, 1063],
  },
  {
    id: 'construction',
    name: 'Construction Clean Up',
    description: 'Heavy-duty cleaning after construction or renovation (50% more than Move In/Out)',
    color: '#f97316',
    minimumPrice: 400,
    prices: [450, 502, 555, 607, 660, 712, 795, 877, 960, 1042, 1125, 1207, 1290, 1372, 1455, 1537, 1620],
  },
  {
    id: 'airbnb',
    name: 'Airbnb/Short-Term Rental',
    description: 'Recurring turnover cleans for vacation rentals (3-7 cleans/month discount)',
    color: '#ec4899',
    minimumPrice: 95,
    prices: [95, 115, 135, 155, 175, 195, 220, 250, 285, 320, 355, 390, 425, 460, 495, 530, 565],
  },
];

export const extras = [
  { id: 'windows', name: 'Windows', price: 30, note: '', icon: 'Blinds' },
  { id: 'appliances', name: 'Appliances', price: 50, note: '', icon: 'Refrigerator' },
  { id: 'baseboards', name: 'Baseboards', price: 40, note: '', icon: 'LayoutGrid' },
  { id: 'walls', name: 'Walls', price: 25, note: '', icon: 'Sparkles' },
  { id: 'carpets', name: 'Carpets', price: 150, note: '', icon: 'Dog' },
  { id: 'laundry', name: 'Laundry', price: 10, note: '', icon: 'Shirt' },
  { id: 'dishes', name: 'Dishes', price: 15, note: '', icon: 'UtensilsCrossed' },
];

export const frequencyOptions = [
  { id: 'one_time', label: 'One-Time', discount: 0 },
  { id: 'weekly', label: 'Weekly (30% off)', discount: 0.30 },
  { id: 'biweekly', label: 'Bi-Weekly (25% off)', discount: 0.25 },
  { id: 'monthly', label: 'Monthly (15% off)', discount: 0.15 },
];

export const bedroomOptions = ['0', '1', '2', '3', '4', '5', '6+'];
export const bathroomOptions = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5+'];

export function getPriceForService(serviceId: CleaningServiceType, sqFtIndex: number): number {
  const service = cleaningServices.find(s => s.id === serviceId);
  if (!service) return 0;
  
  // Ensure index is within bounds
  const index = Math.min(Math.max(0, sqFtIndex), service.prices.length - 1);
  return service.prices[index];
}

export function getSqFtIndexFromValue(sqFt: number): number {
  for (let i = 0; i < squareFootageRanges.length; i++) {
    if (sqFt <= squareFootageRanges[i].maxSqFt) {
      return i;
    }
  }
  return squareFootageRanges.length - 1; // Return last index for anything larger
}
