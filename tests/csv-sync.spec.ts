import { expect, test, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const storageKey = "course-distributor-v8";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();

    const blobUrls = new Map<string, Blob>();
    let blobCounter = 0;
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const originalCreateElement = Document.prototype.createElement;

    type CapturedDownload = {
      filename: string;
      content: string;
    };

    (window as Window & { __capturedDownloads: CapturedDownload[] }).__capturedDownloads = [];

    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) {
        const url = `blob:playwright-capture-${(blobCounter += 1)}`;
        blobUrls.set(url, object);
        return url;
      }
      return originalCreateObjectUrl(object);
    };

    URL.revokeObjectURL = (url: string) => {
      if (blobUrls.has(url)) {
        blobUrls.delete(url);
        return;
      }
      originalRevokeObjectUrl(url);
    };

    Document.prototype.createElement = function createElement(
      tagName: string,
      options?: ElementCreationOptions,
    ) {
      const element = originalCreateElement.call(this, tagName, options);

      if (tagName.toLowerCase() === "a") {
        const anchor = element as HTMLAnchorElement;
        const originalAnchorClick = anchor.click.bind(anchor);

        anchor.click = () => {
          const blob = blobUrls.get(anchor.href);
          if (blob && anchor.download) {
            void blob.text().then((content) => {
              (
                window as Window & {
                  __capturedDownloads: CapturedDownload[];
                }
              ).__capturedDownloads.push({
                filename: anchor.download,
                content,
              });
            });
            return;
          }
          originalAnchorClick();
        };
      }

      return element;
    };
  });

  await page.goto("/");
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, storageKey);
});

test("downloads templates, reimports CSV data, and round-trips the schedule grid", async ({
  page,
}) => {
  const participantsTable = page.getByTestId("participants-table");
  const coursesTable = page.getByTestId("courses-table");
  const roomsTable = page.getByTestId("rooms-table");
  const rulesTable = page.getByTestId("rules-table");
  const scheduleTable = page.getByTestId("schedule-table");
  const distributionTable = page.getByTestId("distribution-table");
  const distributionIssuesTable = page.getByTestId("distribution-issues-table");
  const rulesDownload = await captureCsvExport(page, "rules-export-csv");
  expect(rulesDownload.filename).toBe("rules.csv");
  expect(rulesDownload.content).toBe(
    '"courseName","type","tag"\n"English Basics","optional","eng"',
  );

  const participantsDownload = await captureCsvExport(page, "participants-export-csv");
  expect(participantsDownload.filename).toBe("participants.csv");
  const participantRows = participantsDownload.content.split("\n");
  expect(participantRows).toHaveLength(34);
  expect(participantRows[0]).toBe('"name","tags"');
  expect(participantsDownload.content).toContain('"Alice",""');
  expect(participantsDownload.content).toContain('"Bob","eng"');
  expect(participantsDownload.content).toContain('"Felix","eng"');
  expect(participantsDownload.content).toContain('"Gia",""');

  const coursesDownload = await captureCsvExport(page, "courses-export-csv");
  expect(coursesDownload.filename).toBe("courses.csv");
  const courseRows = coursesDownload.content.split("\n");
  expect(courseRows).toHaveLength(21);
  expect(courseRows[0]).toBe('"name","defaultCapacity"');
  expect(coursesDownload.content).toContain('"English Basics","20"');
  expect(coursesDownload.content).toContain('"Data Entry","20"');

  const roomsDownload = await captureCsvExport(page, "rooms-export-csv");
  expect(roomsDownload.filename).toBe("rooms.csv");
  expect(roomsDownload.content).toBe('"name"\n"Room 1"\n"Room 2"\n"Room 3"\n"Room 4"\n"Room 5"');

  await expect(scheduleTable.getByText("English Basics").first()).toBeVisible();
  await expect(scheduleTable.getByText("HSU Safety").first()).toBeVisible();
  await expect(scheduleTable.getByText("Data Entry").first()).toBeVisible();
  await expect(rulesTable.getByText("English Basics")).toBeVisible();
  await expect(rulesTable.getByText("optional")).toBeVisible();
  await expect(rulesTable.getByRole("cell", { name: "eng", exact: true })).toBeVisible();
  await expect(scheduleTable.getByRole("columnheader", { name: "Mo 1" })).toBeVisible();
  await expect(scheduleTable.getByRole("columnheader", { name: "Fr 5" })).toBeVisible();

  const initialScheduleDownload = await captureCsvExport(page, "schedule-export-csv");
  expect(initialScheduleDownload.filename).toBe("schedule.csv");
  const initialScheduleRows = initialScheduleDownload.content.split("\n");
  expect(initialScheduleRows).toHaveLength(6);
  expect(initialScheduleRows[0]).toContain('"Mo 1"');
  expect(initialScheduleRows[0]).toContain('"Fr 5"');
  expect(initialScheduleDownload.content).toContain('"Room 1","English Basics","HSU Safety"');
  expect(initialScheduleDownload.content).toContain('"Room 5","First Aid","Math 101"');

  await page
    .getByTestId("participants-import-csv-input")
    .setInputFiles(join(fixturesDir, "participants-import.csv"));
  await page
    .getByTestId("courses-import-csv-input")
    .setInputFiles(join(fixturesDir, "courses-import.csv"));
  await page
    .getByTestId("rooms-import-csv-input")
    .setInputFiles(join(fixturesDir, "rooms-import.csv"));
  await page
    .getByTestId("schedule-import-csv-input")
    .setInputFiles(join(fixturesDir, "schedule-valid.csv"));
  await page
    .getByTestId("rules-import-csv-input")
    .setInputFiles(join(fixturesDir, "rules-valid.csv"));

  await expect(participantsTable.getByText("Ada Lovelace")).toBeVisible();
  await expect(participantsTable.getByText("Bruno Mars")).toBeVisible();
  await expect(coursesTable.getByText("Logistics 101")).toBeVisible();
  await expect(coursesTable.getByText("Safety Drill")).toBeVisible();
  await expect(roomsTable.getByText("Lab A")).toBeVisible();
  await expect(roomsTable.getByText("Workshop B")).toBeVisible();
  await expect(rulesTable.getByText("alpha")).toBeVisible();
  await expect(rulesTable.getByText("ops")).toBeVisible();
  await expect(scheduleTable.getByText("Logistics 101").first()).toBeVisible();
  await expect(scheduleTable.getByText("Safety Drill").first()).toBeVisible();
  await expect(page.getByText("prefers one visit per course for each participant")).toBeVisible();

  await page.getByRole("button", { name: "Distribute" }).click();
  await expect(distributionTable.getByRole("columnheader", { name: "Period" })).toBeVisible();
  await expect(distributionTable.getByRole("columnheader", { name: "Room" })).toBeVisible();
  await expect(distributionTable.getByRole("columnheader", { name: "Course" })).toBeVisible();
  await expect(distributionTable.getByRole("columnheader", { name: "Participants" })).toBeVisible();
  await expect(distributionTable).toContainText("Lab A");
  await expect(distributionTable).toContainText("Logistics 101");
  await expect(distributionTable).toContainText("Ada Lovelace");
  await expect(distributionTable).toContainText("Bruno Mars");
  await expect(distributionIssuesTable).toContainText(
    "repeated course to avoid an empty assignment",
  );

  const distributionDownload = await captureCsvExport(page, "distribution-export-csv");
  expect(distributionDownload.filename).toBe("distribution.csv");
  const distributionRows = distributionDownload.content.split("\n");
  expect(distributionRows[0]).toBe('"period","room","course","participants"');
  expect(distributionRows[1]).toContain('"Mo 1"');
  expect(distributionRows[1]).toContain('"Lab A"');
  expect(distributionRows[1]).toContain('"Logistics 101"');
  expect(distributionDownload.content).toContain("Ada Lovelace");
  expect(distributionDownload.content).toContain("Bruno Mars");

  const scheduleDownload = await captureCsvExport(page, "schedule-export-csv");
  expect(scheduleDownload.filename).toBe("schedule.csv");
  const importedScheduleRows = scheduleDownload.content.split("\n");
  expect(importedScheduleRows).toHaveLength(3);
  expect(importedScheduleRows[0]).toContain('"Mo 1"');
  expect(importedScheduleRows[0]).toContain('"Fr 5"');
  expect(scheduleDownload.content).toContain(
    '"Lab A","Logistics 101","Safety Drill","","Logistics 101","Safety Drill"',
  );
});

