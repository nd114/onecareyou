import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setProgress(0);
    setStats(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const dataLines = lines.slice(1); // Skip header
      
      console.log(`Processing ${dataLines.length} lines...`);
      
      // Headers: DRUGNAME,RXAUI,RXCUI,STR,SAB,TTY,CODE
      const mappings: Array<{
        brand_name: string;
        brand_name_normalized: string;
        generic_name: string;
        rxcui: string | null;
        country_code: string | null;
        source: string;
      }> = [];
      
      for (const line of dataLines) {
        const cols = parseCSVLine(line);
        const brandName = cols[0]; // DRUGNAME
        const rxcui = cols[2];     // RXCUI
        const genericName = cols[3]; // STR
        const countryCode = cols[4]; // SAB
        
        if (brandName && genericName) {
          mappings.push({
            brand_name: brandName,
            brand_name_normalized: brandName.toLowerCase(),
            generic_name: genericName,
            rxcui: rxcui || null,
            country_code: countryCode || null,
            source: 'mendeley_idd',
          });
        }
      }
      
      console.log(`Prepared ${mappings.length} valid mappings`);
      
      // Insert in batches of 500
      const batchSize = 500;
      let inserted = 0;
      let errors = 0;
      
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('international_drug_mappings')
          .upsert(batch, {
            onConflict: 'brand_name_normalized',
            ignoreDuplicates: false,
          });
        
        if (error) {
          console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error);
          errors += batch.length;
        } else {
          inserted += batch.length;
        }
        
        setProgress(Math.round((i + batch.length) / mappings.length * 100));
      }
      
      setStats({ inserted, errors, total: mappings.length });
      toast.success(`Import complete: ${inserted} records inserted`);
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Import IDD Drug Mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload CSV file with headers: DRUGNAME, RXAUI, RXCUI, STR, SAB, TTY, CODE
          </p>
          
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
          />
          
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
        </CardContent>
      </Card>
    </div>
  );
}
