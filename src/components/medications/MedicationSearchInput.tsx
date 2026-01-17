import { useState, useRef, useEffect } from 'react';
import { Search, Pill, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useMedicationDatabase, MedicationSuggestion } from '@/hooks/useMedicationDatabase';
import { cn } from '@/lib/utils';

interface MedicationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectSuggestion?: (medication: MedicationSuggestion) => void;
  placeholder?: string;
  className?: string;
}

export function MedicationSearchInput({
  value,
  onChange,
  onSelectSuggestion,
  placeholder = "Search for medication...",
  className,
}: MedicationSearchInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { setSearchTerm, suggestions } = useMedicationDatabase();

  // Update search term when value changes
  useEffect(() => {
    setSearchTerm(value);
  }, [value, setSearchTerm]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(true);
    setHighlightedIndex(-1);
  };

  const handleSelectSuggestion = (suggestion: MedicationSuggestion) => {
    onChange(suggestion.name);
    setShowSuggestions(false);
    onSelectSuggestion?.(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={() => value.length >= 2 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pl-10"
          autoComplete="off"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[300px] overflow-auto">
          <ul ref={listRef} className="py-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.name}
                className={cn(
                  "px-3 py-2 cursor-pointer transition-colors",
                  index === highlightedIndex 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-muted"
                )}
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{suggestion.name}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.category}</p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {suggestion.commonDosages.length} dosages
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Helper text */}
      {value.length > 0 && value.length < 2 && (
        <p className="text-xs text-muted-foreground mt-1">
          Type at least 2 characters to search
        </p>
      )}
      {value.length >= 2 && suggestions.length === 0 && showSuggestions && (
        <p className="text-xs text-muted-foreground mt-1">
          No matches found. You can still add "{value}" manually.
        </p>
      )}
    </div>
  );
}
