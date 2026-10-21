import Phaser from 'phaser';
import { DESK, GAME_HEIGHT, GAME_WIDTH } from './config/world';
import { RENDER_SCALE } from './render/scale';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

async function loadFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('32px "Patrick Hand"'),
      document.fonts.load('32px "Gloria Hallelujah"'),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
}

async function boot(): Promise<void> {
  await loadFonts();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
    backgroundColor: DESK.colour,
    // EXPAND keeps the whole 480 x 854 page visible and grows the canvas to fill the screen.
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    scene: [BootScene, GameScene],
  });
  // Hooks for automated browser tests: the game, and page coordinates to screen (CSS) coordinates.
  Object.assign(window, {
    __game: game,
    __pageToClient: (x: number, y: number) => {
      const cam = game.scene.getScenes(true)[0]?.cameras.main;
      const rect = game.canvas.getBoundingClientRect();
      if (!cam) return { x: 0, y: 0 };
      const k = rect.width / game.canvas.width;
      return { x: rect.left + (x - cam.worldView.x) * cam.zoom * k, y: rect.top + (y - cam.worldView.y) * cam.zoom * k };
    },
  });
}

void boot();
