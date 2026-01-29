import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Camera, Save, Loader2, User, Mail, Phone, FileText, MapPin, Home } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface StaffInfo {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  tax_classification: string | null;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
}

interface Props {
  staffInfo: StaffInfo;
  userId: string;
}

export function CleanerProfile({ staffInfo, userId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: staffInfo.name,
    phone: staffInfo.phone || '',
    bio: staffInfo.bio || '',
    home_address: staffInfo.home_address || '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (data: { name: string; phone: string; bio: string; home_address: string }) => {
      // If address changed, try to geocode it
      let latitude: number | null = null;
      let longitude: number | null = null;

      if (data.home_address && data.home_address !== staffInfo.home_address) {
        setIsGeocodingAddress(true);
        try {
          // Use browser's Geocoding API via OpenStreetMap Nominatim (free, no API key needed)
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(data.home_address)}&limit=1`,
            { headers: { 'User-Agent': 'TidyWise/1.0' } }
          );
          const results = await response.json();
          if (results && results.length > 0) {
            latitude = parseFloat(results[0].lat);
            longitude = parseFloat(results[0].lon);
            console.log('Geocoded address:', { latitude, longitude });
          }
        } catch (geocodeError) {
          console.error('Geocoding failed:', geocodeError);
          // Continue without coordinates - address still saved
        }
        setIsGeocodingAddress(false);
      }

      const updateData: Record<string, unknown> = {
        name: data.name,
        phone: data.phone || null,
        bio: data.bio || null,
        home_address: data.home_address || null,
      };

      // Only update lat/lng if we have new values
      if (latitude !== null && longitude !== null) {
        updateData.home_latitude = latitude;
        updateData.home_longitude = longitude;
      }

      const { error } = await supabase
        .from('staff')
        .update(updateData)
        .eq('id', staffInfo.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-profile'] });
      toast.success('Profile updated!');
      setHasChanges(false);
    },
    onError: (error) => {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      // Create file path using user ID
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      // Delete old avatar if exists
      await supabase.storage.from('staff-avatars').remove([filePath]);

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('staff-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('staff-avatars')
        .getPublicUrl(filePath);

      // Update staff record with new avatar URL
      const { error: updateError } = await supabase
        .from('staff')
        .update({ avatar_url: publicUrl })
        .eq('id', staffInfo.id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['staff-profile'] });
      toast.success('Photo updated!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Profile Photo Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Profile Photo
          </CardTitle>
          <CardDescription>
            Update your profile picture. This will be visible to customers and admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="relative group">
            <Avatar className="h-32 w-32 border-4 border-primary/20">
              <AvatarImage src={staffInfo.avatar_url || undefined} alt={staffInfo.name} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {getInitials(staffInfo.name)}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <Camera className="h-8 w-8 text-white" />
              )}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-sm text-muted-foreground">
            Click on the photo to change it
          </p>
        </CardContent>
      </Card>

      {/* Contact Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Contact Information
          </CardTitle>
          <CardDescription>
            Update your name and contact details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="pl-10"
                  placeholder="Your full name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="pl-10"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={staffInfo.email}
                disabled
                className="pl-10 bg-muted"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Contact admin to change your email address
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Home Address Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Home Address
          </CardTitle>
          <CardDescription>
            Used to calculate travel distance to job locations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="home_address">Street Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="home_address"
                value={formData.home_address}
                onChange={(e) => handleInputChange('home_address', e.target.value)}
                className="pl-10"
                placeholder="123 Main St, City, State 12345"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your full address including city, state, and ZIP code
            </p>
          </div>
          {staffInfo.home_latitude && staffInfo.home_longitude && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>Location verified: {staffInfo.home_latitude.toFixed(4)}, {staffInfo.home_longitude.toFixed(4)}</span>
            </div>
          )}
          {isGeocodingAddress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Verifying address location...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bio Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            About You
          </CardTitle>
          <CardDescription>
            Tell customers a bit about yourself
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => handleInputChange('bio', e.target.value)}
            placeholder="I'm a professional cleaner with 5+ years of experience specializing in deep cleaning and organization..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {formData.bio.length}/500 characters
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={() => updateProfile.mutate(formData)}
        disabled={!hasChanges || updateProfile.isPending}
        className="w-full gap-2"
        size="lg"
      >
        {updateProfile.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}
