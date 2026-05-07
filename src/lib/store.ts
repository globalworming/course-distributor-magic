import { useEffect, useState } from "react";
import {
  CsvError,
  parseCoursesCsv,
  parseParticipantsCsv,
  parseRoomsCsv,
  parseRulesCsv,
  parseScheduleCsv,
} from "./csv";
import type { Participant, Course, Room, Rule, Slot } from "./distribution";
import coursesTemplate from "../templates/courses.csv?raw";
import participantsTemplate from "../templates/participants.csv?raw";
import roomsTemplate from "../templates/rooms.csv?raw";
import rulesTemplate from "../templates/rules.csv?raw";
import scheduleTemplate from "../templates/schedule.csv?raw";

const KEY = "course-distributor-v8";
export const PERIODS = 25;

export type AppState = {
  participants: Participant[];
  courses: Course[];
  rooms: Room[];
  slots: Slot[];
  rules: Rule[];
  schedulePeriodLabels: string[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const createTemplateState = (): AppState => {
  const participants = parseParticipantsCsv(participantsTemplate).map((row) => ({
    id: uid(),
    name: row.name,
    tags: row.tags,
  }));
  const courses = parseCoursesCsv(coursesTemplate).map((row) => ({
    id: uid(),
    name: row.name,
    defaultCapacity: row.defaultCapacity,
  }));
  const rooms = parseRoomsCsv(roomsTemplate).map((row) => ({
    id: uid(),
    name: row.name,
  }));
  const coursesByName = new Map(courses.map((course) => [course.name, course]));
  const roomsByName = new Map(rooms.map((room) => [room.name, room]));
  const rules = parseRulesCsv(rulesTemplate).map((row) => {
    const course = coursesByName.get(row.courseName);
    if (!course) {
      throw new CsvError(`Unknown course name "${row.courseName}" in rules template.`);
    }

    return {
      id: uid(),
      courseId: course.id,
      tag: row.tag,
      type: row.type,
    };
  });
  const schedule = parseScheduleCsv(scheduleTemplate, PERIODS);
  const slots = schedule.rows.flatMap((row) => {
    const room = roomsByName.get(row.roomName);
    if (!room) {
      throw new CsvError(`Unknown room name "${row.roomName}" in schedule template.`);
    }

    return row.courseNames.map((courseName, period) => {
      if (!courseName) {
        return {
          id: uid(),
          roomId: room.id,
          period,
          courseId: null,
          capacity: 0,
        };
      }

      const course = coursesByName.get(courseName);
      if (!course) {
        throw new CsvError(`Unknown course name "${courseName}" in schedule template.`);
      }

      return {
        id: uid(),
        roomId: room.id,
        period,
        courseId: course.id,
        capacity: course.defaultCapacity,
      };
    });
  });

  return {
    participants,
    courses,
    rooms,
    slots,
    rules,
    schedulePeriodLabels: schedule.periodLabels,
  };
};

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    if (typeof window === "undefined") return createTemplateState();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as AppState;
    } catch {
      return createTemplateState();
    }
    return createTemplateState();
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota failures and keep the in-memory session state usable.
    }
  }, [state]);

  return [state, setState, uid] as const;
}

export { uid };
