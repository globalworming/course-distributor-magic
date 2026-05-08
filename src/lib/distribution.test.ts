import { describe, expect, it } from "vitest";
import {
  distribute,
  type Course,
  type Participant,
  type Room,
  type Rule,
  type Slot,
} from "./distribution";

const courseA: Course = { id: "course-a", name: "Course A", defaultCapacity: 1 };
const courseB: Course = { id: "course-b", name: "Course B", defaultCapacity: 2 };
const courseOptional: Course = { id: "course-c", name: "Course C", defaultCapacity: 3 };

const rooms: Room[] = [
  { id: "room-1", name: "Room 1" },
  { id: "room-2", name: "Room 2" },
];

function createSlots(): Slot[] {
  return [
    { id: "slot-a1", roomId: "room-1", period: 0, courseId: courseA.id, capacity: 1 },
    { id: "slot-c1", roomId: "room-2", period: 0, courseId: courseOptional.id, capacity: 3 },
    { id: "slot-b2", roomId: "room-1", period: 1, courseId: courseB.id, capacity: 2 },
    { id: "slot-c2", roomId: "room-2", period: 1, courseId: courseOptional.id, capacity: 3 },
  ];
}

describe("distribute", () => {
  it("places required courses before optional preferences", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: ["alpha"] }];
    const rules: Rule[] = [
      { id: "rule-1", courseId: courseA.id, tag: "alpha", type: "required" },
      { id: "rule-2", courseId: courseOptional.id, tag: "alpha", type: "optional" },
    ];

    const result = distribute(
      participants,
      [courseA, courseOptional],
      rooms,
      createSlots(),
      rules,
      2,
    );

    expect(result.assignments[0].perPeriod[0]).toBe("slot-a1");
    expect(result.assignments[0].unmetRequired).toEqual([]);
  });

  it("treats optional courses as fallback when another unique course is available", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: ["alpha"] }];
    const slots: Slot[] = [
      { id: "slot-b1", roomId: "room-1", period: 0, courseId: courseB.id, capacity: 1 },
      { id: "slot-c1", roomId: "room-2", period: 0, courseId: courseOptional.id, capacity: 1 },
    ];
    const rules: Rule[] = [
      { id: "rule-1", courseId: courseOptional.id, tag: "alpha", type: "optional" },
    ];

    const result = distribute(participants, [courseB, courseOptional], rooms, slots, rules, 1);

    expect(result.assignments[0].perPeriod).toEqual(["slot-b1"]);
  });

  it("never exceeds slot capacity", () => {
    const participants: Participant[] = [
      { id: "participant-1", name: "Ada", tags: [] },
      { id: "participant-2", name: "Bruno", tags: [] },
      { id: "participant-3", name: "Carol", tags: [] },
    ];

    const result = distribute(
      participants,
      [courseA, courseB, courseOptional],
      rooms,
      createSlots(),
      [],
      2,
    );

    for (const slot of createSlots()) {
      expect(result.loads.get(slot.id)).toBeLessThanOrEqual(slot.capacity);
    }
  });

  it("reports unmet required courses when no feasible slot exists", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: ["alpha"] }];
    const slots: Slot[] = [
      { id: "slot-c1", roomId: "room-1", period: 0, courseId: courseOptional.id, capacity: 1 },
      { id: "slot-c2", roomId: "room-1", period: 1, courseId: courseOptional.id, capacity: 1 },
    ];
    const rules: Rule[] = [{ id: "rule-1", courseId: courseA.id, tag: "alpha", type: "required" }];

    const result = distribute(participants, [courseA, courseOptional], [rooms[0]], slots, rules, 2);

    expect(result.assignments[0].unmetRequired).toEqual([courseA.id]);
  });

  it("keeps required-course loads stable when participants compete for the same slot", () => {
    const participants: Participant[] = [
      { id: "participant-1", name: "Ada", tags: ["alpha"] },
      { id: "participant-2", name: "Bruno", tags: ["alpha"] },
      { id: "participant-3", name: "Carol", tags: ["alpha"] },
    ];
    const slots: Slot[] = [
      { id: "slot-a1", roomId: "room-1", period: 0, courseId: courseA.id, capacity: 1 },
      { id: "slot-a2", roomId: "room-2", period: 1, courseId: courseA.id, capacity: 2 },
      { id: "slot-b1", roomId: "room-1", period: 1, courseId: courseB.id, capacity: 3 },
      { id: "slot-b2", roomId: "room-2", period: 0, courseId: courseB.id, capacity: 3 },
    ];
    const rules: Rule[] = [{ id: "rule-1", courseId: courseA.id, tag: "alpha", type: "required" }];

    const result = distribute(participants, [courseA, courseB], rooms, slots, rules, 2);

    expect(result.loads.get("slot-a1")).toBe(1);
    expect(result.loads.get("slot-a2")).toBe(2);
    expect(result.assignments.every((assignment) => assignment.unmetRequired.length === 0)).toBe(
      true,
    );
  });

  it("avoids repeating a course when another feasible course exists", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: ["alpha"] }];
    const slots: Slot[] = [
      { id: "slot-a1", roomId: "room-1", period: 0, courseId: courseA.id, capacity: 2 },
      { id: "slot-a2", roomId: "room-1", period: 1, courseId: courseA.id, capacity: 2 },
      { id: "slot-b2", roomId: "room-2", period: 1, courseId: courseB.id, capacity: 2 },
    ];
    const rules: Rule[] = [{ id: "rule-1", courseId: courseA.id, tag: "alpha", type: "optional" }];

    const result = distribute(participants, [courseA, courseB], rooms, slots, rules, 2);
    const assignedCourseIds = result.assignments[0].perPeriod.map(
      (slotId) => slots.find((slot) => slot.id === slotId)?.courseId,
    );

    expect(new Set(assignedCourseIds).size).toBe(2);
  });

  it("uses an optional course after other unique courses fill up", () => {
    const participants: Participant[] = [
      { id: "participant-1", name: "Ada", tags: ["beta"] },
      { id: "participant-2", name: "Bruno", tags: ["alpha"] },
    ];
    const slots: Slot[] = [
      { id: "slot-b1", roomId: "room-1", period: 0, courseId: courseB.id, capacity: 1 },
      { id: "slot-c1", roomId: "room-2", period: 0, courseId: courseOptional.id, capacity: 1 },
    ];
    const rules: Rule[] = [
      { id: "rule-1", courseId: courseB.id, tag: "beta", type: "required" },
      { id: "rule-2", courseId: courseOptional.id, tag: "alpha", type: "optional" },
    ];

    const result = distribute(participants, [courseB, courseOptional], rooms, slots, rules, 1);

    expect(
      result.assignments.find((assignment) => assignment.participantId === "participant-1"),
    ).toMatchObject({ perPeriod: ["slot-b1"] });
    expect(
      result.assignments.find((assignment) => assignment.participantId === "participant-2"),
    ).toMatchObject({ perPeriod: ["slot-c1"] });
  });

  it("uses an optional course when no other unique course remains for the participant", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: ["alpha"] }];
    const slots: Slot[] = [
      { id: "slot-b1", roomId: "room-1", period: 0, courseId: courseB.id, capacity: 1 },
      { id: "slot-b2", roomId: "room-1", period: 1, courseId: courseB.id, capacity: 1 },
      { id: "slot-c2", roomId: "room-2", period: 1, courseId: courseOptional.id, capacity: 1 },
    ];
    const rules: Rule[] = [
      { id: "rule-1", courseId: courseOptional.id, tag: "alpha", type: "optional" },
    ];

    const result = distribute(participants, [courseB, courseOptional], rooms, slots, rules, 2);
    const assignedCourseIds = result.assignments[0].perPeriod.map(
      (slotId) => slots.find((slot) => slot.id === slotId)?.courseId,
    );

    expect(assignedCourseIds).toEqual([courseB.id, courseOptional.id]);
  });

  it("keeps participants in a course when only a repeated course is available", () => {
    const participants: Participant[] = [{ id: "participant-1", name: "Ada", tags: [] }];
    const slots: Slot[] = [
      { id: "slot-a1", roomId: "room-1", period: 0, courseId: courseA.id, capacity: 2 },
      { id: "slot-a2", roomId: "room-1", period: 1, courseId: courseA.id, capacity: 2 },
    ];

    const result = distribute(participants, [courseA], [rooms[0]], slots, [], 2);

    expect(result.assignments[0].perPeriod).toEqual(["slot-a1", "slot-a2"]);
    expect(result.assignments[0].notes).toContain(
      "Period 2: repeated course to avoid an empty assignment",
    );
  });

  it("balances equivalent room choices across participants", () => {
    const participants: Participant[] = [
      { id: "participant-1", name: "Ada", tags: [] },
      { id: "participant-2", name: "Bruno", tags: [] },
      { id: "participant-3", name: "Carol", tags: [] },
      { id: "participant-4", name: "Dina", tags: [] },
    ];
    const balancedCourse: Course = { id: "course-balanced", name: "Balanced", defaultCapacity: 4 };
    const slots: Slot[] = [
      { id: "slot-r1", roomId: "room-1", period: 0, courseId: balancedCourse.id, capacity: 2 },
      { id: "slot-r2", roomId: "room-2", period: 0, courseId: balancedCourse.id, capacity: 2 },
    ];

    const result = distribute(participants, [balancedCourse], rooms, slots, [], 1);

    expect(result.loads.get("slot-r1")).toBe(2);
    expect(result.loads.get("slot-r2")).toBe(2);
  });
});
