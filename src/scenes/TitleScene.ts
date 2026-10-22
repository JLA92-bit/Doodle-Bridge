import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { getVehicle } from '../config/vehicles';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/world';
import { save } from '../game/Save';
import { Button } from '../render/Button';
import { boilImage, css, PENCIL, roughTextures } from '../render/RoughRenderer';
import { addPanel, addStar, addText, goTo, setupScreen } from '../render/ui';
import { addVehiclePicture } from '../render/VehicleRenderer';

/** Notebook cover: big Play button, daily challenge card, total stars. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    setupScreen(this, false);
    this.drawCover();

    // Title label stuck on the cover.
    addPanel(this, { x: 50, y: 90, w: 380, h: 300 }, 0xfffdf6);
    addText(this, GAME_WIDTH / 2, 185, 'Doodle\nBridge', 56, { title: true }).setLineSpacing(-6);
    addText(this, GAME_WIDTH / 2, 300, 'draw it - drive it - snap it', 22, { colour: '#6b6b72' });

    // A little doodle bridge with the paper car on it.
    const bridge = { x: 120, y: 330, w: 240, h: 40 };
    const keys = roughTextures(this, 'title-bridge', bridge, (rc, _ctx, seed) => {
      rc.curve(
        [
          [120, 352],
          [180, 364],
          [240, 367],
          [300, 364],
          [360, 352],
        ],
        { ...PENCIL, strokeWidth: 3.5, seed },
      );
      rc.circle(120, 352, 9, { ...PENCIL, fill: '#c9c4ba', fillStyle: 'solid', seed: seed + 1 });
      rc.circle(360, 352, 9, { ...PENCIL, fill: '#c9c4ba', fillStyle: 'solid', seed: seed + 2 });
    });
    boilImage(this, keys, bridge);
    const car = addVehiclePicture(this, getVehicle('paperCar'), 200, 340, 0.8);
    this.tweens.add({ targets: car, x: 280, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    new Button(this, GAME_WIDTH / 2, 470, 'Play', () => this.play(), {
      width: 220,
      height: 84,
      radius: 22,
      fill: 0xfff1a8,
      fontSize: 46,
    });

    // Total stars.
    const stars = save().totalStars();
    addStar(this, GAME_WIDTH / 2 - 34, 560, true, 18);
    addText(this, GAME_WIDTH / 2 + 4, 560, `${stars}`, 30, { colour: '#fffdf6', origin: 0 }).setOrigin(0, 0.5);

    // Daily challenge card (the mode arrives in phase 7).
    addPanel(this, { x: 70, y: 620, w: 340, h: 120 }, 0xfbf7ea, 0x3c8dde);
    addText(this, GAME_WIDTH / 2, 658, 'Daily Challenge', 30, { title: true });
    addText(this, GAME_WIDTH / 2, 705, 'Coming soon - same course for everyone, every day', 18, {
      colour: '#6b6b72',
    }).setWordWrapWidth(300);

    this.input.once('pointerdown', () => Sfx.unlock());
  }

  private play(): void {
    Sfx.unlock();
    Sfx.tap();
    goTo(this, 'NotebookSelect');
  }

  /** A hard notebook cover: blue card with hatching, a spine band and corner wear. */
  private drawCover(): void {
    const box = { x: 0, y: 0, w: GAME_WIDTH, h: GAME_HEIGHT };
    const keys = roughTextures(this, 'title-cover', box, (rc, ctx, seed) => {
      ctx.fillStyle = css(0x3a6fb8);
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      rc.rectangle(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8, {
        ...PENCIL,
        stroke: '#1f3558',
        strokeWidth: 3,
        fill: 'rgba(25,45,90,0.35)',
        fillStyle: 'cross-hatch',
        hachureGap: 14,
        fillWeight: 1,
        seed,
      });
      // Spine band down the left edge.
      ctx.fillStyle = css(0x2b5490);
      ctx.fillRect(0, 0, 34, GAME_HEIGHT);
      rc.line(34, 0, 34, GAME_HEIGHT, { ...PENCIL, stroke: '#1f3558', strokeWidth: 2.4, seed: seed + 1 });
      // Doodles in the corners, like a bored student drew them.
      rc.circle(400, 800, 60, { stroke: 'rgba(255,255,255,0.55)', strokeWidth: 2, roughness: 2, seed: seed + 2 });
      rc.linearPath(
        [
          [70, 790],
          [100, 760],
          [130, 790],
          [160, 760],
          [190, 790],
        ],
        { stroke: 'rgba(255,255,255,0.55)', strokeWidth: 2, roughness: 1.6, seed: seed + 3 },
      );
      rc.polygon(
        [
          [420, 60],
          [430, 85],
          [455, 88],
          [436, 104],
          [442, 130],
          [420, 116],
          [398, 130],
          [404, 104],
          [385, 88],
          [410, 85],
        ],
        { stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2, roughness: 1.4, seed: seed + 4 },
      );
    }, 0, 1);
    boilImage(this, keys, box, 0).setDepth(-50);
  }
}
