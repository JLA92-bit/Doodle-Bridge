import Phaser from 'phaser';

/** Nothing to download yet: all art is drawn in code. Fonts are loaded before Phaser starts. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Game');
  }
}
