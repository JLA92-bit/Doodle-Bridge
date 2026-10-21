import Phaser from 'phaser';
import { COLOURS, FONT_UI } from '../config/ui';
import { css, PENCIL, registerBoil, roughTextures, roundedRectPath } from './RoughRenderer';
import { RENDER_SCALE } from './scale';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fill?: number;
  textColour?: string;
  fontSize?: number;
  /** Corner radius; half the height makes a pill or circle. */
  radius?: number;
}

const PAD = 6;

/** A hand-drawn paper button. Calls onClick on release inside the button. */
export class Button extends Phaser.GameObjects.Container {
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    private readonly onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 96;
    const h = opts.height ?? 52;
    const r = opts.radius ?? 12;
    const fill = opts.fill ?? COLOURS.buttonFill;
    const round = r >= Math.min(w, h) / 2;

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.13);
    if (round) this.shadow.fillEllipse(3, 4, w, h);
    else this.shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, r);

    const keys = roughTextures(scene, `btn-${w}x${h}-${r}-${fill}`, { x: 0, y: 0, w, h }, (rc, ctx, seed) => {
      // Solid paper fill so the button reads clearly, then a crayon hatch and pencil outline.
      ctx.fillStyle = css(fill);
      if (round) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        rc.ellipse(w / 2, h / 2, w, h, { ...PENCIL, strokeWidth: 2.4, seed });
      } else {
        const outline = roundedRectPath(0, 0, w, h, r);
        ctx.fill(new Path2D(outline));
        rc.path(outline, {
          ...PENCIL,
          strokeWidth: 2.4,
          fill: css(Phaser.Display.Color.ValueToColor(fill).darken(12).color, 0.55),
          fillStyle: 'hachure',
          hachureGap: 5,
          hachureAngle: 60,
          fillWeight: 1,
          seed,
        });
      }
    }, PAD);
    this.bg = scene.add
      .image(-w / 2 - PAD, -h / 2 - PAD, keys[0]!)
      .setOrigin(0)
      .setScale(1 / RENDER_SCALE);
    registerBoil(scene, this.bg, keys);

    this.text = scene.add
      .text(0, 1, label, {
        fontFamily: FONT_UI,
        fontSize: `${opts.fontSize ?? 26}px`,
        color: opts.textColour ?? '#3d3d44',
      })
      .setOrigin(0.5)
      .setResolution(RENDER_SCALE);
    this.add([this.shadow, this.bg, this.text]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.press(true));
    this.on('pointerout', () => this.press(false));
    this.on('pointerup', () => {
      this.press(false);
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

  private press(down: boolean): void {
    const dy = down ? 3 : 0;
    this.bg.setY(-this.height / 2 - PAD + dy);
    this.text.setY(1 + dy);
  }
}
