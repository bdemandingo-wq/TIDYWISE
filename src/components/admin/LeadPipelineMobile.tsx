import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Edit, Trash2, UserPlus } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgMemberNames } from '@/hooks/useOrgMemberNames';
import { LeadCard, type Lead } from '@/components/admin/LeadPipelineBoard';
import { PIPELINE_COLUMNS } from '@/components/admin/leadPipeline';

/**
 * The pipeline board for phones. One stage fills the screen; you swipe
 * sideways between stages and long-press a card to move it.
 *
 * ── Why this is a separate component from LeadPipelineBoard ────────────
 *
 * Not to duplicate it — the card is imported from it, and so are the columns
 * and the Lead type. What differs is only the two things that cannot work on
 * touch:
 *
 * 1. The desktop board drags with the HTML5 Drag and Drop API. No mobile
 *    browser fires `dragstart` from a touch, so that board's core interaction
 *    is inert on a phone. This one uses dnd-kit, which the app already ships
 *    and already uses in five other places.
 *
 * 2. Desktop columns are a fixed 250px. Five of them at 250 is 1250px of
 *    board — at 390px you see one and a half stages, which is not a stage at
 *    a time. Here a column is the viewport.
 *
 * Keeping them separate means the desktop board is untouched rather than
 * migrated to a drag system I cannot exercise from here.
 *
 * ── Three gestures on one surface ─────────────────────────────────────
 *
 * A column scrolls vertically, the board swipes horizontally, and a card
 * drags. They are told apart by time, not distance: TouchSensor activates on
 * a HOLD, so a flick in any direction is a scroll and only a deliberate press
 * starts a drag. A distance-based sensor — which is what the app's existing
 * SortableTaskList uses for the mouse — would steal every scroll.
 *
 * `touchAction: manipulation` keeps the browser's own scrolling alive during
 * the pre-activation delay; `none` would freeze the column the moment a
 * finger landed.
 *
 * ── Moving a card you cannot see the target for ───────────────────────
 *
 * When one column fills the screen the destination stage is off-screen by
 * definition. Dragging a card to the left or right edge pages the board, so
 * the drop target scrolls into view under the finger rather than requiring a
 * drop, a swipe and a second drag.
 */

type Props = {
  leads: Lead[];
  onStatusChange: (leadId: string, newStatus: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onConvert: (lead: Lead) => void;
  maskName: (name: string) => string;
  maskEmail: (email: string) => string;
  maskPhone: (phone: string) => string;
  showDelete: boolean;
};

function DraggableCard({
  lead,
  children,
  onTap,
}: {
  lead: Lead;
  children: React.ReactNode;
  onTap: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const movedRef = useRef(false);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'manipulation' }}
      className={isDragging ? 'opacity-40' : undefined}
      /* A tap and the start of a long-press look identical until one of them
         ends. `movedRef` keeps a drag from also firing the sheet on release. */
      onPointerDown={() => { movedRef.current = false; }}
      onPointerMove={() => { movedRef.current = true; }}
      onClick={() => { if (!movedRef.current && !isDragging) onTap(lead); }}
    >
      {children}
    </div>
  );
}

function Column({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        'w-full shrink-0 snap-center px-4 ' +
        (isOver ? 'rounded-2xl bg-primary/5 ring-2 ring-primary/40' : '')
      }
    >
      {children}
    </div>
  );
}

