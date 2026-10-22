import Phaser from 'phaser';
import { Sfx } from '../audio/Sfx';
import { BOSS_LEVEL, LEVELS_PER_NOTEBOOK, NOTEBOOKS, OPTIONAL_LEVELS, levelId } from '../config/notebooks';
import { GAME_WIDTH } from '../config/world';
import { getLevel } from '../game/Levels';
import { levelUnlocked, notebookStars } from '../game/Progress';
import { save } from '../game/Save';
import { Button } from '../render/Button';
import { boilImage, css, PENCIL, roughTextures } from '../render/RoughRenderer';
import { addLock, addStar, addText, goTo, setupScreen } from '../render/ui';

/** Bubble centres along a winding path; the boss sits at the bottom. */
const SPOTS: [number, number][] = [
  [110, 230], [240, 262], [370, 230],
  [370, 380], [240, 412], [110, 380],
  [110, 530], [240, 562], [370, 530],
  [240, 700],
];

type BubbleState = 'done' | 'open' | 'locked' | 'soon';

/** The ten levels of one notebook as doodled bubbles with their stars. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create(data: { notebook?: number }): void {
    setupScreen(this);
    const nbId = data.notebook ?? (this.registry.get('notebook') as number | undefined) ?? 1;
    const nb = NOTEBOOKS.find((n) => n.id === nbId) ?? NOTEBOOKS[0]!;
    const s = save();

    new Button(this, 66, 40, 'Back', () => goTo(this, 'NotebookSelect'), { width: 96, height: 46, fontSize: 24 });
    addText(this, GAME_WIDTH / 2 + 30, 40, `${nb.id}. ${nb.title}`, 34, { title: true });
    addStar(this, GAME_WIDTH - 98, 100, true, 14);
    addText(this, GAME_WIDTH - 82, 100, `${notebookStars(s, nb.id)} / ${LEVELS_PER_NOTEBOOK * 3}`, 24).setOrigin(0, 0.5);

    this.drawPath(nb.accent);

    for (let i = 1; i <= LEVELS_PER_NOTEBOOK; i++) {
      const id = levelId(nb.id, i);
      const level = getLevel(id);
      const [x, y] = SPOTS[i - 1]!;
      const state: BubbleState = !level
        ? 'soon'
        : !levelUnlocked(s, nb.id, i)
          ? 'locked'
          : s.completed(id)
            ? 'done'
            : 'open';
      const boss = i === BOSS_LEVEL;
      const r = boss ? 54 : 40;
      boilImage(this, bubbleTextures(this, state, r, nb.accent, OPTIONAL_LEVELS.includes(i)), {
        x: x - r,
        y: y - r,
        w: r * 2,
        h: r * 2,
      });

      if (state === 'locked') addLock(this, x, y, 26);
      else if (state === 'soon') addText(this, x, y, 'soon', 20, { colour: '#8a8790' });
      else addText(this, x, y - 2, `${i}`, boss ? 44 : 36, { title: true });

      if (boss) addText(this, x, y + r + 16, 'Boss', 22, { colour: '#d8433b' });
      if (OPTIONAL_LEVELS.includes(i)) addText(this, x, y - r - 10, 'bonus', 18, { colour: '#6b6b72' });
      if (state === 'done' || state === 'open') {
        const stars = s.record(id).stars;
        stars.forEach((on, k) => addStar(this, x + (k - 1) * 22, y + r + (boss ? 38 : 14), on, 10));
      }

      if (state === 'done' || state === 'open') {
        const zone = this.add.zone(x, y, r * 2, r * 2).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => {
          Sfx.tap();
          goTo(this, 'Game', { levelId: id });
        });
      }
    }
  }

  /** A dotted pencil trail joining the bubbles in order. */
  private drawPath(accent: number): void {
    const box = { x: 60, y: 180, w: 360, h: 580 };
    const keys = roughTextures(this, `level-path-${accent}`, box, (rc, _ctx, seed) => {
      for (let i = 1; i < SPOTS.length; i++) {
        const [ax, ay] = SPOTS[i - 1]!;
        const [bx, by] = SPOTS[i]!;
        const len = Math.hypot(bx - ax, by - ay);
        for (let d = 46; d < len - 46; d += 14) {
          const t = d / len;
          rc.circle(ax + (bx - ax) * t, ay + (by - ay) * t, 4, {
            stroke: css(accent, 0.8),
            fill: css(accent, 0.6),
            fillStyle: 'solid',
            roughness: 0.8,
            seed: seed + d,
          });
        }
      }
    });
    boilImage(this, keys, box);
  }
}

function bubbleTextures(scene: Phaser.Scene, state: BubbleState, r: number, accent: number, optional: boolean): string[] {
  const box = { x: -r, y: -r, w: r * 2, h: r * 2 };
  return roughTextures(scene, `bubble-${state}-${r}-${accent}-${optional}`, box, (rc, ctx, seed) => {
    const fill = state === 'done' ? css(accent, 0.35) : state === 'open' ? '#fffdf6' : '#ece8de';
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = state === 'done' ? '#fffdf6' : fill;
    ctx.fill();
    rc.circle(0, 0, r * 2 - 2, {
      ...PENCIL,
      stroke: state === 'locked' || state === 'soon' ? '#8a8790' : '#3d3d44',
      strokeWidth: state === 'open' ? 3.2 : 2.4,
      strokeLineDash: state === 'soon' || optional ? [7, 6] : undefined,
      fill: state === 'done' ? fill : undefined,
      fillStyle: 'hachure',
      hachureGap: 6,
      seed,
    });
  });
}
