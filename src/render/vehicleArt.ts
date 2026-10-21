import type { VehicleConfig, VehicleId } from '../config/vehicles';

/**
 * Polished cartoon vehicle art, painted once with Canvas 2D (gradients, gloss, chrome, glass)
 * into textures. Coordinates are chassis-local game units: x forward, y down, origin at the chassis centre.
 */

export type Ctx = CanvasRenderingContext2D;

export interface ArtBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type WheelKind = 'car' | 'bus' | 'monster' | 'skate' | 'bike' | 'racer';

export interface VehicleArt {
  box: ArtBox;
  wheel: WheelKind;
  bodyOverWheels: boolean;
  /** Local points for effects. */
  exhaust?: { x: number; y: number };
  exhaustColour?: number;
  flame?: { x: number; y: number };
  draw(ctx: Ctx, cfg: VehicleConfig): void;
}

const OUTLINE = '#1c1c21';

// ---------- colour + path helpers ----------

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a colour, returns a CSS colour. */
export function tone(hex: number, amt: number, alpha = 1): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))) as [
    number,
    number,
    number,
  ];
  return `rgba(${r},${g},${b},${alpha})`;
}

function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Glossy paint: light top, base colour, dark underside. */
function paint(ctx: Ctx, base: number, y0: number, y1: number): CanvasGradient {
  return vgrad(ctx, y0, y1, [
    [0, tone(base, 0.45)],
    [0.28, tone(base, 0.12)],
    [0.6, tone(base, 0)],
    [1, tone(base, -0.38)],
  ]);
}

function chrome(ctx: Ctx, y0: number, y1: number): CanvasGradient {
  return vgrad(ctx, y0, y1, [
    [0, '#ffffff'],
    [0.45, '#c3c8cf'],
    [0.55, '#8d949d'],
    [1, '#e4e7eb'],
  ]);
}

