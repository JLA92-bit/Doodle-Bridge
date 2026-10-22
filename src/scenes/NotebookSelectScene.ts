import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { LEVELS_PER_NOTEBOOK, NOTEBOOKS, type NotebookConfig } from '../config/notebooks';
import { GAME_WIDTH } from '../config/world';
import { notebookStars, notebookUnlocked } from '../game/Progress';
import { save } from '../game/Save';
import { Button } from '../render/Button';
import { css, PENCIL, registerBoil, roughTextures, roundedRectPath } from '../render/RoughRenderer';
import { RENDER_SCALE } from '../render/scale';
import { addLock, addStar, addText, goTo, setupScreen } from '../render/ui';

const COVER = { x: 60, y: 150, w: 360, h: 500 };
const SWIPE_PX = 50;

/** Pick a notebook: covers flip like pages; locked ones show how many stars they need. */
export class NotebookSelectScene extends Phaser.Scene {
  private index = 0;
  private cover: Phaser.GameObjects.Container | null = null;
  private dots!: Phaser.GameObjects.Graphics;
  private flipping = false;

  constructor() {
    super('NotebookSelect');
  }

  create(): void {
    setupScreen(this);
    this.index = Phaser.Math.Clamp((this.registry.get('notebook') as number | undefined) ?? 1, 1, NOTEBOOKS.length) - 1;
    this.flipping = false;
    this.cover = null;

    new Button(this, 66, 40, 'Back', () => goTo(this, 'Title'), { width: 96, height: 46, fontSize: 24 });
    addText(this, GAME_WIDTH / 2 + 30, 40, 'Notebooks', 36, { title: true });
    const total = save().totalStars();
    addStar(this, GAME_WIDTH - 72, 100, true, 14);
    addText(this, GAME_WIDTH - 56, 100, `${total}`, 24).setOrigin(0, 0.5);

    new Button(this, 30, COVER.y + COVER.h / 2, '<', () => this.flip(-1), { width: 44, height: 72, radius: 14, fontSize: 32 }).setDepth(5);
    new Button(this, GAME_WIDTH - 30, COVER.y + COVER.h / 2, '>', () => this.flip(1), { width: 44, height: 72, radius: 14, fontSize: 32 }).setDepth(5);
    this.dots = this.add.graphics();

    // Tapping the cover opens the notebook (or wiggles it if locked).
    const zone = this.add.zone(COVER.x, COVER.y, COVER.w, COVER.h).setOrigin(0).setDepth(-1).setInteractive();
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.upX - p.downX) > SWIPE_PX * RENDER_SCALE || this.flipping) return;
      const nb = NOTEBOOKS[this.index]!;
      if (notebookUnlocked(save(), nb.id)) this.openNotebook(nb);
      else {
        Sfx.tap();
        this.tweens.add({
          targets: this.cover,
          angle: { from: -2, to: 2 },
          duration: 60,
          yoyo: true,
          repeat: 2,
          onComplete: () => this.cover?.setAngle(0),
        });
      }
    });

    // Swipe left or right anywhere to flip.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dx = p.upX - p.downX;
      if (Math.abs(dx) > SWIPE_PX * RENDER_SCALE && Math.abs(dx) > Math.abs(p.upY - p.downY)) this.flip(dx < 0 ? 1 : -1);
    });

    this.showCover();
  }

  private flip(dir: number): void {
    const next = this.index + dir;
    if (this.flipping || next < 0 || next >= NOTEBOOKS.length) return;
    this.flipping = true;
    Sfx.tap();
    const old = this.cover!;
    this.tweens.add({
      targets: old,
      scaleX: 0,
      x: GAME_WIDTH / 2 + (dir > 0 ? -60 : 60),
      duration: 110,
      ease: 'Sine.easeIn',
      onComplete: () => {
        old.destroy();
        this.index = next;
        this.registry.set('notebook', next + 1);
        const fresh = this.showCover();
        fresh.setScale(0, 1).setX(GAME_WIDTH / 2 + (dir > 0 ? 60 : -60));
        this.tweens.add({
          targets: fresh,
          scaleX: 1,
          x: GAME_WIDTH / 2,
          duration: 140,
          ease: 'Sine.easeOut',
          onComplete: () => (this.flipping = false),
        });
      },
    });
  }

  /** Builds the cover for the current notebook, centred on x so it can flip around its spine. */
  private showCover(): Phaser.GameObjects.Container {
    const nb = NOTEBOOKS[this.index]!;
    const s = save();
    const open = notebookUnlocked(s, nb.id);
    const cx = GAME_WIDTH / 2;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const ox = -COVER.w / 2;

    const keys = coverTextures(this, nb, open);
    const img = this.add.image(ox - 6, -6, keys[0]!).setOrigin(0).setScale(1 / RENDER_SCALE);
    registerBoil(this, img, keys);
    parts.push(img);

    const ink = open ? '#3d3d44' : '#6b6b72';
    parts.push(
      addText(this, 0, 92, `Notebook ${nb.id}`, 24, { colour: ink }),
      fitWidth(addText(this, 0, 150, nb.title, 44, { title: true, colour: ink }), COVER.w - 100),
      addText(this, 0, 222, nb.mechanic, 24, { colour: '#6b6b72' }),
    );
    if (open) {
      parts.push(
        addStar(this, -40, 300, true, 20),
        addText(this, -12, 300, `${notebookStars(s, nb.id)} / ${LEVELS_PER_NOTEBOOK * 3}`, 30).setOrigin(0, 0.5),
        addText(this, 0, 370, `Finish it to unlock\n${nb.reward}`, 22, { colour: '#6b6b72' }),
      );
      const openBtn = new Button(this, 0, 440, 'Open', () => this.openNotebook(nb), {
        width: 170,
        height: 62,
        fill: 0xfff1a8,
        fontSize: 32,
      });
      parts.push(openBtn);
    } else {
      parts.push(
        addLock(this, 0, 315, 46),
        addText(this, 0, 390, `Collect ${nb.unlockStars} stars to open`, 24),
        addText(this, 0, 425, `You have ${s.totalStars()}`, 22, { colour: '#6b6b72' }),
      );
    }

    const c = this.add.container(cx, COVER.y, parts);
    this.cover = c;
    this.drawDots();
    return c;
  }

  private openNotebook(nb: NotebookConfig): void {
    if (this.flipping) return;
    Sfx.tap();
    this.registry.set('notebook', nb.id);
    goTo(this, 'LevelSelect', { notebook: nb.id });
  }

  private drawDots(): void {
    const g = this.dots.clear();
    const y = COVER.y + COVER.h + 40;
    NOTEBOOKS.forEach((_, i) => {
      const x = GAME_WIDTH / 2 + (i - (NOTEBOOKS.length - 1) / 2) * 26;
      g.lineStyle(2, 0x3d3d44, 1);
      if (i === this.index) g.fillStyle(0x3d3d44, 1).fillCircle(x, y, 7);
      else g.strokeCircle(x, y, 6);
    });
  }
}

