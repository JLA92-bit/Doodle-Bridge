import Phaser from 'phaser';
import { WIND, type PaperTheme } from '../config/theme';
import { COLOURS } from '../config/ui';
import type { LevelData, PlatformDef, Rect, WindZone } from '../game/Level';
import { settings } from '../game/Settings';
import type { Simulation } from '../physics/Simulation';
import { addNails } from './LevelArt';
import { boilImage, css, PENCIL, roughTextures, type Box } from './RoughRenderer';

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

function bounds(points: readonly [number, number][]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Moving platforms: rough pencil blocks that follow their physics bodies, with rail dots and nails. */
export class PlatformArt {
  private readonly items: { def: PlatformDef; min: { x: number; y: number }; block: Phaser.GameObjects.Image; nails: Phaser.GameObjects.Image[]; nailBase: { x: number; y: number }[]; blockBase: { x: number; y: number } }[] = [];

  constructor(scene: Phaser.Scene, level: LevelData, theme: PaperTheme) {
    const pencil = { ...PENCIL, stroke: theme.ink };
    (level.platforms ?? []).forEach((def, i) => {
      const box = bounds(def.points);
      this.addRail(scene, box, def, theme, `${level.id}-${i}`);
      const keys = roughTextures(scene, `platform-${hashStr(JSON.stringify(def.points) + theme.ink)}`, box, (rc, ctx, seed) => {
        ctx.beginPath();
        def.points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = css(theme.terrainFill, 0.95);
        ctx.fill();
        rc.polygon(def.points, {
          ...pencil,
          strokeWidth: 2.8,
          fill: theme.hatch,
          fillStyle: 'cross-hatch',
          hachureGap: 8,
          hachureAngle: 41,
          fillWeight: 1,
          seed,
        });
      });
      const block = boilImage(scene, keys, box).setDepth(1.2);
      const nails = addNails(scene, (def.nails ?? []).map(([x, y]) => ({ x, y })), theme);
      this.items.push({
        def,
        min: { x: box.x, y: box.y },
        block,
        blockBase: { x: block.x, y: block.y },
        nails,
        nailBase: nails.map((n) => ({ x: n.x, y: n.y })),
      });
    });
  }

  /** Dotted pencil track along the path, with a little tick at each end. */
  private addRail(scene: Phaser.Scene, box: Box, def: PlatformDef, theme: PaperTheme, id: string): void {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const [mx, my] = def.move;
    const rb = bounds([[cx, cy], [cx + mx, cy + my]]);
    const len = Math.hypot(mx, my);
    const keys = roughTextures(scene, `rail-${id}-${hashStr(JSON.stringify([def.points, def.move, theme.ink]))}`, rb, (rc, _ctx, seed) => {
      const nx = len ? -my / len : 0;
      const ny = len ? mx / len : 1;
      for (let d = 0; d <= len; d += 15) {
        const t = len ? d / len : 0;
        rc.circle(cx + mx * t, cy + my * t, 3.2, { stroke: theme.ink, strokeWidth: 1.2, roughness: 0.8, fill: theme.ink, fillStyle: 'solid', seed: seed + d });
      }
      for (const t of [0, 1]) {
        const ex = cx + mx * t;
        const ey = cy + my * t;
        rc.line(ex - nx * 9, ey - ny * 9, ex + nx * 9, ey + ny * 9, { stroke: theme.ink, strokeWidth: 2, roughness: 0.9, seed: seed + t });
      }
    }, 14);
    const img = boilImage(scene, keys, rb, 14).setDepth(0.6);
    img.setAlpha(0.55);
  }

  /** Moves each block and its nails to where its physics body is. */
  update(sim: Simulation): void {
    this.items.forEach((it, i) => {
      const body = sim.platforms[i]?.body;
      const dx = body ? body.bounds.min.x - it.min.x : 0;
      const dy = body ? body.bounds.min.y - it.min.y : 0;
      it.block.setPosition(it.blockBase.x + dx, it.blockBase.y + dy);
      it.nails.forEach((n, k) => n.setPosition(it.nailBase[k]!.x + dx, it.nailBase[k]!.y + dy));
    });
  }

  /** Where each platform nail is right now (for light glows). */
  nailPositions(): { x: number; y: number }[] {
    return this.items.flatMap((it) => it.nails.map((n) => ({ x: n.x + 15, y: n.y + 15 })));
  }
}

interface Gust {
  /** 0 to 1 along the travel direction. */
  u: number;
  /** 0 to 1 across. */
  lane: number;
  speed: number;
  len: number;
  wob: number;
}

interface Scrap {
  u: number;
  lane: number;
  speed: number;
  size: number;
  rot: number;
  spin: number;
  colour: number;
}

/**
 * Wind zones: a faint tinted, dashed rectangle with wavy gust lines and a few paper scraps
 * drifting the way the wind blows. Lines are redrawn each frame into one Graphics (a few dozen segments).
 */
export class WindArt {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly zones: { zone: WindZone; gusts: Gust[]; scraps: Scrap[]; dir: { x: number; y: number }; travel: number; across: number; speed: number }[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene, zones: readonly WindZone[], private readonly theme: PaperTheme) {
    this.g = scene.add.graphics().setDepth(2.5);
    const colour = theme.dark ? WIND.colourDark : WIND.colour;
    zones.forEach((zone, zi) => {
      const box: Box = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
      const keys = roughTextures(scene, `wind-${zone.w}x${zone.h}-${theme.dark}`, box, (rc, ctx, seed) => {
        ctx.fillStyle = css(colour, theme.dark ? 0.1 : 0.08);
        ctx.fillRect(box.x, box.y, box.w, box.h);
        rc.rectangle(box.x, box.y, box.w, box.h, { stroke: css(colour, 0.55), strokeWidth: 1.6, roughness: 1.2, strokeLineDash: [9, 7], seed });
      });
      boilImage(scene, keys, box).setDepth(0.7);

      const [fx, fy] = zone.force;
      const mag = Math.hypot(fx, fy) || 1;
      const dir = { x: fx / mag, y: fy / mag };
      const travel = Math.abs(dir.x) * zone.w + Math.abs(dir.y) * zone.h;
      const across = Math.abs(dir.x) * zone.h + Math.abs(dir.y) * zone.w;
      const speed = Phaser.Math.Clamp((mag / 0.1) * WIND.speedAt01, 60, 340);
      const count = Math.min(WIND.maxLines, Math.max(3, Math.round(((zone.w * zone.h) / 10000) * WIND.density)));
      const rand = new Phaser.Math.RandomDataGenerator([`wind${zi}${zone.x}${zone.y}`]);
      const gusts: Gust[] = [];
      for (let i = 0; i < count; i++) {
        gusts.push({
          u: rand.frac(),
          lane: (i + rand.frac() * 0.8) / count,
          speed: 0.75 + rand.frac() * 0.5,
          len: (26 + Math.min(70, mag * 420)) * (0.8 + rand.frac() * 0.5),
          wob: 3 + rand.frac() * 4,
        });
      }
      const scraps: Scrap[] = [];
      const nScraps = Math.min(5, 2 + Math.round((zone.w * zone.h) / 50000));
      for (let i = 0; i < nScraps; i++) {
        scraps.push({
          u: rand.frac(),
          lane: rand.frac(),
          speed: 0.55 + rand.frac() * 0.4,
          size: 4 + rand.frac() * 3,
          rot: rand.frac() * 6,
          spin: (rand.frac() - 0.5) * 6,
          colour: WIND.scrapColours[i % WIND.scrapColours.length]!,
        });
      }
      this.zones.push({ zone, gusts, scraps, dir, travel, across, speed });
    });
  }

  update(deltaMs: number): void {
    const slow = settings().reducedMotion ? 0.3 : 1;
    const dt = (Math.min(deltaMs, 50) / 1000) * slow;
    this.t += dt;
    const g = this.g;
    g.clear();
    const colour = this.theme.dark ? WIND.colourDark : WIND.colour;
    for (const z of this.zones) {
      const { zone, dir } = z;
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;
      const nx = -dir.y;
      const ny = dir.x;
      const inside = (x: number, y: number) => x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
      for (const gu of z.gusts) {
        gu.u = (gu.u + (z.speed * gu.speed * dt) / Math.max(40, z.travel)) % 1;
        const env = Math.sin(Math.PI * gu.u);
        g.lineStyle(2, colour, 0.65 * env);
        const n = 7;
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i <= n; i++) {
          const along = (gu.u - 0.5) * z.travel - (i / n) * gu.len;
          const across = (gu.lane - 0.5) * z.across + Math.sin(i * 0.9 + this.t * 3 + gu.lane * 20) * gu.wob * (i / n);
          const p = { x: cx + dir.x * along + nx * across, y: cy + dir.y * along + ny * across };
          if (prev && inside(p.x, p.y) && inside(prev.x, prev.y)) g.lineBetween(prev.x, prev.y, p.x, p.y);
          prev = p;
        }
        // Arrow head at the front of the gust shows the direction.
        const hx = cx + dir.x * (gu.u - 0.5) * z.travel + nx * (gu.lane - 0.5) * z.across;
        const hy = cy + dir.y * (gu.u - 0.5) * z.travel + ny * (gu.lane - 0.5) * z.across;
        if (inside(hx, hy)) {
          g.lineBetween(hx, hy, hx - dir.x * 7 + nx * 4, hy - dir.y * 7 + ny * 4);
          g.lineBetween(hx, hy, hx - dir.x * 7 - nx * 4, hy - dir.y * 7 - ny * 4);
        }
      }
      for (const s of z.scraps) {
        s.u = (s.u + (z.speed * s.speed * dt) / Math.max(40, z.travel)) % 1;
        s.rot += s.spin * dt;
        const bob = Math.sin(this.t * 2.2 + s.lane * 9) * 8;
        const x = cx + dir.x * (s.u - 0.5) * z.travel + nx * ((s.lane - 0.5) * z.across + bob);
        const y = cy + dir.y * (s.u - 0.5) * z.travel + ny * ((s.lane - 0.5) * z.across + bob);
        if (!inside(x, y)) continue;
        const w = s.size * (0.4 + 0.6 * Math.abs(Math.cos(s.rot)));
        const c = Math.cos(s.rot * 0.7);
        const sn = Math.sin(s.rot * 0.7);
        const corner = (px: number, py: number) => ({ x: x + px * c - py * sn, y: y + px * sn + py * c });
        g.fillStyle(s.colour, 0.75 * Math.sin(Math.PI * s.u));
        g.fillPoints([corner(-w, -s.size * 0.6), corner(w, -s.size * 0.6), corner(w, s.size * 0.6), corner(-w, s.size * 0.6)], true);
      }
    }
  }
}