function glass(ctx: Ctx, y0: number, y1: number): CanvasGradient {
  return vgrad(ctx, y0, y1, [
    [0, '#eaf7ff'],
    [0.5, '#9fd0ee'],
    [1, '#5f9fc8'],
  ]);
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function poly(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function fillStroke(ctx: Ctx, fill: string | CanvasGradient, width = 1.6, stroke = OUTLINE): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** A white streak across glass. */
function reflection(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  poly(ctx, [
    [x, y + h],
    [x + w * 0.35, y],
    [x + w * 0.55, y],
    [x + w * 0.2, y + h],
  ]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  poly(ctx, [
    [x + w * 0.3, y + h],
    [x + w * 0.65, y],
    [x + w * 0.72, y],
    [x + w * 0.37, y + h],
  ]);
  ctx.fill();
  ctx.restore();
}

function windowPane(ctx: Ctx, pts: [number, number][], y0: number, y1: number): void {
  poly(ctx, pts);
  fillStroke(ctx, glass(ctx, y0, y1), 1.2);
  poly(ctx, pts);
  const xs = pts.map((p) => p[0]);
  reflection(ctx, Math.min(...xs), y0, Math.max(...xs) - Math.min(...xs), y1 - y0);
}

/** Cuts a wheel opening out of the body and rims it, so the wheel shows through. */
function wheelArch(ctx: Ctx, x: number, y: number, r: number, trim: string): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = trim;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r + 1.3, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function headlamp(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  const g = ctx.createRadialGradient(x + rx * 0.3, y - ry * 0.3, 0.2, x, y, Math.max(rx, ry));
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#fff6c4');
  g.addColorStop(1, '#f2c94c');
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  fillStroke(ctx, g, 1.1);
}

function lamp(ctx: Ctx, x: number, y: number, w: number, h: number, colour: string): void {
  rr(ctx, x, y, w, h, Math.min(w, h) / 2.5);
  fillStroke(ctx, vgrad(ctx, y, y + h, [[0, '#ffd2cc'], [0.4, colour], [1, '#6e1410']]), 1);
}

function gloss(ctx: Ctx, pts: [number, number][], alpha = 0.45): void {
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.stroke();
  ctx.restore();
}

// ---------- vehicles ----------

const paperCar: VehicleArt = {
  box: { x0: -38, y0: -32, x1: 39, y1: 14 },
  wheel: 'car',
  bodyOverWheels: true,
  exhaust: { x: -33, y: 8 },
  draw(ctx, cfg) {
    const c = cfg.colour;
    // Rear bumper, front bumper (behind body edges).
    rr(ctx, -35, 3, 8, 6, 2.5);
    fillStroke(ctx, vgrad(ctx, 3, 9, [[0, '#5b5b63'], [1, '#26262b']]));
    rr(ctx, 29, 3, 8, 6, 2.5);
    fillStroke(ctx, vgrad(ctx, 3, 9, [[0, '#5b5b63'], [1, '#26262b']]));
    // Body silhouette.
    ctx.beginPath();
    ctx.moveTo(-31, 9);
    ctx.lineTo(-32.5, -1);
    ctx.quadraticCurveTo(-33, -7.5, -27, -8.5);
    ctx.lineTo(-21, -9.5);
    ctx.bezierCurveTo(-19.5, -18, -16.5, -25.5, -9, -26.5);
    ctx.lineTo(5, -26.5);
    ctx.bezierCurveTo(10, -26.5, 14, -17, 18.5, -10.5);
    ctx.quadraticCurveTo(29, -9.5, 32, -6);
    ctx.quadraticCurveTo(34.5, -3, 34, 3);
    ctx.lineTo(33, 9);
    ctx.closePath();
    fillStroke(ctx, paint(ctx, c, -27, 10), 1.8);
    // Rocker panel shade.
    ctx.save();
    ctx.globalAlpha = 0.35;
    rr(ctx, -30, 5, 62, 4, 1.5);
    ctx.fillStyle = tone(c, -0.6);
    ctx.fill();
    ctx.restore();
    // Windows with a B pillar.
    windowPane(ctx, [[-18.5, -10.5], [-15.5, -21.5], [-9, -23.5], [-4, -23.5], [-4, -10.5]], -24, -10);
    windowPane(ctx, [[-1, -10.5], [-1, -23.5], [4.5, -23.5], [8, -22], [14.5, -10.5]], -24, -10);
    // Door seam and handle.
    ctx.beginPath();
    ctx.moveTo(-2.5, -10);
    ctx.quadraticCurveTo(-1.5, 0, -3, 8);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = tone(c, -0.55);
    ctx.stroke();
    rr(ctx, -9, -6.5, 4.5, 1.6, 0.8);
    fillStroke(ctx, chrome(ctx, -6.5, -5), 0.6);
    // Mirror.
    rr(ctx, 13, -12.5, 4, 3, 1.2);
    fillStroke(ctx, paint(ctx, c, -12.5, -9.5), 0.9);
    // Lights.
    headlamp(ctx, 31.2, -3.2, 2.2, 2.6);
    lamp(ctx, -33, -5, 2.6, 5, '#d92b23');
    // Gloss lines along roof and shoulder.
    gloss(ctx, [[-14, -24.5], [3, -24.8]], 0.7);
    gloss(ctx, [[-27, -7], [-20, -8], [18, -8.3], [28, -7]], 0.5);
    for (const w of cfg.wheels) wheelArch(ctx, w.x, w.y, w.r + 1.8, tone(c, -0.65));
  },
};

const skateboard: VehicleArt = {
  box: { x0: -38, y0: -14, x1: 38, y1: 6 },
  wheel: 'skate',
  bodyOverWheels: false,
  draw(ctx, cfg) {
    // Deck seen from the side: grip tape on top, maple plies, coloured bottom.
    const deck = () => {
      ctx.beginPath();
      ctx.moveTo(-35, -10);
      ctx.quadraticCurveTo(-31, -4, -26, -3.5);
      ctx.lineTo(26, -3.5);
      ctx.quadraticCurveTo(31, -4, 35, -10);
      ctx.lineTo(36.5, -8.5);
      ctx.quadraticCurveTo(32, -0.5, 26, 0.5);
      ctx.lineTo(-26, 0.5);
      ctx.quadraticCurveTo(-32, -0.5, -36.5, -8.5);
      ctx.closePath();
    };
    deck();
    fillStroke(ctx, vgrad(ctx, -4, 1, [[0, '#2a2a2e'], [0.3, '#e9cf9c'], [0.55, '#c99b5b'], [0.75, '#e9cf9c'], [0.76, tone(cfg.colour, 0)], [1, tone(cfg.colour, -0.35)]]), 1.4);
    ctx.save();
    deck();
    ctx.clip();
    ctx.fillStyle = tone(cfg.shade, 0.1);
    for (let x = -30; x < 30; x += 9) {
      poly(ctx, [[x, 1], [x + 4, 1], [x + 7, -1], [x + 3, -1]]);
      ctx.fill();
    }
    ctx.restore();
    gloss(ctx, [[-25, -3.2], [25, -3.2]], 0.25);
  },
};

const schoolBus: VehicleArt = {
  box: { x0: -60, y0: -30, x1: 61, y1: 18 },
  wheel: 'bus',
  bodyOverWheels: true,
  exhaust: { x: -58, y: 12 },
  draw(ctx, cfg) {
    const c = cfg.colour;
    rr(ctx, -59, 6, 8, 7, 2);
    fillStroke(ctx, vgrad(ctx, 6, 13, [[0, '#4a4a50'], [1, '#18181c']]));
    rr(ctx, 51, 6, 9, 7, 2);
    fillStroke(ctx, vgrad(ctx, 6, 13, [[0, '#4a4a50'], [1, '#18181c']]));
    // Body.
    ctx.beginPath();
    ctx.moveTo(-56, 12);
    ctx.lineTo(-56.5, -19);
    ctx.quadraticCurveTo(-56.5, -26, -49, -26);
    ctx.lineTo(48, -26);
    ctx.quadraticCurveTo(55, -26, 56, -19);
    ctx.lineTo(57.5, 0);
    ctx.quadraticCurveTo(58, 10, 55, 12);
    ctx.closePath();
    fillStroke(ctx, paint(ctx, c, -26, 13), 1.8);
    // Roof cap and warning lights.
    gloss(ctx, [[-50, -24], [49, -24]], 0.7);
    for (const [x, col] of [[-50, '#ff3b2f'], [-45, '#ffb21e'], [45, '#ffb21e'], [50, '#ff3b2f']] as [number, string][]) {
      ctx.beginPath();
      ctx.ellipse(x, -26.5, 2, 1.6, 0, Math.PI, Math.PI * 2);
      fillStroke(ctx, col, 0.9);
    }
    // Windows.
    for (let i = 0; i < 6; i++) {
      const x = -52 + i * 13.5;
      rr(ctx, x, -21, 11, 11, 1.5);
      ctx.save();
      fillStroke(ctx, glass(ctx, -21, -10), 1.1);
      rr(ctx, x, -21, 11, 11, 1.5);
      reflection(ctx, x, -21, 11, 11);
      ctx.restore();
    }
    // Door (folding glass) and windscreen.
    rr(ctx, 31, -21, 11, 30, 1.5);
    fillStroke(ctx, tone(c, -0.15), 1.1);
    windowPane(ctx, [[32.5, -19.5], [36, -19.5], [36, 7], [32.5, 7]], -20, 7);
    windowPane(ctx, [[37, -19.5], [40.5, -19.5], [40.5, 7], [37, 7]], -20, 7);
    windowPane(ctx, [[45, -21], [54.5, -21], [56, -6], [45, -6]], -21, -6);
    // Black rub rails and lettering.
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-56, 2, 87, 1.6);
    ctx.fillRect(-56, 6.5, 87, 1.6);
    ctx.fillRect(42.5, 2, 15, 1.6);
    ctx.font = 'bold 6px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCHOOL BUS', -12, -4.5);
    // Stop sign arm.
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const p: [number, number] = [24 + Math.cos(a) * 4.6, -4 + Math.sin(a) * 4.6];
      if (i) ctx.lineTo(...p);
      else ctx.moveTo(...p);
    }
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -9, 1, [[0, '#ff5a4f'], [1, '#b3140c']]), 1);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    headlamp(ctx, 55.5, 2, 1.8, 2.4);
    lamp(ctx, -58, -6, 2.5, 6, '#d92b23');
    for (const w of cfg.wheels) wheelArch(ctx, w.x, w.y, w.r + 2, '#1f1f22');
  },
};

