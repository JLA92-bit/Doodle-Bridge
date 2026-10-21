import { expect, test, type Page } from '@playwright/test';

interface GameHandle {
  scene: { getScene(key: string): { sim: { status: string; strokes: unknown[] } } };
}
type Win = { __game: GameHandle; __pageToClient(x: number, y: number): { x: number; y: number } };

/** Converts notebook-page coordinates (480 x 854) to screen coordinates. */
const toScreen = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => (window as unknown as Win).__pageToClient(px!, py!), [x, y]);

const sim = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as Win).__game.scene.getScene('Game').sim;
    return { status: s.status, strokes: s.strokes.length };
  });
const status = async (page: Page) => (await sim(page)).status;

test('draw a bridge, press Go, reach the flag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => status(page)).toBe('drawing');

  const points = [];
  for (let i = 0; i <= 12; i++) points.push(await toScreen(page, 150 + i * 15, 560 + Math.sin((i / 12) * Math.PI) * 8));
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  expect((await sim(page)).strokes).toBe(1);

  const go = await toScreen(page, 480 - 16 - 60, 854 - 16 - 26);
  await page.mouse.click(go.x, go.y);
  await expect.poll(() => status(page), { timeout: 25_000 }).toBe('won');
  expect(errors).toEqual([]);
});
