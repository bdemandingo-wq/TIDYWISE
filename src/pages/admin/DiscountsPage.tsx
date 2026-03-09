import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { SwipeableRow } from '@/components/mobile/SwipeableRow';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Percent, DollarSign, Tag, Loader2 } from 'lucide-react';
import { useDiscounts, Discount } from '@/hooks/useDiscounts';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function DiscountsPage() {
  const { discounts, loading, createDiscount, deleteDiscount, updateDiscount } = useDiscounts();
  const { settings } = useOrganizationSettings();
  const isMobile = useIsMobile();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDiscount, setNewDiscount] = useState({
    code: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'flat',
    discount_value: '',
    min_order_amount: '0',
    max_uses: '',
    valid_until: '',
  });

  const handleCreateDiscount = async () => {
    if (!newDiscount.code || !newDiscount.discount_value) {
      toast.error('Please fill in required fields');
      return;
    }

    const result = await createDiscount({
      code: newDiscount.code.toUpperCase(),
      description: newDiscount.description || null,
      discount_type: newDiscount.discount_type,
      discount_value: parseFloat(newDiscount.discount_value),
      min_order_amount: parseFloat(newDiscount.min_order_amount) || 0,
      max_uses: newDiscount.max_uses ? parseInt(newDiscount.max_uses) : null,
      valid_from: new Date().toISOString(),
      valid_until: newDiscount.valid_until ? new Date(newDiscount.valid_until).toISOString() : null,
      is_active: true,
      is_test: settings?.demo_mode_enabled ?? false,
    });

    if (result) {
      toast.success('Discount created successfully');
      setIsAddDialogOpen(false);
      setNewDiscount({
        code: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '',
        min_order_amount: '0',
        max_uses: '',
        valid_until: '',
      });
    } else {
      toast.error('Failed to create discount');
    }
  };

  const handleDeleteDiscount = async (id: string) => {
    const success = await deleteDiscount(id);
    if (success) {
      toast.success('Discount deleted');
    } else {
      toast.error('Failed to delete discount');
    }
  };

  const handleToggleActive = async (discount: Discount) => {
    const success = await updateDiscount(discount.id, { is_active: !discount.is_active });
    if (success) {
      toast.success(discount.is_active ? 'Discount deactivated' : 'Discount activated');
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Discounts & Coupons" subtitle="Manage promotional codes">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Discounts & Coupons"
      subtitle="Create and manage promotional codes for your customers"
    >
      <SubscriptionGate feature="Discounts & Coupons">
      {settings?.demo_mode_enabled && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
          <Tag className="w-5 h-5 text-yellow-600" />
          <span className="text-sm text-yellow-700 dark:text-yellow-400">
            Demo Mode Active - New discounts will be flagged as test data
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Coupon Codes</CardTitle>
            <CardDescription>
              Create discount codes for customers to use at checkout
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Discount
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Discount</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Coupon Code *</Label>
                  <Input
                    value={newDiscount.code}
                    onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., SAVE20"
                    className="uppercase"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newDiscount.description}
                    onChange={(e) => setNewDiscount({ ...newDiscount, description: e.target.value })}
                    placeholder="e.g., 20% off first booking"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discount Type</Label>
                    <Select
                      value={newDiscount.discount_type}
                      onValueChange={(value: 'percentage' | 'flat') => 
                        setNewDiscount({ ...newDiscount, discount_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="flat">Flat Amount ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      {newDiscount.discount_type === 'percentage' ? 'Percentage *' : 'Amount ($) *'}
                    </Label>
                    <Input
                      type="number"
                      value={newDiscount.discount_value}
                      onChange={(e) => setNewDiscount({ ...newDiscount, discount_value: e.target.value })}
                      placeholder={newDiscount.discount_type === 'percentage' ? '20' : '25'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Minimum Order ($)</Label>
                    <Input
                      type="number"
                      value={newDiscount.min_order_amount}
                      onChange={(e) => setNewDiscount({ ...newDiscount, min_order_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Uses (optional)</Label>
                    <Input
                      type="number"
                      value={newDiscount.max_uses}
                      onChange={(e) => setNewDiscount({ ...newDiscount, max_uses: e.target.value })}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Expires On (optional)</Label>
                  <Input
                    type="date"
                    value={newDiscount.valid_until}
                    onChange={(e) => setNewDiscount({ ...newDiscount, valid_until: e.target.value })}
                  />
                </div>

                <Button onClick={handleCreateDiscount} className="w-full">
                  Create Discount
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {discounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No discounts created yet</p>
              <p className="text-sm">Create your first coupon code to offer discounts</p>
            </div>
          ) : isMobile ? (
            <div className="space-y-2 -mx-4 px-1">
              {discounts.map((discount) => (
                <SwipeableRow
                  key={discount.id}
                  rightAction={{
                    label: 'Delete',
                    variant: 'destructive',
                    onAction: () => handleDeleteDiscount(discount.id),
                  }}
                >
                  <div className="bg-card border border-border/40 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-sm">{discount.code}</code>
                          {discount.is_test && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-600 border-yellow-600">Test</Badge>
                          )}
                        </div>
                        {discount.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{discount.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            {discount.discount_type === 'percentage' ? `${discount.discount_value}%` : `$${discount.discount_value}`} off
                          </span>
                          <span>{discount.current_uses}{discount.max_uses ? `/${discount.max_uses}` : ''} uses</span>
                          {discount.valid_until && (
                            <span>Exp {format(new Date(discount.valid_until), 'MMM d')}</span>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={discount.is_active}
                        onCheckedChange={() => handleToggleActive(discount)}
                      />
                    </div>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min Order</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discounts.map((discount) => (
                  <TableRow key={discount.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-bold">{discount.code}</code>
                        {discount.is_test && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            Test
                          </Badge>
                        )}
                      </div>
                      {discount.description && (
                        <p className="text-xs text-muted-foreground">{discount.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {discount.discount_type === 'percentage' ? (
                          <>
                            <Percent className="w-4 h-4 text-muted-foreground" />
                            {discount.discount_value}%
                          </>
                        ) : (
                          <>
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            ${discount.discount_value}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {discount.min_order_amount > 0 ? `$${discount.min_order_amount}` : '-'}
                    </TableCell>
                    <TableCell>
                      {discount.current_uses}
                      {discount.max_uses ? `/${discount.max_uses}` : ''}
                    </TableCell>
                    <TableCell>
                      {discount.valid_until 
                        ? format(new Date(discount.valid_until), 'MMM d, yyyy')
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={discount.is_active}
                        onCheckedChange={() => handleToggleActive(discount)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDiscount(discount.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </SubscriptionGate>
    </AdminLayout>
  );
}
