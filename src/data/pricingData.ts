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
  | 'post_construction'
  | 'commercial'
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
    minimumPrice: 140,
    prices: [140, 160, 180, 200, 220, 240, 265, 295, 330, 365, 400, 435, 470, 505, 540, 575, 610],
  },
  {
    id: 'post_construction',
    name: 'Post Construction Clean',
    description: 'Heavy-duty cleaning after construction or renovation projects',
    color: '#f59e0b',
    minimumPrice: 400,
    prices: [450, 502, 555, 607, 660, 712, 795, 877, 960, 1042, 1125, 1207, 1290, 1372, 1455, 1537, 1620],
  },
  {
    id: 'commercial',
    name: 'Commercial Cleaning',
    description: 'Professional cleaning for commercial spaces, offices, and businesses',
    color: '#6366f1',
    minimumPrice: 350,
    prices: [350, 400, 450, 500, 550, 600, 675, 750, 825, 900, 975, 1050, 1125, 1200, 1275, 1350, 1425],
  },
];

export const extras = [
  { id: 'windows', name: 'Windows', price: 30, note: '', icon: 'Blinds' },
  { id: 'appliances', name: 'Appliances', price: 50, note: '', icon: 'Refrigerator' },
  { id: 'baseboards', name: 'Baseboards', price: 40, note: '', icon: 'LayoutGrid' },
  { id: 'walls', name: 'Walls', price: 25, note: '', icon: 'Sparkles' },
  { id: 'carpet', name: 'Carpet Clean', price: 0, note: 'Custom Pricing', icon: 'LayoutGrid' },
  { id: 'upholstery', name: 'Upholstery', price: 0, note: 'Custom Pricing', icon: 'Sofa' },
  { id: 'laundry', name: 'Laundry', price: 10, note: '', icon: 'Shirt' },
  { id: 'dishes', name: 'Dishes', price: 15, note: '', icon: 'UtensilsCrossed' },
];

// Pet options
export const petOptions = [
  { id: 'no_pets', label: 'No Pets', price: 0 },
  { id: '1_pet', label: '1 Pet', price: 15 },
  { id: '2_pets', label: '2 Pets', price: 25 },
  { id: '3_plus_pets', label: '3+ Pets', price: 40 },
];

// Home condition options (1-5 scale)
export const homeConditionOptions = [
  { id: 1, label: '1 - Excellent (light cleaning needed)', price: 0 },
  { id: 2, label: '2 - Good (normal upkeep)', price: 0 },
  { id: 3, label: '3 - Fair (some areas need attention)', price: 25 },
  { id: 4, label: '4 - Needs Work (heavy cleaning)', price: 50 },
  { id: 5, label: '5 - Very Dirty (deep cleaning required)', price: 75 },
];

// Bedroom/Bathroom pricing (alternative to square footage)
export const bedroomPricing = [
  { bedrooms: '1', bathrooms: '1', basePrice: 120 },
  { bedrooms: '1', bathrooms: '1.5', basePrice: 135 },
  { bedrooms: '2', bathrooms: '1', basePrice: 150 },
  { bedrooms: '2', bathrooms: '1.5', basePrice: 165 },
  { bedrooms: '2', bathrooms: '2', basePrice: 180 },
  { bedrooms: '3', bathrooms: '1', basePrice: 190 },
  { bedrooms: '3', bathrooms: '1.5', basePrice: 200 },
  { bedrooms: '3', bathrooms: '2', basePrice: 215 },
  { bedrooms: '3', bathrooms: '2.5', basePrice: 230 },
  { bedrooms: '4', bathrooms: '2', basePrice: 250 },
  { bedrooms: '4', bathrooms: '2.5', basePrice: 270 },
  { bedrooms: '4', bathrooms: '3', basePrice: 290 },
  { bedrooms: '5', bathrooms: '2.5', basePrice: 310 },
  { bedrooms: '5', bathrooms: '3', basePrice: 330 },
  { bedrooms: '5', bathrooms: '3.5', basePrice: 350 },
  { bedrooms: '6+', bathrooms: '3', basePrice: 380 },
  { bedrooms: '6+', bathrooms: '3.5', basePrice: 400 },
  { bedrooms: '6+', bathrooms: '4', basePrice: 430 },
  { bedrooms: '6+', bathrooms: '4.5', basePrice: 460 },
  { bedrooms: '6+', bathrooms: '5+', basePrice: 500 },
];

export const frequencyOptions = [
  { id: 'one_time', label: 'One-Time', discount: 0 },
  { id: 'weekly', label: 'Weekly (30% off)', discount: 0.30 },
  { id: 'biweekly', label: 'Bi-Weekly (25% off)', discount: 0.25 },
  { id: 'triweekly', label: 'Tri-Weekly (20% off)', discount: 0.20 },
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

export function getBedroomBathroomPrice(bedrooms: string, bathrooms: string): number {
  const match = bedroomPricing.find(p => p.bedrooms === bedrooms && p.bathrooms === bathrooms);
  if (match) return match.basePrice;
  
  // Fallback: find closest match
  const bedroomMatches = bedroomPricing.filter(p => p.bedrooms === bedrooms);
  if (bedroomMatches.length > 0) {
    return bedroomMatches[0].basePrice;
  }
  
  return 150; // Default base price
}

export function getConditionPrice(condition: number): number {
  const option = homeConditionOptions.find(o => o.id === condition);
  return option?.price || 0;
}

export function getPetPrice(petOption: string): number {
  const option = petOptions.find(o => o.id === petOption);
  return option?.price || 0;
}
