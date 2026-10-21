import { expect, test, type Page } from '@playwright/test';

interface GameHandle {
  scene: { getScene(key: string): { sim: { status: string; strokes: unknown[] } } };
}

async function toScreen(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 854) * box.height };
}

const status = (page: Page) =>
  page.evaluate(() => (window as unknown as { __game: GameHandle }).__game.scene.getScene('Game').sim.status);

test('draw a bridge, press Go, reach the flag', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => status(page)).toBe('drawing');

  const start = await toScreen(page, 150, 560);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const p = await toScreen(page, 150 + i * 15, 560 + Math.sin((i / 12) * Math.PI) * 8);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
  const strokes = await page.evaluate(
    () => (window as unknown as { __game: GameHandle }).__game.scene.getScene('Game').sim.strokes.length,
  );
  expect(strokes).toBe(1);

  const go = await toScreen(page, 480 - 16 - 60, 854 - 16 - 26);
  await page.mouse.click(go.x, go.y);
  await expect.poll(() => status(page), { timeout: 15_000 }).toBe('won');
  await page.screenshot({ path: 'test-results/won.png' });
});
