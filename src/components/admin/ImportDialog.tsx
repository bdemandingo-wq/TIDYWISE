import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface FieldMapping {
  dbField: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'email';
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entityName: string;
  fields: FieldMapping[];
  onImport: (records: Record<string, any>[]) => Promise<void>;
  sampleData?: string;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
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

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  
  return { headers, rows };
}

export function ImportDialog({
  open,
  onOpenChange,
  title,
  entityName,
  fields,
  onImport,
  sampleData,
}: ImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setImporting(false);
    setImportResult(null);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    
    try {
      const text = await selectedFile.text();
      const { headers, rows } = parseCSV(text);
      
      if (headers.length === 0) {
        toast.error('CSV file appears to be empty');
        return;
      }

      setCsvHeaders(headers);
      setCsvRows(rows);
      
      // Auto-map columns based on header names
      const autoMapping: Record<string, string> = {};
      fields.forEach(field => {
        const matchingHeader = headers.find(h => 
          h.toLowerCase().replace(/[_\s-]/g, '') === 
          field.label.toLowerCase().replace(/[_\s-]/g, '') ||
          h.toLowerCase().replace(/[_\s-]/g, '') === 
          field.dbField.toLowerCase().replace(/[_\s-]/g, '')
        );
        if (matchingHeader) {
          autoMapping[field.dbField] = matchingHeader;
        }
      });
      setColumnMapping(autoMapping);
      
      setStep('mapping');
    } catch (error) {
      toast.error('Failed to parse CSV file');
      console.error(error);
    }
  };

  const handleMappingChange = (dbField: string, csvHeader: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [dbField]: csvHeader === '_none_' ? '' : csvHeader,
    }));
  };

  const getMappedRecords = (): Record<string, any>[] => {
    return csvRows.map(row => {
      const record: Record<string, any> = {};
      fields.forEach(field => {
        const csvHeader = columnMapping[field.dbField];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1) {
            let value = row[headerIndex] || '';
            
            // Type conversion
            if (field.type === 'number' && value) {
              record[field.dbField] = parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
            } else {
              record[field.dbField] = value;
            }
          }
        }
      });
      return record;
    });
  };

  const validateMapping = (): boolean => {
    const missingRequired = fields
      .filter(f => f.required && !columnMapping[f.dbField])
      .map(f => f.label);
    
    if (missingRequired.length > 0) {
      toast.error(`Please map required fields: ${missingRequired.join(', ')}`);
      return false;
    }
    return true;
  };

  const handlePreview = () => {
    if (!validateMapping()) return;
    setStep('preview');
  };

  const handleImport = async () => {
    setImporting(true);
    setStep('importing');
    
    try {
      const records = getMappedRecords();
      await onImport(records);
      setImportResult({ success: records.length, failed: 0 });
      toast.success(`Successfully imported ${records.length} ${entityName}`);
    } catch (error: any) {
      console.error('Import failed:', error);
      setImportResult({ success: 0, failed: csvRows.length });
      toast.error(error.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const previewRecords = step === 'preview' ? getMappedRecords().slice(0, 5) : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === 'upload' && `Upload a CSV file to import ${entityName}`}
            {step === 'mapping' && 'Map CSV columns to database fields'}
            {step === 'preview' && 'Review data before importing'}
            {step === 'importing' && 'Importing records...'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-6 py-4">
              <div 
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  "hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                )}
                onClick={() => document.getElementById('csv-upload')?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">
                  {file ? file.name : 'Click to upload or drag and drop'}
                </p>
                <p className="text-sm text-muted-foreground">CSV files only</p>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {sampleData && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="font-medium text-sm">Expected CSV format</span>
                  </div>
                  <code className="text-xs block whitespace-pre-wrap text-muted-foreground">
                    {sampleData}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Mapping Step */}
          {step === 'mapping' && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 text-blue-500" />
                  <span>Found {csvRows.length} rows to import. Map CSV columns to fields below.</span>
                </div>

                <div className="space-y-3">
                  {fields.map(field => (
                    <div key={field.dbField} className="flex items-center gap-4">
                      <Label className="w-40 text-sm">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      <Select
                        value={columnMapping[field.dbField] || '_none_'}
                        onValueChange={(value) => handleMappingChange(field.dbField, value)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select CSV column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">-- Don't import --</SelectItem>
                          {csvHeaders.filter(header => header && header.trim() !== '').map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {columnMapping[field.dbField] && (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>Showing first 5 of {csvRows.length} records. Review before importing.</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields.filter(f => columnMapping[f.dbField]).map(field => (
                        <TableHead key={field.dbField}>{field.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRecords.map((record, i) => (
                      <TableRow key={i}>
                        {fields.filter(f => columnMapping[f.dbField]).map(field => (
                          <TableCell key={field.dbField} className="max-w-[200px] truncate">
                            {String(record[field.dbField] || '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              {importing ? (
                <>
                  <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                  <p className="text-lg font-medium">Importing {csvRows.length} {entityName}...</p>
                  <p className="text-sm text-muted-foreground">Please wait</p>
                </>
              ) : importResult && (
                <>
                  {importResult.success > 0 ? (
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
                  )}
                  <p className="text-lg font-medium">
                    {importResult.success > 0 
                      ? `Successfully imported ${importResult.success} ${entityName}`
                      : 'Import failed'}
                  </p>
                  {importResult.failed > 0 && (
                    <p className="text-sm text-destructive">{importResult.failed} records failed</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handlePreview}>Preview Import</Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>Back</Button>
              <Button onClick={handleImport}>
                Import {csvRows.length} {entityName}
              </Button>
            </>
          )}
          {step === 'importing' && !importing && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
