import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  Loader2, 
  Building2, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Sparkles,
  Building,
  Dog,
  Leaf,
  Scissors,
  Car,
  Droplets,
  Wrench,
  PaintBucket,
  Shirt,
  Dumbbell,
  Camera,
  Check
} from 'lucide-react';
import { industryTemplates, IndustryType, getIndustryTemplate } from '@/data/industryTemplates';
import { cn } from '@/lib/utils';

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function randomSuffix(length = 5) {
  return Math.random().toString(36).slice(2, 2 + length);
}

const industryIcons: Record<IndustryType, typeof Sparkles> = {
  "Home Cleaning": Sparkles,
  "Office Cleaning": Building,
  "Pet Grooming": Dog,
  "Lawn Care": Leaf,
  "Hair Salon": Scissors,
  "Car Wash": Car,
  "Pool Service": Droplets,
  "Handyman": Wrench,
  "Painting": PaintBucket,
  "Laundry Service": Shirt,
  "Personal Training": Dumbbell,
  "Photography": Camera,
};

const industries = Object.keys(industryTemplates) as IndustryType[];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, loading: orgLoading, refetch } = useOrganization();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryType | null>(null);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

  // Read industry from sessionStorage if set from landing page
  useEffect(() => {
    const storedIndustry = sessionStorage.getItem('selectedIndustry');
    if (storedIndustry && industries.includes(storedIndustry as IndustryType)) {
      setSelectedIndustry(storedIndustry as IndustryType);
    }
  }, []);

  // When industry changes, pre-select all services
  useEffect(() => {
    if (selectedIndustry) {
      const template = getIndustryTemplate(selectedIndustry);
      if (template) {
        setSelectedServices(new Set(template.services.map(s => s.name)));
      }
    }
  }, [selectedIndustry]);

  // If the user already has a business, never let them re-onboard.
  useEffect(() => {
    if (!orgLoading && organization) {
      navigate('/dashboard', { replace: true });
    }
  }, [orgLoading, organization, navigate]);

  // If not logged in, send to auth.
  useEffect(() => {
    if (!orgLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [orgLoading, user, navigate]);

  const baseSlug = useMemo(() => slugify(businessName), [businessName]);

  const currentTemplate = selectedIndustry ? getIndustryTemplate(selectedIndustry) : null;

  const toggleService = (serviceName: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceName)) {
      newSelected.delete(serviceName);
    } else {
      newSelected.add(serviceName);
    }
    setSelectedServices(newSelected);
  };

  const selectAllServices = () => {
    if (currentTemplate) {
      setSelectedServices(new Set(currentTemplate.services.map(s => s.name)));
    }
  };

  const deselectAllServices = () => {
    setSelectedServices(new Set());
  };

  const handleSubmit = async () => {
    if (!user || !businessName.trim() || !selectedIndustry) return;

    setLoading(true);
    try {
      const name = businessName.trim();
      const initialSlug = slugify(name);

      // Try a few times in case the slug is taken.
      let orgData: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const slug = attempt === 0 ? initialSlug : `${initialSlug}-${randomSuffix()}`;

        const { data, error } = await supabase
          .from('organizations')
          .insert({
            name,
            owner_id: user.id,
            slug,
          })
          .select()
          .single();

        if (!error) {
          orgData = data;
          break;
        }

        // Slug conflict: retry with a different slug.
        if (error.code === '23505' && (error.message || '').includes('organizations_slug_key')) {
          continue;
        }

        throw error;
      }

      if (!orgData) {
        throw new Error('Business name is already taken. Please choose a different business name.');
      }

      // Create the membership for the owner
      const { error: memberError } = await supabase
        .from('org_memberships')
        .insert({
          organization_id: orgData.id,
          user_id: user.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      // Create default business settings
      await supabase.from('business_settings').insert({
        organization_id: orgData.id,
        company_name: name,
      });

      // Create service categories if defined
      const template = getIndustryTemplate(selectedIndustry);
      let categoryMap: Record<string, string> = {};
      
      if (template?.categories && template.categories.length > 0) {
        const categoryInserts = template.categories.map((cat, index) => ({
          organization_id: orgData.id,
          name: cat,
          color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5],
        }));

        const { data: categories, error: catError } = await supabase
          .from('service_categories')
          .insert(categoryInserts)
          .select();

        if (!catError && categories) {
          categories.forEach((cat: any) => {
            categoryMap[cat.name] = cat.id;
          });
        }
      }

      // Create selected services
      if (template && selectedServices.size > 0) {
        const servicesToCreate = template.services
          .filter(s => selectedServices.has(s.name))
          .map(service => ({
            organization_id: orgData.id,
            name: service.name,
            description: service.description,
            price: service.price,
            duration: service.duration,
            deposit_amount: service.depositAmount || 0,
            is_active: true,
          }));

        if (servicesToCreate.length > 0) {
          const { error: servicesError } = await supabase
            .from('services')
            .insert(servicesToCreate);

          if (servicesError) {
            console.error('Error creating services:', servicesError);
          }
        }
      }

      // Clear the stored industry
      sessionStorage.removeItem('selectedIndustry');

      toast.success('Business created successfully with your services!');
      await refetch();
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error creating organization:', error);
      toast.error(error.message || 'Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep1 = businessName.trim().length >= 2;
  const canProceedStep2 = selectedIndustry !== null;
  const canProceedStep3 = selectedServices.size > 0;

  const totalSteps = 3;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Set Up Your Business</CardTitle>
          <CardDescription>
            {step === 1 && "Let's start with your business name"}
            {step === 2 && "Select your industry to get started with templates"}
            {step === 3 && "Choose which services you want to offer"}
          </CardDescription>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div 
                key={s}
                className={cn(
                  "h-2 rounded-full transition-all",
                  s === step ? "w-8 bg-primary" : s < step ? "w-8 bg-primary/60" : "w-8 bg-muted"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Step {step} of {totalSteps}</p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Step 1: Business Name */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="My Awesome Business"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="text-lg h-12"
                  autoFocus
                />
                {businessName && (
                  <p className="text-sm text-muted-foreground">
                    Your booking URL will be: <span className="font-mono text-primary">{baseSlug || 'your-business'}</span>
                  </p>
                )}
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                disabled={!canProceedStep1}
                onClick={() => setStep(2)}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Industry Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {industries.map((industry) => {
                  const Icon = industryIcons[industry];
                  const isSelected = selectedIndustry === industry;
                  return (
                    <button
                      key={industry}
                      onClick={() => setSelectedIndustry(industry)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5 shadow-md" 
                          : "border-border hover:border-primary/50 hover:bg-secondary/50"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center",
                        isSelected ? "bg-primary/20" : "bg-secondary"
                      )}>
                        <Icon className={cn(
                          "h-6 w-6",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <span className={cn(
                        "text-sm font-medium text-center",
                        isSelected ? "text-primary" : "text-foreground"
                      )}>
                        {industry}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button 
                  className="flex-1" 
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Service Selection */}
          {step === 3 && currentTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedServices.size} of {currentTemplate.services.length} services selected
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllServices}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllServices}>
                    Deselect All
                  </Button>
                </div>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                {currentTemplate.services.map((service) => {
                  const isSelected = selectedServices.has(service.name);
                  return (
                    <button
                      key={service.name}
                      onClick={() => toggleService(service.name)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        isSelected 
                          ? "border-primary bg-primary" 
                          : "border-muted-foreground"
                      )}>
                        {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{service.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{service.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-foreground">${service.price}</p>
                        <p className="text-xs text-muted-foreground">{service.duration} min</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                You can always add, edit, or remove services later from the Services page.
              </p>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button 
                  className="flex-1" 
                  disabled={loading || !canProceedStep3}
                  onClick={handleSubmit}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Business <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
