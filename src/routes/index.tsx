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
import { useAppState, uid } from "@/lib/store";
import {
  distribute,
  type Course,
  type Participant,
  type Rule,
  type Track,
} from "@/lib/distribution";
import { Wand2, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Course Distributor — assign participants to parallel tracks" },
      {
        name: "description",
        content:
          "Distribute participants across parallel course tracks based on tags and required/optional course rules.",
      },
    ],
  }),
});

function tagsToString(tags: string[]) {
  return tags.join(", ");
}
function stringToTags(s: string) {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function Index() {
  const [state, setState] = useAppState();
  const { participants, courses, tracks, rules } = state;

  const allTags = useMemo(() => {
    const set = new Set<string>(["all"]);
    participants.forEach((p) => p.tags.forEach((t) => set.add(t)));
    rules.forEach((r) => set.add(r.tag));
    return [...set];
  }, [participants, rules]);

  const [result, setResult] = useState<ReturnType<typeof distribute> | null>(null);

  const run = () => setResult(distribute(participants, courses, tracks, rules));

  const exportCsv = () => {
    if (!result) return;
    const tById = new Map(tracks.map((t) => [t.id, t]));
    const pById = new Map(participants.map((p) => [p.id, p]));
    const rows = [
      ["Participant", "Tags", "Track", "Note"],
      ...result.map((a) => {
        const p = pById.get(a.participantId);
        const t = a.trackId ? tById.get(a.trackId) : null;
        return [
          p?.name ?? "",
          p ? p.tags.join("|") : "",
          t?.name ?? "UNASSIGNED",
          a.reason ?? "",
        ];
      }),
    ];
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

  // Column defs
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
  ];

  const trackCols: Column<Track>[] = [
    {
      key: "name",
      header: "Track",
      width: "180px",
      render: (r, u) => (
        <Input value={r.name} onChange={(e) => u({ name: e.target.value })} />
      ),
    },
    {
      key: "courses",
      header: "Courses in this track",
      render: (r, u) => (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => {
            const active = r.courseIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  u({
                    courseIds: active
                      ? r.courseIds.filter((id) => id !== c.id)
                      : [...r.courseIds, c.id],
                  })
                }
                className={
                  "rounded-md border px-2 py-1 text-xs transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-accent")
                }
              >
                {c.name || "(unnamed)"}
              </button>
            );
          })}
          {courses.length === 0 && (
            <span className="text-xs text-muted-foreground">Add courses first.</span>
          )}
        </div>
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

  const pById = new Map(participants.map((p) => [p.id, p]));
  const tById = new Map(tracks.map((t) => [t.id, t]));

  const grouped = useMemo(() => {
    if (!result) return null;
    const map = new Map<string, Participant[]>();
    for (const t of tracks) map.set(t.id, []);
    const unassigned: { p: Participant; reason?: string }[] = [];
    for (const a of result) {
      const p = pById.get(a.participantId);
      if (!p) continue;
      if (a.trackId) map.get(a.trackId)?.push(p);
      else unassigned.push({ p, reason: a.reason });
    }
    return { map, unassigned };
  }, [result, tracks, participants]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Course Distributor
            </h1>
            <p className="text-sm text-muted-foreground">
              Assign participants to parallel tracks based on tags & rules.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={run} className="gap-1.5">
              <Wand2 className="h-4 w-4" />
              Distribute
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!result} className="gap-1.5">
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
                onChange={(rows) => setState({ ...state, participants: rows })}
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
                onAdd={() => ({ id: uid(), name: "" })}
                addLabel="Add course"
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parallel tracks</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableTable
              rows={tracks}
              columns={trackCols}
              onChange={(rows) => setState({ ...state, tracks: rows })}
              onAdd={() => ({
                id: uid(),
                name: `Track ${tracks.length + 1}`,
                courseIds: [],
              })}
              addLabel="Add track"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Rules{" "}
              <span className="font-normal text-muted-foreground">
                — tag <code className="rounded bg-muted px-1">all</code> applies to everyone
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

        {grouped && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {tracks.map((t) => {
                  const list = grouped.map.get(t.id) ?? [];
                  return (
                    <div
                      key={t.id}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-medium">{t.name}</div>
                        <Badge variant="secondary">{list.length}</Badge>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {t.courseIds.map((cid) => (
                          <Badge key={cid} variant="outline" className="text-xs">
                            {courses.find((c) => c.id === cid)?.name ?? "?"}
                          </Badge>
                        ))}
                      </div>
                      <ul className="space-y-1 text-sm">
                        {list.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2">
                            <span>{p.name || "(unnamed)"}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.tags.join(", ")}
                            </span>
                          </li>
                        ))}
                        {list.length === 0 && (
                          <li className="text-xs text-muted-foreground">Empty</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {grouped.unassigned.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="mb-2 font-medium text-destructive">
                    Unassigned ({grouped.unassigned.length})
                  </div>
                  <ul className="space-y-1 text-sm">
                    {grouped.unassigned.map(({ p, reason }) => (
                      <li key={p.id}>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-muted-foreground">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