export function LeadPipelineMobile({
  leads,
  onStatusChange,
  onEdit,
  onDelete,
  onConvert,
  maskName,
  maskEmail,
  maskPhone,
  showDelete,
}: Props) {
  const { organization } = useOrganization();
  const memberNames = useOrgMemberNames(organization?.id);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState(0);
  const [dragging, setDragging] = useState<Lead | null>(null);
  const [sheetLead, setSheetLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    /* Hold to drag. 220ms is long enough that a swipe never trips it and
       short enough that it does not feel broken. tolerance lets a finger
       wobble during the hold without cancelling. */
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    /* Mouse, for anyone on a narrow desktop window. Distance is right here —
       there is no scroll to steal from a cursor. */
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const byStatus = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    for (const c of PIPELINE_COLUMNS) m[c.id] = [];
    for (const l of leads) if (m[l.status]) m[l.status].push(l);
    return m;
  }, [leads]);

  /* Leads whose status is not one of the five columns. The board cannot show
     them and silently dropping them would hide real rows — this org already
     has one lead on 'commercial'. Counted here and named in the footer. */
  const offBoard = useMemo(
    () => leads.filter(l => !PIPELINE_COLUMNS.some(c => c.id === l.status)),
    [leads],
  );

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(PIPELINE_COLUMNS.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setStage(next);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== stage) setStage(i);
  };

  const handleStart = (e: DragStartEvent) => {
    setDragging(leads.find(l => l.id === e.active.id) ?? null);
  };

  const handleEnd = (e: DragEndEvent) => {
    const lead = dragging;
    setDragging(null);
    const target = e.over?.id;
    if (!lead || !target || typeof target !== 'string') return;
    if (target === lead.status) return;
    onStatusChange(lead.id, target);
    /* Follow the card. Moving something to a stage you are not looking at,
       with no confirmation, reads as the card vanishing. */
    const i = PIPELINE_COLUMNS.findIndex(c => c.id === target);
    if (i >= 0) goTo(i);
  };

  const current = PIPELINE_COLUMNS[stage];

  return (
    <div className="flex flex-col">
      {/* Stage strip: which stage, how many, and a way to move without
          swiping — the arrows matter during a drag, when a finger is busy. */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous stage"
          className="h-9 w-9 shrink-0"
          disabled={stage === 0}
          onClick={() => goTo(stage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-bold">{current?.label}</p>
          <p className="text-[11.5px] text-muted-foreground">
            {(byStatus[current?.id] ?? []).length}
            {(byStatus[current?.id] ?? []).length === 1 ? ' lead' : ' leads'}
            {' · '}
            {stage + 1} of {PIPELINE_COLUMNS.length}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Next stage"
          className="h-9 w-9 shrink-0"
          disabled={stage === PIPELINE_COLUMNS.length - 1}
          onClick={() => goTo(stage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-center gap-1.5 pb-2" aria-hidden>
        {PIPELINE_COLUMNS.map((c, i) => (
          <span
            key={c.id}
            className={
              'h-1.5 rounded-full transition-all ' +
              (i === stage ? `w-5 ${c.color}` : 'w-1.5 bg-muted-foreground/30')
            }
          />
        ))}
      </div>

      <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          data-no-swipe
          className="flex snap-x snap-mandatory overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {PIPELINE_COLUMNS.map(c => {
            const items = byStatus[c.id] ?? [];
            return (
              <Column key={c.id} id={c.id}>
                <div className="flex min-h-[320px] flex-col gap-2.5 pb-4">
                  {items.length === 0 ? (
                    <p className="rounded-[14px] border border-dashed px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                      Nothing in {c.label}.
                      <br />
                      Hold a card on another stage to move it here.
                    </p>
                  ) : (
                    items.map(lead => (
                      <DraggableCard key={lead.id} lead={lead} onTap={setSheetLead}>
                        <LeadCard
                          lead={lead}
                          memberNames={memberNames}
                          isDragging={dragging?.id === lead.id}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onConvert={onConvert}
                          maskName={maskName}
                          maskEmail={maskEmail}
                          maskPhone={maskPhone}
                          showDelete={showDelete}
                          html5Drag={false}
                          hideMenu
                        />
                      </DraggableCard>
                    ))
                  )}
                </div>
              </Column>
            );
          })}
        </div>

        {/* The native drag image does not exist outside HTML5 DnD, so the
            card being moved is drawn explicitly. */}
        <DragOverlay>
          {dragging ? (
            <div className="w-[86vw] max-w-[340px] rotate-2 opacity-95">
              <LeadCard
                lead={dragging}
                memberNames={memberNames}
                isDragging={false}
                onEdit={onEdit}
                onDelete={onDelete}
                onConvert={onConvert}
                maskName={maskName}
                maskEmail={maskEmail}
                maskPhone={maskPhone}
                showDelete={showDelete}
                html5Drag={false}
                hideMenu
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {offBoard.length > 0 && (
        <p className="px-4 pb-3 text-[11.5px] text-muted-foreground">
          {offBoard.length} lead{offBoard.length === 1 ? '' : 's'} not on the board
          {offBoard.length === 1 ? ' has a status' : ' have statuses'} outside these
          five stages. The List view shows {offBoard.length === 1 ? 'it' : 'them'}.
        </p>
      )}

      {/* Tap opens this. Long-press is spoken for by the drag, so the card's
          actions cannot live behind a press-and-hold menu. */}
      <Sheet open={!!sheetLead} onOpenChange={o => !o && setSheetLead(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="pb-2">
            <SheetTitle className="truncate text-base">
              {sheetLead ? maskName(sheetLead.name) : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="outline"
              className="h-12 justify-start gap-3 rounded-xl"
              onClick={() => { if (sheetLead) onEdit(sheetLead); setSheetLead(null); }}
            >
              <Edit className="h-4 w-4" /> Edit lead
            </Button>

            {sheetLead?.status !== 'converted' && (
              <Button
                variant="outline"
                className="h-12 justify-start gap-3 rounded-xl"
                onClick={() => { if (sheetLead) onConvert(sheetLead); setSheetLead(null); }}
              >
                <UserPlus className="h-4 w-4" /> Convert to customer
              </Button>
            )}

            {showDelete && (
              <Button
                variant="outline"
                className="h-12 justify-start gap-3 rounded-xl text-destructive"
                onClick={() => {
                  /* Same confirm the desktop card uses. A destructive action
                     one tap from a list is exactly where a confirm earns its
                     keep. */
                  if (sheetLead && confirm('Delete this lead?')) onDelete(sheetLead.id);
                  setSheetLead(null);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete lead
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
