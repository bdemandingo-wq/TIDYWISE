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
  | 'construction';

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
    minimumPrice: 250,
    prices: [258, 293, 328, 363, 398, 433, 488, 543, 598, 653, 708, 763, 818, 873, 928, 983, 1038],
  },
  {
    id: 'standard_clean',
    name: 'Standard Clean',
    description: 'Regular maintenance cleaning for your home',
    color: '#10b981',
    minimumPrice: 200,
    prices: [158, 193, 228, 263, 298, 333, 363, 418, 473, 528, 583, 638, 693, 748, 803, 858, 913],
  },
  {
    id: 'move_in_out',
    name: 'Move In/Move Out Clean',
    description: 'Deep clean + $75 for move-in or move-out, includes fridge cleaning',
    color: '#06b6d4',
    minimumPrice: 350,
    prices: [333, 368, 403, 438, 473, 508, 563, 618, 673, 728, 783, 838, 893, 948, 1003, 1058, 1113],
  },
  {
    id: 'construction',
    name: 'Construction Clean Up',
    description: 'Heavy-duty cleaning after construction or renovation (50% more than Move In/Out)',
    color: '#f97316',
    minimumPrice: 450,
    prices: [500, 552, 605, 657, 710, 762, 845, 927, 1010, 1092, 1175, 1257, 1340, 1422, 1505, 1587, 1670],
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
  { id: 'weekly', label: 'Weekly (15% off)', discount: 0.15 },
  { id: 'biweekly', label: 'Bi-Weekly (10% off)', discount: 0.10 },
  { id: 'monthly', label: 'Monthly (5% off)', discount: 0.05 },
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
