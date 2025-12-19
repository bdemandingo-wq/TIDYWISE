import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, User, X } from 'lucide-react';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}

interface CustomerSearchInputProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelectCustomer: (customerId: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomerSearchInput({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  placeholder = "Search customers...",
  className
}: CustomerSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer => {
    const fullName = `${customer.first_name} ${customer.last_name}`.toLowerCase();
    const email = customer.email.toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredCustomers.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCustomers[highlightedIndex]) {
          handleSelectCustomer(filteredCustomers[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer.id);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClearSelection = () => {
    onSelectCustomer('');
    setSearchTerm('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      {selectedCustomer ? (
        // Show selected customer
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {selectedCustomer.first_name} {selectedCustomer.last_name}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {selectedCustomer.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearSelection}
            className="p-1 hover:bg-background rounded-full transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        // Show search input
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="pl-9"
            />
          </div>

          {/* Dropdown */}
          {isOpen && (
            <div
              ref={dropdownRef}
              className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto"
            >
              {filteredCustomers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchTerm ? (
                    <p>No customers found matching "{searchTerm}"</p>
                  ) : (
                    <p>No customers yet. Create a new customer below.</p>
                  )}
                </div>
              ) : (
                <ul className="py-1">
                  {filteredCustomers.map((customer, index) => (
                    <li
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer)}
                      className={cn(
                        "px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors",
                        index === highlightedIndex 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-muted"
                      )}
                    >
                      <User className="h-5 w-5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-base">
                          {customer.first_name} {customer.last_name}
                        </p>
                        <p className={cn(
                          "text-sm",
                          index === highlightedIndex 
                            ? "text-primary-foreground/80" 
                            : "text-muted-foreground"
                        )}>
                          {customer.email}
                        </p>
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
