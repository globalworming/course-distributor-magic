export type Participant = { id: string; name: string; tags: string[] };
export type Course = { id: string; name: string; defaultCapacity: number };
export type Room = { id: string; name: string };
export type RuleType = "required" | "optional";
export type Rule = { id: string; courseId: string; tag: string; type: RuleType };

// One scheduled session: a course running in a room during a period
export type Slot = {
  id: string;
  roomId: string;
  period: number; // 0..periods-1
  courseId: string | null;
  capacity: number;
};

export type Assignment = {
  participantId: string;
  // period index -> slotId (or null if unassigned)
  perPeriod: (string | null)[];
  unmetRequired: string[]; // course ids
  notes: string[];
};

export function distribute(
  participants: Participant[],
  courses: Course[],
  rooms: Room[],
  slots: Slot[],
  rules: Rule[],
  periods: number,
): { assignments: Assignment[]; loads: Map<string, number> } {
  const requiredByTag = new Map<string, Set<string>>();
  const optionalByTag = new Map<string, Set<string>>();
  for (const r of rules) {
    const m = r.type === "required" ? requiredByTag : optionalByTag;
    if (!m.has(r.tag)) m.set(r.tag, new Set());
    m.get(r.tag)!.add(r.courseId);
  }

  // period -> slots that have a course assigned
  const slotsByPeriod: Slot[][] = Array.from({ length: periods }, () => []);
  for (const s of slots) {
    if (s.courseId && s.period >= 0 && s.period < periods) slotsByPeriod[s.period].push(s);
  }

  const loads = new Map<string, number>(slots.map((s) => [s.id, 0]));

  // Order participants: more required courses first
  const ordered = [...participants].sort((a, b) => {
    const reqA = collectCourses(a, requiredByTag).size;
    const reqB = collectCourses(b, requiredByTag).size;
    return reqB - reqA;
  });

  const assignments: Assignment[] = [];

  for (const p of ordered) {
    const required = collectCourses(p, requiredByTag);
    const optional = collectCourses(p, optionalByTag);

    // Backtracking: choose one slot per period, ensuring all required courses covered
    const perPeriod: (string | null)[] = new Array(periods).fill(null);
    const coveredCourses = new Set<string>();

    // Helper: candidate slots in a period, scored
    const candidates = (period: number): Slot[] => {
      const list = slotsByPeriod[period].filter(
        (s) => (loads.get(s.id) ?? 0) < s.capacity,
      );
      return list.sort((a, b) => score(b, p) - score(a, p));
      function score(s: Slot, _p: Participant): number {
        const cid = s.courseId!;
        let sc = 0;
        if (required.has(cid) && !coveredCourses.has(cid)) sc += 10000;
        else if (optional.has(cid)) sc += 100;
        // load balance: prefer less full
        sc += (s.capacity - (loads.get(s.id) ?? 0)) * 0.1;
        return sc;
      }
    };

    // Greedy with required-first pass
    // 1) Try to place each uncovered required course into some period
    const periodOrder = [...Array(periods).keys()];
    const requiredList = [...required];
    // For each required course find feasible periods sorted by least flexibility
    const findPeriodsFor = (cid: string) =>
      periodOrder.filter(
        (pe) =>
          perPeriod[pe] === null &&
          slotsByPeriod[pe].some(
            (s) => s.courseId === cid && (loads.get(s.id) ?? 0) < s.capacity,
          ),
      );

    // Sort required by fewest options
    requiredList.sort((a, b) => findPeriodsFor(a).length - findPeriodsFor(b).length);

    const unmet: string[] = [];
    for (const cid of requiredList) {
      const opts = findPeriodsFor(cid);
      if (opts.length === 0) {
        unmet.push(cid);
        continue;
      }
      // pick period with most overall load pressure resolved: simplest = first option
      // but prefer the slot with most remaining capacity to balance
      let bestPeriod = opts[0];
      let bestSlot: Slot | null = null;
      let bestScore = -Infinity;
      for (const pe of opts) {
        for (const s of slotsByPeriod[pe]) {
          if (s.courseId !== cid) continue;
          const remaining = s.capacity - (loads.get(s.id) ?? 0);
          if (remaining <= 0) continue;
          if (remaining > bestScore) {
            bestScore = remaining;
            bestPeriod = pe;
            bestSlot = s;
          }
        }
      }
      if (bestSlot) {
        perPeriod[bestPeriod] = bestSlot.id;
        loads.set(bestSlot.id, (loads.get(bestSlot.id) ?? 0) + 1);
        coveredCourses.add(cid);
      } else {
        unmet.push(cid);
      }
    }

    // 2) Fill remaining periods with optional > any
    const notes: string[] = [];
    for (let pe = 0; pe < periods; pe++) {
      if (perPeriod[pe] !== null) continue;
      const cands = candidates(pe);
      if (cands.length === 0) {
        notes.push(`Period ${pe + 1}: no available slot`);
        continue;
      }
      const chosen = cands[0];
      perPeriod[pe] = chosen.id;
      loads.set(chosen.id, (loads.get(chosen.id) ?? 0) + 1);
    }

    assignments.push({
      participantId: p.id,
      perPeriod,
      unmetRequired: unmet,
      notes,
    });
  }

  return { assignments, loads };
}

function collectCourses(p: Participant, byTag: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  const tags = ["all", ...p.tags];
  for (const t of tags) byTag.get(t)?.forEach((c) => out.add(c));
  return out;
}
