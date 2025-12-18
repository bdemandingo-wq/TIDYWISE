import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Globe, Bell, Lock, CreditCard, Palette } from 'lucide-react';

export default function SettingsPage() {
  return (
    <AdminLayout
      title="Settings"
      subtitle="Manage your business preferences"
    >
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full max-w-xl grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="booking">Booking</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Business Information
              </CardTitle>
              <CardDescription>
                Update your business details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" defaultValue="Footprint Cleaning" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Business Email</Label>
                  <Input id="email" type="email" defaultValue="contact@footprintcleaning.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" defaultValue="(555) 123-4567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" defaultValue="https://footprintcleaning.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <Input id="address" defaultValue="123 Business St, New York, NY 10001" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select defaultValue="est">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="est">Eastern Time (ET)</SelectItem>
                      <SelectItem value="cst">Central Time (CT)</SelectItem>
                      <SelectItem value="mst">Mountain Time (MT)</SelectItem>
                      <SelectItem value="pst">Pacific Time (PT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select defaultValue="usd">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD ($)</SelectItem>
                      <SelectItem value="eur">EUR (€)</SelectItem>
                      <SelectItem value="gbp">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Booking Settings */}
        <TabsContent value="booking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Booking Preferences</CardTitle>
              <CardDescription>
                Configure how customers can book your services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Allow Online Booking</p>
                  <p className="text-sm text-muted-foreground">
                    Let customers book services through your website
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Require Deposit</p>
                  <p className="text-sm text-muted-foreground">
                    Collect a deposit when booking is made
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Notice (hours)</Label>
                  <Input type="number" defaultValue="24" />
                </div>
                <div className="space-y-2">
                  <Label>Cancellation Window (hours)</Label>
                  <Input type="number" defaultValue="48" />
                </div>
                <div className="space-y-2">
                  <Label>Buffer Between Bookings (min)</Label>
                  <Input type="number" defaultValue="30" />
                </div>
                <div className="space-y-2">
                  <Label>Max Advance Booking (days)</Label>
                  <Input type="number" defaultValue="60" />
                </div>
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Choose how you want to receive updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New Booking Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when a new booking is made</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Booking Reminders</p>
                  <p className="text-sm text-muted-foreground">Send reminders to customers before their appointment</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Cancellation Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when a booking is cancelled</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">SMS Notifications</p>
                  <p className="text-sm text-muted-foreground">Receive SMS for urgent updates</p>
                </div>
                <Switch />
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Brand Customization
              </CardTitle>
              <CardDescription>
                Customize the look and feel of your booking page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input defaultValue="https://example.com/logo.png" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <Input defaultValue="#3b82f6" />
                    <div className="w-10 h-10 rounded-lg bg-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input defaultValue="#14b8a6" />
                    <div className="w-10 h-10 rounded-lg bg-accent" />
                  </div>
                </div>
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage your account security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" />
                </div>
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
