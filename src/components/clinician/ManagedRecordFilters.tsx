import { useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { ClinicianPatientRecord } from '@/hooks/useClinicianPatientRecords';

export interface ManagedRecordFilters {
  tag: string;
  condition: string;
  status: string;
}

interface Props {
  records: ClinicianPatientRecord[];
  filters: ManagedRecordFilters;
  onFiltersChange: (filters: ManagedRecordFilters) => void;
}

export function ManagedRecordFilterBar({ records, filters, onFiltersChange }: Props) {
  const allTags = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => ((r.tags || []) as string[]).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [records]);

  const allConditions = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => (r.health_conditions || []).forEach(c => set.add(String(c))));
    return Array.from(set).sort();
  }, [records]);

  const statuses = ['not_invited', 'invited', 'accepted', 'declined'];

  const hasFilters = filters.tag || filters.condition || filters.status;

  const clearAll = () => onFiltersChange({ tag: '', condition: '', status: '' });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />

      <Select value={filters.tag || '_all'} onValueChange={v => onFiltersChange({ ...filters, tag: v === '_all' ? '' : v })}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Tags</SelectItem>
          {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.condition || '_all'} onValueChange={v => onFiltersChange({ ...filters, condition: v === '_all' ? '' : v })}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Condition" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Conditions</SelectItem>
          {allConditions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.status || '_all'} onValueChange={v => onFiltersChange({ ...filters, status: v === '_all' ? '' : v })}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All Statuses</SelectItem>
          {statuses.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearAll}>
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}

export function applyManagedRecordFilters(
  records: ClinicianPatientRecord[],
  filters: ManagedRecordFilters
): ClinicianPatientRecord[] {
  return records.filter(r => {
    if (filters.tag && !((r.tags || []) as string[]).includes(filters.tag)) return false;
    if (filters.condition && !(r.health_conditions || []).map(String).includes(filters.condition)) return false;
    if (filters.status && r.invitation_status !== filters.status) return false;
    return true;
  });
}
