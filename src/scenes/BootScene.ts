import Phaser from 'phaser';
import { getLevel } from '../game/Levels';

/**
 * Nothing to download: all art is drawn in code and fonts load before Phaser starts.
 * Routes to the title screen, or (for development) ?editor=1 opens the level editor
 * and ?play=nb1-02 jumps straight into a level.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editor') === '1') this.scene.start('Editor');
    else if (getLevel(params.get('play') ?? '')) this.scene.start('Game', { levelId: params.get('play') });
    else this.scene.start('Title');
  }
}
