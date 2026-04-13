export type LocationType = "state" | "city";

export interface LocationData {
  type: LocationType;
  name: string;
  stateName?: string;
  stateAbbr?: string;
  stateSlug?: string;
  intro: string;
  marketContext: string;
  topCities?: string[];
  topCitySlugs?: string[];
  faqs: { question: string; answer: string }[];
}

export const locationData: Record<string, LocationData> = {

  // ── STATES ──────────────────────────────────────────────────────────────

  "california": {
    type: "state",
    name: "California",
    intro: "California's residential cleaning market is one of the largest in the country, spanning Los Angeles, the Bay Area, San Diego, and hundreds of fast-growing suburban markets. High labor costs, competitive pricing pressure, and complex wage laws—including AB5 independent-contractor rules—make running a cleaning business here harder than almost anywhere else in the US.",
    marketContext: "California cleaning companies pay some of the highest cleaner wages in the country, averaging $18–$25/hour. Software that automates payroll, tip tracking, and mileage reimbursements typically pays for itself within the first month.",
    topCities: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento", "Fresno", "Oakland", "Long Beach"],
    topCitySlugs: ["los-angeles", "san-diego"],
    faqs: [
      {
        question: "What business licenses do I need to run a cleaning business in California?",
        answer: "You need a general business license from your city or county. If you have employees, register with the EDD (Employment Development Department) and carry workers' compensation insurance—required by law even for part-time employees. Some cities like Los Angeles also require a city business tax registration certificate."
      },
      {
        question: "What's the average rate for house cleaning services in California?",
        answer: "House cleaners in California typically charge $35–$60 per hour, or $150–$350 per home depending on size and frequency. Higher-cost areas like San Francisco and Los Angeles command premium rates. Move-in/move-out and deep cleaning jobs typically run 1.5–2x the standard rate."
      },
      {
        question: "Are cleaning business employees covered under AB5 in California?",
        answer: "Yes, AB5 significantly affects cleaning businesses. Most cleaning workers who clean for a single company cannot legally be classified as independent contractors under the ABC test—they must be W-2 employees with full benefits and payroll taxes. TidyWise automates W-2 payroll calculations and tax withholding to keep California cleaning businesses compliant."
      }
    ]
  },

  "texas": {
    type: "state",
    name: "Texas",
    intro: "Texas is one of the fastest-growing cleaning business markets in the country, fueled by population booms in Dallas-Fort Worth, Houston, Austin, and San Antonio. No state income tax, lower regulatory burden, and a large bilingual labor pool make Texas a strong market to grow a cleaning company.",
    marketContext: "Texas cleaning businesses benefit from relatively lower labor costs ($14–$20/hour) and high residential demand from newly built suburbs. The challenge is managing routes across sprawling metro areas where cleaners can drive 30+ minutes between jobs.",
    topCities: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington", "Plano"],
    topCitySlugs: ["houston", "san-antonio", "dallas", "austin"],
    faqs: [
      {
        question: "Do I need a license to start a cleaning business in Texas?",
        answer: "Texas doesn't require a state-level license specifically for residential cleaning. You'll need a general business registration (DBA if operating under a trade name), an EIN for tax purposes, and general liability insurance. If you have employees, you must register with the Texas Workforce Commission for unemployment taxes."
      },
      {
        question: "What's the average price for house cleaning in Texas?",
        answer: "Standard house cleaning in Texas runs $100–$250 per visit depending on home size and city. Austin and Dallas tend to command higher rates ($130–$280) while smaller markets are lower. Deep cleaning and move-out jobs typically run 50–80% more than standard rates."
      },
      {
        question: "What insurance does a Texas cleaning business need?",
        answer: "At minimum, you need general liability insurance ($1–2M coverage, costing $500–$1,500/year) to protect against property damage and theft claims. If you have employees, workers' compensation is optional in Texas but strongly recommended. Bonding ($10,000–$25,000) provides additional client trust, especially for high-value homes."
      }
    ]
  },

  "florida": {
    type: "state",
    name: "Florida",
    intro: "Florida's cleaning market is uniquely shaped by its snowbird population, booming short-term rental sector, and year-round demand. Markets like Miami, Orlando, Tampa, and Jacksonville each have distinct client profiles—from luxury waterfront condos to Airbnb vacation rentals that need fast turnovers between guests.",
    marketContext: "Vacation rental cleaning is a major revenue driver in Florida, with turnover cleans running $80–$200 per visit and high repeat frequency. Managing guest-driven scheduling with last-minute changes makes reliable software essential.",
    topCities: ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "Boca Raton", "Naples", "Sarasota"],
    topCitySlugs: ["miami"],
    faqs: [
      {
        question: "How do I start a cleaning business in Florida?",
        answer: "Register your business with the Florida Division of Corporations (sunbiz.org), obtain a local business tax receipt from your county, and get general liability insurance. Florida doesn't require a state cleaning license, but some counties have additional requirements. If you hire employees, register with the Florida Department of Revenue for payroll taxes."
      },
      {
        question: "How much do house cleaners charge in Florida?",
        answer: "Standard cleaning in Florida runs $100–$200 per home, depending on size and location. Miami and Naples command higher rates ($140–$250+), while inland markets are lower. Vacation rental turnover cleaning—especially in Orlando, Kissimmee, and Panama City Beach—often runs $100–$180 per turnover with premium rates for same-day turnarounds."
      },
      {
        question: "Is vacation rental cleaning profitable in Florida?",
        answer: "Yes—Florida's 100M+ annual tourists make short-term rental cleaning one of the most profitable niches in the state. Airbnb hosts and property managers pay premium rates for reliable, consistent turnover cleans. TidyWise lets you manage vacation rental cleaning schedules, auto-detect checkout/checkin times, and invoice property managers automatically."
      }
    ]
  },

  "new-york": {
    type: "state",
    name: "New York",
    intro: "New York State has two very distinct cleaning markets: New York City—one of the densest and highest-priced apartment cleaning markets in the world—and upstate New York, where suburban and rural markets operate on very different pricing and logistics. Both markets are growing, but require different approaches.",
    marketContext: "New York's strict wage and tip laws (including a $16/hour minimum wage in NYC and $15 statewide), complex tax requirements, and high insurance costs make compliance-oriented payroll software essential for any cleaning business with employees.",
    topCities: ["New York City", "Buffalo", "Rochester", "Albany", "Syracuse", "Yonkers", "White Plains"],
    topCitySlugs: ["new-york-city"],
    faqs: [
      {
        question: "How much does house cleaning cost in New York?",
        answer: "House cleaning in New York State ranges from $120–$200 for a standard clean in suburban markets, up to $180–$350+ per apartment in New York City. NYC rates are significantly higher due to the cost of living, parking, and minimum wage requirements. Premium neighborhoods like the Upper East Side and Tribeca often pay $300–$500+ per clean."
      },
      {
        question: "What's required to legally hire cleaners in New York?",
        answer: "In New York, hiring employees requires registering with the NYS Department of Labor for unemployment insurance, withholding state income tax, and carrying workers' compensation and disability insurance (required by law). NYC cleaning companies must also comply with the NYC Earned Safe and Sick Time Act, which mandates paid sick leave."
      },
      {
        question: "Do New York cleaning businesses need to be licensed?",
        answer: "There's no state-specific license for residential cleaning in New York. You'll need a general business registration (or incorporation), an EIN, and proper insurance. New York City businesses may need a DCA (Department of Consumer and Worker Protection) license depending on their services. Always verify with your local municipality."
      }
    ]
  },

  "illinois": {
    type: "state",
    name: "Illinois",
    intro: "Illinois's cleaning market is centered on Chicago and its affluent suburbs—Oak Park, Evanston, Naperville, and Schaumburg—but extends to mid-size markets like Rockford, Peoria, and Springfield. Harsh winters create strong demand for deep cleans in spring, while the city's dense condo and apartment market drives year-round residential cleaning.",
    marketContext: "Chicago's minimum wage ($15.80/hour) and Illinois's progressive payroll rules make automated wage calculation important for cleaning businesses with multiple employees. Route optimization is critical given the city's grid and suburb sprawl.",
    topCities: ["Chicago", "Aurora", "Naperville", "Rockford", "Evanston", "Joliet", "Schaumburg", "Peoria"],
    topCitySlugs: ["chicago"],
    faqs: [
      {
        question: "What licenses does an Illinois cleaning business need?",
        answer: "Illinois cleaning businesses need a general business registration with the Illinois Secretary of State (or county clerk for a DBA), an EIN, and general liability insurance. Chicago businesses additionally need a Chicago Business License. If you have employees, register with the Illinois Department of Employment Security (IDES) for unemployment taxes."
      },
      {
        question: "How much do cleaning services cost in Illinois?",
        answer: "Standard cleaning in Illinois runs $100–$180 in suburban markets and $150–$280 in Chicago, depending on home size and frequency. Move-out cleanings and deep cleans typically run 50–100% more. Chicago's higher minimum wage means labor costs—and therefore prices—are higher than in downstate Illinois."
      },
      {
        question: "Is Chicago a good market for a cleaning business?",
        answer: "Yes—Chicago's dense urban core, affluent North Shore suburbs (Winnetka, Glencoe, Lake Forest), and active condo market create strong, consistent demand. The city's harsh winters also drive seasonal deep cleaning surges. The main challenges are traffic-related routing and Chicago's higher operating costs compared to suburban Illinois markets."
      }
    ]
  },

  "pennsylvania": {
    type: "state",
    name: "Pennsylvania",
    intro: "Pennsylvania's two major cleaning markets—Philadelphia and Pittsburgh—are distinct in character. Philadelphia's dense row-home neighborhoods and growing suburban ring create strong residential cleaning demand, while Pittsburgh's revitalized tech and healthcare sectors have driven upscale residential growth. Rural Pennsylvania has a lower price point but loyal client base.",
    marketContext: "Pennsylvania's older housing stock means cleaning jobs often take longer than in newer-construction markets. Billing accurately by the job rather than the hour—and adjusting for home age and condition—is important for profitability.",
    topCities: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton", "Lancaster", "Bethlehem"],
    topCitySlugs: ["philadelphia"],
    faqs: [
      {
        question: "How do I start a cleaning business in Pennsylvania?",
        answer: "Register with the Pennsylvania Department of State as a sole proprietor (DBA), LLC, or corporation. Obtain an EIN, open a business bank account, and get general liability insurance. If you hire employees, register with the PA Department of Revenue and the Department of Labor & Industry for unemployment compensation. Philadelphia businesses need a City of Philadelphia Business Tax Account."
      },
      {
        question: "What should I charge for cleaning in Pennsylvania?",
        answer: "Standard residential cleaning in Pennsylvania runs $90–$160 per visit in most markets. Philadelphia and Pittsburgh command $120–$200 depending on neighborhood. Older homes with more detail work (crown molding, hardwood floors, multiple bathrooms) often justify higher rates. Deep cleaning and move-out jobs typically start at $200–$350."
      },
      {
        question: "Do Pennsylvania cleaning businesses pay the Philadelphia wage tax?",
        answer: "Yes—if your cleaning business operates within Philadelphia city limits and you have employees who work in the city, you're subject to the Philadelphia Wage Tax (3.75% for non-residents, 3.79% for residents). This is separate from state income tax. TidyWise's payroll tools calculate wages but you'll need to work with an accountant for Philadelphia-specific tax filings."
      }
    ]
  },

  "georgia": {
    type: "state",
    name: "Georgia",
    intro: "Georgia's cleaning market has grown substantially alongside Atlanta's tech boom and the state's overall population growth. Metro Atlanta—including Alpharetta, Marietta, Smyrna, and Decatur—is the primary market, but Savannah, Augusta, and Columbus all have growing residential cleaning demand.",
    marketContext: "Atlanta's heat and humidity mean clients often want more frequent cleaning (every 1–2 weeks vs monthly), which increases recurring revenue per client. Traffic congestion across the metro is a major route optimization challenge.",
    topCities: ["Atlanta", "Savannah", "Columbus", "Augusta", "Macon", "Alpharetta", "Marietta", "Roswell"],
    topCitySlugs: ["atlanta"],
    faqs: [
      {
        question: "How do I register a cleaning business in Georgia?",
        answer: "Register your business with the Georgia Secretary of State (for LLCs or corporations) or your county clerk (for a DBA). Obtain an EIN, and get general liability insurance. Georgia doesn't require a state cleaning license, but some cities and counties require a local business license. If you have employees, register with the Georgia Department of Labor."
      },
      {
        question: "How much do house cleaners charge in Georgia?",
        answer: "Standard cleaning in Georgia runs $100–$175 per visit. Atlanta's affluent suburbs (Buckhead, Sandy Springs, Alpharetta) command $130–$220+. Savannah and coastal markets have seen rate increases due to vacation rental demand. Move-out and deep cleaning jobs typically start at $200–$350 in metro markets."
      },
      {
        question: "What's the cleaning business market like in Atlanta?",
        answer: "Atlanta is one of the strongest cleaning markets in the Southeast, driven by a large professional class, strong corporate relocation activity (many major companies have SE headquarters in Atlanta), and a hot real estate market with frequent moves. The main operational challenge is I-285 and I-75/85 traffic, which makes route optimization software essential for multi-cleaner teams."
      }
    ]
  },

  "washington": {
    type: "state",
    name: "Washington",
    intro: "Washington State's cleaning market is anchored by the Seattle metro, one of the highest-wage, highest-income markets in the country thanks to Amazon, Microsoft, Boeing, and a thriving tech sector. The Pacific Northwest's rainy climate drives strong demand for deep cleaning, mold prevention, and post-construction cleaning in rapidly developing areas.",
    marketContext: "Seattle's minimum wage ($20.76/hour as of 2025) is among the highest in the US, making labor cost management critical. Software that automates payroll, tracks hours precisely, and calculates overtime is not optional—it's essential for staying profitable.",
    topCities: ["Seattle", "Spokane", "Tacoma", "Bellevue", "Kirkland", "Redmond", "Everett", "Renton"],
    topCitySlugs: ["seattle"],
    faqs: [
      {
        question: "What's the minimum wage for cleaning employees in Washington State?",
        answer: "Washington State's minimum wage is $16.66/hour (2025). Seattle and unincorporated King County have a higher minimum wage of $20.76/hour for large employers. SeaTac has its own hospitality minimum wage. For cleaning businesses, tracking which jurisdiction each employee works in and applying the correct wage floor is important—TidyWise automates this calculation."
      },
      {
        question: "How much should I charge for cleaning services in Seattle?",
        answer: "Seattle cleaning businesses typically charge $50–$75/hour per cleaner, or $175–$350 per home depending on size. Premium neighborhoods like Medina, Mercer Island, Bellevue, and Madison Park command $250–$450+ per clean. Short-term rental turnover cleans in Capitol Hill and Belltown typically run $120–$200 per turnover."
      },
      {
        question: "How do I start a cleaning business in Washington State?",
        answer: "Register with the Washington Secretary of State and get a Washington State Business License from the Department of Revenue. You'll also need a City of Seattle Business License if operating in Seattle. Get general liability insurance ($1–2M) and workers' comp through L&I (required for all Washington employers with employees). Washington doesn't have state income tax, which simplifies some filings."
      }
    ]
  },

  "colorado": {
    type: "state",
    name: "Colorado",
    intro: "Colorado's cleaning market is driven by Denver's rapid growth and a mountain resort sector that creates strong vacation rental cleaning demand in towns like Vail, Aspen, Breckenridge, and Steamboat Springs. The Front Range—Denver, Aurora, Lakewood, Boulder, Fort Collins—is the core residential market, with suburban expansion pushing demand further east.",
    marketContext: "Colorado's outdoor lifestyle means clients often track in more dirt and debris, increasing cleaning frequency. Mountain resort markets need cleaners who can handle quick turnovers between ski-season bookings, often with same-day scheduling changes.",
    topCities: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Boulder", "Lakewood", "Thornton", "Pueblo"],
    topCitySlugs: ["denver"],
    faqs: [
      {
        question: "How do I start a cleaning business in Colorado?",
        answer: "Register with the Colorado Secretary of State online (sos.colorado.gov), obtain an EIN, and get general liability insurance. Colorado requires employers to register with the Department of Labor and Employment for unemployment insurance and workers' comp. Some cities (Denver, Boulder) have local licensing requirements, so check your municipality before operating."
      },
      {
        question: "How much do cleaning services cost in Colorado?",
        answer: "Standard residential cleaning in Colorado runs $110–$185 per visit. Denver proper and Boulder command $140–$220. Mountain resort markets (Aspen, Vail, Breckenridge) have dramatically higher rates—$200–$400+ per clean—due to the premium nature of the properties and remoteness. Drive time is often billed separately in mountain markets."
      },
      {
        question: "Is vacation rental cleaning profitable in Colorado mountain towns?",
        answer: "Yes—Colorado ski resort markets are among the most lucrative for turnover cleaning in the country. Properties in Aspen, Vail, and Breckenridge rent for $500–$2,000+/night, and hosts pay premium rates for reliable, fast turnovers between guests. The challenge is managing last-minute checkout/checkin changes and scheduling in areas with limited cleaner availability."
      }
    ]
  },

  "arizona": {
    type: "state",
    name: "Arizona",
    intro: "Arizona's cleaning market is centered on the Greater Phoenix metro (Scottsdale, Tempe, Mesa, Chandler, Gilbert, Surprise) with a secondary market in Tucson. The state's large retiree population, rapid suburban growth, and booming short-term rental market (especially around Scottsdale and Sedona) create diverse, year-round cleaning demand.",
    marketContext: "Phoenix's extreme summer heat (110°F+) affects cleaner working conditions and scheduling—many cleaners work early mornings to avoid afternoon heat. Dusty desert conditions mean clients often need more frequent cleaning, especially for exterior spaces and HVAC filter areas.",
    topCities: ["Phoenix", "Tucson", "Scottsdale", "Mesa", "Chandler", "Tempe", "Gilbert", "Glendale"],
    topCitySlugs: ["phoenix"],
    faqs: [
      {
        question: "How do I start a cleaning business in Arizona?",
        answer: "Register with the Arizona Corporation Commission (LLC) or file a DBA with your county recorder. Obtain an EIN and a Transaction Privilege Tax (TPT) license from the Arizona Department of Revenue—cleaning services are taxable in Arizona. Get general liability insurance and, if you have employees, register with the Industrial Commission of Arizona for workers' comp."
      },
      {
        question: "Are cleaning services taxed in Arizona?",
        answer: "Yes—Arizona charges Transaction Privilege Tax (TPT) on cleaning services. The state rate is 5.6%, plus city/county rates that vary by municipality. In Phoenix, the combined rate is typically 8.6%. You must collect and remit TPT on your cleaning invoices, which requires a TPT license from the Department of Revenue. TidyWise can add tax line items to invoices automatically."
      },
      {
        question: "What's the cleaning market like in Scottsdale and Paradise Valley?",
        answer: "Scottsdale and Paradise Valley are among the highest-priced residential cleaning markets in Arizona. Luxury homes in these communities often require 3–5 hour cleans at $200–$500+, with clients expecting premium service and attention to detail. Scottsdale's vacation rental market (driven by spring training and golf tourism) adds significant seasonal demand from February through April."
      }
    ]
  },

  "north-carolina": {
    type: "state",
    name: "North Carolina",
    intro: "North Carolina's cleaning market has grown dramatically alongside Charlotte's rise as a banking hub and the Research Triangle's tech and pharma expansion. Charlotte, Raleigh, Durham, and Chapel Hill are the primary markets, but Asheville's vacation rental market and the Outer Banks' short-term rental sector add significant seasonal demand.",
    marketContext: "North Carolina's population has grown faster than almost any other state, bringing tens of thousands of new households that need cleaning services. The influx of corporate relocations to Charlotte and the Triangle means a steady stream of move-in/move-out clients.",
    topCities: ["Charlotte", "Raleigh", "Durham", "Greensboro", "Winston-Salem", "Fayetteville", "Asheville", "Chapel Hill"],
    topCitySlugs: ["charlotte"],
    faqs: [
      {
        question: "How do I start a cleaning business in North Carolina?",
        answer: "Register with the NC Secretary of State (for LLCs) or your county Register of Deeds (for a DBA), obtain an EIN, and get general liability insurance. North Carolina requires employers to register with the NC Department of Revenue for withholding taxes and the Division of Employment Security for unemployment insurance. No state-level cleaning license is required."
      },
      {
        question: "How much do cleaning services cost in North Carolina?",
        answer: "Standard residential cleaning in NC runs $100–$165 per visit. Charlotte and Raleigh command $120–$200, particularly in affluent suburbs like South Charlotte (Ballantyne, Waxhaw) and North Raleigh (Cary, Apex). Asheville's premium vacation rental market drives rates of $150–$300+ for turnover cleans in popular short-term rental areas."
      },
      {
        question: "Is Airbnb cleaning profitable in North Carolina?",
        answer: "Yes—North Carolina has strong short-term rental markets in Asheville, the Outer Banks, and increasingly in Charlotte and Raleigh for business travelers. Asheville Airbnb hosts and Outer Banks vacation property owners pay $100–$250+ per turnover and often need reliable weekly or even daily scheduling. These clients offer high frequency and consistent revenue once you establish a relationship."
      }
    ]
  },

  "ohio": {
    type: "state",
    name: "Ohio",
    intro: "Ohio has three distinct cleaning markets: Columbus (the fastest-growing, driven by tech and finance), Cleveland (the traditional industrial base with a growing healthcare sector), and Cincinnati (a strong mid-market with many Fortune 500 regional offices). All three cities have strong residential cleaning demand and relatively affordable operating costs compared to coastal markets.",
    marketContext: "Ohio's lower cost of living means cleaning rates are more modest ($90–$160 range), but lower labor costs allow for better margins than high-cost states. The state's many college towns also create strong student-move and landlord-turnover cleaning niches.",
    topCities: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Canton", "Youngstown"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I register a cleaning business in Ohio?",
        answer: "File with the Ohio Secretary of State for an LLC or DBA registration, obtain an EIN, and register with the Ohio Department of Taxation for employer withholding. If you have employees, register with the Ohio Department of Job and Family Services for unemployment insurance. Get general liability insurance and workers' comp through the Ohio Bureau of Workers' Compensation (BWC)—Ohio is a monopolistic state, meaning you must buy workers' comp from BWC, not private insurers."
      },
      {
        question: "How much do cleaning services cost in Ohio?",
        answer: "Standard residential cleaning in Ohio runs $85–$150 per visit. Columbus and Cincinnati's suburban markets (Dublin, Powell, Hyde Park, Mason) command $110–$175. Cleveland's east-side communities (Shaker Heights, Bratenahl) are the premium market in NE Ohio. Ohio's lower cost of living means rates are more accessible than coastal markets, which helps with client acquisition."
      },
      {
        question: "What's the cleaning business opportunity in Columbus?",
        answer: "Columbus is one of the fastest-growing cities in the Midwest, with strong job growth in tech (JPMorgan Chase campus expansion, Intel chip plant, Amazon operations), healthcare, and finance. This drives a large, growing professional class with dual incomes and high cleaning demand. New suburban developments in Dublin, Hilliard, Westerville, and New Albany create consistent demand for initial and recurring cleans."
      }
    ]
  },

  "michigan": {
    type: "state",
    name: "Michigan",
    intro: "Michigan's cleaning market is anchored by metro Detroit—particularly the affluent Oakland County suburbs (Birmingham, Bloomfield Hills, Grosse Pointe, Rochester Hills)—along with growing Grand Rapids and mid-sized markets in Lansing, Ann Arbor, and Flint. Michigan's auto industry executive class in Oakland County represents one of the highest-income residential cleaning markets in the Midwest.",
    marketContext: "Michigan's harsh winters create strong spring cleaning demand surges and complicate scheduling during ice and snowstorms. Cleaning businesses here benefit from steady recurring clients who want their homes cleaned more frequently during the months spent indoors.",
    topCities: ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing", "Flint", "Dearborn"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in Michigan?",
        answer: "File with the Michigan Department of Licensing and Regulatory Affairs (LARA) for your LLC or corporation. Register for a Michigan Business Tax account with the Department of Treasury, and register for unemployment insurance with the Unemployment Insurance Agency. Michigan requires workers' compensation for businesses with 1+ employees. Get general liability insurance and a surety bond if working in residential properties."
      },
      {
        question: "How much do cleaning services cost in Michigan?",
        answer: "Standard residential cleaning in Michigan runs $90–$155 per visit. Oakland County (Birmingham, Bloomfield Hills, West Bloomfield) is the premium market at $150–$250+ per clean. Grand Rapids and Ann Arbor run $110–$165. Detroit proper has a more price-sensitive market. Specialized cleaning (post-construction, move-out, estate) commands premium rates statewide."
      },
      {
        question: "Is there demand for eco-friendly cleaning in Michigan?",
        answer: "Yes—particularly in Ann Arbor, East Lansing, and parts of Grand Rapids, there's strong client preference for green cleaning products. The Great Lakes region has heightened environmental consciousness, and clients near lakes and rivers often specifically request non-toxic products. Offering an eco-friendly tier can be a differentiation strategy in college towns and progressive urban neighborhoods."
      }
    ]
  },

  "virginia": {
    type: "state",
    name: "Virginia",
    intro: "Virginia's cleaning market is split between Northern Virginia (one of the wealthiest suburban markets in the country, driven by federal contractors, tech, and government workers) and Hampton Roads/Richmond/Charlottesville, which have their own distinct markets. Northern Virginia—Tysons, Reston, McLean, Alexandria, Arlington—is the premium residential cleaning market in the state.",
    marketContext: "Virginia's federal contractor and government employee base creates unusually stable, high-income residential demand. This market is characterized by dual-income professional households willing to pay premium rates for reliable, consistent service.",
    topCities: ["Virginia Beach", "Norfolk", "Chesapeake", "Richmond", "Arlington", "Alexandria", "McLean", "Reston"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in Virginia?",
        answer: "Register with the Virginia State Corporation Commission, obtain an EIN, and register for a Virginia business license with your locality. Virginia requires all employers to carry workers' compensation insurance and register with the Virginia Employment Commission for unemployment insurance. Northern Virginia businesses should also verify Fairfax County, Arlington County, or Alexandria City licensing requirements."
      },
      {
        question: "What's the cleaning market like in Northern Virginia?",
        answer: "Northern Virginia is one of the most lucrative cleaning markets in the mid-Atlantic. McLean, Great Falls, and the Dulles Corridor have some of the highest household incomes on the East Coast. Clients expect premium service and are willing to pay $200–$400+ per clean. The military base population in Hampton Roads (Naval Station Norfolk, Fort Belvoir) also creates consistent residential demand."
      },
      {
        question: "How much do cleaning services cost in Virginia?",
        answer: "Standard cleaning in Virginia runs $110–$175 per visit in most markets. Northern Virginia premium markets run $160–$300+. Richmond, Virginia Beach, and Charlottesville are mid-market at $110–$165. Vacation rental markets in the Shenandoah Valley and Outer Banks of Virginia command higher rates for quick turnovers."
      }
    ]
  },

  "tennessee": {
    type: "state",
    name: "Tennessee",
    intro: "Tennessee's cleaning market has exploded alongside Nashville's incredible growth and Knoxville/Chattanooga's expansion. Nashville's bachelorette party industry and short-term rental boom make it one of the most active Airbnb cleaning markets in the Southeast. Memphis, while a different market, has steady residential cleaning demand and lower competition.",
    marketContext: "Tennessee has no state income tax, making it financially attractive for cleaning business owners. Nashville's tourism economy means vacation rental cleaning is a major revenue stream, with hosts paying premium rates for reliable, fast turnovers.",
    topCities: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville", "Murfreesboro", "Franklin", "Brentwood"],
    topCitySlugs: ["nashville"],
    faqs: [
      {
        question: "How do I start a cleaning business in Tennessee?",
        answer: "Register with the Tennessee Secretary of State online (tnsos.gov), obtain an EIN, and register for Tennessee business tax with the Department of Revenue. If you have employees, register with the Tennessee Department of Labor for unemployment insurance. Get general liability insurance—Tennessee doesn't mandate workers' comp for businesses with fewer than 5 employees, but it's strongly recommended."
      },
      {
        question: "How much do cleaning services cost in Tennessee?",
        answer: "Standard residential cleaning in Tennessee runs $90–$155 per visit. Nashville's premium suburbs (Brentwood, Franklin, Green Hills, Belle Meade) command $130–$200+. Knoxville and Chattanooga run $90–$140. Nashville Airbnb turnover cleans in popular neighborhoods (The Gulch, East Nashville, 12 South) typically run $100–$200 per turnover depending on property size."
      },
      {
        question: "Is Nashville a good market for a cleaning business?",
        answer: "Yes—Nashville is one of the best markets in the Southeast for cleaning businesses. The city's explosive growth (thousands of new residents monthly), booming short-term rental market, thriving healthcare sector, and high-income suburbs create consistent demand. The bachelorette party industry alone generates tens of thousands of Airbnb stays per year, each requiring professional turnover cleaning."
      }
    ]
  },

  "new-jersey": {
    type: "state",
    name: "New Jersey",
    intro: "New Jersey's cleaning market benefits from its proximity to New York City and Philadelphia, with commuter suburbs in Bergen, Morris, and Monmouth counties representing some of the highest household incomes in the country. The Shore market (Jersey Shore, Seaside Heights, Asbury Park) adds significant seasonal vacation rental cleaning demand.",
    marketContext: "New Jersey's median household income ($97,000+) is among the highest in the nation, and its dense suburban population creates strong, consistent residential cleaning demand. The challenge is NJ's complex tax structure and high operating costs.",
    topCities: ["Newark", "Jersey City", "Paterson", "Elizabeth", "Trenton", "Cherry Hill", "Hoboken", "Morristown"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in New Jersey?",
        answer: "Register with the NJ Division of Revenue and Enterprise Services, obtain an EIN, and apply for a NJ Business Registration Certificate. Register for unemployment insurance with the NJ Department of Labor. New Jersey requires all employers to carry workers' compensation insurance and disability insurance. Bergen, Morris, and Monmouth counties may have additional local licensing requirements."
      },
      {
        question: "How much do cleaning services cost in New Jersey?",
        answer: "Standard residential cleaning in NJ runs $120–$200 per visit in most markets. Bergen County (Ridgewood, Ho-Ho-Kus, Saddle River) and Morris County (Chatham, Summit, Madison) are premium markets at $160–$280+. Shore market vacation rental turnovers during summer peak run $130–$220 per turnover with same-day availability commanding premium rates."
      },
      {
        question: "Are cleaning services taxable in New Jersey?",
        answer: "Yes—New Jersey charges 6.625% sales tax on residential cleaning services. This is significant because it means you need to collect and remit NJ sales tax on every invoice. TidyWise can add tax line items to invoices automatically. Make sure you register for a Certificate of Authority with the NJ Division of Taxation to collect sales tax legally."
      }
    ]
  },

  "massachusetts": {
    type: "state",
    name: "Massachusetts",
    intro: "Massachusetts has one of the most educated and highest-income client bases in the country, concentrated in Greater Boston (Newton, Brookline, Wellesley, Needham, Lexington), the Cape and Islands, and the Pioneer Valley. The Boston area's large graduate student and young professional population creates strong apartment cleaning demand alongside the traditional suburban market.",
    marketContext: "Massachusetts has a $15/hour minimum wage with automatic annual increases. Cleaning businesses must also comply with the Paid Family and Medical Leave (PFML) program, making payroll software that handles Massachusetts-specific deductions essential.",
    topCities: ["Boston", "Worcester", "Springfield", "Lowell", "Cambridge", "Newton", "Brookline", "Wellesley"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in Massachusetts?",
        answer: "Register with the Massachusetts Secretary of the Commonwealth, obtain an EIN, and register with MassTaxConnect for state tax filings. All Massachusetts employers must carry workers' compensation insurance and contribute to the state's Paid Family and Medical Leave (PFML) program. Boston requires an additional city business certificate. Get general liability insurance with at least $1M coverage."
      },
      {
        question: "How much do cleaning services cost in Massachusetts?",
        answer: "Standard residential cleaning in Massachusetts runs $130–$210 per visit. Greater Boston's premium suburbs (Wellesley, Weston, Dover, Lincoln, Lexington) command $175–$350+. Cape Cod vacation rental turnovers during summer peak (June–August) run $150–$280 per turnover. Boston apartment cleaning typically runs $150–$250 for studios through 2BRs."
      },
      {
        question: "What are the Massachusetts Paid Family Leave requirements for cleaning businesses?",
        answer: "Massachusetts PFML requires employers to withhold contributions from employee wages and remit them to the state. In 2025, the contribution rate is 0.88% of eligible wages. Employees with 12+ months of service can take up to 12 weeks of paid family leave and 20 weeks of medical leave per year. TidyWise can track wages for PFML calculation purposes, though you'll need your accountant to file the quarterly remittances."
      }
    ]
  },

  "maryland": {
    type: "state",
    name: "Maryland",
    intro: "Maryland's cleaning market is heavily influenced by Washington DC—particularly Montgomery County (Bethesda, Chevy Chase, Rockville, Potomac) and Howard County (Columbia, Ellicott City), which are among the wealthiest counties in the United States. The DC suburb market features dual-income federal and private sector professional households who are reliable, high-value cleaning clients.",
    marketContext: "Maryland's proximity to DC means many clients are federal employees or contractors with stable, predictable incomes. The Annapolis, Eastern Shore, and Ocean City markets add a vacation rental dimension that creates seasonal peaks.",
    topCities: ["Baltimore", "Silver Spring", "Rockville", "Bethesda", "Gaithersburg", "Annapolis", "Columbia", "Frederick"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in Maryland?",
        answer: "Register with the Maryland State Department of Assessments and Taxation (SDAT), obtain an EIN, and register for a Maryland Business Tax Account. If you have employees, register with the Maryland Department of Labor for unemployment insurance and obtain workers' compensation through a private insurer or the Chesapeake Employers' Insurance Company. Baltimore City has additional licensing requirements."
      },
      {
        question: "How much do cleaning services cost in Maryland?",
        answer: "Standard residential cleaning in Maryland runs $120–$190 per visit. Montgomery County's premium neighborhoods (Potomac, Chevy Chase, Bethesda) command $175–$320+. Baltimore proper is more mid-market at $110–$165. The Eastern Shore and Annapolis vacation rental market runs $130–$220 per turnover during the boating and summer season."
      },
      {
        question: "What's the demand for cleaning services in the DC Maryland suburbs?",
        answer: "Montgomery and Howard counties have household incomes averaging $120,000–$160,000+—among the highest in the nation—and a large proportion of dual-income professional households who routinely hire cleaning services. Client retention is typically excellent in these markets because clients prioritize reliable service over price. The DC Maryland market also sees strong demand from government-funded moving and relocation cleaning."
      }
    ]
  },

  "minnesota": {
    type: "state",
    name: "Minnesota",
    intro: "Minnesota's cleaning market centers on the Minneapolis–Saint Paul metro and its affluent suburbs—Edina, Eden Prairie, Wayzata, Minnetonka, and Woodbury. The Twin Cities have a large Scandinavian cultural heritage that traditionally values clean, well-maintained homes, creating a clientele that views professional cleaning as a regular household expense rather than a luxury.",
    marketContext: "Minnesota's harsh winters (frequent sub-zero temperatures and heavy snowfall) significantly affect scheduling reliability. Building schedule flexibility into your calendar—and having a solid client communication system for weather-related delays—is essential for Minnesota cleaning businesses.",
    topCities: ["Minneapolis", "Saint Paul", "Rochester", "Bloomington", "Brooklyn Park", "Plymouth", "Edina", "Woodbury"],
    topCitySlugs: [],
    faqs: [
      {
        question: "How do I start a cleaning business in Minnesota?",
        answer: "Register with the Minnesota Secretary of State, obtain an EIN, and register for Minnesota Employer Tax Account with the Department of Revenue. Register for unemployment insurance with the Department of Employment and Economic Development (DEED). Minnesota requires workers' compensation for all employers with employees. Minneapolis and Saint Paul have their own minimum wage ordinances ($15.57/hour for Minneapolis large employers in 2025)."
      },
      {
        question: "How much do cleaning services cost in Minnesota?",
        answer: "Standard residential cleaning in Minnesota runs $100–$170 per visit. Edina, Wayzata, and North Oaks are the premium markets at $140–$220+. Rochester's medical professional community (Mayo Clinic) creates consistent demand at mid-range rates ($120–$170). The Twin Cities suburbs are generally $110–$165 depending on home size and cleaning frequency."
      },
      {
        question: "How does Minnesota weather affect a cleaning business?",
        answer: "Minnesota winters are a real operational challenge—blizzards and extreme cold can force cancellations, and road conditions affect cleaner safety and arrival times. Building a 24-hour cancellation policy, keeping client contact info current for text/email notifications, and scheduling buffer time in winter months are all important. TidyWise's SMS notification system lets you alert affected clients quickly when weather forces rescheduling."
      }
    ]
  },

  "nevada": {
    type: "state",
    name: "Nevada",
    intro: "Nevada's cleaning market is dominated by the Las Vegas metro, one of the most active short-term rental markets in the world. Beyond the tourist economy, Las Vegas has a large and rapidly growing residential market in Henderson, Summerlin, and North Las Vegas. Reno's tech growth (Tesla Gigafactory, Google, Switch data centers) has created a second significant market in northern Nevada.",
    marketContext: "Nevada has no state income tax, making it financially attractive for cleaning business owners. The 24/7 economy in Las Vegas means short-term rental turnovers happen at all hours, requiring flexible scheduling systems and reliable cleaner availability.",
    topCities: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks", "Enterprise", "Summerlin", "Boulder City"],
    topCitySlugs: ["las-vegas"],
    faqs: [
      {
        question: "How do I start a cleaning business in Nevada?",
        answer: "Register with the Nevada Secretary of State online (nvsilverflume.gov), obtain a Nevada State Business License (required for all Nevada businesses), and get a local business license from your city or county. Nevada doesn't require a specific cleaning license. Register with the Nevada Employment Security Division if you have employees. No state income tax simplifies tax filings considerably."
      },
      {
        question: "How much do cleaning services cost in Nevada?",
        answer: "Standard residential cleaning in Las Vegas and Henderson runs $100–$175 per visit. Summerlin, MacDonald Ranch, and Seven Hills (upscale Henderson) command $140–$220. Vacation rental turnovers near the Strip and in Paradise run $120–$220 per turnover. Reno is slightly lower at $100–$160 for residential. Short-term rental turnovers in both markets often include linen service, which commands additional fees."
      },
      {
        question: "Is Airbnb cleaning profitable in Las Vegas?",
        answer: "Yes—Las Vegas is one of the busiest Airbnb markets in the country, with thousands of properties in the metro area that require regular, reliable turnover cleaning. Convention season (January through November) keeps occupancy high. The 24/7 nature of Vegas means guests check out at all hours, requiring flexible scheduling. Hosts pay $100–$220 per turnover and are willing to pay more for reliability and quick availability."
      }
    ]
  },

  "oregon": {
    type: "state",
    name: "Oregon",
    intro: "Oregon's cleaning market is centered on the Portland metro and its affluent west-side suburbs (Lake Oswego, Beaverton, Hillsboro, Tualatin), with a growing secondary market in Bend and the coast. Portland's progressive culture drives strong demand for eco-friendly cleaning products and sustainable practices, which can be a meaningful differentiator.",
    marketContext: "Oregon's minimum wage ($15.45/hour in Portland metro in 2025) and complex statewide Paid Leave Oregon program add payroll compliance complexity. Oregon cleaning businesses benefit from the state's tech sector growth in the Silicon Forest corridor.",
    topCities: ["Portland", "Eugene", "Salem", "Bend", "Gresham", "Hillsboro", "Beaverton", "Lake Oswego"],
    topCitySlugs: ["portland"],
    faqs: [
      {
        question: "How do I start a cleaning business in Oregon?",
        answer: "Register with the Oregon Secretary of State, obtain an EIN, and register with the Oregon Department of Revenue for withholding taxes. Enroll in Oregon's Paid Leave program (Paid Leave Oregon) and register for unemployment insurance with the Oregon Employment Department. Portland requires a separate city business license. Get general liability insurance and workers' compensation through SAIF Corporation or a private insurer."
      },
      {
        question: "How much do cleaning services cost in Oregon?",
        answer: "Standard residential cleaning in Oregon runs $110–$180 per visit. Portland's west hills and Lake Oswego run $140–$220. Bend's vacation rental market (ski season and summer) commands $130–$220 per turnover. Oregon coast vacation rentals (Cannon Beach, Seaside, Lincoln City) run $150–$250 per turnover during peak season."
      },
      {
        question: "Do Oregon clients prefer eco-friendly cleaning products?",
        answer: "Yes—Portland and Bend in particular have high demand for non-toxic, environmentally safe cleaning products. Offering a green cleaning option (certified products like Branch Basics, Seventh Generation, or similar) can meaningfully differentiate your business and command a 10–20% premium from environmentally conscious clients. It's a strong marketing angle in college-educated, progressive markets."
      }
    ]
  },

  // ── CITIES ──────────────────────────────────────────────────────────────

  "los-angeles": {
    type: "city",
    name: "Los Angeles",
    stateName: "California",
    stateAbbr: "CA",
    stateSlug: "california",
    intro: "Los Angeles is one of the most lucrative—and logistically challenging—cleaning markets in the country. The city's sprawl, heavy traffic (the 405, 101, and 10 are notorious), and diverse neighborhoods require careful route planning to avoid cleaners spending more time in traffic than cleaning. Premium markets in Beverly Hills, Bel Air, Pacific Palisades, and Malibu command $300–$600+ per clean.",
    marketContext: "LA's entertainment industry clientele, large Airbnb market, and dual-income professional households in Culver City, Silver Lake, and the Westside create consistent, high-value demand. The city's large Spanish-speaking population makes a bilingual team a competitive advantage.",
    faqs: [
      {
        question: "How much does house cleaning cost in Los Angeles?",
        answer: "Standard house cleaning in Los Angeles runs $150–$300 per visit depending on home size and neighborhood. Premium areas like Bel Air, Beverly Hills, and Pacific Palisades often start at $250 and can exceed $600 for large estates. Apartment cleaning in West Hollywood, Silver Lake, and downtown runs $120–$200 per unit. Move-out cleans for landlords typically run $200–$450."
      },
      {
        question: "How do I find cleaning clients in Los Angeles?",
        answer: "The most effective channels for LA cleaning businesses are Google Business Profile (optimize for '[neighborhood] cleaning service'), Nextdoor (where affluent westside neighborhoods actively share local recommendations), and online booking page ads targeting specific zip codes. Referral programs work exceptionally well in LA's tight-knit neighborhood communities (Brentwood, Manhattan Beach, Hancock Park)."
      },
      {
        question: "How do I manage routes for a cleaning business across Los Angeles?",
        answer: "Route optimization is critical in LA—without it, cleaners can spend 2–3 hours/day commuting between jobs. Cluster your clients geographically (e.g., Westside on Mondays, San Fernando Valley on Tuesdays) and use route optimization software to sequence jobs within each cluster. TidyWise's route optimization feature accounts for LA traffic patterns and automatically sequences jobs to minimize drive time."
      }
    ]
  },

  "san-diego": {
    type: "city",
    name: "San Diego",
    stateName: "California",
    stateAbbr: "CA",
    stateSlug: "california",
    intro: "San Diego's cleaning market combines a large military and defense contractor clientele (Camp Pendleton, MCRD, Naval Base San Diego), a thriving vacation rental market along the coast (Pacific Beach, Ocean Beach, La Jolla, Del Mar), and a rapidly growing suburban market in Chula Vista, El Cajon, and Escondido.",
    marketContext: "Military base proximity creates unique demand—military families relocate frequently, generating consistent move-in/move-out cleaning work. San Diego's year-round mild climate means steady booking with few weather disruptions compared to other major markets.",
    faqs: [
      {
        question: "How much do cleaning services cost in San Diego?",
        answer: "Standard residential cleaning in San Diego runs $130–$220 per visit. Coastal neighborhoods (La Jolla, Del Mar, Coronado) and Rancho Santa Fe command $200–$400+. Mid-market areas (Mission Valley, Kearny Mesa, Chula Vista) run $120–$175. Vacation rental turnovers in Pacific Beach and Mission Beach typically run $120–$200 per turnover, with premium rates for same-day availability."
      },
      {
        question: "Is military family cleaning a good niche in San Diego?",
        answer: "Yes—military families on San Diego's bases are a lucrative niche because they relocate every 1–3 years (Permanent Change of Station orders), generating consistent move-in and move-out cleaning demand. Military housing inspections require very thorough cleaning, and families are willing to pay for professional results. Building relationships with military relocation services and Facebook groups on base can generate reliable referral business."
      },
      {
        question: "How do I get cleaning clients in San Diego neighborhoods like La Jolla?",
        answer: "Premium San Diego neighborhoods (La Jolla, Rancho Santa Fe, Coronado, Del Mar) respond well to high-quality Google Business Profiles with genuine reviews, Nextdoor marketing in the specific community, and referrals from real estate agents and property managers. These clients prioritize reliability and trust over price—highlight your vetting process, insurance, and consistent team assignments in your marketing."
      }
    ]
  },

  "new-york-city": {
    type: "city",
    name: "New York City",
    stateName: "New York",
    stateAbbr: "NY",
    stateSlug: "new-york",
    intro: "New York City is the most unique cleaning market in the country—apartment cleaning dominates over houses, clients are reached almost entirely through online channels, and cleaners navigate the city via subway and public transit rather than cars. The density means route efficiency is measured in subway stops, not miles.",
    marketContext: "NYC's minimum wage ($16/hour), combined tipped-worker rules, and NYC-specific sick leave laws make payroll compliance more complex than almost any other market. Premium neighborhoods (Upper East Side, Tribeca, West Village, DUMBO) command rates that make the compliance investment worthwhile.",
    faqs: [
      {
        question: "How much does apartment cleaning cost in New York City?",
        answer: "Apartment cleaning in NYC typically runs $120–$200 for a studio or 1BR, $160–$280 for a 2BR, and $200–$400+ for a 3BR or larger. Luxury buildings and co-ops in the UES, Tribeca, and West Village routinely pay $300–$600+ for thorough cleans. Move-in/move-out cleaning for NYC apartments (which require meticulous deep cleaning) runs $250–$600 depending on size."
      },
      {
        question: "Do cleaning businesses in NYC need to follow specific labor laws?",
        answer: "Yes—NYC has multiple layers of labor law on top of NY State requirements. These include the NYC Earned Safe and Sick Time Act (up to 56 hours of paid leave for large employers), the Freelance Isn't Free Act (contracts required for freelance workers over $800), and the minimum wage of $16/hour. Doorman and co-op buildings also have specific vendor rules—confirm insurance certificate requirements before working in luxury buildings."
      },
      {
        question: "How does a NYC cleaning business schedule jobs without cars?",
        answer: "Most NYC cleaning businesses have cleaners travel by subway, bus, or on foot, with supplies delivered to apartments or stored with clients. Scheduling in NYC means clustering jobs by subway line and borough—Brooklyn cleaners work Brooklyn, Manhattan cleaners work Manhattan. TidyWise's scheduling system handles this by letting you assign cleaners to geographic zones and stack jobs on the same transit corridor for maximum efficiency."
      }
    ]
  },

  "chicago": {
    type: "city",
    name: "Chicago",
    stateName: "Illinois",
    stateAbbr: "IL",
    stateSlug: "illinois",
    intro: "Chicago's cleaning market is anchored by the Gold Coast, Lincoln Park, Lakeview, and River North condo market, along with the city's affluent north shore suburbs (Wilmette, Winnetka, Glencoe, Lake Forest). The city's harsh winters create significant seasonal demand shifts—spring deep cleans are among the busiest weeks of the year for Chicago cleaning businesses.",
    marketContext: "Chicago's minimum wage ($16.20/hour inside city limits in 2025) and Cook County's additional requirements make it important to track which jobs are within city limits vs. suburbs for accurate payroll calculation. Traffic on the Dan Ryan, Kennedy, and Edens can significantly impact scheduling.",
    faqs: [
      {
        question: "How much does cleaning cost in Chicago?",
        answer: "Standard residential cleaning in Chicago runs $130–$210 per visit. Gold Coast, Lincoln Park, and River North apartments run $160–$280. The North Shore suburbs (Kenilworth, Winnetka, Lake Forest) command $200–$400+ for large homes. Chicago's Ukrainian Village, Logan Square, and Wicker Park are mid-market at $120–$170. Move-out cleaning for Chicago apartments typically runs $200–$400."
      },
      {
        question: "When is the busiest season for Chicago cleaning businesses?",
        answer: "Chicago has two strong peaks: spring (March–May), when the post-winter deep cleaning rush hits, and fall (September–October), when clients prepare for the long indoor season. Summer is steady but slower in residential (many clients travel). December is busy for holiday cleans. The deep cleaning rush in April–May can be 30–50% above typical weekly volume for established businesses."
      },
      {
        question: "How do I handle Chicago's minimum wage requirements for my cleaning business?",
        answer: "Chicago's minimum wage is $16.20/hour inside city limits (2025), which is higher than Illinois's statewide $14/hour. If your cleaners work in both the city and suburbs on the same day, you need to track their hours in each jurisdiction and apply the correct wage floor. Cook County has its own ordinance at $14/hour. TidyWise tracks hours per job so you can calculate wages correctly across jurisdictions."
      }
    ]
  },

  "houston": {
    type: "city",
    name: "Houston",
    stateName: "Texas",
    stateAbbr: "TX",
    stateSlug: "texas",
    intro: "Houston is one of the largest cleaning markets in the South, with a diverse client base spanning the Energy Corridor, Medical Center, River Oaks, Memorial, and the Woodlands. The metro's sprawl—there's no zoning and Houston covers 670 square miles—makes route planning critical. Post-hurricane cleaning (Harvey taught the city a hard lesson) has also become a recurring specialty service.",
    marketContext: "Houston's oil and gas executive class in River Oaks and Memorial represents premium cleaning clients willing to pay $250–$500+ per clean. The city's large number of multi-unit properties and corporate housing also creates steady commercial cleaning opportunity alongside residential.",
    faqs: [
      {
        question: "How much does house cleaning cost in Houston?",
        answer: "Standard residential cleaning in Houston runs $100–$175 per visit. Premium neighborhoods (River Oaks, Memorial, Tanglewood, West University Place) command $160–$300+. The Woodlands and Sugar Land suburbs run $120–$185 for standard homes. Post-flood restoration cleaning (common after tropical weather events) is a specialized service that commands $200–$500+ depending on scope."
      },
      {
        question: "How do I plan routes for a cleaning business across Houston?",
        answer: "Houston's size makes clustering essential. Divide your service area into zones (Heights/Montrose on one day, Katy/Memorial on another, Sugar Land on another) and schedule clients within the same zone on the same days. The 610 Loop is a useful geographic divider. TidyWise's route optimization sequences jobs within each zone to minimize drive time and avoid Houston's notorious rush hour on I-10 and I-45."
      },
      {
        question: "Is The Woodlands a good area for a cleaning business?",
        answer: "Yes—The Woodlands is one of Houston's most desirable cleaning markets. It's a master-planned community with high household incomes, large homes (2,500–5,000+ sq ft), and a culture where dual-income families routinely use cleaning services. Adjacent communities like Spring, Tomball, Conroe, and Kingwood have similar demographics. Setting up a dedicated 'Woodlands day' on your schedule and marketing specifically to this community via Nextdoor and community Facebook groups is very effective."
      }
    ]
  },

  "phoenix": {
    type: "city",
    name: "Phoenix",
    stateName: "Arizona",
    stateAbbr: "AZ",
    stateSlug: "arizona",
    intro: "Phoenix is one of the fastest-growing cities in the US, with explosive growth in Scottsdale, Gilbert, Chandler, Tempe, and Surprise driving strong residential cleaning demand. The metro's large retiree population (Sun City, Sun City West, Peoria) creates steady, low-maintenance clients who want recurring weekly or bi-weekly service. Scottsdale's short-term rental market adds vacation rental cleaning volume.",
    marketContext: "Phoenix's extreme summer heat (June–September, 110°F+) affects scheduling—most cleaning happens in morning hours. Summer can see a demand dip as snowbirds leave, but this is offset by increased Airbnb activity. Dust from desert storms (haboobs) increases cleaning frequency needs.",
    faqs: [
      {
        question: "How much does house cleaning cost in Phoenix?",
        answer: "Standard residential cleaning in Phoenix runs $100–$165 per visit. Scottsdale (particularly north Scottsdale and Paradise Valley) commands $150–$280. Chandler, Gilbert, and Tempe are mid-market at $110–$165. Sun City and retirement communities are often smaller homes at $90–$130. Short-term rental turnovers in Old Town Scottsdale and near Talking Stick Resort run $120–$200 per turnover."
      },
      {
        question: "Does Phoenix have a good market for recurring cleaning clients?",
        answer: "Yes—Phoenix has a large base of retirees and 'snowbirds' (seasonal residents from colder states) who are excellent recurring clients. Retirees often prefer bi-weekly or weekly service, are reliably home during the day, and are consistent payers. The key challenge is seasonal fluctuation—some snowbirds leave May through September, creating a summer dip. Building a mix of year-round residents and snowbirds balances this out."
      },
      {
        question: "How do I market a cleaning business in Phoenix?",
        answer: "Phoenix responds well to Google Local Services Ads (cleaning searches are high-intent), neighborhood-specific Nextdoor marketing (particularly in master-planned communities like Ahwatukee, Verrado, and Power Ranch), and partnerships with real estate agents for move-in/move-out cleaning referrals. Phoenix's rapid new construction creates a steady stream of first-time homebuyers who need initial deep cleans—these clients often convert to recurring service."
      }
    ]
  },

  "san-antonio": {
    type: "city",
    name: "San Antonio",
    stateName: "Texas",
    stateAbbr: "TX",
    stateSlug: "texas",
    intro: "San Antonio's cleaning market is shaped by its large military presence (Joint Base San Antonio, the largest military installation in the US), a growing tech and healthcare sector, and a significant tourism economy centered on the River Walk and the Alamo. The north side suburbs (Stone Oak, The Dominion, Helotes) are the premium residential market.",
    marketContext: "Military families in San Antonio (Lackland, Fort Sam Houston, Randolph) generate consistent move-in/move-out cleaning demand due to frequent PCS moves. The city's large Spanish-speaking population makes bilingual service a genuine competitive advantage in client acquisition.",
    faqs: [
      {
        question: "How much does house cleaning cost in San Antonio?",
        answer: "Standard residential cleaning in San Antonio runs $90–$155 per visit. Premium north-side neighborhoods (Stone Oak, The Dominion, Shavano Park) command $130–$200. The southern and west-side markets are more price-sensitive at $85–$120. Military housing cleaning (on or near base) typically runs $100–$160 for standard units, with move-out deep cleans at $150–$250."
      },
      {
        question: "Is San Antonio a good market for a bilingual cleaning business?",
        answer: "Yes—San Antonio has one of the largest Hispanic populations of any major US city (about 64%), and offering Spanish-language communication for both clients and staff is a meaningful advantage. Spanish-speaking staff are more comfortable communicating cleaning preferences in Spanish, and many clients prefer booking and correspondence in Spanish. This isn't just cultural sensitivity—it opens you to a larger client and labor pool."
      },
      {
        question: "How does the military market affect cleaning demand in San Antonio?",
        answer: "Joint Base San Antonio (Lackland AFB, Fort Sam Houston, Randolph AFB) is the largest military installation in the US, housing tens of thousands of military families. Military families PCS (move) every 1–3 years, making them consistent sources of move-in and move-out cleaning work. Homes on base require pass-inspection-level cleaning, and military families pay reliably. Building a referral relationship with base housing offices or military spouse networks (like MilSpouse Facebook groups) is very effective."
      }
    ]
  },

  "dallas": {
    type: "city",
    name: "Dallas",
    stateName: "Texas",
    stateAbbr: "TX",
    stateSlug: "texas",
    intro: "Dallas is one of the fastest-growing major metros in the US, with corporate relocations bringing thousands of high-income households from California, New York, and Illinois. The DFW metroplex—including Plano, Frisco, Allen, Southlake, Colleyville, and University Park—contains some of the most affluent suburbs in the country, making it an exceptional residential cleaning market.",
    marketContext: "Dallas's corporate relocation boom (Toyota, Charles Schwab, McKesson, and dozens of others have moved HQ to DFW) keeps the move-in cleaning market consistently busy. New construction is constant, with many clients seeking initial deep cleans before moving into new builds.",
    faqs: [
      {
        question: "How much does house cleaning cost in Dallas?",
        answer: "Standard residential cleaning in Dallas runs $110–$185 per visit. Highland Park, University Park, and Southlake command $160–$300+. Plano, Frisco, and Allen—DFW's most active growth suburbs—run $130–$200. Downtown Dallas condo cleaning typically runs $140–$220. New construction initial deep cleans (a major Dallas niche given constant building activity) run $250–$500 depending on square footage."
      },
      {
        question: "Is Frisco or Plano better for a cleaning business?",
        answer: "Both are excellent—Frisco and Plano are two of the wealthiest and fastest-growing suburbs in Texas. Frisco in particular has seen explosive growth with corporate campuses (Toyota, Liberty Mutual, Keurig Dr Pepper) driving demand for dual-income household cleaning services. The newer, larger homes (3,000–5,000+ sq ft) in these markets mean bigger jobs and higher revenue per visit. Southlake, Colleyville, and Flower Mound are comparable premium markets with less competition."
      },
      {
        question: "How do I get cleaning clients in the Dallas corporate relocation market?",
        answer: "Partner with relocation companies, real estate agents, and corporate housing providers—they regularly need move-in cleaning recommendations for newly relocated executives. Dallas is a major hub for corporate relocations, and a relationship with a single large corporate relocation service can generate 5–15 move-in cleans per month. Post in expat/newcomer Facebook groups (there are active Dallas Newcomers groups) and offer new-resident discounts to capture relocating households early."
      }
    ]
  },

  "austin": {
    type: "city",
    name: "Austin",
    stateName: "Texas",
    stateAbbr: "TX",
    stateSlug: "texas",
    intro: "Austin has transformed into one of the premier tech hubs in the US (Tesla Gigafactory, Apple, Google, Samsung, Oracle, Dell headquarters), bringing tens of thousands of high-income tech workers who are prime cleaning service clients. The city's Airbnb market is massive, driven by SXSW, Austin City Limits Music Festival, Formula 1 races, and year-round tourism.",
    marketContext: "Austin's rapid growth has created significant cleaning demand pressure—good, reliable cleaning businesses are in short supply relative to the city's expanding client base. This means pricing power is above average for established cleaning companies with strong reviews.",
    faqs: [
      {
        question: "How much does house cleaning cost in Austin?",
        answer: "Standard residential cleaning in Austin runs $120–$200 per visit. Premium neighborhoods (Westlake Hills, Tarrytown, Barton Hills, Rollingwood) command $170–$300+. East Austin and Mueller run $130–$190. Airbnb turnover cleans during major events (SXSW, F1 Grand Prix, ACL) are premium—hosts often pay $150–$300+ per turnover for same-day availability during peak weekends."
      },
      {
        question: "Is Austin a good market for Airbnb turnover cleaning?",
        answer: "Yes—Austin has one of the most active Airbnb markets in Texas. The city hosts 70,000+ visitors during SXSW and Formula 1 weekends, driving massive short-term rental occupancy. Hosts in Travis County paid $130M+ in hotel occupancy taxes in 2023, indicating the scale of the market. Cleaning companies that can guarantee availability during peak weekends and provide fast, reliable turnovers command premium rates."
      },
      {
        question: "How do I compete for cleaning clients in Austin's crowded market?",
        answer: "Austin has a competitive cleaning market due to the city's growth, but also high demand that outstrips supply for quality providers. The keys are: (1) a fast, seamless online booking experience—Austin's tech-savvy clientele expects to book online instantly; (2) consistent team assignments so clients see the same cleaners each visit; (3) genuine Google reviews with photos; and (4) being available for the major event weekends when demand spikes."
      }
    ]
  },

  "charlotte": {
    type: "city",
    name: "Charlotte",
    stateName: "North Carolina",
    stateAbbr: "NC",
    stateSlug: "north-carolina",
    intro: "Charlotte is one of the fastest-growing cities in the Southeast, anchored by its status as the second-largest banking center in the US (Bank of America HQ, Wells Fargo regional HQ, Truist). South Charlotte—Ballantyne, Waxhaw, Marvin, Weddington—is the premium residential cleaning market, with homes routinely above 3,000 square feet and household incomes in the top quartile nationally.",
    marketContext: "Charlotte's finance sector drives a large professional-class client base that values reliability and consistency over price. Corporate relocation is constant (many companies are moving regional operations to Charlotte), keeping the move-in cleaning market active.",
    faqs: [
      {
        question: "How much does house cleaning cost in Charlotte?",
        answer: "Standard residential cleaning in Charlotte runs $110–$175 per visit. South Charlotte neighborhoods (Ballantyne, Waverly, Waxhaw, Marvin) command $140–$220. Dilworth, Myers Park, and SouthPark run $130–$200. The Lake Norman area (Cornelius, Davidson, Huntersville) is a growing premium market at $130–$190. Move-out cleans typically run $200–$380."
      },
      {
        question: "Is Charlotte growing fast enough to support a new cleaning business?",
        answer: "Yes—Charlotte adds approximately 100+ new residents per day, making it one of the fastest-growing metros in the South. Each new household is a potential cleaning client, and the city's strong corporate base (finance, healthcare, tech) means a high proportion of dual-income professional households. The Ballantyne corridor, University City tech district, and SouthPark retail hub are among the strongest growth areas."
      },
      {
        question: "How do I get cleaning clients in South Charlotte?",
        answer: "South Charlotte (Ballantyne, Waxhaw, Marvin, Weddington) responds well to Nextdoor marketing, Google Business Profile optimization, and referrals from real estate agents handling the active home sales market. Partnering with local realtors who sell the 400,000–800,000 homes in these communities and offering new-homeowner specials is highly effective. Facebook community groups (Ballantyne Moms, Waxhaw community groups) are active and receptive to local service recommendations."
      }
    ]
  },

  "seattle": {
    type: "city",
    name: "Seattle",
    stateName: "Washington",
    stateAbbr: "WA",
    stateSlug: "washington",
    intro: "Seattle is one of the highest-income and most educated cleaning markets in the country, driven by Amazon, Microsoft, Boeing, and a dense tech sector. Bellevue, Kirkland, Redmond, and Mercer Island are the premium east-side markets. The Pacific Northwest's wet climate means mold prevention and post-rain deep cleaning are recurring needs, not occasional services.",
    marketContext: "Seattle's minimum wage ($20.76/hour inside city limits in 2025) is among the highest in the US, requiring precise payroll tracking. Despite high labor costs, Seattle's market supports premium pricing—clients in Queen Anne, Capitol Hill, and Eastlake regularly pay $200–$350 per apartment clean.",
    faqs: [
      {
        question: "How much does house cleaning cost in Seattle?",
        answer: "Standard residential cleaning in Seattle runs $160–$280 per visit. Mercer Island, Bellevue's Clyde Hill, and Medina (home to many Amazon and Microsoft executives) command $250–$450+. Capitol Hill, Fremont, and Ballard apartments run $160–$250 for standard 2–3BR units. Eastside markets (Kirkland, Redmond, Issaquah) run $170–$270 for suburban homes. Move-out cleans for Seattle rentals typically run $250–$500."
      },
      {
        question: "How does Seattle's minimum wage affect cleaning business pricing?",
        answer: "Seattle's $20.76/hour minimum wage (2025) for large employers inside city limits means your cleaner labor cost is among the highest in the country. Most Seattle cleaning businesses price accordingly at $50–$75/cleaner/hour. This high wage floor actually benefits the market by reducing the race-to-the-bottom pricing seen in lower-cost markets—clients expect to pay more and the market supports it. TidyWise tracks hours by job location to help calculate wages accurately across the city/county boundary."
      },
      {
        question: "Is mold an issue Seattle cleaning businesses need to address?",
        answer: "Yes—Seattle's persistent rain and moisture create real mold risks in bathrooms, window sills, and basement areas. Cleaning businesses that include mold prevention (using products that inhibit mold growth) as part of their standard service can differentiate themselves and justify higher rates. Clients in older homes (pre-1980 construction) in Wallingford, Ravenna, and North Seattle are particularly likely to need this. Post-construction cleaning for the constant new development is also a strong niche."
      }
    ]
  },

  "denver": {
    type: "city",
    name: "Denver",
    stateName: "Colorado",
    stateAbbr: "CO",
    stateSlug: "colorado",
    intro: "Denver's cleaning market has grown dramatically with the city's tech and cannabis industry booms. Cherry Creek, Washington Park, and Highlands are the premium urban markets, while the southern suburbs (Greenwood Village, Lone Tree, Castle Rock) and the Boulder corridor represent the high-income residential opportunity. Mountain resort cleaning in nearby Breckenridge, Vail, and Aspen is a specialized extension market.",
    marketContext: "Denver's outdoor lifestyle means clients often track in more dirt, mud, and outdoor debris—especially in spring when snow melt is active. This increases cleaning frequency needs and makes premium 'outdoor-ready' deep cleans popular. The city's fast growth has made reliable cleaning services scarce relative to demand.",
    faqs: [
      {
        question: "How much does house cleaning cost in Denver?",
        answer: "Standard residential cleaning in Denver runs $120–$195 per visit. Cherry Creek, Washington Park, and Park Hill command $150–$250. Greenwood Village and Cherry Hills Village (high-income south Denver suburbs) run $180–$300+. Boulder runs $140–$220 for standard cleaning. Mountain resort areas (Breckenridge, Vail, Aspen) typically command $200–$400+ for vacation rental turnovers due to higher property values and driving time."
      },
      {
        question: "How does altitude affect cleaning in Denver?",
        answer: "At 5,280 feet, water boils at a lower temperature and cleaning products behave slightly differently—some chemical concentrations need adjustment. More practically, the dry air and intense sun (Denver gets more annual sunshine than Miami) bleaches surfaces faster, and window cleaning residue evaporates quickly. Cleaning businesses sometimes need to adjust product dilutions and work faster on exterior surfaces. These are minor adjustments, but worth knowing when training staff new to high-altitude markets."
      },
      {
        question: "Is Boulder a good market for eco-friendly cleaning?",
        answer: "Yes—Boulder is one of the best markets in the country for eco-friendly cleaning services. The city's educated, environmentally conscious population strongly prefers non-toxic, sustainable cleaning products. Offering a 'Boulder Green Clean' tier with certified non-toxic products can command a 15–25% premium. Certification from organizations like Green Seal or EPA Safer Choice is valued by Boulder clients. This positioning also appeals strongly to families with young children and pets."
      }
    ]
  },

  "nashville": {
    type: "city",
    name: "Nashville",
    stateName: "Tennessee",
    stateAbbr: "TN",
    stateSlug: "tennessee",
    intro: "Nashville has transformed from a mid-sized Southern city into one of the hottest destination markets in the US, driven by the bachelorette party industry, healthcare sector growth (HCA Healthcare, Vanderbilt Medical Center), and a wave of corporate relocations. The short-term rental market is massive—Nashville hosts hundreds of thousands of bachelorette and bachelor visitors per year, each group booking rental homes that need cleaning between stays.",
    marketContext: "Nashville's Airbnb market is among the most active in the Southeast, with premium cleaning rates during peak weekends (bachelorette season, NFL games, concerts at Nissan Stadium). Brentwood and Franklin represent the premium residential market south of the city.",
    faqs: [
      {
        question: "How much does cleaning cost in Nashville?",
        answer: "Standard residential cleaning in Nashville runs $100–$175 per visit. Premium south Nashville suburbs (Brentwood, Franklin, Nolensville, Spring Hill) command $130–$220. East Nashville, 12 South, and Germantown run $120–$185. Airbnb turnover cleans in The Nations, Gulch, and popular party neighborhoods run $120–$250 per turnover, with same-day premium availability during peak bachelorette/event weekends."
      },
      {
        question: "How profitable is Nashville Airbnb turnover cleaning?",
        answer: "Nashville's short-term rental cleaning is very profitable. The city's bachelorette industry drives some of the highest per-night rental rates and occupancy rates of any non-coastal city. Hosts pay $120–$250+ per turnover and are willing to pay more for guaranteed fast availability. During busy weekends (Nashville has 40+ events per year that spike STR occupancy), cleaning companies that can handle same-day turnovers earn significantly above standard rates. Building relationships with vacation rental property managers (who manage 10–50 properties each) creates scalable recurring revenue."
      },
      {
        question: "Is Nashville growing fast enough to support a cleaning business?",
        answer: "Yes—Nashville has been one of the 10 fastest-growing metros in the US for the past decade. The city adds thousands of new residents monthly, driven by no state income tax, affordable cost of living relative to coastal markets, and strong job growth in healthcare, music industry, and tech. Each new household is a potential cleaning client, and the city's young professional demographic (many from higher-cost cities where they habitually used cleaning services) is receptive to recurring service."
      }
    ]
  },

  "atlanta": {
    type: "city",
    name: "Atlanta",
    stateName: "Georgia",
    stateAbbr: "GA",
    stateSlug: "georgia",
    intro: "Atlanta is the economic capital of the Southeast, with major corporate headquarters (CNN, Coca-Cola, Delta, Home Depot, UPS) and a rapidly growing tech sector (Google, Microsoft, and dozens of startups). Buckhead, Sandy Springs, and Dunwoody are the premium residential cleaning markets; East Atlanta, Kirkwood, and Decatur have an active urban professional market.",
    marketContext: "Atlanta's notorious traffic (I-285 and I-75/85 interchange known as 'Spaghetti Junction') makes route optimization critical—a poorly planned day can mean cleaners spending 40% of their time in traffic. Smart scheduling and geographic clustering are essential for profitability.",
    faqs: [
      {
        question: "How much does house cleaning cost in Atlanta?",
        answer: "Standard residential cleaning in Atlanta runs $110–$185 per visit. Buckhead, Sandy Springs, and Dunwoody command $140–$250+. East Atlanta, Decatur, and Grant Park are mid-market at $110–$160. The tony northern suburbs (Alpharetta, Johns Creek, Milton, Roswell) run $130–$220. Move-out cleans in Atlanta's active rental market typically run $200–$400."
      },
      {
        question: "How do I handle Atlanta traffic for a cleaning business?",
        answer: "Atlanta traffic is one of the biggest operational challenges for cleaning businesses in the city. The key strategies: cluster jobs geographically by day (OTP—outside the perimeter—one day, ITP on another), schedule the first job of the day to start before rush hour (before 8am), build 45-minute travel buffers between jobs inside the city, and use route optimization software to sequence jobs along traffic-aware routes. TidyWise's route optimization uses real-time traffic data to sequence jobs efficiently."
      },
      {
        question: "Is Atlanta a good market for move-out cleaning?",
        answer: "Yes—Atlanta has a very active real estate market and high renter-to-owner ratio, generating consistent move-out cleaning demand. The city's constant corporate relocations (many companies have Southeast HQ in Atlanta) mean a steady stream of executive moves requiring thorough cleaning. Partnering with Atlanta real estate agents, apartment complexes, and corporate housing providers gives you consistent access to this high-value niche."
      }
    ]
  },

  "las-vegas": {
    type: "city",
    name: "Las Vegas",
    stateName: "Nevada",
    stateAbbr: "NV",
    stateSlug: "nevada",
    intro: "Las Vegas is one of the most active short-term rental markets in the world, with thousands of Airbnb properties serving the city's 40M+ annual visitors. Beyond the tourist economy, the Henderson and Summerlin suburbs have large, affluent residential populations with strong recurring cleaning demand. No state income tax and Nevada's business-friendly environment make Las Vegas a financially attractive place to operate a cleaning business.",
    marketContext: "Las Vegas's 24/7 economy means guests check out at all hours—cleaning businesses that can handle flexible, time-sensitive turnovers command premium rates. Convention season (the city hosts hundreds of major conventions annually) creates predictable spikes in STR occupancy and cleaning demand.",
    faqs: [
      {
        question: "How much does house cleaning cost in Las Vegas?",
        answer: "Standard residential cleaning in Las Vegas runs $100–$170 per visit. Summerlin and Henderson (Macdonald Ranch, Seven Hills, Inspirada) command $130–$200. Short-term rental turnovers near the Strip (Paradise, Spring Valley) run $120–$220 per turnover. Luxury vacation home turnovers in Anthem Country Club and Lake Las Vegas run $200–$400+. Residential cleaning in North Las Vegas and Henderson's more affordable communities runs $90–$140."
      },
      {
        question: "How do I build a Las Vegas STR cleaning business?",
        answer: "Start by connecting with Airbnb and VRBO hosts directly—join local host Facebook groups, Bigger Pockets Las Vegas forums, and attend local real estate investor meetups. Property managers who oversee 10–50+ short-term rental properties are the highest-value clients because they generate consistent weekly volume. Offer a fast, reliable turnover guarantee with same-day availability during convention weeks, and you'll quickly differentiate from less responsive competitors."
      },
      {
        question: "How does Las Vegas convention season affect cleaning demand?",
        answer: "Las Vegas hosts hundreds of major conventions annually (CES, SEMA, World of Concrete, NAB Show, etc.) that fill the city's STR inventory to near-100% occupancy. During these weeks, every Airbnb and VRBO in the city turns over multiple times, creating massive demand for fast, reliable cleaning. Building convention dates into your scheduling calendar in advance—and having enough cleaner capacity to handle the surge—can generate 3–5x a normal week's revenue during peak convention periods."
      }
    ]
  },

  "miami": {
    type: "city",
    name: "Miami",
    stateName: "Florida",
    stateAbbr: "FL",
    stateSlug: "florida",
    intro: "Miami is a uniquely bilingual cleaning market where Spanish-language communication is as important as English for both client acquisition and cleaner management. The city's luxury condo market (Brickell, Edgewater, Wynwood, South Beach) is among the most valuable in the country, with cleaning clients who expect premium service and meticulous attention to detail.",
    marketContext: "Miami's vacation rental market—particularly in South Beach, Surfside, and Bal Harbour—creates strong turnover cleaning demand year-round, peaking during Art Basel, Ultra Music Festival, and winter snowbird season. The city's tropical climate (humidity, mold risk) means cleaning frequency is often higher than northern markets.",
    faqs: [
      {
        question: "How much does cleaning cost in Miami?",
        answer: "Standard residential cleaning in Miami runs $130–$220 per visit. Luxury condo cleaning in Brickell, Edgewater, and South Beach runs $180–$350+. Miami Beach and Bal Harbour townhome cleaning runs $200–$400. Coral Gables and Coconut Grove (larger single-family homes) run $160–$300. Airbnb turnover cleans in South Beach run $140–$250 per turnover during peak season."
      },
      {
        question: "How important is Spanish for a cleaning business in Miami?",
        answer: "Very important—Miami is one of the most bilingual cities in the US, with a majority Spanish-speaking population in many neighborhoods. For cleaning businesses, this means: Spanish-speaking cleaner recruitment is important (Miami's cleaner workforce is largely Spanish-speaking), client communication in Spanish opens you to the full client base, and your booking page/marketing should be bilingual. Businesses that can operate comfortably in both languages have a significant advantage in Miami's labor and client market."
      },
      {
        question: "How does Miami's humidity affect cleaning demand?",
        answer: "Miami's tropical climate (year-round humidity, frequent rain) accelerates mold and mildew growth in bathrooms, window tracks, and outdoor furniture. Clients often need cleaning more frequently than in drier climates—bi-weekly is common where monthly might suffice elsewhere. Proactively offering a mold-prevention treatment add-on (wiping surfaces with anti-mold solution) can increase your per-job revenue and client stickiness, since clients who've dealt with mold are eager to prevent recurrence."
      }
    ]
  },

  "philadelphia": {
    type: "city",
    name: "Philadelphia",
    stateName: "Pennsylvania",
    stateAbbr: "PA",
    stateSlug: "pennsylvania",
    intro: "Philadelphia's cleaning market is shaped by its distinctive housing stock—the city has more row homes than any other major US city, and the historic architecture (crown molding, hardwood floors, original tile) requires more careful, detailed cleaning than modern construction. The Main Line suburbs (Villanova, Wayne, Bryn Mawr, Haverford) and Society Hill/Rittenhouse Square are the premium markets.",
    marketContext: "Philadelphia's gentrifying neighborhoods (Fishtown, Northern Liberties, Point Breeze, East Passyunk) have created a new tier of urban professionals willing to pay for recurring cleaning service. The city's university hospital system generates a large healthcare worker clientele.",
    faqs: [
      {
        question: "How much does house cleaning cost in Philadelphia?",
        answer: "Standard residential cleaning in Philadelphia runs $110–$180 per visit. The Main Line (Bryn Mawr, Villanova, Wayne, Gladwyne) commands $150–$260. Rittenhouse Square, Society Hill, and Chestnut Hill run $140–$220 for townhomes and condos. Fishtown, Northern Liberties, and Manayunk are mid-market at $110–$165. Move-out cleaning for Philadelphia's rental market typically runs $200–$400."
      },
      {
        question: "How do Philadelphia row homes affect cleaning pricing?",
        answer: "Philadelphia's row homes are multi-story (typically 3 floors), narrow, with detailed original architectural features (plaster walls, pocket doors, window sills, baseboards) that take longer to clean thoroughly. Standard cleaning estimates for row homes should account for the extra vertical square footage and detailed work. Many Philadelphia cleaning businesses charge hourly rather than flat-rate for this reason, which allows billing to accurately reflect the complexity of the property."
      },
      {
        question: "Is the Main Line a good area for a cleaning business?",
        answer: "Yes—the Main Line (the affluent Philadelphia suburbs along the old Pennsylvania Railroad Main Line) is one of the strongest cleaning markets in the Mid-Atlantic. Communities like Bryn Mawr, Villanova, Wayne, and Berwyn have some of the highest household incomes in Pennsylvania, large older homes that require significant cleaning time, and a culture of professional service. Client retention is excellent once you establish yourself, and word-of-mouth referrals spread quickly through these tight-knit communities."
      }
    ]
  },

  "portland": {
    type: "city",
    name: "Portland",
    stateName: "Oregon",
    stateAbbr: "OR",
    stateSlug: "oregon",
    intro: "Portland's cleaning market is driven by its large tech sector (Nike, Intel, Adidas North America headquarters in nearby Beaverton/Hillsboro), a strong eco-conscious culture, and affluent west-side neighborhoods (West Hills, Lake Oswego, Dunthorpe). Portland clients often specifically request green cleaning products, making eco-friendly positioning a genuine differentiator.",
    marketContext: "Portland's Pearl District, Northwest 23rd, and Eastside neighborhoods have active urban professional cleaning demand, while Lake Oswego and the West Hills represent the premium single-family market. Oregon's rainy climate means mold and mildew prevention is a recurring client concern.",
    faqs: [
      {
        question: "How much does house cleaning cost in Portland?",
        answer: "Standard residential cleaning in Portland runs $120–$195 per visit. West Hills, Lake Oswego, and Dunthorpe command $155–$260. The Pearl District and Northwest Portland condos run $140–$220 per unit. Eastside neighborhoods (Hawthorne, Division, Alberta) are mid-market at $110–$165. Bend, Oregon's fast-growing second market, runs $120–$185 with vacation rental turnovers at $130–$220."
      },
      {
        question: "Do Portland cleaning clients really prefer eco-friendly products?",
        answer: "Yes—Portland has one of the strongest eco-conscious consumer bases in the US. Clients in the Pearl District, Eastmoreland, and Sellwood regularly ask specifically for non-toxic, fragrance-free, or certified-green cleaning products. Offering a green cleaning tier (even at a small upcharge) is a meaningful differentiator. Popular product lines include Seventh Generation, Branch Basics, and Mrs. Meyer's. Advertising your product certifications (EPA Safer Choice, Green Seal) can meaningfully improve conversion in Portland's market."
      },
      {
        question: "How does Oregon's Paid Leave program affect a Portland cleaning business?",
        answer: "Oregon's Paid Leave Oregon (effective 2023) requires employers to withhold contributions from employee wages for paid family and medical leave. The contribution rate in 2025 is 1% of gross wages split between employer and employee. Eligible employees can take up to 12 weeks of paid leave per year. This adds a layer of payroll complexity—TidyWise tracks gross wages per employee, which you or your accountant can use to calculate the quarterly Paid Leave contributions."
      }
    ]
  }
};
