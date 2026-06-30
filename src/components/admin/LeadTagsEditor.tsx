import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface LeadTag {
  name: string;
  color: string; // one of TAG_COLOR keys
}

export const TAG_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  slate: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-200', dot: 'bg-slate-500', label: 'Slate' },
  red: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500', label: 'Red' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', label: 'Orange' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500', label: 'Amber' },
  green: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500', label: 'Green' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-950/50', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500', label: 'Teal' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500', label: 'Blue' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', label: 'Indigo' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500', label: 'Purple' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-950/50', text: 'text-pink-700 dark:text-pink-300', dot: 'bg-pink-500', label: 'Pink' },
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

export function normalizeTags(raw: unknown): LeadTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => {
      if (typeof t === 'string') return { name: t, color: 'slate' };
      if (t && typeof t === 'object' && typeof t.name === 'string') {
        const color = typeof t.color === 'string' && TAG_COLORS[t.color] ? t.color : 'slate';
        return { name: t.name.trim(), color };
      }
      return null;
    })
    .filter((t): t is LeadTag => !!t && !!t.name);
}

interface LeadTagChipProps {
  tag: LeadTag;
  onRemove?: () => void;
  className?: string;
}

export function LeadTagChip({ tag, onRemove, className }: LeadTagChipProps) {
  const c = TAG_COLORS[tag.color] ?? TAG_COLORS.slate;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      <span className="truncate max-w-[120px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 -mr-0.5"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

interface LeadTagsEditorProps {
  value: LeadTag[];
  onChange: (next: LeadTag[]) => void;
  /** Tags previously used elsewhere — shown as suggestions. */
  suggestions?: LeadTag[];
}

export function LeadTagsEditor({ value, onChange, suggestions = [] }: LeadTagsEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('blue');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const dedupedSuggestions = useMemo(() => {
    const taken = new Set(value.map((t) => t.name.toLowerCase()));
    const seen = new Set<string>();
    return suggestions.filter((t) => {
      const k = t.name.toLowerCase();
      if (taken.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [suggestions, value]);

  const filteredSuggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return dedupedSuggestions.slice(0, 8);
    return dedupedSuggestions.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [dedupedSuggestions, name]);

  const addTag = (tag: LeadTag) => {
    const trimmed = tag.name.trim();
    if (!trimmed) return;
    if (value.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, { name: trimmed, color: tag.color }]);
    setName('');
  };

  const removeAt = (i: number) => {
    const next = [...value];
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((t, i) => (
        <LeadTagChip key={`${t.name}-${i}`} tag={t} onRemove={() => removeAt(i)} />
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1 rounded-full"
          >
            <Plus className="w-3 h-3" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TagIcon className="w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag({ name, color });
                  }
                }}
                placeholder="Tag name…"
                className="h-8 text-sm"
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Color
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLOR_KEYS.map((k) => {
                  const c = TAG_COLORS[k];
                  const active = k === color;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setColor(k)}
                      aria-label={c.label}
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                        c.dot,
                        active
                          ? 'ring-2 ring-offset-2 ring-foreground/60 scale-110'
                          : 'opacity-80 hover:opacity-100',
                      )}
                    />
                  );
                })}
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              className="w-full h-8"
              onClick={() => addTag({ name, color })}
              disabled={!name.trim()}
            >
              Add tag
            </Button>

            {filteredSuggestions.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Previously used
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {filteredSuggestions.map((t, i) => (
                    <button
                      key={`${t.name}-${i}`}
                      type="button"
                      onClick={() => addTag(t)}
                      className="hover:opacity-80"
                    >
                      <LeadTagChip tag={t} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
