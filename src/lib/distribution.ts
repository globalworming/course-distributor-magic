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
  void courses;
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
  const roomLoads = new Map<string, number>(rooms.map((room) => [room.id, 0]));
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

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
    const perPeriod: (string | null)[] = new Array(periods).fill(null);
    const assignedCourses = new Set<string>();
    const requiredList = [...required];
    const periodLabels = Array.from({ length: periods }, (_, index) => `Period ${index + 1}`);

    const findPeriodsFor = (courseId: string) =>
      [...Array(periods).keys()].filter(
        (period) =>
          perPeriod[period] === null &&
          slotsByPeriod[period].some(
            (slot) =>
              slot.courseId === courseId &&
              (loads.get(slot.id) ?? 0) < slot.capacity &&
              !assignedCourses.has(courseId),
          ),
      );

    requiredList.sort((a, b) => findPeriodsFor(a).length - findPeriodsFor(b).length);

    const unmet: string[] = [];
    for (const cid of requiredList) {
      const opts = findPeriodsFor(cid);
      if (opts.length === 0) {
        unmet.push(cid);
        continue;
      }
      const best = chooseCandidateSlot(
        p,
        opts,
        slotsByPeriod,
        loads,
        roomLoads,
        required,
        optional,
        assignedCourses,
        false,
      );
      if (!best) {
        unmet.push(cid);
        continue;
      }

      assignToPeriod(best.period, best.slot, perPeriod, loads, roomLoads, assignedCourses);
    }

    const notes: string[] = [];
    for (let period = 0; period < periods; period += 1) {
      if (perPeriod[period] !== null) continue;

      const uniqueChoice = chooseCandidateSlot(
        p,
        [period],
        slotsByPeriod,
        loads,
        roomLoads,
        required,
        optional,
        assignedCourses,
        false,
      );

      if (uniqueChoice) {
        assignToPeriod(period, uniqueChoice.slot, perPeriod, loads, roomLoads, assignedCourses);
        continue;
      }

      const fallbackChoice = chooseCandidateSlot(
        p,
        [period],
        slotsByPeriod,
        loads,
        roomLoads,
        required,
        optional,
        assignedCourses,
        true,
      );

      if (!fallbackChoice) {
        notes.push(`${periodLabels[period]}: no available slot`);
        continue;
      }

      assignToPeriod(period, fallbackChoice.slot, perPeriod, loads, roomLoads, assignedCourses);
      const repeatedCourseId = fallbackChoice.slot.courseId;
      const repeatedSlot = repeatedCourseId ? slotById.get(fallbackChoice.slot.id) : null;
      if (repeatedSlot?.courseId) {
        notes.push(`${periodLabels[period]}: repeated course to avoid an empty assignment`);
      }
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

function chooseCandidateSlot(
  participant: Participant,
  periods: number[],
  slotsByPeriod: Slot[][],
  loads: Map<string, number>,
  roomLoads: Map<string, number>,
  required: Set<string>,
  optional: Set<string>,
  assignedCourses: Set<string>,
  allowRepeats: boolean,
): { period: number; slot: Slot } | null {
  const candidates: Array<{ period: number; slot: Slot }> = [];

  for (const period of periods) {
    for (const slot of slotsByPeriod[period]) {
      if ((loads.get(slot.id) ?? 0) >= slot.capacity) continue;
      if (!slot.courseId) continue;
      if (!allowRepeats && assignedCourses.has(slot.courseId)) continue;
      candidates.push({ period, slot });
    }
  }

  candidates.sort((a, b) => scoreSlot(b.slot, b.period) - scoreSlot(a.slot, a.period));
  return candidates[0] ?? null;

  function scoreSlot(slot: Slot, period: number) {
    const courseId = slot.courseId!;
    const slotLoad = loads.get(slot.id) ?? 0;
    const roomLoad = roomLoads.get(slot.roomId) ?? 0;
    const roomPeriodLoad = slotsByPeriod[period].reduce((sum, candidate) => {
      if (candidate.roomId !== slot.roomId) return sum;
      return sum + (loads.get(candidate.id) ?? 0);
    }, 0);
    let score = 0;

    // Keep this priority order aligned with the distributor rules and tests in
    // `src/lib/distribution.test.ts`:
    // - "places required courses before optional preferences"
    // - "treats optional courses as fallback when another unique course is available"
    // - "uses an optional course after other unique courses fill up"
    // - "uses an optional course when no other unique course remains for the participant"
    if (required.has(courseId) && !assignedCourses.has(courseId)) score += 10000;
    else if (!assignedCourses.has(courseId) && !optional.has(courseId)) score += 1000;
    else if (optional.has(courseId) && !assignedCourses.has(courseId)) score += 100;
    else if (optional.has(courseId)) score += 20;

    score += slot.capacity - slotLoad;
    score -= roomLoad * 0.5;
    score -= roomPeriodLoad * 0.25;
    return score;
  }
}

function assignToPeriod(
  period: number,
  slot: Slot,
  perPeriod: (string | null)[],
  loads: Map<string, number>,
  roomLoads: Map<string, number>,
  assignedCourses: Set<string>,
) {
  perPeriod[period] = slot.id;
  loads.set(slot.id, (loads.get(slot.id) ?? 0) + 1);
  roomLoads.set(slot.roomId, (roomLoads.get(slot.roomId) ?? 0) + 1);
  if (slot.courseId) {
    assignedCourses.add(slot.courseId);
  }
}

function collectCourses(p: Participant, byTag: Map<string, Set<string>>): Set<string> {
  const out = new Set<string>();
  const tags = ["all", ...p.tags];
  for (const t of tags) byTag.get(t)?.forEach((c) => out.add(c));
  return out;
}
