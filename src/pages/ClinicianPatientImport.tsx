import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download,
  ArrowLeft, ArrowRight, Loader2, X, Edit2, Users, Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClinicianHeader } from '@/components/clinician/ClinicianHeader';
import { useClinicianPatientRecords } from '@/hooks/useClinicianPatientRecords';
import { toast } from 'sonner';

interface ParsedRow {
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  date_of_birth: string;
  gender: string;
  allergies: string;
  health_conditions: string;
  blood_type: string;
  medications: string;
  notes: string;
  errors: string[];
}

const TEMPLATE_HEADERS = [
  'Name', 'Email', 'Phone', 'Date of Birth', 'Gender',
  'Allergies', 'Health Conditions', 'Blood Type', 'Medications', 'Notes',
];

const DATA_MODELS = [
  {
    value: 'clinician_managed',
    label: 'Clinician-Managed',
    description: 'You manage all patient data. Patient does not need to use OneCare. Best for paper-based or non-tech patients.',
    icon: Shield,
  },
  {
    value: 'collaborative',
    label: 'Collaborative',
    description: 'Both you and the patient can read and write data once they join OneCare. Ideal for active doctor-patient relationships.',
    icon: Users,
  },
  {
    value: 'view_only',
    label: 'View-Only',
    description: 'You get read-only access to patient data. Useful for specialists, pharmacists, or second opinions.',
    icon: FileSpreadsheet,
  },
];

