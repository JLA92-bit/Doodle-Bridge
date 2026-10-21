import Phaser from 'phaser';
import { COLOURS, FONT_UI } from '../config/ui';
import { RENDER_SCALE } from './scale';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fill?: number;
  textColour?: string;
  fontSize?: number;
}

/** A doodled paper button. Calls onClick on release inside the button. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    private readonly onClick: () => void,
    private readonly opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 96;
    const h = opts.height ?? 52;
    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, 1, label, {
        fontFamily: FONT_UI,
        fontSize: `${opts.fontSize ?? 26}px`,
        color: opts.textColour ?? '#3d3d44',
      })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    this.add([this.bg, this.text]);
    this.setSize(w, h);
    this.draw(false);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.draw(true));
    this.on('pointerout', () => this.draw(false));
    this.on('pointerup', () => {
      this.draw(false);
      if (this.enabled) this.onClick();
    });
    scene.add.existing(this);
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.4);
    return this;
  }

  private draw(pressed: boolean): void {
    const w = this.width;
    const h = this.height;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, 12);
    const dy = pressed ? 3 : 0;
    g.fillStyle(this.opts.fill ?? COLOURS.buttonFill, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + dy, w, h, 12);
    g.lineStyle(2.5, COLOURS.graphite, 1);
    g.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h, 12);
    this.text.setY(1 + dy);
  }
}
