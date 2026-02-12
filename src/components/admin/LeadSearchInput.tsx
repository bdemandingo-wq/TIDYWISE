import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, User, X } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface LeadSearchInputProps {
  leads: Lead[];
  selectedLeadId: string;
  onSelectLead: (leadId: string) => void;
  placeholder?: string;
  className?: string;
}

export function LeadSearchInput({
  leads,
  selectedLeadId,
  onSelectLead,
  placeholder = "Search leads...",
  className
}: LeadSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const filteredLeads = leads.filter(lead => {
    const name = (lead.name || '').toLowerCase();
    const email = (lead.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { setHighlightedIndex(0); }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightedIndex(prev => prev < filteredLeads.length - 1 ? prev + 1 : prev); break;
      case 'ArrowUp': e.preventDefault(); setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0); break;
      case 'Enter': e.preventDefault(); if (filteredLeads[highlightedIndex]) handleSelectLead(filteredLeads[highlightedIndex]); break;
      case 'Escape': setIsOpen(false); break;
    }
  };

  const handleSelectLead = (lead: Lead) => {
    onSelectLead(lead.id);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClearSelection = () => {
    onSelectLead('');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      {selectedLead ? (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{selectedLead.name}</p>
            {selectedLead.email && <p className="text-sm text-muted-foreground truncate">{selectedLead.email}</p>}
          </div>
          <button type="button" onClick={handleClearSelection} className="p-1 hover:bg-background rounded-full transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              autoComplete="off"
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="pl-9"
            />
          </div>
          {isOpen && (
            <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredLeads.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? <p>No leads found matching "{searchTerm}"</p> : <p>No leads available.</p>}
                </div>
              ) : (
                <ul className="py-1">
                  {filteredLeads.map((lead, index) => (
                    <li
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      className={cn(
                        "px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors border-b border-border/30 last:border-0",
                        index === highlightedIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <User className="h-5 w-5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{lead.name}</p>
                        {lead.email && (
                          <p className={cn("text-sm", index === highlightedIndex ? "text-primary-foreground/80" : "text-muted-foreground")}>
                            {lead.email}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
