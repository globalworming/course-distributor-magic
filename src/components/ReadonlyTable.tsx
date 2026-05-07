import { ReactNode } from "react";

export type ReadonlyColumn<T> = {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  rows: T[];
  columns: ReadonlyColumn<T>[];
  emptyState: ReactNode;
  actions?: ReactNode;
  testId?: string;
};

export function ReadonlyTable<T>({ rows, columns, emptyState, actions, testId }: Props<T>) {
  return (
    <div className="rounded-md border border-border bg-card" data-testid={testId}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-2 text-left font-medium"
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border align-top">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6">
                  {emptyState}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-2">
          {actions}
        </div>
      )}
    </div>
  );
}
