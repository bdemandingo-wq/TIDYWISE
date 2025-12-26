// Industry-specific service templates for onboarding

export type IndustryType = 
  | "Home Cleaning"
  | "Office Cleaning"
  | "Pet Grooming"
  | "Lawn Care"
  | "Hair Salon"
  | "Car Wash"
  | "Pool Service"
  | "Handyman"
  | "Painting"
  | "Laundry Service"
  | "Personal Training"
  | "Photography";

export interface ServiceTemplate {
  name: string;
  description: string;
  price: number;
  duration: number; // in minutes
  depositAmount?: number;
}

export interface IndustryTemplate {
  name: IndustryType;
  description: string;
  services: ServiceTemplate[];
  categories?: string[];
}

export const industryTemplates: Record<IndustryType, IndustryTemplate> = {
  "Home Cleaning": {
    name: "Home Cleaning",
    description: "Residential cleaning services",
    categories: ["Residential", "Deep Cleaning", "Specialty"],
    services: [
      { name: "Standard Clean", description: "Regular maintenance cleaning for your home", price: 120, duration: 120, depositAmount: 25 },
      { name: "Deep Clean", description: "Thorough top-to-bottom cleaning", price: 200, duration: 180, depositAmount: 50 },
      { name: "Move In/Out Clean", description: "Complete cleaning for property transitions", price: 280, duration: 240, depositAmount: 75 },
      { name: "Post Construction Clean", description: "Detailed cleaning after renovations or construction", price: 350, duration: 300, depositAmount: 100 },
      { name: "Airbnb Turnover", description: "Quick turnaround cleaning for short-term rentals", price: 100, duration: 90, depositAmount: 25 },
      { name: "Spring Clean", description: "Seasonal deep cleaning service", price: 250, duration: 210, depositAmount: 60 },
    ]
  },
  "Office Cleaning": {
    name: "Office Cleaning",
    description: "Commercial and office cleaning services",
    categories: ["Daily Cleaning", "Deep Cleaning", "Specialty"],
    services: [
      { name: "Daily Office Clean", description: "Regular daily maintenance cleaning", price: 150, duration: 120, depositAmount: 30 },
      { name: "Weekly Deep Clean", description: "Comprehensive weekly cleaning service", price: 300, duration: 240, depositAmount: 75 },
      { name: "Carpet Cleaning", description: "Professional carpet steam cleaning", price: 200, duration: 180, depositAmount: 50 },
      { name: "Window Cleaning", description: "Interior and exterior window cleaning", price: 180, duration: 150, depositAmount: 40 },
      { name: "Restroom Sanitization", description: "Deep sanitization of restroom facilities", price: 120, duration: 90, depositAmount: 25 },
      { name: "Post-Event Cleanup", description: "Cleaning after corporate events", price: 250, duration: 180, depositAmount: 60 },
    ]
  },
  "Pet Grooming": {
    name: "Pet Grooming",
    description: "Professional pet grooming services",
    categories: ["Dogs", "Cats", "Add-Ons"],
    services: [
      { name: "Full Groom - Small Dog", description: "Complete grooming for dogs under 20 lbs", price: 45, duration: 60, depositAmount: 10 },
      { name: "Full Groom - Medium Dog", description: "Complete grooming for dogs 20-50 lbs", price: 65, duration: 90, depositAmount: 15 },
      { name: "Full Groom - Large Dog", description: "Complete grooming for dogs over 50 lbs", price: 85, duration: 120, depositAmount: 20 },
      { name: "Bath & Brush", description: "Bath, blow dry, and brushing service", price: 35, duration: 45, depositAmount: 10 },
      { name: "Nail Trim", description: "Nail clipping and filing", price: 15, duration: 15 },
      { name: "Cat Grooming", description: "Full grooming service for cats", price: 55, duration: 60, depositAmount: 15 },
      { name: "De-Shedding Treatment", description: "Specialized treatment to reduce shedding", price: 30, duration: 30 },
    ]
  },
  "Lawn Care": {
    name: "Lawn Care",
    description: "Lawn maintenance and landscaping services",
    categories: ["Maintenance", "Landscaping", "Seasonal"],
    services: [
      { name: "Weekly Mowing", description: "Regular lawn mowing and edging", price: 45, duration: 45, depositAmount: 10 },
      { name: "Bi-Weekly Mowing", description: "Lawn mowing service every two weeks", price: 55, duration: 60, depositAmount: 15 },
      { name: "Fertilization Treatment", description: "Professional fertilizer application", price: 80, duration: 45, depositAmount: 20 },
      { name: "Weed Control", description: "Weed prevention and removal treatment", price: 65, duration: 30, depositAmount: 15 },
      { name: "Leaf Removal", description: "Seasonal leaf cleanup and removal", price: 120, duration: 120, depositAmount: 30 },
      { name: "Hedge Trimming", description: "Professional hedge and shrub trimming", price: 100, duration: 90, depositAmount: 25 },
      { name: "Mulch Installation", description: "Fresh mulch spreading and installation", price: 150, duration: 180, depositAmount: 40 },
    ]
  },
  "Hair Salon": {
    name: "Hair Salon",
    description: "Hair styling and beauty services",
    categories: ["Cuts", "Color", "Treatments", "Styling"],
    services: [
      { name: "Women's Haircut", description: "Cut, wash, and style", price: 55, duration: 60, depositAmount: 15 },
      { name: "Men's Haircut", description: "Classic men's cut and style", price: 30, duration: 30, depositAmount: 10 },
      { name: "Kids Haircut", description: "Haircut for children under 12", price: 20, duration: 20 },
      { name: "Full Color", description: "Single-process all-over color", price: 95, duration: 90, depositAmount: 25 },
      { name: "Highlights", description: "Partial or full highlights", price: 150, duration: 120, depositAmount: 40 },
      { name: "Balayage", description: "Hand-painted highlighting technique", price: 200, duration: 150, depositAmount: 50 },
      { name: "Blowout", description: "Wash, blow dry, and style", price: 45, duration: 45, depositAmount: 10 },
      { name: "Deep Conditioning", description: "Intensive hair treatment", price: 35, duration: 30 },
    ]
  },
  "Car Wash": {
    name: "Car Wash",
    description: "Auto detailing and car wash services",
    categories: ["Exterior", "Interior", "Full Detail"],
    services: [
      { name: "Express Wash", description: "Quick exterior wash and dry", price: 20, duration: 15 },
      { name: "Full Service Wash", description: "Exterior wash plus interior vacuum", price: 35, duration: 30 },
      { name: "Interior Detail", description: "Complete interior cleaning and conditioning", price: 80, duration: 90, depositAmount: 20 },
      { name: "Exterior Detail", description: "Hand wash, clay bar, and wax", price: 100, duration: 120, depositAmount: 25 },
      { name: "Full Detail", description: "Complete interior and exterior detailing", price: 180, duration: 180, depositAmount: 45 },
      { name: "Ceramic Coating", description: "Professional ceramic protection application", price: 350, duration: 240, depositAmount: 100 },
      { name: "Engine Bay Clean", description: "Engine compartment degreasing and clean", price: 60, duration: 45, depositAmount: 15 },
    ]
  },
  "Pool Service": {
    name: "Pool Service",
    description: "Pool maintenance and repair services",
    categories: ["Maintenance", "Repair", "Seasonal"],
    services: [
      { name: "Weekly Maintenance", description: "Weekly chemical balance and cleaning", price: 120, duration: 45, depositAmount: 30 },
      { name: "Bi-Weekly Service", description: "Every other week pool service", price: 80, duration: 45, depositAmount: 20 },
      { name: "One-Time Clean", description: "Single visit pool cleaning and balance", price: 150, duration: 60, depositAmount: 40 },
      { name: "Green Pool Recovery", description: "Algae treatment and pool recovery", price: 300, duration: 180, depositAmount: 100 },
      { name: "Filter Cleaning", description: "Filter cartridge or DE cleaning", price: 85, duration: 60, depositAmount: 20 },
      { name: "Pool Opening", description: "Seasonal pool opening service", price: 200, duration: 120, depositAmount: 50 },
      { name: "Pool Closing", description: "Winterization and pool closing", price: 200, duration: 120, depositAmount: 50 },
    ]
  },
  "Handyman": {
    name: "Handyman",
    description: "General repair and home improvement services",
    categories: ["Repairs", "Installation", "Assembly"],
    services: [
      { name: "Hourly Service", description: "General handyman work per hour", price: 75, duration: 60, depositAmount: 20 },
      { name: "TV Mounting", description: "Wall mount TV installation", price: 100, duration: 60, depositAmount: 25 },
      { name: "Furniture Assembly", description: "Assembly of furniture pieces", price: 80, duration: 90, depositAmount: 20 },
      { name: "Drywall Repair", description: "Patch and repair drywall damage", price: 120, duration: 120, depositAmount: 30 },
      { name: "Door Installation", description: "Interior door replacement", price: 150, duration: 120, depositAmount: 40 },
      { name: "Ceiling Fan Install", description: "Ceiling fan installation or replacement", price: 100, duration: 60, depositAmount: 25 },
      { name: "Faucet Replacement", description: "Kitchen or bathroom faucet installation", price: 85, duration: 60, depositAmount: 20 },
    ]
  },
  "Painting": {
    name: "Painting",
    description: "Interior and exterior painting services",
    categories: ["Interior", "Exterior", "Specialty"],
    services: [
      { name: "Single Room", description: "Paint one standard-size room", price: 350, duration: 300, depositAmount: 100 },
      { name: "Accent Wall", description: "Paint single accent wall", price: 150, duration: 120, depositAmount: 40 },
      { name: "Full Interior", description: "Complete interior home painting", price: 2500, duration: 1440, depositAmount: 500 },
      { name: "Exterior - Small Home", description: "Exterior painting for homes under 1500 sq ft", price: 2000, duration: 1200, depositAmount: 500 },
      { name: "Exterior - Large Home", description: "Exterior painting for homes over 1500 sq ft", price: 4000, duration: 2400, depositAmount: 800 },
      { name: "Cabinet Painting", description: "Kitchen cabinet refinishing", price: 1500, duration: 1200, depositAmount: 400 },
      { name: "Color Consultation", description: "Professional color selection consultation", price: 75, duration: 60, depositAmount: 20 },
    ]
  },
  "Laundry Service": {
    name: "Laundry Service",
    description: "Professional laundry and dry cleaning services",
    categories: ["Wash & Fold", "Dry Cleaning", "Specialty"],
    services: [
      { name: "Wash & Fold - Small", description: "Up to 15 lbs of laundry", price: 25, duration: 60 },
      { name: "Wash & Fold - Medium", description: "15-30 lbs of laundry", price: 45, duration: 90 },
      { name: "Wash & Fold - Large", description: "30-50 lbs of laundry", price: 65, duration: 120 },
      { name: "Dry Cleaning - Per Item", description: "Professional dry cleaning", price: 8, duration: 30 },
      { name: "Comforter Cleaning", description: "Wash and dry large bedding", price: 35, duration: 90 },
      { name: "Shirt Laundering", description: "Professional shirt washing and pressing", price: 4, duration: 15 },
      { name: "Pickup & Delivery", description: "Door-to-door laundry service", price: 15, duration: 30 },
    ]
  },
  "Personal Training": {
    name: "Personal Training",
    description: "Fitness training and coaching services",
    categories: ["Individual", "Group", "Specialty"],
    services: [
      { name: "1-on-1 Session", description: "Private personal training session", price: 75, duration: 60, depositAmount: 20 },
      { name: "Duo Training", description: "Training session for two people", price: 100, duration: 60, depositAmount: 25 },
      { name: "Group Class", description: "Small group fitness class (up to 6)", price: 25, duration: 60 },
      { name: "Initial Assessment", description: "Fitness evaluation and goal setting", price: 50, duration: 90, depositAmount: 15 },
      { name: "5-Session Package", description: "Package of five 1-on-1 sessions", price: 325, duration: 60, depositAmount: 75 },
      { name: "10-Session Package", description: "Package of ten 1-on-1 sessions", price: 600, duration: 60, depositAmount: 150 },
      { name: "Online Coaching", description: "Monthly online training program", price: 150, duration: 30, depositAmount: 40 },
    ]
  },
  "Photography": {
    name: "Photography",
    description: "Professional photography services",
    categories: ["Portrait", "Events", "Commercial"],
    services: [
      { name: "Mini Session", description: "20-minute portrait session, 10 edited images", price: 150, duration: 30, depositAmount: 50 },
      { name: "Standard Portrait", description: "1-hour session, 25 edited images", price: 300, duration: 90, depositAmount: 100 },
      { name: "Extended Portrait", description: "2-hour session, 50 edited images", price: 500, duration: 150, depositAmount: 150 },
      { name: "Event Coverage", description: "Per hour event photography", price: 200, duration: 60, depositAmount: 50 },
      { name: "Wedding Package", description: "Full day wedding coverage", price: 3000, duration: 600, depositAmount: 750 },
      { name: "Product Photography", description: "Per product commercial shots", price: 50, duration: 30, depositAmount: 15 },
      { name: "Headshots", description: "Professional headshot session", price: 200, duration: 45, depositAmount: 50 },
    ]
  },
};

export const getIndustryTemplate = (industry: IndustryType): IndustryTemplate | null => {
  return industryTemplates[industry] || null;
};

export const getAllIndustries = (): IndustryType[] => {
  return Object.keys(industryTemplates) as IndustryType[];
};
