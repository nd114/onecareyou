import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export default function AdminImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ inserted: number; errors: number; total: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog(prev => [...prev, msg]);
    console.log(msg);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setProgress(0);
    setStats(null);
    setLog([]);

    try {
      addLog('Reading file...');
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const dataLines = lines.slice(1); // Skip header
      
      addLog(`Found ${dataLines.length} data lines`);
      
      // Headers: DRUGNAME,RXAUI,RXCUI,STR,SAB,TTY,CODE,,,
      const mappings: Array<{
        brand_name: string;
        brand_name_normalized: string;
        generic_name: string;
        rxcui: string | null;
        country_code: string | null;
        source: string;
      }> = [];
      
      let skipped = 0;
      for (const line of dataLines) {
        const cols = parseCSVLine(line);
        const brandName = cols[0]?.trim(); // DRUGNAME
        const rxcui = cols[2]?.trim();     // RXCUI
        const genericName = cols[3]?.trim(); // STR
        const countryCode = cols[4]?.trim(); // SAB
        
        if (brandName && genericName) {
          mappings.push({
            brand_name: brandName,
            brand_name_normalized: brandName.toLowerCase(),
            generic_name: genericName,
            rxcui: rxcui || null,
            country_code: countryCode || null,
            source: 'mendeley_idd',
          });
        } else {
          skipped++;
        }
      }
      
      addLog(`Prepared ${mappings.length} valid mappings (${skipped} skipped)`);
      
      // Call edge function which has service_role access
      const batchSize = 1000;
      let inserted = 0;
      let errors = 0;
      
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        
        const { data, error } = await supabase.functions.invoke('import-idd-data', {
          body: { action: 'import-batch', mappings: batch },
        });
        
        if (error) {
          addLog(`Batch ${Math.floor(i / batchSize) + 1} error: ${error.message}`);
          errors += batch.length;
        } else {
          inserted += data?.inserted || batch.length;
          if (data?.errors) errors += data.errors;
        }
        
        setProgress(Math.round((i + batch.length) / mappings.length * 100));
      }
      
      setStats({ inserted, errors, total: mappings.length });
      toast.success(`Import complete: ${inserted} records processed`);
      
    } catch (error) {
      console.error('Import error:', error);
      addLog(`Error: ${error}`);
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const checkStats = async () => {
    const { data, error } = await supabase.functions.invoke('import-idd-data', {
      body: { action: 'get-stats' },
    });
    if (data) {
      addLog(`Database has ${data.count} records`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Import IDD Drug Mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload CSV file with headers: DRUGNAME, RXAUI, RXCUI, STR, SAB, TTY, CODE
          </p>
          
          <div className="flex gap-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isImporting}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
            />
            <Button variant="outline" onClick={checkStats} disabled={isImporting}>
              Check Stats
            </Button>
          </div>
          
          {isImporting && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center">{progress}% complete</p>
            </div>
          )}
          
          {stats && (
            <div className="p-4 bg-muted rounded-lg">
              <p><strong>Total mappings:</strong> {stats.total}</p>
              <p><strong>Inserted:</strong> {stats.inserted}</p>
              <p><strong>Errors:</strong> {stats.errors}</p>
            </div>
          )}
          
          {log.length > 0 && (
            <div className="p-4 bg-muted rounded-lg max-h-48 overflow-y-auto">
              <p className="font-medium mb-2">Log:</p>
              {log.map((msg, i) => (
                <p key={i} className="text-xs font-mono">{msg}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
