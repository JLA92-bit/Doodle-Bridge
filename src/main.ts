import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PAPER } from './config/world';
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
    backgroundColor: PAPER.colour,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    scene: [BootScene, GameScene],
  });
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void boot();