/** Pink rubber-eraser zones, with crumbs and a little eraser doodle. Anything drawn through them is rubbed out. */
export function addErasers(scene: Phaser.Scene, zones: readonly Rect[], theme: PaperTheme): Phaser.GameObjects.Image[] {
  return zones.map((z) => {
    const box: Box = { x: z.x, y: z.y, w: z.w, h: z.h };
    const keys = roughTextures(scene, `eraser-${z.w}x${z.h}-${theme.ink}`, box, (rc, ctx, seed) => {
      ctx.fillStyle = css(0xf6a9bd, 0.5);
      ctx.fillRect(z.x, z.y, z.w, z.h);
      rc.rectangle(z.x, z.y, z.w, z.h, {
        stroke: theme.ink,
        strokeWidth: 2,
        roughness: 1.3,
        fill: css(0xe0708f, 0.45),
        fillStyle: 'hachure',
        hachureGap: 9,
        hachureAngle: -35,
        fillWeight: 1.4,
        seed,
      });
      // Crumbs along the bottom and sides.
      const n = Math.max(6, Math.round((z.w + z.h) / 14));
      for (let i = 0; i < n; i++) {
        const r = ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1;
        const r2 = ((Math.sin(i * 78.233 + seed) * 12345.6789) % 1 + 1) % 1;
        const x = z.x + r * z.w;
        const y = z.y + z.h - 2 + r2 * 9;
        rc.rectangle(x, y, 2.5 + r2 * 3, 2 + r * 2.5, { stroke: css(0xd9607f), strokeWidth: 1, roughness: 0.6, fill: css(0xf6a9bd), fillStyle: 'solid', seed: seed + i });
      }
      // Doodled eraser block in the middle of roomy zones.
      if (Math.min(z.w, z.h) >= 56) {
        ctx.save();
        ctx.translate(z.x + z.w / 2, z.y + z.h / 2);
        ctx.rotate(-0.35);
        rc.rectangle(-26, -13, 52, 26, { stroke: theme.ink, strokeWidth: 2, roughness: 0.8, fill: '#fbd3dc', fillStyle: 'solid', seed: seed + 5 });
        rc.rectangle(-26, -13, 20, 26, { stroke: theme.ink, strokeWidth: 2, roughness: 0.8, fill: css(COLOURS.accent), fillStyle: 'solid', seed: seed + 6 });
        ctx.restore();
      }
    });
    return boilImage(scene, keys, box).setDepth(0.8);
  });
}

