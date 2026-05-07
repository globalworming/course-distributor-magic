import { expect, test, type Locator, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const storageKey = "course-distributor-v2";

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
        const url = `blob:playwright-capture-${blobCounter += 1}`;
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

    Document.prototype.createElement = function createElement(tagName: string, options?: ElementCreationOptions) {
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

test("downloads and reimports CSV data for every editable table", async ({ page }) => {
  const participantsTable = page.getByTestId("participants-table");
  const coursesTable = page.getByTestId("courses-table");
  const roomsTable = page.getByTestId("rooms-table");
  const rulesTable = page.getByTestId("rules-table");

  const participantsDownload = await captureCsvExport(page, "participants-export-csv");
  expect(participantsDownload.filename).toBe("participants.csv");
  expect(participantsDownload.content).toContain('"name","tags"');

  await page
    .getByTestId("participants-import-csv-input")
    .setInputFiles(join(fixturesDir, "participants-import.csv"));

  await expect(participantsTable.locator("tbody tr")).toHaveCount(2);
  await expect(inputWithValue(participantsTable, "Ada Lovelace")).toBeVisible();
  await expect(inputWithValue(participantsTable, "Bruno Mars")).toBeVisible();
  await expect(inputWithValue(participantsTable, "Alice")).toHaveCount(0);

  const coursesDownload = await captureCsvExport(page, "courses-export-csv");
  expect(coursesDownload.filename).toBe("courses.csv");
  expect(coursesDownload.content).toContain('"name","defaultCapacity"');

  await page
    .getByTestId("courses-import-csv-input")
    .setInputFiles(join(fixturesDir, "courses-import.csv"));

  await expect(coursesTable.locator("tbody tr")).toHaveCount(2);
  await expect(inputWithValue(coursesTable, "Logistics 101")).toBeVisible();
  await expect(inputWithValue(coursesTable, "Safety Drill")).toBeVisible();
  await expect(inputWithValue(coursesTable, "English Basics")).toHaveCount(0);

  const roomsDownload = await captureCsvExport(page, "rooms-export-csv");
  expect(roomsDownload.filename).toBe("rooms.csv");
  expect(roomsDownload.content).toContain('"name"');

  await page
    .getByTestId("rooms-import-csv-input")
    .setInputFiles(join(fixturesDir, "rooms-import.csv"));

  await expect(roomsTable.locator("tbody tr")).toHaveCount(2);
  await expect(inputWithValue(roomsTable, "Lab A")).toBeVisible();
  await expect(inputWithValue(roomsTable, "Workshop B")).toBeVisible();
  await expect(inputWithValue(roomsTable, "Room 1")).toHaveCount(0);

  const rulesDownload = await captureCsvExport(page, "rules-export-csv");
  expect(rulesDownload.filename).toBe("rules.csv");
  expect(rulesDownload.content).toContain('"courseName","type","tag"');

  await page
    .getByTestId("rules-import-csv-input")
    .setInputFiles(join(fixturesDir, "rules-invalid.csv"));

  await expect(
    page.getByText('Unknown course name "Nonexistent Course" in rules CSV.'),
  ).toBeVisible();
  await expect(rulesTable.locator("tbody tr")).toHaveCount(2);

  await page
    .getByTestId("rules-import-csv-input")
    .setInputFiles(join(fixturesDir, "rules-valid.csv"));

  await expect(rulesTable.locator("tbody tr")).toHaveCount(2);
  await expect(inputWithValue(rulesTable, "alpha")).toBeVisible();
  await expect(inputWithValue(rulesTable, "ops")).toBeVisible();
  await expect(
    page.getByText('Unknown course name "Nonexistent Course" in rules CSV.'),
  ).toHaveCount(0);
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

function inputWithValue(scope: Page | Locator, value: string) {
  return scope.locator(`input[value=${JSON.stringify(value)}]`);
}
