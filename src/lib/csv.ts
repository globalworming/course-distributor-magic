import type { Course, Participant, Room, RuleType } from "./distribution";

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

export type ParticipantCsvRow = Pick<Participant, "name" | "tags">;
export type CourseCsvRow = Pick<Course, "name" | "defaultCapacity">;
export type RoomCsvRow = Pick<Room, "name">;
export type RuleCsvRow = {
  courseName: string;
  type: RuleType;
  tag: string;
};

const PARTICIPANT_HEADERS = ["name", "tags"] as const;
const COURSE_HEADERS = ["name", "defaultCapacity"] as const;
const ROOM_HEADERS = ["name"] as const;
const RULE_HEADERS = ["courseName", "type", "tag"] as const;

export function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

export function exportParticipantsCsv(rows: ParticipantCsvRow[]) {
  return toCsv([PARTICIPANT_HEADERS, ...rows.map((row) => [row.name, row.tags.join(", ")])]);
}

export function parseParticipantsCsv(text: string): ParticipantCsvRow[] {
  return parseDataRows(text, PARTICIPANT_HEADERS).map(([name, tags]) => ({
    name: name.trim(),
    tags: parseTags(tags),
  }));
}

export function exportCoursesCsv(rows: CourseCsvRow[]) {
  return toCsv([COURSE_HEADERS, ...rows.map((row) => [row.name, String(row.defaultCapacity)])]);
}

export function parseCoursesCsv(text: string): CourseCsvRow[] {
  return parseDataRows(text, COURSE_HEADERS).map(([name, defaultCapacity], index) => ({
    name: name.trim(),
    defaultCapacity: parseNonNegativeNumber(defaultCapacity, index + 2, "defaultCapacity"),
  }));
}

export function exportRoomsCsv(rows: RoomCsvRow[]) {
  return toCsv([ROOM_HEADERS, ...rows.map((row) => [row.name])]);
}

export function parseRoomsCsv(text: string): RoomCsvRow[] {
  return parseDataRows(text, ROOM_HEADERS).map(([name]) => ({ name: name.trim() }));
}

export function exportRulesCsv(rows: RuleCsvRow[]) {
  return toCsv([RULE_HEADERS, ...rows.map((row) => [row.courseName, row.type, row.tag])]);
}

export function parseRulesCsv(text: string): RuleCsvRow[] {
  return parseDataRows(text, RULE_HEADERS).map(([courseName, type, tag], index) => ({
    courseName: courseName.trim(),
    type: parseRuleType(type, index + 2),
    tag: tag.trim() || "all",
  }));
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseRuleType(value: string, lineNumber: number): RuleType {
  const normalized = value.trim();
  if (normalized === "required" || normalized === "optional") return normalized;
  throw new CsvError(`Row ${lineNumber}: type must be "required" or "optional".`);
}

function parseNonNegativeNumber(value: string, lineNumber: number, fieldName: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CsvError(`Row ${lineNumber}: ${fieldName} must be a non-negative number.`);
  }
  return parsed;
}

function parseDataRows(text: string, expectedHeaders: readonly string[]) {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new CsvError("CSV is empty.");
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const expectedNormalized = expectedHeaders.map(normalizeHeader);
  if (
    normalizedHeaders.length !== expectedNormalized.length ||
    normalizedHeaders.some((header, index) => header !== expectedNormalized[index])
  ) {
    throw new CsvError(`Expected headers: ${expectedHeaders.join(", ")}`);
  }

  return dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row, index) => {
      if (row.length !== expectedHeaders.length) {
        throw new CsvError(
          `Row ${index + 2}: expected ${expectedHeaders.length} columns but found ${row.length}.`,
        );
      }
      return row;
    });
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function toCsv(rows: readonly (readonly string[])[]) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${cell.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushRow();
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      pushRow();
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new CsvError("CSV contains an unterminated quoted field.");
  }

  if (field !== "" || row.length > 0) {
    pushRow();
  }

  while (rows.length > 0 && rows.at(-1)?.every((cell) => cell.trim() === "")) {
    rows.pop();
  }

  return rows;
}