/** A doodled flag on the ground that turns green once the vehicle has passed it. */
export class CheckpointArt {
  private readonly off: Phaser.GameObjects.Image;
  private readonly on: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, at: readonly [number, number], theme: PaperTheme) {
    const [x, y] = at;
    const box: Box = { x: x - 8, y: y - 64, w: 52, h: 66 };
    const draw = (reached: boolean) =>
      roughTextures(scene, `checkpoint-${reached}-${theme.ink}`, box, (rc, _ctx, seed) => {
        const pencil = { ...PENCIL, stroke: theme.ink };
        rc.line(x, y, x, y - 58, { ...pencil, strokeWidth: 2.8, seed });
        const pennant: [number, number][] = [[x, y - 58], [x + 34, y - 47], [x, y - 36]];
        if (reached) {
          rc.polygon(pennant, { ...pencil, fill: css(0x46b35a), fillStyle: 'zigzag', hachureGap: 3.2, fillWeight: 2, seed: seed + 1 });
          rc.line(x + 8, y - 47, x + 13, y - 42, { ...pencil, strokeWidth: 2.2, stroke: '#ffffff', seed: seed + 2 });
          rc.line(x + 13, y - 42, x + 22, y - 52, { ...pencil, strokeWidth: 2.2, stroke: '#ffffff', seed: seed + 3 });
        } else {
          rc.polygon(pennant, { ...pencil, stroke: css(0x8a8790), strokeLineDash: [5, 4], fill: css(0x46b35a, 0.35), fillStyle: 'hachure', hachureGap: 5, seed: seed + 1 });
        }
        rc.line(x - 7, y, x + 7, y, { ...pencil, strokeWidth: 2.4, seed: seed + 4 });
      });
    this.off = boilImage(scene, draw(false), box).setDepth(1.5);
    this.on = boilImage(scene, draw(true), box).setDepth(1.5).setVisible(false);
  }

  setReached(reached: boolean): void {
    this.off.setVisible(!reached);
    this.on.setVisible(reached);
  }

  get image(): Phaser.GameObjects.Image {
    return this.on;
  }
}
