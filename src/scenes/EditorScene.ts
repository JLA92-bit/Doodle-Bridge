import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/world';
import { validateLevel, type LevelData } from '../game/Level';
import { getLevel } from '../game/Levels';
import { polylineLength, toPoint, toTuple, type Point, type PointTuple } from '../physics/geometry';
import { addSample, simplify } from '../physics/StrokeBuilder';
import { Button } from '../render/Button';
import { addText, goTo, setupScreen } from '../render/ui';

type Tool = 'ground' | 'ramp' | 'nail' | 'start' | 'flag' | 'solve' | 'erase';

const STORE_KEY = 'doodle-bridge.editor';
const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;

function blankLevel(): LevelData {
  return {
    id: 'nb1-04',
    name: 'New Level',
    notebook: 1,
    index: 4,
    terrain: [
      { points: [[0, 560], [150, 560], [150, 854], [0, 854]] },
      { points: [[330, 560], [480, 560], [480, 854], [330, 854]] },
    ],
    anchors: [[150, 560], [330, 560]],
    start: [60, 559],
    flag: { x: 410, y: 470, w: 60, h: 90 },
    ink: 600,
    stars: { ink: 300, timeMs: 7000 },
    solution: { strokes: [] },
  };
}

/**
 * Dev-only level editor (open with ?editor=1, or ?editor=1&level=nb1-02 to edit an existing level).
 * Drag to make ground blocks or ramps, tap to place nails, start and flag, draw the solution,
 * test it in the real game, then export JSON for /src/levels.
 */
export class EditorScene extends Phaser.Scene {
  private level!: LevelData;
  private tool: Tool = 'ground';
  private g!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private toolButtons = new Map<Tool, Button>();
  private dragFrom: Point | null = null;
  private dragTo: Point | null = null;
  private stroke: Point[] | null = null;

  constructor() {
    super('Editor');
  }

  create(data: { level?: LevelData } = {}): void {
    setupScreen(this);
    const param = new URLSearchParams(window.location.search).get('level');
    const fromParam = param ? getLevel(param) : undefined;
    this.level = data.level ?? (fromParam ? structuredClone(fromParam) : undefined) ?? loadDraft() ?? blankLevel();
    this.g = this.add.graphics().setDepth(5);
    this.status = addText(this, GAME_WIDTH / 2, 132, '', 18, { colour: '#6b6b72' }).setDepth(30);

    const tools: [Tool, string][] = [
      ['ground', 'Ground'], ['ramp', 'Ramp'], ['nail', 'Nail'], ['start', 'Start'],
      ['flag', 'Flag'], ['solve', 'Solve'], ['erase', 'Erase'],
    ];
    tools.forEach(([t, label], i) => {
      const b = new Button(this, 52 + (i % 4) * 95, 30 + Math.floor(i / 4) * 50, label, () => this.setTool(t), {
        width: 88,
        height: 42,
        fontSize: 20,
      }).setDepth(30);
      this.toolButtons.set(t, b);
    });
    new Button(this, 337, 80, 'Test', () => this.test(), { width: 92, height: 42, fontSize: 20, fill: 0xfff1a8 }).setDepth(30);
    new Button(this, 437, 80, 'Export', () => this.exportJson(), { width: 76, height: 42, fontSize: 18 }).setDepth(30);
    new Button(this, 437, 30, 'Props', () => this.editProps(), { width: 76, height: 42, fontSize: 18 }).setDepth(30);
    new Button(this, 60, GAME_HEIGHT - 30, 'New', () => {
      this.level = blankLevel();
      this.changed();
    }, { width: 80, height: 40, fontSize: 18 }).setDepth(30);
    new Button(this, GAME_WIDTH - 60, GAME_HEIGHT - 30, 'Exit', () => goTo(this, 'Title'), { width: 80, height: 40, fontSize: 18 }).setDepth(30);

    this.input.on('pointerdown', this.down, this);
    this.input.on('pointermove', this.move, this);
    this.input.on('pointerup', this.up, this);
    this.setTool('ground');
    this.changed();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.toolButtons.forEach((b, k) => b.setAlpha(k === t ? 1 : 0.55));
    this.refresh();
  }

