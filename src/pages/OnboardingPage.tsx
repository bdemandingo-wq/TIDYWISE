import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TermsOfServiceDialog } from '@/components/legal/TermsOfServiceDialog';
import { toast } from 'sonner';
import { 
  Loader2, 
  Building2, 
  ArrowRight, 
  ArrowLeft, 
  Plus,
  X,
  Check,
  CheckCircle2,
  LogOut
} from 'lucide-react';
import { getIndustryTemplate } from '@/data/industryTemplates';
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

// Cleaning-only template
const cleaningTemplate = getIndustryTemplate("Home Cleaning")!;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, loading: orgLoading, refetch } = useOrganization();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [needsPhoneCollection, setNeedsPhoneCollection] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [customServices, setCustomServices] = useState<{ name: string; description: string }[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDescription, setNewServiceDescription] = useState('');

  const handleLogout = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  // Pre-select all cleaning services and check if user needs phone collection
  useEffect(() => {
    setSelectedServices(new Set(cleaningTemplate.services.map(s => s.name)));
    
    // Check if user signed up via Google OAuth and needs phone collection
    const checkPhoneNeeded = async () => {
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();
      
      // If no phone number, user likely signed up with Google OAuth
      if (!profile?.phone) {
        setNeedsPhoneCollection(true);
      }
    };
    
    checkPhoneNeeded();
  }, [user]);

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
    setSelectedServices(new Set(cleaningTemplate.services.map(s => s.name)));
  };

  const deselectAllServices = () => {
    setSelectedServices(new Set());
  };

  const addCustomService = () => {
    if (!newServiceName.trim()) return;
    
    const newService = {
      name: newServiceName.trim(),
      description: newServiceDescription.trim() || 'Custom service',
    };
    
    setCustomServices([...customServices, newService]);
    setSelectedServices(new Set([...selectedServices, newService.name]));
    setNewServiceName('');
    setNewServiceDescription('');
    setShowAddForm(false);
  };

  const removeCustomService = (serviceName: string) => {
    setCustomServices(customServices.filter(s => s.name !== serviceName));
    const newSelected = new Set(selectedServices);
    newSelected.delete(serviceName);
    setSelectedServices(newSelected);
  };

  const allServices = [
    ...cleaningTemplate.services,
    ...customServices.map(s => ({ ...s, price: 0, duration: 60 }))
  ];

  const totalServicesCount = allServices.length;

  const handleSubmit = async () => {
    if (!user || !businessName.trim()) return;

    setLoading(true);
    try {
      const name = businessName.trim();
      const initialSlug = slugify(name);
      
      // If user provided phone during onboarding (Google OAuth users), save it and send welcome SMS
      if (needsPhoneCollection && phoneNumber.trim()) {
        await supabase
          .from('profiles')
          .update({ phone: phoneNumber.trim() })
          .eq('id', user.id);
        
        // Send welcome SMS for Google OAuth users
        supabase.functions.invoke('send-signup-welcome-sms', {
          body: {
            to: phoneNumber.trim(),
            fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
          },
        }).catch(err => console.log('Welcome SMS failed (non-critical):', err));
        
        // Notify platform admin of new signup
        supabase.functions.invoke('notify-platform-admin-signup', {
          body: {
            email: user.email || '',
            fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
            phone: phoneNumber.trim(),
            signupMethod: 'google',
          },
        }).catch(err => console.log('Admin notification failed (non-critical):', err));
      } else {
        // Still notify admin even if no phone collected
        supabase.functions.invoke('notify-platform-admin-signup', {
          body: {
            email: user.email || '',
            fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
            signupMethod: 'google',
          },
        }).catch(err => console.log('Admin notification failed (non-critical):', err));
      }

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
      if (cleaningTemplate.categories && cleaningTemplate.categories.length > 0) {
        const categoryInserts = cleaningTemplate.categories.map((cat, index) => ({
          organization_id: orgData.id,
          name: cat,
          color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5],
        }));

        await supabase
          .from('service_categories')
          .insert(categoryInserts);
      }

      // Create selected services from template
      const templateServices = cleaningTemplate.services
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

      // Add custom services
      const customServiceInserts = customServices
        .filter(s => selectedServices.has(s.name))
        .map(service => ({
          organization_id: orgData.id,
          name: service.name,
          description: service.description,
          price: 0,
          duration: 60,
          deposit_amount: 0,
          is_active: true,
        }));

      const allServicesToCreate = [...templateServices, ...customServiceInserts];

      if (allServicesToCreate.length > 0) {
        const { error: servicesError } = await supabase
          .from('services')
          .insert(allServicesToCreate);

        if (servicesError) {
          console.error('Error creating services:', servicesError);
        }
      }

      // Get user's phone from profile for onboarding complete SMS
      const { data: profileData } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', user.id)
        .maybeSingle();

      // Send onboarding complete SMS (non-blocking) - uses org's SMS settings
      if (profileData?.phone) {
        supabase.functions.invoke('send-onboarding-complete-sms', {
          body: {
            to: profileData.phone,
            businessName: name,
            organizationId: orgData.id,
            ownerName: profileData.full_name?.split(' ')[0] || '',
          },
        }).catch(err => console.log('Onboarding SMS failed (non-critical):', err));
      }

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

  const canProceedStep1 = businessName.trim().length >= 2 && (!needsPhoneCollection || phoneNumber.trim().length >= 10);
  const canProceedStep2 = selectedServices.size > 0;

  const totalSteps = 2;

  // Show loading spinner while checking organization status
  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Logout button in top right */}
      <div className="absolute top-4 right-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
      
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Set Up Your Cleaning Business</CardTitle>
          <CardDescription>
            {step === 1 && "Let's start with your business name"}
            {step === 2 && "Choose which cleaning services you want to offer"}
          </CardDescription>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[1, 2].map((s) => (
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
          {/* Step 1: Business Name & Phone */}
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
              
              {/* Phone number collection for Google OAuth users */}
              {needsPhoneCollection && (
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">We'll send you a welcome text with tips to get started!</p>
                </div>
              )}
              
              <Button 
                className="w-full" 
                size="lg"
                disabled={!canProceedStep1}
                onClick={() => setStep(2)}
              >
                Choose Services <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Service Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedServices.size} of {totalServicesCount} services selected
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
              
              <div className="max-h-[350px] overflow-y-auto space-y-2 pr-2">
                {/* Template services */}
                {cleaningTemplate.services.map((service) => {
                  const isSelected = selectedServices.has(service.name);
                  return (
                    <button
                      key={service.name}
                      onClick={() => toggleService(service.name)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        isSelected 
                          ? "border-primary bg-primary" 
                          : "border-muted-foreground"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{service.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{service.description}</p>
                      </div>
                    </button>
                  );
                })}

                {/* Custom services */}
                {customServices.map((service) => {
                  const isSelected = selectedServices.has(service.name);
                  return (
                    <div
                      key={service.name}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border"
                      )}
                    >
                      <button
                        onClick={() => toggleService(service.name)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                          isSelected 
                            ? "border-primary bg-primary" 
                            : "border-muted-foreground"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{service.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{service.description}</p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCustomService(service.name)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Add custom service form */}
              {showAddForm ? (
                <div className="border border-border rounded-lg p-4 space-y-3 bg-secondary/30">
                  <div className="space-y-2">
                    <Label htmlFor="newServiceName">Service Name</Label>
                    <Input
                      id="newServiceName"
                      placeholder="e.g., Express Service"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newServiceDescription">Description (optional)</Label>
                    <Input
                      id="newServiceDescription"
                      placeholder="Brief description of the service"
                      value={newServiceDescription}
                      onChange={(e) => setNewServiceDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewServiceName('');
                        setNewServiceDescription('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={addCustomService}
                      disabled={!newServiceName.trim()}
                    >
                      Add Service
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Custom Service
                </Button>
              )}

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
                  disabled={loading || !canProceedStep2}
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

      <div className="mt-6 text-center text-xs text-muted-foreground max-w-2xl">
        By creating an account you agree to our{' '}
        <TermsOfServiceDialog>
          <button className="underline underline-offset-4 hover:text-foreground transition-colors">Terms</button>
        </TermsOfServiceDialog>
        {' '}and acknowledge our{' '}
        <Link
          to="/privacy-policy"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}
