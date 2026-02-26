import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Mail, Phone, MoreHorizontal, UserPlus, Edit, Trash2, GripVertical, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  service_interest: string | null;
  message: string | null;
  notes: string | null;
  estimated_value: number | null;
  source: string;
  status: string;
  created_at: string;
}

const PIPELINE_COLUMNS = [
  { id: 'new', label: 'New', color: 'bg-blue-500', borderColor: 'border-t-blue-500' },
  { id: 'follow_up', label: 'Follow Up', color: 'bg-yellow-500', borderColor: 'border-t-yellow-500' },
  { id: 'quoted', label: 'Quoted', color: 'bg-purple-500', borderColor: 'border-t-purple-500' },
  { id: 'converted', label: 'Converted', color: 'bg-green-500', borderColor: 'border-t-green-500' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500', borderColor: 'border-t-red-500' },
];

interface LeadPipelineBoardProps {
  leads: Lead[];
  onStatusChange: (leadId: string, newStatus: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (leadId: string) => void;
  onConvert: (lead: Lead) => void;
  maskName: (name: string) => string;
  maskEmail: (email: string) => string;
  maskPhone: (phone: string) => string;
}

export function LeadPipelineBoard({ 
  leads, 
  onStatusChange, 
  onEdit, 
  onDelete, 
  onConvert,
  maskName,
  maskEmail,
  maskPhone,
}: LeadPipelineBoardProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const getColumnLeads = useCallback((status: string) => {
    return leads.filter(l => l.status === status);
  }, [leads]);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId && columnId) {
      const lead = leads.find(l => l.id === leadId);
      if (lead && lead.status !== columnId) {
        onStatusChange(leadId, columnId);
      }
    }
    setDraggedLeadId(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverColumn(null);
  };

  const totalValue = leads.length;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" data-no-swipe>
      {PIPELINE_COLUMNS.map((column) => {
        const columnLeads = getColumnLeads(column.id);
        const isDragOver = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className="flex-shrink-0 w-[280px] min-h-[500px]"
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`rounded-t-lg border-t-4 ${column.borderColor} bg-card p-3 border-x border-b-0`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{column.label}</span>
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">
                    {columnLeads.length}
                  </Badge>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  ${columnLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Column Body */}
            <div 
              className={`rounded-b-lg border bg-muted/30 p-2 space-y-2 min-h-[450px] transition-colors ${
                isDragOver ? 'bg-primary/5 border-primary/30' : ''
              }`}
            >
              {columnLeads.length === 0 && (
                <div className="flex items-center justify-center h-24 text-sm text-muted-foreground italic">
                  {isDragOver ? 'Drop here' : 'No leads'}
                </div>
              )}

              {columnLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isDragging={draggedLeadId === lead.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onConvert={onConvert}
                  maskName={maskName}
                  maskEmail={maskEmail}
                  maskPhone={maskPhone}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onConvert,
  maskName,
  maskEmail,
  maskPhone,
}: {
  lead: Lead;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onConvert: (lead: Lead) => void;
  maskName: (name: string) => string;
  maskEmail: (email: string) => string;
  maskPhone: (phone: string) => string;
}) {
  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-40 scale-95' : 'hover:shadow-md'
      }`}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Name + Actions */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
            <span className="font-medium text-sm truncate">{maskName(lead.name)}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => onEdit(lead)}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              {lead.status !== 'converted' && (
                <DropdownMenuItem className="gap-2" onClick={() => onConvert(lead)}>
                  <UserPlus className="w-3.5 h-3.5" /> Convert to Customer
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="gap-2 text-destructive"
                onClick={() => {
                  if (confirm('Delete this lead?')) onDelete(lead.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Contact Info */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{maskEmail(lead.email)}</span>
          </div>
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span>{maskPhone(lead.phone)}</span>
            </div>
          )}
        </div>

        {/* Service Interest */}
        {lead.service_interest && (
          <Badge variant="outline" className="text-xs h-5 font-normal">
            {lead.service_interest}
          </Badge>
        )}

        {/* Estimated Value */}
        {lead.estimated_value != null && lead.estimated_value > 0 && (
          <p className="text-xs font-semibold text-green-600 dark:text-green-400">
            ${lead.estimated_value.toLocaleString()}
          </p>
        )}

        {/* Notes preview */}
        {lead.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2 italic">
            {lead.notes}
          </p>
        )}

        {/* Footer: Source + Time */}
        <div className="flex items-center justify-between pt-1 border-t">
          <Badge variant="secondary" className="text-[10px] h-4 px-1 capitalize">
            {lead.source}
          </Badge>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
