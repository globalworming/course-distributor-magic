export type Participant = { id: string; name: string; tags: string[] };
export type Course = { id: string; name: string };
export type Track = { id: string; name: string; courseIds: string[] };
export type RuleType = "required" | "optional";
export type Rule = { id: string; courseId: string; tag: string; type: RuleType };

export type Assignment = {
  participantId: string;
  trackId: string | null;
  reason?: string;
};

export function distribute(
  participants: Participant[],
  courses: Course[],
  tracks: Track[],
  rules: Rule[],
): Assignment[] {
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Tag -> set of required courseIds
  const requiredByTag = new Map<string, Set<string>>();
  // Tag -> set of optional courseIds
  const optionalByTag = new Map<string, Set<string>>();
  for (const r of rules) {
    const map = r.type === "required" ? requiredByTag : optionalByTag;
    if (!map.has(r.tag)) map.set(r.tag, new Set());
    map.get(r.tag)!.add(r.courseId);
  }

  const trackCounts = new Map(tracks.map((t) => [t.id, 0]));
  const result: Assignment[] = [];

  for (const p of participants) {
    const tags = ["all", ...p.tags];
    const required = new Set<string>();
    const optional = new Set<string>();
    for (const tag of tags) {
      requiredByTag.get(tag)?.forEach((c) => required.add(c));
      optionalByTag.get(tag)?.forEach((c) => optional.add(c));
    }

    // Score each track: must include all required; prefer more optional matches; balance load
    let best: { trackId: string; score: number; missing: string[] } | null = null;
    for (const t of tracks) {
      const tc = new Set(t.courseIds);
      const missing = [...required].filter((c) => !tc.has(c));
      if (missing.length > 0) continue;
      const optMatches = [...optional].filter((c) => tc.has(c)).length;
      const load = trackCounts.get(t.id) ?? 0;
      // higher optMatches better, lower load better
      const score = optMatches * 1000 - load;
      if (!best || score > best.score) best = { trackId: t.id, score, missing: [] };
    }

    if (best) {
      trackCounts.set(best.trackId, (trackCounts.get(best.trackId) ?? 0) + 1);
      result.push({ participantId: p.id, trackId: best.trackId });
    } else {
      // find any track with fewest missing for diagnostics
      let leastMissing: string[] = [];
      let leastCount = Infinity;
      for (const t of tracks) {
        const tc = new Set(t.courseIds);
        const missing = [...required].filter((c) => !tc.has(c));
        if (missing.length < leastCount) {
          leastCount = missing.length;
          leastMissing = missing;
        }
      }
      const names = leastMissing.map((id) => courseById.get(id)?.name ?? id).join(", ");
      result.push({
        participantId: p.id,
        trackId: null,
        reason: `No track contains all required courses. Missing in best track: ${names}`,
      });
    }
  }

  return result;
}