  private point(p: Phaser.Input.Pointer): Point {
    return { x: p.worldX, y: p.worldY };
  }

  private down(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length) return;
    const at = this.point(p);
    switch (this.tool) {
      case 'ground':
      case 'ramp':
        this.dragFrom = { x: snap(at.x), y: snap(at.y) };
        this.dragTo = this.dragFrom;
        break;
      case 'solve':
        this.stroke = [at];
        break;
      case 'nail':
        this.toggleNail(at);
        break;
      case 'start':
        this.level.start = toTuple({ x: snap(at.x), y: this.groundBelow(at) - 1 });
        this.changed();
        break;
      case 'flag': {
        const ground = this.groundBelow(at);
        this.level.flag = { x: snap(at.x) - 30, y: ground - 90, w: 60, h: 90 };
        this.changed();
        break;
      }
      case 'erase':
        this.erase(at);
        break;
    }
  }

  private move(p: Phaser.Input.Pointer): void {
    if (!p.isDown) return;
    const at = this.point(p);
    if (this.dragFrom) {
      this.dragTo = { x: snap(at.x), y: snap(at.y) };
      this.refresh();
    } else if (this.stroke) {
      addSample(this.stroke, at);
      this.refresh();
    }
  }

  private up(p: Phaser.Input.Pointer): void {
    const at = this.point(p);
    if (this.dragFrom && this.dragTo) {
      const a = this.dragFrom;
      const b = this.dragTo;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      if (x1 - x0 >= GRID && y1 - y0 >= GRID) {
        // A ramp rises towards the end of the drag.
        const pts: PointTuple[] =
          this.tool === 'ramp'
            ? b.x > a.x
              ? [[x0, y1], [x1, y0], [x1, y1]]
              : [[x0, y0], [x1, y1], [x0, y1]]
            : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        this.level.terrain.push({ points: pts });
      }
      this.dragFrom = this.dragTo = null;
      this.changed();
    } else if (this.stroke) {
      this.stroke.push(at);
      if (polylineLength(this.stroke) > 14) {
        this.level.solution.strokes.push(simplify(this.stroke).map(toTuple));
      }
      this.stroke = null;
      this.changed();
    }
  }

  private toggleNail(at: Point): void {
    const i = this.level.anchors.findIndex((a) => Math.hypot(a[0] - at.x, a[1] - at.y) < 16);
    if (i >= 0) this.level.anchors.splice(i, 1);
    else {
      // Snap to the nearest terrain corner if close, else to the grid.
      let best: PointTuple = [snap(at.x), snap(at.y)];
      let bestD = 24;
      for (const t of this.level.terrain) {
        for (const c of t.points) {
          const d = Math.hypot(c[0] - at.x, c[1] - at.y);
          if (d < bestD) {
            bestD = d;
            best = [c[0], c[1]];
          }
        }
      }
      this.level.anchors.push(best);
    }
    this.changed();
  }

  private erase(at: Point): void {
    const nail = this.level.anchors.findIndex((a) => Math.hypot(a[0] - at.x, a[1] - at.y) < 16);
    if (nail >= 0) this.level.anchors.splice(nail, 1);
    else if (this.level.solution.strokes.length && this.nearSolution(at)) this.level.solution.strokes = [];
    else {
      const i = this.level.terrain.findIndex((t) => inside(at, t.points.map(toPoint)));
      if (i >= 0) this.level.terrain.splice(i, 1);
    }
    this.changed();
  }

  private nearSolution(at: Point): boolean {
    return this.level.solution.strokes.some((s) => s.some((p) => Math.hypot(p[0] - at.x, p[1] - at.y) < 20));
  }

  /** Top of the terrain under x (or the bottom of the page). */
  private groundBelow(at: Point): number {
    let best = GAME_HEIGHT;
    for (const t of this.level.terrain) {
      const pts = t.points.map(toPoint);
      for (let y = Math.max(0, at.y - 40); y < best; y += 2) {
        if (inside({ x: at.x, y }, pts)) {
          best = y;
          break;
        }
      }
    }
    return best;
  }

  private editProps(): void {
    const name = window.prompt('Level name', this.level.name);
    if (name) this.level.name = name;
    const id = window.prompt('Level id (nbN-MM)', this.level.id);
    if (id && /^nb\d-\d\d$/.test(id)) {
      this.level.id = id;
      this.level.notebook = Number(id[2]);
      this.level.index = Number(id.slice(4));
    }
    const ink = Number(window.prompt('Ink allowance', String(this.level.ink)));
    if (ink > 0) this.level.ink = ink;
    const tip = window.prompt('Tip (optional)', this.level.tip ?? '');
    this.level.tip = tip || undefined;
    this.changed();
  }

  private test(): void {
    const problems = validateLevel(this.level);
    if (problems.length) {
      this.status.setText(`Fix first: ${problems.join(', ')}`).setColor('#d8433b');
      return;
    }
    goTo(this, 'Game', { level: structuredClone(this.level), fromEditor: true });
  }

  private exportJson(): void {
    const json = JSON.stringify(this.level, null, 2);
    console.log(json);
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    const blob = new Blob([json + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.level.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.status.setText(`Exported ${this.level.id}.json (also copied)`).setColor('#2f8f4e');
  }

  private changed(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.level));
    } catch {
      // Drafts are a convenience only.
    }
    this.refresh();
  }

  private refresh(): void {
    const g = this.g.clear();
    const L = this.level;
    for (const t of L.terrain) {
      const pts = t.points.map(toPoint);
      g.fillStyle(0xd8d0bd, 0.9).fillPoints(pts, true);
      g.lineStyle(2.5, 0x3d3d44, 1).strokePoints(pts, true);
    }
    if (this.dragFrom && this.dragTo) {
      g.lineStyle(2, 0x3c8dde, 1).strokeRect(
        Math.min(this.dragFrom.x, this.dragTo.x),
        Math.min(this.dragFrom.y, this.dragTo.y),
        Math.abs(this.dragTo.x - this.dragFrom.x),
        Math.abs(this.dragTo.y - this.dragFrom.y),
      );
    }
    g.lineStyle(2, 0xd8433b, 1).strokeRect(L.flag.x, L.flag.y, L.flag.w, L.flag.h);
    g.fillStyle(0xd8433b, 1).fillTriangle(L.flag.x + 30, L.flag.y + 10, L.flag.x + 58, L.flag.y + 20, L.flag.x + 30, L.flag.y + 30);
    g.fillStyle(0x2f8f4e, 1).fillCircle(L.start[0], L.start[1] - 12, 8);
    for (const s of [...L.solution.strokes.map((s) => s.map(toPoint)), ...(this.stroke ? [this.stroke] : [])]) {
      g.lineStyle(5, 0x3c8dde, 0.8).strokePoints(s, false);
    }
    for (const a of L.anchors) g.fillStyle(0xb7b3ab, 1).fillCircle(a[0], a[1], 7).lineStyle(2, 0x3d3d44, 1).strokeCircle(a[0], a[1], 7);
    const ink = L.solution.strokes.reduce((n, s) => n + polylineLength(s.map(toPoint)), 0);
    const problems = validateLevel(L);
    this.status
      .setText(
        `${L.id} "${L.name}"  ink ${L.ink}  solution ${Math.round(ink)}` + (problems.length ? `  -  ${problems.join(', ')}` : ''),
      )
      .setColor(problems.length ? '#d8433b' : '#6b6b72');
  }
}

function loadDraft(): LevelData | undefined {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as LevelData) : undefined;
  } catch {
    return undefined;
  }
}

/** Point in polygon (even-odd rule). */
function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
