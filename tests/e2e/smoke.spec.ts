import { expect, test, type Page } from '@playwright/test';

type SceneHandle = { sim?: { status: string; strokes: unknown[] }; results?: unknown[]; sys: { isActive(): boolean } };
interface Win {
  __game: { scene: { getScene(key: string): SceneHandle } };
  __pageToClient(x: number, y: number): { x: number; y: number };
}

/** Converts notebook-page coordinates (480 x 854) to screen coordinates. */
const toScreen = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => (window as unknown as Win).__pageToClient(px!, py!), [x, y]);

const active = (page: Page, key: string) =>
  page.evaluate((k) => (window as unknown as Win).__game?.scene.getScene(k)?.sys.isActive() ?? false, key);

const game = (page: Page) =>
  page.evaluate(() => {
    const sc = (window as unknown as Win).__game.scene.getScene('Game');
    return { status: sc.sim!.status, strokes: sc.sim!.strokes.length, results: sc.results!.length };
  });

async function tap(page: Page, x: number, y: number): Promise<void> {
  const p = await toScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

test('title, pick a level, draw a bridge, reach the flag, see results', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect.poll(() => active(page, 'Title')).toBe(true);

  await tap(page, 240, 470); // Play
  await expect.poll(() => active(page, 'NotebookSelect')).toBe(true);
  await tap(page, 240, 590); // Open notebook 1
  await expect.poll(() => active(page, 'LevelSelect')).toBe(true);
  await tap(page, 110, 230); // Level 1
  await expect.poll(() => active(page, 'Game')).toBe(true);
  await expect.poll(async () => (await game(page)).status).toBe('drawing');

  const points = [];
  for (let i = 0; i <= 12; i++) points.push(await toScreen(page, 150 + i * 15, 560 + Math.sin((i / 12) * Math.PI) * 8));
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  expect((await game(page)).strokes).toBe(1);

  await tap(page, 480 - 16 - 60, 854 - 16 - 26); // Go
  await expect.poll(async () => (await game(page)).status, { timeout: 25_000 }).toBe('won');
  await expect.poll(async () => (await game(page)).results).toBeGreaterThan(0);
  const saved = await page.evaluate(() => localStorage.getItem('doodle-bridge.save'));
  expect(saved).toContain('nb1-01');
  expect(errors).toEqual([]);
});
