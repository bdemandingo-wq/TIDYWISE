import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { KeyRound, PawPrint, ParkingCircle, Lock, Loader2, Save, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface PropertyNotesEditorProps {
  customerId: string;
  organizationId: string;
}

export function PropertyNotesEditor({ customerId, organizationId }: PropertyNotesEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [alarmCode, setAlarmCode] = useState('');
  const [hasPets, setHasPets] = useState(false);
  const [petNotes, setPetNotes] = useState('');
  const [parkingNotes, setParkingNotes] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('property_notes')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setNotes(data.notes || '');
          setAccessInstructions(data.access_instructions || '');
          setGateCode(data.gate_code || '');
          setAlarmCode(data.alarm_code || '');
          setHasPets(data.has_pets || false);
          setPetNotes(data.pet_notes || '');
          setParkingNotes(data.parking_notes || '');
        }
        setLoading(false);
      });
  }, [customerId, organizationId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        customer_id: customerId,
        notes: notes || null,
        access_instructions: accessInstructions || null,
        gate_code: gateCode || null,
        alarm_code: alarmCode || null,
        has_pets: hasPets,
        pet_notes: petNotes || null,
        parking_notes: parkingNotes || null,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        const { error } = await supabase.from('property_notes').update(payload).eq('id', existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('property_notes').insert(payload).select('id').single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast.success('Property notes saved');
    } catch (e: any) {
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Info className="w-4 h-4" />Property Notes</CardTitle>
        <p className="text-xs text-muted-foreground">Shown to cleaners when they view this job</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">General Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Use back door, client works from home..."
            className="resize-none min-h-[80px] text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><Lock className="w-3 h-3" />Access Instructions</Label>
          <Textarea
            value={accessInstructions}
            onChange={(e) => setAccessInstructions(e.target.value)}
            placeholder="e.g. Key under mat, ring bell twice..."
            className="resize-none min-h-[60px] text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><KeyRound className="w-3 h-3" />Gate Code</Label>
            <Input value={gateCode} onChange={(e) => setGateCode(e.target.value)} placeholder="e.g. #1234" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><Lock className="w-3 h-3" />Alarm Code</Label>
            <Input value={alarmCode} onChange={(e) => setAlarmCode(e.target.value)} placeholder="e.g. 5678" className="text-sm" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><ParkingCircle className="w-3 h-3" />Parking Notes</Label>
          <Input value={parkingNotes} onChange={(e) => setParkingNotes(e.target.value)} placeholder="e.g. Park in driveway, not on street" className="text-sm" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5"><PawPrint className="w-3 h-3" />Pets on premises</Label>
            <Switch checked={hasPets} onCheckedChange={setHasPets} />
          </div>
          {hasPets && (
            <Input value={petNotes} onChange={(e) => setPetNotes(e.target.value)} placeholder="e.g. 2 dogs (friendly), keep door closed" className="text-sm" />
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Property Notes
        </Button>
      </CardContent>
    </Card>
  );
}