/** A notebook cover in the notebook's colour, with a paper label. */
function coverTextures(scene: Phaser.Scene, nb: NotebookConfig, open: boolean): string[] {
  const { w, h } = COVER;
  return roughTextures(scene, `cover-${nb.id}-${open ? 'open' : 'locked'}`, { x: 0, y: 0, w, h }, (rc, ctx, seed) => {
    const base = open ? nb.accent : 0x9a958c;
    const outline = roundedRectPath(0, 0, w, h, 14);
    ctx.fillStyle = css(base);
    ctx.fill(new Path2D(outline));
    rc.path(outline, {
      ...PENCIL,
      strokeWidth: 3,
      fill: 'rgba(0,0,0,0.18)',
      fillStyle: 'hachure',
      hachureGap: 9,
      hachureAngle: 50,
      seed,
    });
    // Spine.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 10, 22, h - 20);
    // Paper label.
    const label = roundedRectPath(36, 50, w - 72, h - 100, 12);
    ctx.fillStyle = open ? '#fffdf6' : '#ece8de';
    ctx.fill(new Path2D(label));
    rc.path(label, { ...PENCIL, strokeWidth: 2.2, seed: seed + 1 });
    // Ruled lines on the label.
    for (let y = 120; y < h - 60; y += 34) {
      rc.line(52, y + 140, w - 52, y + 140, { stroke: 'rgba(120,160,210,0.35)', strokeWidth: 1, roughness: 0.6, seed: seed + y });
    }
  });
}

/** Shrinks a text until it fits the given width. */
function fitWidth(t: Phaser.GameObjects.Text, max: number): Phaser.GameObjects.Text {
  if (t.width > max) t.setScale(max / t.width);
  return t;
}
