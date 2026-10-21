import type Phaser from 'phaser';

/**
 * The canvas is rendered at up to 2x the logical 480 px width so lines stay crisp
 * on high density phone screens. Scenes zoom their camera by this amount and
 * keep working in logical coordinates.
 */
export const RENDER_SCALE = Math.min(2, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));

export function setupCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(RENDER_SCALE);
}
