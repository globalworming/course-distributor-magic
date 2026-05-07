import { useEffect, useState } from "react";
import type { Participant, Course, Track, Rule } from "./distribution";

const KEY = "course-distributor-v1";

export type AppState = {
  participants: Participant[];
  courses: Course[];
  tracks: Track[];
  rules: Rule[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

const seed = (): AppState => {
  const cEng = { id: uid(), name: "English Basics" };
  const cHsu = { id: uid(), name: "HSU Safety" };
  const cMath = { id: uid(), name: "Math 101" };
  const cTeam = { id: uid(), name: "Teamwork" };
  return {
    participants: [
      { id: uid(), name: "Alice", tags: ["eng"] },
      { id: uid(), name: "Bob", tags: ["fieldB"] },
      { id: uid(), name: "Carol", tags: ["eng", "fieldB"] },
    ],
    courses: [cEng, cHsu, cMath, cTeam],
    tracks: [
      { id: uid(), name: "Track 1", courseIds: [cEng.id, cHsu.id, cTeam.id] },
      { id: uid(), name: "Track 2", courseIds: [cHsu.id, cMath.id, cTeam.id] },
      { id: uid(), name: "Track 3", courseIds: [cEng.id, cHsu.id, cMath.id] },
      { id: uid(), name: "Track 4", courseIds: [cHsu.id, cTeam.id] },
      { id: uid(), name: "Track 5", courseIds: [cEng.id, cMath.id, cTeam.id] },
    ],
    rules: [
      { id: uid(), courseId: cHsu.id, tag: "all", type: "required" },
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
