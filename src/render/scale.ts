import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/world';

/**
 * The canvas is rendered at up to 2x the logical 480 px width so lines stay crisp
 * on high density phone screens. Scenes zoom their camera by this amount and
 * keep working in logical coordinates.
 */
export const RENDER_SCALE = Math.min(2, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));

/**
 * The game is a 480 x 854 notebook page. The canvas expands to fill any phone screen
 * and the camera keeps the page centred, with the desk showing around it.
 */
export function setupCamera(scene: Phaser.Scene, focusX: () => number = () => GAME_WIDTH / 2): void {
  const cam = scene.cameras.main;
  const layout = () => {
    cam.setSize(scene.scale.gameSize.width, scene.scale.gameSize.height);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(focusX(), GAME_HEIGHT / 2);
  };
  layout();
  scene.scale.on('resize', layout);
  scene.events.once('shutdown', () => scene.scale.off('resize', layout));
}

/**
 * A second camera that never scrolls: same zoom, always centred on the page. HUD objects are
 * shown only by this camera, so they stay put while the main camera pans over a wide level.
 */
export function addUiCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.add(0, 0, scene.scale.gameSize.width, scene.scale.gameSize.height, false, 'ui');
  const layout = () => {
    cam.setSize(scene.scale.gameSize.width, scene.scale.gameSize.height);
    cam.setZoom(RENDER_SCALE);
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  };
  layout();
  scene.scale.on('resize', layout);
  scene.events.once('shutdown', () => scene.scale.off('resize', layout));
  return cam;
}
