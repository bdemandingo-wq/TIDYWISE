import { useState, useEffect } from "react";
import { Loader2, User, MapPin, Plus, Trash2, Star, Check, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { supabase } from "@/lib/supabase";

interface Location {
  id: string;
  name: string;
  address: string;
  apt_suite: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_primary: boolean;
}

interface TierInfo {
  tier_name: string;
  tier_order: number;
  min_spending: number;
  max_spending: number | null;
  benefits: string[];
  color: string;
}

export function PortalProfileTab() {
  const { user, customer, loyalty, refreshData } = useClientPortal();
  const [firstName, setFirstName] = useState(customer?.first_name || "");
  const [lastName, setLastName] = useState(customer?.last_name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);
  
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: "",
    address: "",
    apt_suite: "",
    city: "",
    state: "",
    zip_code: "",
    is_primary: false,
  });
  const [savingLocation, setSavingLocation] = useState(false);
  
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.first_name);
      setLastName(customer.last_name);
      setPhone(customer.phone || "");
    }
  }, [customer]);

  useEffect(() => {
    if (!user) return;

    const fetchLocations = async () => {
      setLoadingLocations(true);
      const { data, error } = await supabase.rpc("get_client_portal_locations", {
        p_customer_id: user.customer_id,
      });

      if (!error && data) {
        setLocations(data as Location[]);
      }
      setLoadingLocations(false);
    };

    const fetchTiers = async () => {
      setLoadingTiers(true);
      const { data, error } = await supabase.rpc("get_loyalty_tier_info", {
        p_organization_id: user.organization_id,
      });

      if (!error && data) {
        const tiersData = (data as any[]).map((t) => ({
          ...t,
          benefits: typeof t.benefits === "string" ? JSON.parse(t.benefits) : t.benefits || [],
        }));
        setTiers(tiersData);
      }
      setLoadingTiers(false);
    };

    fetchLocations();
    fetchTiers();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user || !firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }

    setSavingProfile(true);

    try {
      const { data, error } = await supabase.rpc("update_client_portal_profile", {
        p_client_user_id: user.id,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_phone: phone.trim() || null,
      });

      if (error) throw error;

      toast.success("Profile updated successfully!");
      await refreshData();
    } catch (err) {
      console.error("Profile update error:", err);
      toast.error("Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddLocation = async () => {
    if (!user || !newLocation.name.trim() || !newLocation.address.trim()) {
      toast.error("Name and address are required");
      return;
    }

    setSavingLocation(true);

    try {
      const { data, error } = await supabase.rpc("add_client_portal_location", {
        p_client_user_id: user.id,
        p_name: newLocation.name.trim(),
        p_address: newLocation.address.trim(),
        p_apt_suite: newLocation.apt_suite.trim() || null,
        p_city: newLocation.city.trim() || null,
        p_state: newLocation.state.trim() || null,
        p_zip_code: newLocation.zip_code.trim() || null,
        p_is_primary: newLocation.is_primary,
      });

      if (error) throw error;

      toast.success("Address added successfully!");
      setNewLocation({
        name: "",
        address: "",
        apt_suite: "",
        city: "",
        state: "",
        zip_code: "",
        is_primary: false,
      });
      setShowAddLocation(false);

      // Refresh locations
      const { data: updatedLocations } = await supabase.rpc("get_client_portal_locations", {
        p_customer_id: user.customer_id,
      });
      if (updatedLocations) {
        setLocations(updatedLocations as Location[]);
      }
    } catch (err) {
      console.error("Add location error:", err);
      toast.error("Failed to add address");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc("delete_client_portal_location", {
        p_client_user_id: user.id,
        p_location_id: locationId,
      });

      if (error) throw error;

      toast.success("Address deleted");
      setLocations((prev) => prev.filter((l) => l.id !== locationId));
    } catch (err) {
      console.error("Delete location error:", err);
      toast.error("Failed to delete address");
    }
  };

  const currentPoints = loyalty?.lifetime_points || 0;
  const currentTierName = loyalty?.tier?.toLowerCase() || "bronze";
  const currentTierIndex = tiers.findIndex(
    (t) => t.tier_name.toLowerCase() === currentTierName
  );

  return (
    <div className="space-y-4 mt-4">
      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle>My Profile</CardTitle>
          </div>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={customer?.email || ""} disabled />
            <p className="text-xs text-muted-foreground">
              Contact support to change your email
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
            {savingProfile ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Addresses Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>My Addresses</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddLocation(!showAddLocation)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddLocation && (
            <Card className="border-dashed">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Location Name *</Label>
                    <Input
                      placeholder="Home, Work, etc."
                      value={newLocation.name}
                      onChange={(e) =>
                        setNewLocation({ ...newLocation, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Apt/Suite</Label>
                    <Input
                      placeholder="Apt 4B"
                      value={newLocation.apt_suite}
                      onChange={(e) =>
                        setNewLocation({ ...newLocation, apt_suite: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Street Address *</Label>
                  <Input
                    placeholder="123 Main St"
                    value={newLocation.address}
                    onChange={(e) =>
                      setNewLocation({ ...newLocation, address: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">City</Label>
                    <Input
                      placeholder="City"
                      value={newLocation.city}
                      onChange={(e) =>
                        setNewLocation({ ...newLocation, city: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">State</Label>
                    <Input
                      placeholder="State"
                      value={newLocation.state}
                      onChange={(e) =>
                        setNewLocation({ ...newLocation, state: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ZIP</Label>
                    <Input
                      placeholder="12345"
                      value={newLocation.zip_code}
                      onChange={(e) =>
                        setNewLocation({ ...newLocation, zip_code: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleAddLocation}
                    disabled={savingLocation}
                    size="sm"
                  >
                    {savingLocation && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Save Address
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddLocation(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingLocations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : locations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No addresses saved yet
            </p>
          ) : (
            <div className="space-y-3">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="flex items-start justify-between p-3 rounded-lg border"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{location.name}</span>
                      {location.is_primary && (
                        <Badge variant="secondary" className="text-xs">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {location.address}
                      {location.apt_suite && `, ${location.apt_suite}`}
                    </p>
                    {(location.city || location.state || location.zip_code) && (
                      <p className="text-sm text-muted-foreground">
                        {[location.city, location.state, location.zip_code]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteLocation(location.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loyalty Tiers Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle>Loyalty Tiers</CardTitle>
          </div>
          <CardDescription>
            Your progress: {currentPoints} lifetime points
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTiers ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {tiers.map((tier, index) => {
                const isCurrentTier =
                  tier.tier_name.toLowerCase() === currentTierName;
                const isAchieved = currentPoints >= tier.min_spending;
                const progressToNext =
                  tier.max_spending !== null && currentPoints >= tier.min_spending
                    ? Math.min(
                        ((currentPoints - tier.min_spending) /
                          (tier.max_spending - tier.min_spending)) *
                          100,
                        100
                      )
                    : tier.max_spending === null && currentPoints >= tier.min_spending
                    ? 100
                    : (currentPoints / tier.min_spending) * 100;

                return (
                  <div
                    key={tier.tier_name}
                    className={`p-3 rounded-lg border transition-colors ${
                      isCurrentTier
                        ? "border-primary bg-primary/5"
                        : isAchieved
                        ? "bg-muted/30"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tier.color }}
                        />
                        <span className="font-medium">{tier.tier_name}</span>
                        {isCurrentTier && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                        {isAchieved && !isCurrentTier && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {tier.min_spending}
                        {tier.max_spending ? ` - ${tier.max_spending}` : "+"} pts
                      </span>
                    </div>

                    {isCurrentTier && tier.max_spending && (
                      <div className="mb-2">
                        <Progress value={progressToNext} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {tier.max_spending - currentPoints} points to next tier
                        </p>
                      </div>
                    )}

                    {tier.benefits && tier.benefits.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tier.benefits.map((benefit, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {benefit}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
