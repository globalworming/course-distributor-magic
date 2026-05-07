import { useEffect, useState } from "react";
import type { Participant, Course, Room, Rule, Slot } from "./distribution";

const KEY = "course-distributor-v2";
export const PERIODS = 5;

export type AppState = {
  participants: Participant[];
  courses: Course[];
  rooms: Room[];
  slots: Slot[]; // length rooms*PERIODS, one per cell
  rules: Rule[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const seed = (): AppState => {
  const cEng = { id: uid(), name: "English Basics", defaultCapacity: 12 };
  const cHsu = { id: uid(), name: "HSU Safety", defaultCapacity: 20 };
  const cMath = { id: uid(), name: "Math 101", defaultCapacity: 15 };
  const cTeam = { id: uid(), name: "Teamwork", defaultCapacity: 18 };
  const cFire = { id: uid(), name: "Fire Drill", defaultCapacity: 25 };
  const courses = [cEng, cHsu, cMath, cTeam, cFire];

  const rooms: Room[] = Array.from({ length: 5 }, (_, i) => ({
    id: uid(),
    name: `Room ${i + 1}`,
  }));

  // Seed grid: each room offers a rotation
  const slots: Slot[] = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    for (let pe = 0; pe < PERIODS; pe++) {
      const c = courses[(ri + pe) % courses.length];
      slots.push({
        id: uid(),
        roomId: rooms[ri].id,
        period: pe,
        courseId: c.id,
        capacity: c.defaultCapacity,
      });
    }
  }

  return {
    participants: [
      { id: uid(), name: "Alice", tags: ["eng"] },
      { id: uid(), name: "Bob", tags: ["fieldB"] },
      { id: uid(), name: "Carol", tags: ["eng", "fieldB"] },
      { id: uid(), name: "Dan", tags: [] },
      { id: uid(), name: "Eve", tags: ["fieldB"] },
    ],
    courses,
    rooms,
    slots,
    rules: [
      { id: uid(), courseId: cHsu.id, tag: "all", type: "required" },
      { id: uid(), courseId: cFire.id, tag: "all", type: "required" },
      { id: uid(), courseId: cEng.id, tag: "eng", type: "optional" },
      { id: uid(), courseId: cMath.id, tag: "fieldB", type: "required" },
    ],
  };
};

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    if (typeof window === "undefined") return seed();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as AppState;
    } catch {}
    return seed();
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  return [state, setState, uid] as const;
}

export { uid };
