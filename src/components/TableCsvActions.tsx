import { useId } from "react";
import type { ChangeEvent } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  tableKey: string;
  label: string;
  onExport: () => void;
  onImport: (file: File) => void | Promise<void>;
};

export function TableCsvActions({ tableKey, label, onExport, onImport }: Props) {
  const inputId = useId();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await onImport(file);
  };

  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onExport}
        className=""
        aria-label={`Export ${label} CSV`}
        data-testid={`${tableKey}-export-csv`}
      >
        <Download className="h-4 w-4" />
        Export
      </Button>
      <Button type="button" variant="outline" size="sm" asChild>
        <label htmlFor={inputId} className="cursor-pointer">
          <Upload className="h-4 w-4" />
          Import
        </label>
      </Button>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => void handleFileChange(event)}
        aria-label={`Import ${label} CSV file`}
        data-testid={`${tableKey}-import-csv-input`}
      />
    </div>
  );
}