const ClinicianPatientImport = () => {
  const navigate = useNavigate();
  const { importRecords } = useClinicianPatientRecords();
  const [step, setStep] = useState(1);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [dataModel, setDataModel] = useState('clinician_managed');
  const [importResult, setImportResult] = useState<any>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(',') + '\n' +
      'Jane Doe,jane@example.com,+2348012345678,1990-05-15,Female,"Penicillin","Diabetes; Hypertension",O+,"Metformin 500mg twice daily","Regular follow-up needed"\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onecare-patient-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = useCallback((text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      toast.error('CSV must have a header row and at least one data row');
      return;
    }

    // Simple CSV parser that handles quoted fields
    const parseLine = (line: string): string[] => {
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
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z ]/g, '').trim());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.every(v => !v)) continue;

      const getVal = (headerOptions: string[]) => {
        const idx = headers.findIndex(h => headerOptions.some(opt => h.includes(opt)));
        return idx >= 0 ? values[idx] || '' : '';
      };

      const errors: string[] = [];
      const name = getVal(['name']);
      if (!name) errors.push('Missing name');

      const email = getVal(['email']);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Invalid email');
      }

      const dob = getVal(['date of birth', 'dob', 'birth']);
      if (dob && isNaN(Date.parse(dob))) {
        errors.push('Invalid date of birth');
      }

      rows.push({
        patient_name: name,
        patient_email: email,
        patient_phone: getVal(['phone', 'tel', 'mobile']),
        date_of_birth: dob,
        gender: getVal(['gender', 'sex']),
        allergies: getVal(['allergies', 'allergy']),
        health_conditions: getVal(['health conditions', 'conditions', 'diagnosis']),
        blood_type: getVal(['blood type', 'blood']),
        medications: getVal(['medications', 'meds', 'medication']),
        notes: getVal(['notes', 'note', 'comment']),
        errors,
      });
    }

    setParsedRows(rows);
    setStep(2);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const updateCell = (rowIndex: number, field: string, value: string) => {
    setParsedRows(prev => {
      const updated = [...prev];
      (updated[rowIndex] as any)[field] = value;
      // Re-validate
      const errors: string[] = [];
      if (!updated[rowIndex].patient_name) errors.push('Missing name');
      if (updated[rowIndex].patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated[rowIndex].patient_email)) {
        errors.push('Invalid email');
      }
      updated[rowIndex].errors = errors;
      return updated;
    });
    setEditingCell(null);
  };

  const removeRow = (index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  };

  const validRows = useMemo(() => parsedRows.filter(r => r.errors.length === 0), [parsedRows]);
  const errorRows = useMemo(() => parsedRows.filter(r => r.errors.length > 0), [parsedRows]);

  const handleImport = async () => {
    const records = validRows.map(row => ({
      patient_name: row.patient_name,
      patient_email: row.patient_email || undefined,
      patient_phone: row.patient_phone || undefined,
      date_of_birth: row.date_of_birth || undefined,
      gender: row.gender || undefined,
      allergies: row.allergies ? row.allergies.split(';').map(a => a.trim()).filter(Boolean) : undefined,
      health_conditions: row.health_conditions ? row.health_conditions.split(';').map(c => c.trim()).filter(Boolean) : undefined,
      blood_type: row.blood_type || undefined,
      medications: row.medications
        ? row.medications.split(';').map(m => ({ name: m.trim() })).filter(m => m.name)
        : undefined,
      notes: row.notes || undefined,
    }));

    try {
      const result = await importRecords.mutateAsync({
        records,
        data_sharing_model: dataModel,
        import_source: 'csv',
      });
      setImportResult(result);
      setStep(5);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <ClinicianHeader />

      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clinician/patients')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Patients
          </Button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Import Patients</h1>
          <p className="text-sm text-muted-foreground">
            Bulk import your patient records from CSV files
          </p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {['Upload', 'Review', 'Data Model', 'Import', 'Done'].map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step > i + 1 ? 'bg-primary text-primary-foreground' :
                step === i + 1 ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs ${step === i + 1 ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
              {i < 4 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardHeader>
                <CardTitle>Upload Patient Data</CardTitle>
                <CardDescription>Upload a CSV file with your patient records, or download our template to get started.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" /> Download CSV Template
                </Button>

                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="font-medium mb-2">Drop your CSV file here, or click to browse</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Supports CSV files up to 500 patient records
                  </p>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="max-w-xs mx-auto"
                  />
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2">Expected columns:</h4>
                  <p className="text-xs text-muted-foreground">
                    Name (required), Email, Phone, Date of Birth, Gender, Allergies (semicolon-separated), 
                    Health Conditions (semicolon-separated), Blood Type, Medications (semicolon-separated), Notes
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardHeader>
                <CardTitle>Review & Clean Data</CardTitle>
                <CardDescription>
                  {parsedRows.length} records parsed. 
                  <Badge variant="default" className="ml-2">{validRows.length} valid</Badge>
                  {errorRows.length > 0 && <Badge variant="destructive" className="ml-1">{errorRows.length} errors</Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>DOB</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row, i) => (
                        <TableRow key={i} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          {['patient_name', 'patient_email', 'patient_phone', 'date_of_birth', 'gender'].map(field => (
                            <TableCell key={field} className="text-sm">
                              {editingCell?.row === i && editingCell?.field === field ? (
                                <Input
                                  defaultValue={(row as any)[field]}
                                  className="h-7 text-xs"
                                  autoFocus
                                  onBlur={(e) => updateCell(i, field, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') updateCell(i, field, (e.target as HTMLInputElement).value);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                />
                              ) : (
                                <span
                                  className="cursor-pointer hover:text-primary inline-flex items-center gap-1"
                                  onClick={() => setEditingCell({ row: i, field })}
                                >
                                  {(row as any)[field] || <span className="text-muted-foreground italic">—</span>}
                                  <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                </span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            {row.errors.length > 0 ? (
                              <div className="flex items-center gap-1">
                                <AlertCircle className="h-4 w-4 text-destructive" />
                                <span className="text-xs text-destructive">{row.errors.join(', ')}</span>
                              </div>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={validRows.length === 0}>
                    Continue with {validRows.length} records <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 3: Data Model */}
        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardHeader>
                <CardTitle>Choose Data Sharing Model</CardTitle>
                <CardDescription>
                  Select how data ownership works for this batch of patients. You can change this per-patient later.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={dataModel} onValueChange={setDataModel} className="space-y-4">
                  {DATA_MODELS.map(model => (
                    <label
                      key={model.value}
                      className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        dataModel === model.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <RadioGroupItem value={model.value} className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <model.icon className="h-4 w-4 text-primary" />
                          <span className="font-medium">{model.label}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{model.description}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={() => setStep(4)}>
                    Review Import <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 4: Confirm Import */}
        {step === 4 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardHeader>
                <CardTitle>Confirm Import</CardTitle>
                <CardDescription>Review your import settings before proceeding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total Records</p>
                    <p className="text-2xl font-bold">{validRows.length}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Data Model</p>
                    <p className="text-sm font-medium">{DATA_MODELS.find(m => m.value === dataModel)?.label}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">With Email</p>
                    <p className="text-2xl font-bold">{validRows.filter(r => r.patient_email).length}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Skipped (Errors)</p>
                    <p className="text-2xl font-bold text-destructive">{errorRows.length}</p>
                  </div>
                </div>

                <div className="bg-muted/30 border rounded-lg p-4 text-sm">
                  <p className="font-medium mb-2">What happens next:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
                    <li>Records are saved to your clinician patient list</li>
                    <li>No patient accounts are created — data stays in your domain</li>
                    <li>Patients with email addresses can be invited to OneCare later</li>
                    <li>Duplicate records (matching name + email + DOB) will be skipped</li>
                  </ul>
                </div>

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={handleImport} disabled={importRecords.isPending}>
                    {importRecords.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                    ) : (
                      <>Import {validRows.length} Patients</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 5: Done */}
        {step === 5 && importResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Import Complete</CardTitle>
                    <CardDescription>Your patient records have been imported successfully.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground">Imported</p>
                  </div>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-600">{importResult.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Duplicates</p>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <p className="text-2xl font-bold text-destructive">{importResult.errors}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={() => navigate('/clinician/patients')} className="flex-1">
                    View Patient List
                  </Button>
                  <Button variant="outline" onClick={() => { setStep(1); setParsedRows([]); setImportResult(null); }}>
                    Import More
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default ClinicianPatientImport;
