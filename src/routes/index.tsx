import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditableTable, type Column } from "@/components/EditableTable";
import { useAppState, uid, PERIODS } from "@/lib/store";
import {
  distribute,
  type Course,
  type Participant,
  type Rule,
  type Room,
  type Slot,
} from "@/lib/distribution";
import { Wand2, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Course Distributor — assign participants to room×period grid" },
      {
        name: "description",
        content:
          "Schedule courses across rooms and periods, then auto-assign participants based on tags, required & optional rules, and capacity.",
      },
    ],
  }),
});

const tagsToString = (tags: string[]) => tags.join(", ");
const stringToTags = (s: string) =>
  s.split(",").map((t) => t.trim()).filter(Boolean);

function Index() {
  const [state, setState] = useAppState();
  const { participants, courses, rooms, slots, rules } = state;

  const allTags = useMemo(() => {
    const set = new Set<string>(["all"]);
    participants.forEach((p) => p.tags.forEach((t) => set.add(t)));
    rules.forEach((r) => set.add(r.tag));
    return [...set];
  }, [participants, rules]);

  const [result, setResult] = useState<ReturnType<typeof distribute> | null>(
    null,
  );

  const courseById = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );
  const slotMap = useMemo(() => {
    // roomId|period -> slot
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(`${s.roomId}|${s.period}`, s);
    return m;
  }, [slots]);

  const ensureSlot = (roomId: string, period: number): Slot => {
    const key = `${roomId}|${period}`;
    const existing = slotMap.get(key);
    if (existing) return existing;
    return {
      id: uid(),
      roomId,
      period,
      courseId: null,
      capacity: 0,
    };
  };

  const updateSlot = (roomId: string, period: number, patch: Partial<Slot>) => {
    const key = `${roomId}|${period}`;
    const existing = slotMap.get(key);
    if (existing) {
      setState({
        ...state,
        slots: slots.map((s) => (s.id === existing.id ? { ...s, ...patch } : s)),
      });
    } else {
      const fresh = { ...ensureSlot(roomId, period), ...patch };
      setState({ ...state, slots: [...slots, fresh] });
    }
  };

  const run = () =>
    setResult(distribute(participants, courses, rooms, slots, rules, PERIODS));

  const exportCsv = () => {
    if (!result) return;
    const pById = new Map(participants.map((p) => [p.id, p]));
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const header = [
      "Participant",
      "Tags",
      ...Array.from({ length: PERIODS }, (_, i) => `Period ${i + 1}`),
      "Unmet required",
    ];
    const rows = [header];
    for (const a of result.assignments) {
      const p = pById.get(a.participantId);
      const cells = a.perPeriod.map((sid) => {
        if (!sid) return "—";
        const s = slotById.get(sid);
        if (!s) return "—";
        const c = s.courseId ? courseById.get(s.courseId) : null;
        const r = roomById.get(s.roomId);
        return `${c?.name ?? "?"} (${r?.name ?? "?"})`;
      });
      rows.push([
        p?.name ?? "",
        p ? p.tags.join("|") : "",
        ...cells,
        a.unmetRequired
          .map((cid) => courseById.get(cid)?.name ?? cid)
          .join("|"),
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distribution.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Columns
  const participantCols: Column<Participant>[] = [
    {
      key: "name",
      header: "Name",
      render: (r, u) => (
        <Input value={r.name} onChange={(e) => u({ name: e.target.value })} />
      ),
    },
    {
      key: "tags",
      header: "Tags (comma separated)",
      render: (r, u) => (
        <Input
          value={tagsToString(r.tags)}
          onChange={(e) => u({ tags: stringToTags(e.target.value) })}
          placeholder="eng, fieldB"
          list="tag-suggestions"
        />
      ),
    },
  ];

  const courseCols: Column<Course>[] = [
    {
      key: "name",
      header: "Course name",
      render: (r, u) => (
        <Input value={r.name} onChange={(e) => u({ name: e.target.value })} />
      ),
    },
    {
      key: "cap",
      header: "Default capacity",
      width: "160px",
      render: (r, u) => (
        <Input
          type="number"
          min={0}
          value={r.defaultCapacity}
          onChange={(e) =>
            u({ defaultCapacity: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      ),
    },
  ];

  const roomCols: Column<Room>[] = [
    {
      key: "name",
      header: "Room",
      render: (r, u) => (
        <Input value={r.name} onChange={(e) => u({ name: e.target.value })} />
      ),
    },
  ];

  const ruleCols: Column<Rule>[] = [
    {
      key: "course",
      header: "Course",
      render: (r, u) => (
        <Select value={r.courseId} onValueChange={(v) => u({ courseId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name || "(unnamed)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "140px",
      render: (r, u) => (
        <Select
          value={r.type}
          onValueChange={(v) => u({ type: v as Rule["type"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="required">required</SelectItem>
            <SelectItem value="optional">optional</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "tag",
      header: "For tag",
      render: (r, u) => (
        <Input
          value={r.tag}
          onChange={(e) => u({ tag: e.target.value.trim() || "all" })}
          list="tag-suggestions"
          placeholder="all"
        />
      ),
    },
  ];

  // Schedule grid demand counts (per slot)
  const demand = useMemo(() => {
    const m = new Map<string, number>();
    if (!result) return m;
    for (const s of slots) m.set(s.id, result.loads.get(s.id) ?? 0);
    return m;
  }, [result, slots]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Course Distributor
            </h1>
            <p className="text-sm text-muted-foreground">
              {rooms.length} rooms × {PERIODS} periods. Assign each participant
              to one course per period.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={run} className="gap-1.5">
              <Wand2 className="h-4 w-4" />
              Distribute
            </Button>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={!result}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      <datalist id="tag-suggestions">
        {allTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Participants</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTable
                rows={participants}
                columns={participantCols}
                onChange={(rows) =>
                  setState({ ...state, participants: rows })
                }
                onAdd={() => ({ id: uid(), name: "", tags: [] })}
                addLabel="Add participant"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Courses</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTable
                rows={courses}
                columns={courseCols}
                onChange={(rows) => setState({ ...state, courses: rows })}
                onAdd={() => ({ id: uid(), name: "", defaultCapacity: 20 })}
                addLabel="Add course"
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rooms</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableTable
              rows={rooms}
              columns={roomCols}
              onChange={(rows) => setState({ ...state, rooms: rows })}
              onAdd={() => ({
                id: uid(),
                name: `Room ${rooms.length + 1}`,
              })}
              addLabel="Add room"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Schedule grid{" "}
              <span className="font-normal text-muted-foreground">
                — pick course & capacity for each room × period
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="border border-border px-2 py-2 text-left font-medium">
                      Room \ Period
                    </th>
                    {Array.from({ length: PERIODS }, (_, i) => (
                      <th
                        key={i}
                        className="border border-border px-2 py-2 text-left font-medium"
                      >
                        Period {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td className="border border-border px-2 py-2 align-top font-medium">
                        {room.name}
                      </td>
                      {Array.from({ length: PERIODS }, (_, pe) => {
                        const slot = slotMap.get(`${room.id}|${pe}`);
                        const courseId = slot?.courseId ?? "__none";
                        const capacity = slot?.capacity ?? 0;
                        const used = slot ? demand.get(slot.id) ?? 0 : 0;
                        const over = used > capacity && capacity > 0;
                        return (
                          <td
                            key={pe}
                            className="min-w-[180px] border border-border p-1.5 align-top"
                          >
                            <div className="space-y-1.5">
                              <Select
                                value={courseId}
                                onValueChange={(v) => {
                                  const cid = v === "__none" ? null : v;
                                  const c = cid ? courseById.get(cid) : null;
                                  updateSlot(room.id, pe, {
                                    courseId: cid,
                                    capacity:
                                      capacity ||
                                      (c?.defaultCapacity ?? 20),
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">— empty —</SelectItem>
                                  {courses.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name || "(unnamed)"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  min={0}
                                  value={capacity}
                                  onChange={(e) =>
                                    updateSlot(room.id, pe, {
                                      capacity: Math.max(
                                        0,
                                        Number(e.target.value) || 0,
                                      ),
                                    })
                                  }
                                  className="h-7 w-16 text-xs"
                                  disabled={!slot?.courseId}
                                  title="Capacity"
                                />
                                {result && slot?.courseId && (
                                  <Badge
                                    variant={over ? "destructive" : "secondary"}
                                    className="text-xs"
                                  >
                                    {used}/{capacity}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Rules{" "}
              <span className="font-normal text-muted-foreground">
                — tag <code className="rounded bg-muted px-1">all</code> applies
                to everyone
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditableTable
              rows={rules}
              columns={ruleCols}
              onChange={(rows) => setState({ ...state, rules: rows })}
              onAdd={(): Rule => ({
                id: uid(),
                courseId: courses[0]?.id ?? "",
                tag: "all",
                type: "required",
              })}
              addLabel="Add rule"
            />
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="border border-border px-2 py-2 text-left font-medium">
                        Participant
                      </th>
                      {Array.from({ length: PERIODS }, (_, i) => (
                        <th
                          key={i}
                          className="border border-border px-2 py-2 text-left font-medium"
                        >
                          P{i + 1}
                        </th>
                      ))}
                      <th className="border border-border px-2 py-2 text-left font-medium">
                        Issues
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assignments.map((a) => {
                      const p = participants.find(
                        (x) => x.id === a.participantId,
                      );
                      return (
                        <tr key={a.participantId}>
                          <td className="border border-border px-2 py-1.5 align-top">
                            <div className="font-medium">{p?.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p?.tags.join(", ")}
                            </div>
                          </td>
                          {a.perPeriod.map((sid, i) => {
                            const s = sid
                              ? slots.find((x) => x.id === sid)
                              : null;
                            const c = s?.courseId
                              ? courseById.get(s.courseId)
                              : null;
                            const room = s
                              ? rooms.find((r) => r.id === s.roomId)
                              : null;
                            return (
                              <td
                                key={i}
                                className="border border-border px-2 py-1.5 align-top"
                              >
                                {c ? (
                                  <>
                                    <div>{c.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {room?.name}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border border-border px-2 py-1.5 align-top text-xs">
                            {a.unmetRequired.length > 0 && (
                              <div className="text-destructive">
                                Missing:{" "}
                                {a.unmetRequired
                                  .map(
                                    (cid) =>
                                      courseById.get(cid)?.name ?? cid,
                                  )
                                  .join(", ")}
                              </div>
                            )}
                            {a.notes.map((n, i) => (
                              <div key={i} className="text-muted-foreground">
                                {n}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
