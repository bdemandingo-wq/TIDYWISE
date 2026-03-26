import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eraser, Check } from 'lucide-react';

interface Props {
  onSave: (signatureData: string, type: 'draw' | 'type') => void;
  onCancel: () => void;
  saving?: boolean;
}

export function SignaturePad({ onSave, onCancel, saving }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [mode, setMode] = useState<'draw' | 'type'>('draw');

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  }, []);

  useEffect(() => {
    const result = getContext();
    if (!result) return;
    const { canvas, ctx } = result;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    // Canvas can't resolve CSS variables — compute the actual color
    const computed = getComputedStyle(canvas);
    ctx.strokeStyle = computed.color || '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [getContext]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const result = getContext();
    if (!result) return;
    const pos = getPos(e);
    result.ctx.beginPath();
    result.ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const result = getContext();
    if (!result) return;
    const pos = getPos(e);
    result.ctx.lineTo(pos.x, pos.y);
    result.ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const result = getContext();
    if (!result) return;
    const { canvas, ctx } = result;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl, 'draw');
    } else {
      if (!typedName.trim()) return;
      onSave(typedName.trim(), 'type');
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'draw' | 'type')}>
        <TabsList className="w-full">
          <TabsTrigger value="draw" className="flex-1">Draw Signature</TabsTrigger>
          <TabsTrigger value="type" className="flex-1">Type Signature</TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="space-y-3">
          <div className="relative border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden bg-background">
            <canvas
              ref={canvasRef}
              className="w-full touch-none text-foreground cursor-crosshair"
              style={{ height: 180 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <div className="absolute bottom-3 left-3 right-3 border-b border-muted-foreground/20" />
            <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
              Sign above the line
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={clearCanvas}>
            <Eraser className="h-3.5 w-3.5" /> Clear
          </Button>
        </TabsContent>

        <TabsContent value="type" className="space-y-3">
          <Input
            placeholder="Type your full legal name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className="text-lg h-12"
          />
          {typedName && (
            <div className="border rounded-lg p-6 bg-background text-center">
              <p className="text-2xl italic font-serif" style={{ fontFamily: "'Georgia', serif" }}>
                {typedName}
              </p>
              <div className="border-b border-muted-foreground/30 mt-2 mx-12" />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          className="flex-1 gap-1"
          onClick={handleSave}
          disabled={saving || (mode === 'draw' ? !hasDrawn : !typedName.trim())}
        >
          <Check className="h-4 w-4" />
          {saving ? 'Saving...' : 'Sign & Submit'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        By signing, you agree that this electronic signature is legally binding for internal compliance purposes.
      </p>
    </div>
  );
}