test("surfaces CSV validation errors without partial state writes", async ({ page }) => {
  const coursesTable = page.getByTestId("courses-table");
  const rulesTable = page.getByTestId("rules-table");
  const scheduleTable = page.getByTestId("schedule-table");

  await page
    .getByTestId("courses-import-csv-input")
    .setInputFiles(join(fixturesDir, "courses-import.csv"));
  await page
    .getByTestId("rooms-import-csv-input")
    .setInputFiles(join(fixturesDir, "rooms-import.csv"));
  await page
    .getByTestId("schedule-import-csv-input")
    .setInputFiles(join(fixturesDir, "schedule-valid.csv"));
  await page
    .getByTestId("rules-import-csv-input")
    .setInputFiles(join(fixturesDir, "rules-valid.csv"));

  await expect(coursesTable.getByText("Logistics 101")).toBeVisible();
  await expect(rulesTable.getByText("alpha")).toBeVisible();
  await expect(scheduleTable.getByText("Ghost Room")).toHaveCount(0);

  await page
    .getByTestId("courses-import-csv-input")
    .setInputFiles(join(fixturesDir, "courses-duplicate.csv"));
  await expect(
    page.getByText('Duplicate course name "Logistics 101" in courses CSV.'),
  ).toBeVisible();
  await expect(coursesTable.getByText("Safety Drill")).toBeVisible();

  await page
    .getByTestId("rules-import-csv-input")
    .setInputFiles(join(fixturesDir, "rules-invalid.csv"));
  await expect(
    page.getByText('Unknown course name "Nonexistent Course" in rules CSV.'),
  ).toBeVisible();
  await expect(rulesTable.getByText("alpha")).toBeVisible();

  await page
    .getByTestId("schedule-import-csv-input")
    .setInputFiles(join(fixturesDir, "schedule-invalid.csv"));
  await expect(page.getByText('Unknown room name "Ghost Room" in schedule CSV.')).toBeVisible();
  await expect(scheduleTable.getByText("Lab A")).toBeVisible();
  await expect(scheduleTable.getByText("Safety Drill").first()).toBeVisible();
});

async function captureCsvExport(page: Page, testId: string) {
  const capturedCount = await page.evaluate(
    () =>
      (
        window as Window & {
          __capturedDownloads: Array<{ filename: string; content: string }>;
        }
      ).__capturedDownloads.length,
  );

  await page.getByTestId(testId).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __capturedDownloads: Array<{ filename: string; content: string }>;
            }
          ).__capturedDownloads.length,
      ),
    )
    .toBe(capturedCount + 1);

  return page.evaluate(
    (index) =>
      (
        window as Window & {
          __capturedDownloads: Array<{ filename: string; content: string }>;
        }
      ).__capturedDownloads[index],
    capturedCount,
  );
}
