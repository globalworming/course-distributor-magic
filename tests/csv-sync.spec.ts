import { expect, test, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const storageKey = "course-distributor-v7";

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
  expect(participantsDownload.content).toContain('"Alice","eng"');
  expect(participantsDownload.content).toContain('"Willa","eng"');
  expect(participantsDownload.content).toContain('"Gia",""');

  const coursesDownload = await captureCsvExport(page, "courses-export-csv");
  expect(coursesDownload.filename).toBe("courses.csv");
  expect(coursesDownload.content).toBe(
    '"name","defaultCapacity"\n"English Basics","12"\n"HSU Safety","20"\n"Math 101","15"\n"Teamwork","18"\n"Fire Drill","25"',
  );

  const roomsDownload = await captureCsvExport(page, "rooms-export-csv");
  expect(roomsDownload.filename).toBe("rooms.csv");
  expect(roomsDownload.content).toBe('"name"\n"Room 1"\n"Room 2"\n"Room 3"\n"Room 4"\n"Room 5"');

  await expect(scheduleTable.getByText("English Basics")).toHaveCount(5);
  await expect(scheduleTable.getByText("HSU Safety")).toHaveCount(5);
  await expect(rulesTable.getByText("English Basics")).toBeVisible();
  await expect(rulesTable.getByText("optional")).toBeVisible();
  await expect(rulesTable.getByRole("cell", { name: "eng", exact: true })).toBeVisible();
  await expect(
    scheduleTable.getByRole("columnheader", { name: "Mo 11:15 - Mo 12-15" }),
  ).toBeVisible();
  await expect(scheduleTable.getByRole("columnheader", { name: "Mi 12:00 - 13:00" })).toBeVisible();

  const initialScheduleDownload = await captureCsvExport(page, "schedule-export-csv");
  expect(initialScheduleDownload.filename).toBe("schedule.csv");
  expect(initialScheduleDownload.content).toBe(
    '"roomName","Mo 11:15 - Mo 12-15","Mo 12:45 - Mo 13-45","Di 12:45 - Di 13-45","Di 13:45 - Di 14:45","Mi 12:00 - 13:00"\n"Room 1","English Basics","HSU Safety","Math 101","Teamwork","Fire Drill"\n"Room 2","HSU Safety","Math 101","Teamwork","Fire Drill","English Basics"\n"Room 3","Math 101","Teamwork","Fire Drill","English Basics","HSU Safety"\n"Room 4","Teamwork","Fire Drill","English Basics","HSU Safety","Math 101"\n"Room 5","Fire Drill","English Basics","HSU Safety","Math 101","Teamwork"',
  );

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
  await expect(scheduleTable.getByText("Logistics 101")).toHaveCount(4);
  await expect(scheduleTable.getByText("Safety Drill")).toHaveCount(3);

  await page.getByRole("button", { name: "Distribute" }).click();
  await expect(page.getByRole("columnheader", { name: "Mo 11:15 - Mo 12-15" })).toHaveCount(2);
  await expect(page.getByRole("columnheader", { name: "Mi 12:00 - 13:00" })).toHaveCount(2);

  const scheduleDownload = await captureCsvExport(page, "schedule-export-csv");
  expect(scheduleDownload.filename).toBe("schedule.csv");
  expect(scheduleDownload.content).toBe(
    '"roomName","Mo 11:15 - Mo 12-15","Mo 12:45 - Mo 13-45","Di 12:45 - Di 13-45","Di 13:45 - Di 14:45","Mi 12:00 - 13:00"\n"Lab A","Logistics 101","Safety Drill","","Logistics 101","Safety Drill"\n"Workshop B","Safety Drill","","Logistics 101","","Logistics 101"',
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
  await expect(scheduleTable.getByText("Safety Drill")).toHaveCount(3);
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
