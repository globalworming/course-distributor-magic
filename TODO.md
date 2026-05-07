- status: completed

- csv-first workflow is implemented
  - browser UI is read-only for data preview plus import/export/distribute actions
  - participants, courses, rooms, rules, and schedule all bootstrap from source CSV templates
  - reset-to-template replaces manual in-browser editing

- schedule and template work is implemented
  - schedule capacity is derived from `course.defaultCapacity`
  - `src/templates/courses.csv` contains 20 example courses capped at 20 places
  - `src/templates/schedule.csv` covers the full week with `Mo 1` ... `Fr 5`
  - the default weekly schedule repeats courses across different periods

- distribution behavior is implemented
  - required courses are prioritized ahead of optional preferences
  - slot capacity is respected
  - unmet required courses are reported when no feasible slot exists
  - participants avoid repeating the same course when another feasible course exists
  - repeated courses are only used as a fallback to avoid leaving a participant unassigned
  - room loads are balanced when choices are otherwise equivalent

- validation and tests are implemented
  - duplicate course names are rejected
  - schedule and rules import failures do not partially write state
  - schedule CSV round-trip is covered in Playwright
  - distribution logic is covered by direct unit tests

- ui notes are implemented
  - rules and distribution sections describe the active assignment constraints shown in the app