const monsterTruck: VehicleArt = {
  box: { x0: -40, y0: -38, x1: 42, y1: 12 },
  wheel: 'monster',
  bodyOverWheels: false,
  exhaust: { x: -12, y: -33 },
  exhaustColour: 0x55524f,
  draw(ctx, cfg) {
    const c = cfg.colour;
    // Exhaust stacks behind the cab.
    for (const x of [-14, -10]) {
      rr(ctx, x - 1.4, -32, 2.8, 24, 1);
      fillStroke(ctx, chrome(ctx, -32, -8), 0.9);
    }
    // Frame rails under the body.
    rr(ctx, -30, 3, 60, 5, 1.5);
    fillStroke(ctx, vgrad(ctx, 3, 8, [[0, '#3d3d43'], [1, '#151518']]), 1);
    // Pickup body: bed, cab, hood.
    ctx.beginPath();
    ctx.moveTo(-35, 5);
    ctx.lineTo(-36, -9);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-9, -13);
    ctx.bezierCurveTo(-8.5, -21, -7, -26.5, -1, -26.5);
    ctx.lineTo(7, -26.5);
    ctx.bezierCurveTo(11, -26.5, 14, -18, 17, -11);
    ctx.quadraticCurveTo(31, -10.5, 35, -8);
    ctx.quadraticCurveTo(38, -5, 37.5, 0);
    ctx.lineTo(37, 5);
    ctx.closePath();
    fillStroke(ctx, paint(ctx, c, -27, 6), 1.8);
    // Flames along the side.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(34, -2);
    const flame: [number, number][] = [[24, -7], [20, -2], [13, -8], [8, -3], [0, -7.5], [-4, -2.5], [-12, -6], [-16, -1], [-26, -4], [-20, 2]];
    for (const [x, y] of flame) ctx.quadraticCurveTo(x + 3, y + 3, x, y);
    ctx.quadraticCurveTo(0, 4, 34, 3);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -8, 4, [[0, '#ffe066'], [0.5, '#ff9a2e'], [1, '#e8471d']]), 1);
    ctx.restore();
    // Windows and roll bar.
    windowPane(ctx, [[-6, -12], [-4.5, -23.5], [-1, -24], [2, -24], [2, -12]], -24, -12);
    windowPane(ctx, [[4.5, -12], [4.5, -24], [8, -23.5], [13.5, -12]], -24, -12);
    ctx.beginPath();
    ctx.moveTo(-33, -9);
    ctx.lineTo(-30, -17);
    ctx.lineTo(-14, -17);
    ctx.lineTo(-12, -9);
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = OUTLINE;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = chrome(ctx, -17, -9);
    ctx.stroke();
    // Light bar.
    rr(ctx, -6, -30.5, 15, 4, 1.5);
    fillStroke(ctx, '#2a2a2f', 1);
    for (const x of [-3.5, 0, 3.5, 7]) headlamp(ctx, x, -28.5, 1.5, 1.5);
    // Grille and bumper.
    rr(ctx, 33.5, -6, 4.5, 8, 1);
    fillStroke(ctx, chrome(ctx, -6, 2), 1);
    ctx.strokeStyle = '#4b4f55';
    ctx.lineWidth = 0.6;
    for (const y of [-4, -2, 0]) {
      ctx.beginPath();
      ctx.moveTo(34, y);
      ctx.lineTo(37.5, y);
      ctx.stroke();
    }
    rr(ctx, 32, 2, 10, 5, 2);
    fillStroke(ctx, vgrad(ctx, 2, 7, [[0, '#55555c'], [1, '#18181c']]), 1.2);
    headlamp(ctx, 35, -8.5, 1.8, 1.5);
    lamp(ctx, -37.5, -7, 2.5, 5, '#d92b23');
    gloss(ctx, [[-4, -25], [6, -25.2]], 0.7);
    gloss(ctx, [[-34, -8], [-11, -8]], 0.45);
    gloss(ctx, [[17, -10], [33, -8.6]], 0.55);
  },
};

