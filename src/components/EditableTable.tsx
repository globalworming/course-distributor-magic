import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

export type Column<T> = {
  key: string;
  header: string;
  width?: string;
  render: (row: T, update: (patch: Partial<T>) => void) => ReactNode;
};

type Props<T extends { id: string }> = {
  rows: T[];
  columns: Column<T>[];
  onChange: (rows: T[]) => void;
  onAdd: () => T;
  addLabel?: string;
};

export function EditableTable<T extends { id: string }>({
  rows,
  columns,
  onChange,
  onAdd,
  addLabel = "Add row",
}: Props<T>) {
  const update = (id: string, patch: Partial<T>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-left font-medium"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                {columns.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    {c.render(row, (patch) => update(row.id, patch))}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(row.id)}
                    aria-label="Delete row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-start border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...rows, onAdd()])}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
