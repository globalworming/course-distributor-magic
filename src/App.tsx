import { type ReactNode, useMemo, useState } from "react";
import { AlertCircle, Download, RotateCcw, Wand2 } from "lucide-react";
import { ReadonlyTable, type ReadonlyColumn } from "@/components/ReadonlyTable";
import { TableCsvActions } from "@/components/TableCsvActions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CsvError,
  downloadCsvFile,
  exportCoursesCsv,
  exportParticipantsCsv,
  exportRoomsCsv,
  exportRulesCsv,
  exportScheduleCsv,
  parseCoursesCsv,
  parseParticipantsCsv,
  parseRoomsCsv,
  parseRulesCsv,
  parseScheduleCsv,
} from "@/lib/csv";
import { distribute, type Course, type Room, type Slot } from "@/lib/distribution";
import { createTemplateState, PERIODS, type AppState, uid, useAppState } from "@/lib/store";

type CsvTableKey = "participants" | "courses" | "rooms" | "schedule" | "rules";
type CsvErrors = Partial<Record<CsvTableKey, string>>;

export default function App() {
  const [state, setState] = useAppState();
  const { participants, courses, rooms, slots, rules, schedulePeriodLabels } = state;
  const [csvErrors, setCsvErrors] = useState<CsvErrors>({});
  const [result, setResult] = useState<ReturnType<typeof distribute> | null>(null);

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const slotMap = useMemo(() => {
    const next = new Map<string, Slot>();
    for (const slot of slots) {
      next.set(`${slot.roomId}|${slot.period}`, slot);
    }
    return next;
  }, [slots]);
  const demand = useMemo(() => {
    const next = new Map<string, number>();
    if (!result) return next;
    for (const slot of slots) {
      next.set(slot.id, result.loads.get(slot.id) ?? 0);
    }
    return next;
  }, [result, slots]);
  const distributionRows = useMemo(() => {
    if (!result) return [];

    const participantsBySlotId = new Map<string, string[]>();
    for (const assignment of result.assignments) {
      const participant = participantById.get(assignment.participantId);
      if (!participant) continue;

      for (const slotId of assignment.perPeriod) {
        if (!slotId) continue;
        const names = participantsBySlotId.get(slotId) ?? [];
        names.push(participant.name);
        participantsBySlotId.set(slotId, names);
      }
    }

    return slots
      .filter((slot) => slot.courseId)
      .map((slot) => ({
        slotId: slot.id,
        period: slot.period,
        periodLabel: schedulePeriodLabels[slot.period] ?? `Period ${slot.period + 1}`,
        roomName: roomById.get(slot.roomId)?.name ?? "Unknown room",
        courseName: courseById.get(slot.courseId!)?.name ?? "Unknown course",
        participants: participantsBySlotId.get(slot.id) ?? [],
      }))
      .sort((a, b) => a.period - b.period || a.roomName.localeCompare(b.roomName));
  }, [result, participantById, slots, schedulePeriodLabels, roomById, courseById]);
  const issueRows = useMemo(() => {
    if (!result) return [];

    return result.assignments
      .map((assignment) => ({
        participantName:
          participantById.get(assignment.participantId)?.name ?? "Unknown participant",
        missingRequired: assignment.unmetRequired
          .map((courseId) => courseById.get(courseId)?.name ?? courseId)
          .join(", "),
        notes: assignment.notes.join(" | "),
      }))
      .filter((row) => row.missingRequired || row.notes)
      .sort((a, b) => a.participantName.localeCompare(b.participantName));
  }, [result, participantById, courseById]);

  const updateState = (nextState: AppState) => {
    setState(nextState);
    setResult(null);
  };

  const clearCsvError = (table: CsvTableKey) =>
    setCsvErrors((current) => ({ ...current, [table]: undefined }));

  const setCsvError = (table: CsvTableKey, message: string) =>
    setCsvErrors((current) => ({ ...current, [table]: message }));

  const resetToTemplate = () => {
    setState(createTemplateState());
    setCsvErrors({});
    setResult(null);
  };

  const run = () => setResult(distribute(participants, courses, rooms, slots, rules, PERIODS));

  const exportDistribution = () => {
    if (!result) return;
    const header = ["period", "room", "course", "participants"];
    const rows = [header];

    for (const row of distributionRows) {
      rows.push([row.periodLabel, row.roomName, row.courseName, row.participants.join(", ")]);
    }

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadCsvFile("distribution.csv", csv);
  };

  const exportParticipants = () => {
    clearCsvError("participants");
    downloadCsvFile("participants.csv", exportParticipantsCsv(participants));
  };

  const exportCourses = () => {
    clearCsvError("courses");
    downloadCsvFile("courses.csv", exportCoursesCsv(courses));
  };

  const exportRooms = () => {
    clearCsvError("rooms");
    downloadCsvFile("rooms.csv", exportRoomsCsv(rooms));
  };

  const exportRules = () => {
    try {
      clearCsvError("rules");
      const courseNames = getUniqueCourseNames(courses);
      const csv = exportRulesCsv(
        rules.map((rule) => {
          const course = courseById.get(rule.courseId);
          if (!course) {
            throw new CsvError("Rules reference a course that no longer exists.");
          }

          const courseName = course.name.trim();
          if (!courseNames.has(courseName)) {
            throw new CsvError(
              "Rule export requires every referenced course to have a unique name.",
            );
          }

          return {
            courseName,
            type: rule.type,
            tag: rule.tag,
          };
        }),
      );
      downloadCsvFile("rules.csv", csv);
    } catch (error) {
      setCsvError("rules", getErrorMessage(error));
    }
  };

  const exportSchedule = () => {
    try {
      clearCsvError("schedule");
      getUniqueRoomNames(rooms);
      const courseNames = getUniqueCourseNames(courses);
      const csv = exportScheduleCsv(
        rooms.map((room) => ({
          roomName: room.name,
          courseNames: Array.from({ length: PERIODS }, (_, period) => {
            const slot = slotMap.get(`${room.id}|${period}`);
            if (!slot?.courseId) return "";
            const course = courseById.get(slot.courseId);
            if (!course || !courseNames.has(course.name.trim())) {
              throw new CsvError(
                "Schedule export requires every scheduled course to have a unique name.",
              );
            }
            return course.name;
          }),
        })),
        schedulePeriodLabels,
      );
      downloadCsvFile("schedule.csv", csv);
    } catch (error) {
      setCsvError("schedule", getErrorMessage(error));
    }
  };

  const importParticipants = async (file: File) => {
    try {
      const imported = parseParticipantsCsv(await file.text());
      updateState({
        ...state,
        participants: imported.map((row) => ({ id: uid(), name: row.name, tags: row.tags })),
      });
      clearCsvError("participants");
    } catch (error) {
      setCsvError("participants", getErrorMessage(error));
    }
  };

  const importCourses = async (file: File) => {
    try {
      const imported = parseCoursesCsv(await file.text());
      assertNonEmptyUniqueNames(
        imported.map((row) => row.name),
        "course",
      );

      const existingByName = new Map(courses.map((course) => [course.name.trim(), course]));
      const nextCourses = imported.map((row) => ({
        id: existingByName.get(row.name)?.id ?? uid(),
        name: row.name,
        defaultCapacity: row.defaultCapacity,
      }));
      const nextCourseById = new Map(nextCourses.map((course) => [course.id, course]));
      const validCourseIds = new Set(nextCourseById.keys());

      updateState({
        ...state,
        courses: nextCourses,
        rules: rules.filter((rule) => validCourseIds.has(rule.courseId)),
        slots: slots.map((slot) => {
          if (!slot.courseId || !validCourseIds.has(slot.courseId)) {
            return { ...slot, courseId: null, capacity: 0 };
          }

          return {
            ...slot,
            capacity: nextCourseById.get(slot.courseId)?.defaultCapacity ?? 0,
          };
        }),
      });
      clearCsvError("courses");
    } catch (error) {
      setCsvError("courses", getErrorMessage(error));
    }
  };

  const importRooms = async (file: File) => {
    try {
      const imported = parseRoomsCsv(await file.text());
      assertNonEmptyUniqueNames(
        imported.map((row) => row.name),
        "room",
      );

      const existingByName = new Map(rooms.map((room) => [room.name.trim(), room]));
      const nextRooms = imported.map((row) => ({
        id: existingByName.get(row.name)?.id ?? uid(),
        name: row.name,
      }));
      const validRoomIds = new Set(nextRooms.map((room) => room.id));

      updateState({
        ...state,
        rooms: nextRooms,
        slots: slots.filter((slot) => validRoomIds.has(slot.roomId)),
      });
      clearCsvError("rooms");
    } catch (error) {
      setCsvError("rooms", getErrorMessage(error));
    }
  };

  const importRules = async (file: File) => {
    try {
      const imported = parseRulesCsv(await file.text());
      const coursesByName = getUniqueCourseNames(courses);
      const nextRules = imported.map((row, index) => {
        const course = coursesByName.get(row.courseName);
        if (!course) {
          throw new CsvError(`Unknown course name "${row.courseName}" in rules CSV.`);
        }
        return {
          id: rules[index]?.id ?? uid(),
          courseId: course.id,
          tag: row.tag,
          type: row.type,
        };
      });

      updateState({
        ...state,
        rules: nextRules,
      });
      clearCsvError("rules");
    } catch (error) {
      setCsvError("rules", getErrorMessage(error));
    }
  };

  const importSchedule = async (file: File) => {
    try {
      const imported = parseScheduleCsv(await file.text(), PERIODS);
      const coursesByName = getUniqueCourseNames(courses);
      const roomsByName = getUniqueRoomNames(rooms);
      const seenRooms = new Set<string>();
      const nextSlots: Slot[] = [];

      for (const row of imported.rows) {
        if (!row.roomName) {
          throw new CsvError("Schedule CSV requires every row to include a room name.");
        }
        if (seenRooms.has(row.roomName)) {
          throw new CsvError(`Duplicate room row "${row.roomName}" in schedule CSV.`);
        }

        const room = roomsByName.get(row.roomName);
        if (!room) {
          throw new CsvError(`Unknown room name "${row.roomName}" in schedule CSV.`);
        }

        seenRooms.add(row.roomName);

        for (let period = 0; period < PERIODS; period += 1) {
          const courseName = row.courseNames[period] ?? "";
          const existingSlot = slotMap.get(`${room.id}|${period}`);

          if (!courseName) {
            nextSlots.push({
              id: existingSlot?.id ?? uid(),
              roomId: room.id,
              period,
              courseId: null,
              capacity: 0,
            });
            continue;
          }

          const course = coursesByName.get(courseName);
          if (!course) {
            throw new CsvError(`Unknown course name "${courseName}" in schedule CSV.`);
          }

          nextSlots.push({
            id: existingSlot?.id ?? uid(),
            roomId: room.id,
            period,
            courseId: course.id,
            capacity: course.defaultCapacity,
          });
        }
      }

      for (const room of rooms) {
        if (!seenRooms.has(room.name)) {
          throw new CsvError(`Missing room row "${room.name}" in schedule CSV.`);
        }
      }

      updateState({
        ...state,
        slots: nextSlots,
        schedulePeriodLabels: imported.periodLabels,
      });
      clearCsvError("schedule");
    } catch (error) {
      setCsvError("schedule", getErrorMessage(error));
    }
  };

  const participantRows = participants.map((participant) => ({
    name: participant.name,
    tags: participant.tags.join(", "),
  }));
  const courseRows = courses.map((course) => ({
    name: course.name,
    defaultCapacity: course.defaultCapacity,
  }));
  const roomRows = rooms.map((room) => ({ name: room.name }));
  const ruleRows = rules.map((rule) => ({
    courseName: courseById.get(rule.courseId)?.name ?? "Unknown course",
    type: rule.type,
    tag: rule.tag,
  }));

  const participantColumns: ReadonlyColumn<(typeof participantRows)[number]>[] = [
    { key: "name", header: "Name", render: (row) => row.name || "—" },
    { key: "tags", header: "Tags", render: (row) => row.tags || "—" },
  ];
  const courseColumns: ReadonlyColumn<(typeof courseRows)[number]>[] = [
    { key: "name", header: "Course name", render: (row) => row.name || "—" },
    {
      key: "defaultCapacity",
      header: "Default capacity",
      width: "180px",
      render: (row) => row.defaultCapacity,
    },
  ];
  const roomColumns: ReadonlyColumn<(typeof roomRows)[number]>[] = [
    { key: "name", header: "Room", render: (row) => row.name || "—" },
  ];
  const ruleColumns: ReadonlyColumn<(typeof ruleRows)[number]>[] = [
    { key: "courseName", header: "Course", render: (row) => row.courseName },
    { key: "type", header: "Type", width: "140px", render: (row) => row.type },
    { key: "tag", header: "For tag", render: (row) => row.tag || "all" },
  ];

  const emptyState = (
    <div className="space-y-1">
      <div className="font-medium">
        Download the CSV template, edit it locally, then import it here.
      </div>
      <div className="text-sm text-muted-foreground">
        The browser now previews imported data only. Add, delete, and schedule changes happen in CSV
        files.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Course Distributor</h1>
            <p className="text-sm text-muted-foreground">
              CSV-first workflow for participants, courses, rooms, schedule, and rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetToTemplate} className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              Reset to template
            </Button>
            <Button onClick={run} className="gap-1.5">
              <Wand2 className="h-4 w-4" />
              Distribute
            </Button>
            <Button
              variant="outline"
              onClick={exportDistribution}
              disabled={!result}
              className="gap-1.5"
              data-testid="distribution-export-csv"
            >
              <Download className="h-4 w-4" />
              Export results
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <DataCard title="Participants" error={csvErrors.participants}>
            <ReadonlyTable
              rows={participantRows}
              columns={participantColumns}
              emptyState={emptyState}
              testId="participants-table"
              actions={
                <TableCsvActions
                  tableKey="participants"
                  label="participants"
                  onExport={exportParticipants}
                  onImport={importParticipants}
                />
              }
            />
          </DataCard>

          <DataCard title="Courses" error={csvErrors.courses}>
            <ReadonlyTable
              rows={courseRows}
              columns={courseColumns}
              emptyState={emptyState}
              testId="courses-table"
              actions={
                <TableCsvActions
                  tableKey="courses"
                  label="courses"
                  onExport={exportCourses}
                  onImport={importCourses}
                />
              }
            />
          </DataCard>
        </div>

        <DataCard title="Rooms" error={csvErrors.rooms}>
          <ReadonlyTable
            rows={roomRows}
            columns={roomColumns}
            emptyState={emptyState}
            testId="rooms-table"
            actions={
              <TableCsvActions
                tableKey="rooms"
                label="rooms"
                onExport={exportRooms}
                onImport={importRooms}
              />
            }
          />
        </DataCard>

        <DataCard title="Schedule Grid" error={csvErrors.schedule}>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Import one CSV row per room. Slot capacity always follows the scheduled course&apos;s
              default capacity.
            </div>
            <div
              className="overflow-x-auto rounded-md border border-border bg-card"
              data-testid="schedule-table"
            >
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="border border-border px-3 py-2 text-left font-medium">Room</th>
                    {schedulePeriodLabels.map((label, index) => (
                      <th
                        key={index}
                        className="border border-border px-3 py-2 text-left font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan={PERIODS + 1} className="px-4 py-6">
                        {emptyState}
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room) => (
                      <tr key={room.id}>
                        <td className="border border-border px-3 py-2 font-medium">{room.name}</td>
                        {Array.from({ length: PERIODS }, (_, period) => {
                          const slot = slotMap.get(`${room.id}|${period}`);
                          const used = slot ? (demand.get(slot.id) ?? 0) : 0;
                          const course = slot?.courseId ? courseById.get(slot.courseId) : null;
                          return (
                            <td
                              key={period}
                              className="min-w-[150px] border border-border px-3 py-2 align-top"
                            >
                              <div>{course?.name ?? "—"}</div>
                              {course && (
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>Cap {course.defaultCapacity}</span>
                                  {result && slot && (
                                    <Badge variant="secondary" className="text-xs">
                                      {used}/{slot.capacity}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <TableCsvActions
                tableKey="schedule"
                label="schedule"
                onExport={exportSchedule}
                onImport={importSchedule}
              />
            </div>
          </div>
        </DataCard>

        <DataCard title="Rules" error={csvErrors.rules}>
          <div className="mb-3 text-sm text-muted-foreground">
            Rules guide the distributor. It prefers one visit per course for each participant, keeps
            everyone in an available course every period, and balances room loads when options are
            otherwise equivalent.
          </div>
          <ReadonlyTable
            rows={ruleRows}
            columns={ruleColumns}
            emptyState={emptyState}
            testId="rules-table"
            actions={
              <TableCsvActions
                tableKey="rules"
                label="rules"
                onExport={exportRules}
                onImport={importRules}
              />
            }
          />
        </DataCard>

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 text-sm text-muted-foreground">
                  Assignments are grouped by period and room so each row shows who attends a
                  scheduled course in that slot.
                </div>
                <ReadonlyTable
                  rows={distributionRows}
                  testId="distribution-table"
                  emptyState="No scheduled slots available."
                  columns={[
                    { key: "period", header: "Period", render: (row) => row.periodLabel },
                    { key: "room", header: "Room", render: (row) => row.roomName },
                    { key: "course", header: "Course", render: (row) => row.courseName },
                    {
                      key: "participants",
                      header: "Participants",
                      render: (row) =>
                        row.participants.length > 0 ? (
                          row.participants.join(", ")
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        ),
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Participant Issues</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 text-sm text-muted-foreground">
                  Unmet required courses and repeat-placement notes remain participant-specific.
                </div>
                <ReadonlyTable
                  rows={issueRows}
                  testId="distribution-issues-table"
                  emptyState="No participant issues."
                  columns={[
                    {
                      key: "participant",
                      header: "Participant",
                      render: (row) => row.participantName,
                    },
                    {
                      key: "missingRequired",
                      header: "Missing required",
                      render: (row) =>
                        row.missingRequired || <span className="text-muted-foreground">—</span>,
                    },
                    {
                      key: "notes",
                      header: "Notes",
                      render: (row) =>
                        row.notes || <span className="text-muted-foreground">—</span>,
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function DataCard({
  title,
  error,
  children,
}: {
  title: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        {error && <TableCsvError message={error} />}
      </CardContent>
    </Card>
  );
}

function getUniqueCourseNames(courses: Course[]) {
  return getUniqueNames(courses, "course", (course) => course.name);
}

function getUniqueRoomNames(rooms: Room[]) {
  return getUniqueNames(rooms, "room", (room) => room.name);
}

function getUniqueNames<T>(items: T[], label: string, getName: (item: T) => string) {
  const itemsByName = new Map<string, T>();
  for (const item of items) {
    const name = getName(item).trim();
    if (!name) {
      throw new CsvError(
        `${capitalize(label)} CSV sync requires every ${label} to have a non-empty name.`,
      );
    }
    if (itemsByName.has(name)) {
      throw new CsvError(
        `${capitalize(label)} CSV sync requires unique names. Duplicate: "${name}".`,
      );
    }
    itemsByName.set(name, item);
  }
  return itemsByName;
}

function assertNonEmptyUniqueNames(names: string[], label: string) {
  const seen = new Set<string>();
  for (const [index, rawName] of names.entries()) {
    const name = rawName.trim();
    if (!name) {
      throw new CsvError(`Row ${index + 2}: ${label} name is required.`);
    }
    if (seen.has(name)) {
      throw new CsvError(`Duplicate ${label} name "${name}" in ${label}s CSV.`);
    }
    seen.add(name);
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "CSV import failed.";
}

function TableCsvError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-3">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