const unicycle: VehicleArt = {
  box: { x0: -16, y0: -38, x1: 18, y1: 18 },
  wheel: 'bike',
  bodyOverWheels: true,
  draw(ctx, cfg) {
    const c = cfg.colour;
    // Shorts.
    rr(ctx, -8, 5, 17, 9, 3.5);
    fillStroke(ctx, vgrad(ctx, 5, 14, [[0, '#4a4e5a'], [1, '#22252c']]), 1.4);
    // Jersey torso with a stripe.
    ctx.beginPath();
    ctx.moveTo(-8, 7);
    ctx.bezierCurveTo(-11, -2, -10, -13, -3, -15);
    ctx.lineTo(5, -15);
    ctx.bezierCurveTo(12, -13, 12, -2, 9, 7);
    ctx.closePath();
    fillStroke(ctx, paint(ctx, c, -15, 7), 1.6);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-12, -6, 26, 3);
    ctx.fillStyle = tone(c, -0.4);
    ctx.fillRect(-12, -3, 26, 1);
    ctx.restore();
    // Neck and helmet with a dark visor (no face).
    rr(ctx, -2, -19, 6, 5, 2);
    fillStroke(ctx, '#f0c7a0', 1.1);
    ctx.beginPath();
    ctx.ellipse(1.5, -26, 9.5, 8.5, 0, 0, Math.PI * 2);
    fillStroke(ctx, paint(ctx, 0xe8463a, -34.5, -17.5), 1.6);
    ctx.beginPath();
    ctx.moveTo(-1, -26);
    ctx.quadraticCurveTo(6, -28, 11.2, -25);
    ctx.quadraticCurveTo(11, -20, 6, -19.5);
    ctx.quadraticCurveTo(0, -19.5, -1, -26);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -28, -19, [[0, '#4a6d8c'], [1, '#141c26']]), 1.2);
    gloss(ctx, [[2, -26], [9, -26.2]], 0.6);
    gloss(ctx, [[-5, -31], [3, -33.5]], 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4.5, -29, 9, 1.5);
  },
};

const rocketCar: VehicleArt = {
  box: { x0: -46, y0: -30, x1: 40, y1: 14 },
  wheel: 'racer',
  bodyOverWheels: true,
  flame: { x: -41, y: -1 },
  exhaust: { x: -42, y: -1 },
  exhaustColour: 0xc9c2b8,
  draw(ctx, cfg) {
    const c = cfg.colour;
    // Tail fin.
    poly(ctx, [[-31, -8], [-38, -26], [-31.5, -26.5], [-21, -9]]);
    fillStroke(ctx, paint(ctx, cfg.shade, -27, -8), 1.6);
    gloss(ctx, [[-36, -24.5], [-32, -24.8]], 0.6);
    // Rocket nozzle.
    ctx.beginPath();
    ctx.moveTo(-33, -6);
    ctx.lineTo(-42, -8.5);
    ctx.lineTo(-42, 6.5);
    ctx.lineTo(-33, 4);
    ctx.closePath();
    fillStroke(ctx, chrome(ctx, -8, 6), 1.3);
    ctx.beginPath();
    ctx.ellipse(-42, -1, 1.8, 7, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#2b2622', 1);
    // Canopy.
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.bezierCurveTo(-8, -20, 9, -21, 14, -9);
    ctx.closePath();
    fillStroke(ctx, glass(ctx, -19, -9), 1.3);
    ctx.beginPath();
    ctx.moveTo(-10, -9);
    ctx.bezierCurveTo(-8, -20, 9, -21, 14, -9);
    ctx.closePath();
    reflection(ctx, -8, -19, 20, 10);
    // Body wedge.
    ctx.beginPath();
    ctx.moveTo(-33, 7.5);
    ctx.lineTo(-34, -6);
    ctx.quadraticCurveTo(-33, -9.5, -26, -9.5);
    ctx.lineTo(16, -9.5);
    ctx.bezierCurveTo(26, -8.5, 33, -4, 37, 1);
    ctx.quadraticCurveTo(38, 5, 34, 7.5);
    ctx.closePath();
    fillStroke(ctx, paint(ctx, c, -10, 8), 1.8);
    // Racing stripes.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(-34, -5, 72, 2.2);
    ctx.fillRect(-34, -1.6, 72, 1.1);
    ctx.restore();
    // Number roundel.
    ctx.beginPath();
    ctx.arc(-15, 1.5, 4.6, 0, Math.PI * 2);
    fillStroke(ctx, '#ffffff', 1.1);
    ctx.fillStyle = OUTLINE;
    ctx.font = 'bold 7px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', -15, 1.9);
    // Splitter, lights, gloss.
    rr(ctx, 26, 6, 13, 2.4, 1);
    fillStroke(ctx, '#1f1f23', 0.8);
    headlamp(ctx, 33.5, -1, 2.2, 1.3);
    gloss(ctx, [[-30, -8.2], [15, -8.4], [27, -5.5]], 0.6);
    for (const w of cfg.wheels) wheelArch(ctx, w.x, w.y, w.r + 1.6, tone(c, -0.65));
  },
};

export const VEHICLE_ART: Record<VehicleId, VehicleArt> = {
  paperCar,
  skateboard,
  schoolBus,
  monsterTruck,
  unicycle,
  rocketCar,
};

// ---------- wheels ----------

/** Paints a wheel centred at (0, 0) with radius r. */
export function drawWheelArt(ctx: Ctx, kind: WheelKind, r: number): void {
  const tyreGrad = (inner: number) => {
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * inner, 0, 0, r);
    g.addColorStop(0, '#4a4a52');
    g.addColorStop(0.7, '#2c2c31');
    g.addColorStop(1, '#141417');
    return g;
  };
  const metal = (rad: number, light: string, dark: string) => {
    const g = ctx.createRadialGradient(-rad * 0.35, -rad * 0.35, rad * 0.1, 0, 0, rad);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, light);
    g.addColorStop(1, dark);
    return g;
  };
  const circle = (rad: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
  };

  if (kind === 'skate') {
    circle(r);
    fillStroke(ctx, metal(r, '#fbf4dc', '#d8c89a'), 1.2);
    circle(r * 0.42);
    fillStroke(ctx, metal(r * 0.42, '#d5d9de', '#7c838c'), 0.8);
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(-r * 0.12, -r * 0.42, r * 0.24, r * 0.84);
    return;
  }

  if (kind === 'bike') {
    circle(r);
    fillStroke(ctx, tyreGrad(0.8), 1.3);
    circle(r * 0.84);
    fillStroke(ctx, metal(r * 0.84, '#e6e9ed', '#9aa1aa'), 0.9);
    circle(r * 0.76);
    ctx.fillStyle = '#f6f2e6';
    ctx.fill();
    ctx.strokeStyle = '#80868f';
    ctx.lineWidth = 0.55;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const off = i % 2 ? 0.35 : -0.35;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + off) * r * 0.12, Math.sin(a + off) * r * 0.12);
      ctx.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
      ctx.stroke();
    }
    circle(r * 0.16);
    fillStroke(ctx, metal(r * 0.16, '#d5d9de', '#5d636b'), 0.8);
    return;
  }

  // Car-type tyre.
  circle(r);
  fillStroke(ctx, tyreGrad(0.5), 1.4);
  const treads = kind === 'monster' ? 14 : kind === 'bus' ? 12 : 10;
  for (let i = 0; i < treads; i++) {
    const a = (i / treads) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    if (kind === 'monster') {
      rr(ctx, r * 0.86, -r * 0.09, r * 0.2, r * 0.18, r * 0.04);
      fillStroke(ctx, '#2a2a2f', 1);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(r * 0.74, -r * 0.05, r * 0.2, r * 0.1);
    }
    ctx.restore();
  }
  // Sidewall highlight.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, Math.PI * 1.05, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = r * 0.1;
  ctx.stroke();

  const rimR = r * (kind === 'monster' ? 0.55 : kind === 'racer' ? 0.62 : 0.58);
  const rimLight = kind === 'monster' ? '#ffd84a' : kind === 'bus' ? '#f2efe8' : '#dfe3e8';
  const rimDark = kind === 'monster' ? '#b07a00' : kind === 'bus' ? '#9c9a92' : '#7f8790';
  circle(rimR);
  fillStroke(ctx, metal(rimR, rimLight, rimDark), 1.1);
  // Spokes as dark slots between rim and hub.
  const spokes = kind === 'racer' ? 6 : 5;
  ctx.fillStyle = 'rgba(30,30,34,0.75)';
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(rimR * 0.38, -rimR * 0.13);
    ctx.lineTo(rimR * 0.82, -rimR * 0.24);
    ctx.quadraticCurveTo(rimR * 0.9, 0, rimR * 0.82, rimR * 0.24);
    ctx.lineTo(rimR * 0.38, rimR * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  circle(rimR * 0.32);
  fillStroke(ctx, metal(rimR * 0.32, '#c9ced4', '#5d636b'), 0.8);
  ctx.fillStyle = '#3b3f45';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rimR * 0.2, Math.sin(a) * rimR * 0.2, rimR * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}
