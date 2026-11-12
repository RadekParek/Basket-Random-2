import { num, clamp } from './math.js';
import { WIDTH, HEIGHT, FLOOR, RIM_Y, HOOPS } from './physics.js';

const GLYPHS = {
  A:'0E11111F111111',B:'1E11111E11111E',C:'0F10101010100F',D:'1E11111111111E',E:'1F10101E10101F',F:'1F10101E101010',G:'0F10101311110F',H:'1111111F111111',I:'1F04040404041F',J:'0702020212120C',K:'11121418141211',L:'1010101010101F',M:'111B1515111111',N:'11191513111111',O:'0E11111111110E',P:'1E11111E101010',Q:'0E11111115120D',R:'1E11111E141211',S:'0F10100E01011E',T:'1F040404040404',U:'1111111111110E',V:'11111111110A04',W:'11111115151B11',X:'11110A040A1111',Y:'11110A04040404',Z:'1F01020408101F',
  '0':'0E11131519110E','1':'040C040404040E','2':'0E11010204081F','3':'1E01010601011E','4':'02060A121F0202','5':'1F10101E01011E','6':'0E10101E11110E','7':'1F010204080808','8':'0E11110E11110E','9':'0E11110F01010E',
  '!':'04040404040004','?':'0E110102040004',':':'00040400040400','.':'0000000000000404','-':'0000001F000000','/':'01010204081010','+':'0004041F040400',"'":'04040800000000',' ':'00000000000000'
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, Array.from({ length: 7 }, (_, i) => parseInt(v.slice(i * 2, i * 2 + 2), 16))]));
export const textWidth = (text, scale) => (String(text).length * 6 - 1) * scale;
export function text(ctx, value, x, y, scale = 1, color = '#fff', align = 'left', shadow = false) {
  const str = String(value).toUpperCase();
  if (align === 'center') x -= textWidth(str, scale) / 2;
  if (align === 'right') x -= textWidth(str, scale);
  x = Math.round(x); y = Math.round(y);
  if (shadow) text(ctx, str, x + scale, y + scale, scale, '#151923');
  ctx.fillStyle = color;
  for (const ch of str) {
    const rows = FONT[ch] || FONT['?'];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++)
      if (rows[row] & (1 << (4 - col))) ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    x += 6 * scale;
  }
}
export function line(ctx, x0, y0, x1, y1, width, color) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  const half = Math.floor(width / 2);
  for (let guard = 0; guard < 600; guard++) {
    ctx.fillRect(x0 - half, y0 - half, width, width);
    if (x0 === x1 && y0 === y1) break;
    const e = 2 * err;
    if (e >= dy) { err += dy; x0 += sx; }
    if (e <= dx) { err += dx; y0 += sy; }
  }
}
const rect = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
function cloud(ctx, x, y, s = 1) {
  rect(ctx, '#f7fcf5', x + 8*s, y, 22*s, 8*s);
  rect(ctx, '#f7fcf5', x, y + 8*s, 48*s, 10*s);
  rect(ctx, '#e4f4ee', x + 5*s, y + 18*s, 38*s, 3*s);
}
function palm(ctx, x, y, s = 1) {
  line(ctx, x, y, x + 5*s, y - 30*s, 3*s, '#946344');
  const tx = x + 5*s, ty = y - 30*s;
  for (const [dx, dy] of [[-18,3],[-12,-7],[0,-9],[15,-5],[20,5]]) {
    line(ctx, tx, ty, tx + dx*s, ty + dy*s, 3*s, '#438c58');
    line(ctx, tx + dx*s, ty + dy*s, tx + dx*s + Math.sign(dx)*4*s, ty + dy*s + 5*s, 2*s, '#438c58');
  }
}
function markings(ctx, color) {
  ctx.globalAlpha = 0.6;
  line(ctx, 37, 196, 443, 196, 2, color); line(ctx, 5, 251, 475, 251, 2, color);
  line(ctx, 37, 196, 5, 251, 2, color); line(ctx, 443, 196, 475, 251, 2, color);
  line(ctx, 240, 196, 240, 251, 2, color);
  line(ctx, 92, 196, 79, 227, 2, color); line(ctx, 79, 227, 20, 227, 2, color);
  line(ctx, 388, 196, 401, 227, 2, color); line(ctx, 401, 227, 460, 227, 2, color);
  ctx.globalAlpha = 1;
}
function background(court) {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (court === 0) {
    rect(ctx, '#8bdcea', 0, 0, 480, 186);
    cloud(ctx, 34, 30); cloud(ctx, 190, 18, 1.3); cloud(ctx, 374, 42);
    for (let i = 0; i < 16; i++) rect(ctx, '#79cbd9', i*33, 83 + (i*7)%22, 24, 40);
    for (let x = 0; x < 480; x += 12) {
      rect(ctx, '#795640', x, 115 + x%3, 11, 62);
      rect(ctx, '#947052', x + 1, 116 + x%3, 8, 59);
      rect(ctx, '#aa8460', x + 2, 117 + x%3, 2, 56);
    }
    rect(ctx, '#6c8e39', 0, 173, 480, 13);
    for (let x = 0; x < 480; x += 7) rect(ctx, '#96c44d', x, 169 + x%5, 9, 9);
    rect(ctx, '#55565c', 0, 186, 480, 84);
    for (let i = 0; i < 150; i++) rect(ctx, i%2 ? '#606167' : '#494b51', (i*73)%480, 189+(i*37)%80, 1, 1);
    markings(ctx, '#d8d9d5');
  } else if (court === 1) {
    rect(ctx, '#83d4f1', 0, 0, 480, 132);
    cloud(ctx, 20, 35, 1.4); cloud(ctx, 310, 24, 1.6); cloud(ctx, 180, 65);
    rect(ctx, '#47b5df', 0, 132, 480, 54);
    rect(ctx, '#79d2eb', 0, 132, 480, 8);
    for (let i = 0; i < 22; i++) rect(ctx, '#b4ebf2', (i*83)%480, 145+(i*13)%35, 12, 2);
    rect(ctx, '#ead09a', 155, 151, 165, 13); rect(ctx, '#f2dba9', 172, 147, 126, 12);
    rect(ctx, '#8abb63', 183, 143, 105, 9);
    palm(ctx, 192, 151, .8); palm(ctx, 231, 148, 1); palm(ctx, 273, 151, .85);
    rect(ctx, '#edcea0', 0, 186, 480, 84);
    for (let i = 0; i < 160; i++) rect(ctx, '#d9b786', (i*97)%480, 188+(i*41)%81, 2, 1);
    markings(ctx, '#fff9e8');
  } else if (court === 2) {
    rect(ctx, '#b9d8e8', 0, 0, 480, 186);
    cloud(ctx, 55, 31); cloud(ctx, 343, 22, 1.4);
    for (const [x, y, w] of [[-30,100,150],[95,83,170],[245,105,150],[365,76,180]]) {
      for (let j = 0; j < 10; j++) rect(ctx, '#8eafc5', x + j*w/20, y + j*7, w - j*w/10, 80-j*7);
      for (let j = 0; j < 4; j++) rect(ctx, '#f0f7f7', x + w*.35 + j*4, y + j*7, w*.3 - j*8, 8);
    }
    rect(ctx, '#e8f2f2', 0, 174, 480, 12);
    rect(ctx, '#b9dce5', 0, 186, 480, 84);
    for (let i = 0; i < 25; i++) line(ctx, (i*83)%480, 190+(i*31)%75, (i*83)%480+22, 188+(i*31)%75, 1, '#d9eff2');
    markings(ctx, '#ffffff');
  } else {
    rect(ctx, '#25344e', 0, 0, 480, 186);
    rect(ctx, '#f3e4ac', 382, 27, 17, 17); rect(ctx, '#25344e', 389, 24, 13, 13);
    for (let i = 0; i < 35; i++) rect(ctx, '#91a7bd', (i*137)%480, (i*53)%100, 1, 1);
    for (let i = 0; i < 12; i++) {
      rect(ctx, '#35465d', i*43, 91+(i*11)%30, 34, 90);
      for (let j = 0; j < 6; j++) rect(ctx, '#d4b96b', i*43+5+(j%3)*9, 105+Math.floor(j/3)*17, 4, 6);
    }
    rect(ctx, '#263a3c', 0, 174, 480, 12); rect(ctx, '#936c4c', 0, 186, 480, 84);
    for (let y = 188; y < 270; y += 9) {
      rect(ctx, '#79583f', 0, y, 480, 1);
      for (let x = (y%3)*22; x < 480; x += 73) rect(ctx, '#79583f', x, y, 1, 9);
    }
    markings(ctx, '#efe4c7');
  }
  return canvas;
}
function hoop(ctx, h, sway = 0) {
  const post = h.dir === 1 ? 8 : 468;
  line(ctx, post, 222, post, 78, 7, '#252b32'); line(ctx, post, 220, post, 79, 4, '#b9c5c7');
  line(ctx, post, 112, h.board, 82, 5, '#252b32'); line(ctx, post, 111, h.board, 83, 2, '#d6e0df');
  rect(ctx, '#252b32', h.board-3, 70, 7, 70); rect(ctx, '#ecf3ec', h.board-1, 72, 3, 66);
  for (let i = 0; i <= 4; i++) {
    const x = h.left + i*7;
    line(ctx, x, RIM_Y+4, h.left+4+i*5+sway, RIM_Y+21, 1, '#edf3e9');
  }
  line(ctx, h.left+3, RIM_Y+12, h.right-3+sway, RIM_Y+12, 1, '#edf3e9');
  line(ctx, h.left+5+sway, RIM_Y+20, h.right-5+sway, RIM_Y+20, 1, '#edf3e9');
}
function rim(ctx, h) {
  rect(ctx, '#252b32', h.left-3, RIM_Y-5, h.right-h.left+6, 10);
  rect(ctx, '#e6533d', h.left-1, RIM_Y-3, h.right-h.left+2, 6);
  rect(ctx, '#fff0d7', h.left+4, RIM_Y-2, h.right-h.left-8, 2);
}
const SKINS = ['#dba87e', '#9c684c', '#edc39b', '#bb8058'];
const HAIR = ['#34302b', '#25252b', '#d4ae48', '#583b2c'];
function limb(ctx, pts, a, b, c, skin, jersey, sock = false) {
  const [ax, ay, bx, by, cx, cy] = [pts[a*2],pts[a*2+1],pts[b*2],pts[b*2+1],pts[c*2],pts[c*2+1]];
  line(ctx, ax, ay, bx, by, 6, '#20232a'); line(ctx, bx, by, cx, cy, 6, '#20232a');
  line(ctx, ax, ay, bx, by, 3, skin); line(ctx, bx, by, cx, cy, 3, skin);
  if (jersey) line(ctx, ax, ay, ax+(bx-ax)*.35, ay+(by-ay)*.35, 4, jersey);
  if (sock) {
    line(ctx, bx+(cx-bx)*.65, by+(cy-by)*.65, cx, cy, 4, '#f6f3e7');
    rect(ctx, '#20232a', Math.round(cx)-5, Math.round(cy)-2, 10, 5);
    rect(ctx, '#45464b', Math.round(cx)-4, Math.round(cy)-2, 7, 1);
  }
}
export function player(ctx, p, pts, held = false) {
  const skin = SKINS[p.variant], hair = HAIR[p.variant];
  const jersey = p.side ? '#ee6555' : '#f4c644', trim = p.side ? '#ffebe0' : '#754a91';
  limb(ctx, pts, 1, 3, 4, skin, jersey); limb(ctx, pts, 0, 7, 8, skin, null, true);
  line(ctx, pts[0], pts[1], pts[2], pts[3], 12, '#20232a');
  line(ctx, pts[0], pts[1], pts[2], pts[3], 8, jersey);
  line(ctx, pts[0]-3, pts[1]+1, pts[2]-3, pts[3]+5, 2, trim);
  rect(ctx, '#20232a', Math.round(pts[0])-6, Math.round(pts[1])-4, 12, 9);
  rect(ctx, jersey, Math.round(pts[0])-4, Math.round(pts[1])-3, 8, 6);
  limb(ctx, pts, 0, 9, 10, skin, null, true); limb(ctx, pts, 1, 5, 6, skin, jersey);
  const hx = Math.round(pts[4]), hy = Math.round(pts[5]), r = p.variant === 2 ? 9 : 7;
  rect(ctx, '#20232a', hx-r, hy-r-1, r*2, r*2+2);
  rect(ctx, skin, hx-r+2, hy-r+1, r*2-4, r*2-2);
  rect(ctx, hair, hx-r+2, hy-r+1, r*2-4, 4);
  rect(ctx, hair, hx-r+2, hy-r+4, 3, 3);
  rect(ctx, '#20232a', hx+p.d*(r-4), hy-1, 2, 2);
  rect(ctx, '#9b654d', hx+p.d*(r-3), hy+4, 2, 1);
  if (held) rect(ctx, trim, hx-r+2, hy-r+5, r*2-4, 2);
}
export function ball(ctx, x, y, type = 0, radius = 7, spin = 0) {
  x = Math.round(x); y = Math.round(y); const r = Math.round(radius);
  const colors = ['#ef941f', '#8c98a5', '#a8db52', '#ef6654'];
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r*r-dy*dy));
    rect(ctx, '#29252a', x-w, y+dy, w*2+1, 1);
    if (Math.abs(dy) < r) {
      const inner = Math.max(0, w-1);
      rect(ctx, colors[type], x-inner, y+dy, inner*2+1, 1);
      if (type === 3) {
        const stripe = ['#ef6654','#f2bd45','#8bc66b','#62b9d8','#9a78c5'][clamp(Math.floor((dy+r)/(r*2)*5),0,4)];
        rect(ctx, stripe, x-inner, y+dy, inner*2+1, 1);
      }
    }
  }
  const shift = Math.round(Math.sin(spin) * 2);
  line(ctx, x-r+2, y+shift, x+r-2, y-shift, 1, '#594025');
  line(ctx, x+shift, y-r+2, x-shift, y+r-2, 1, '#594025');
  rect(ctx, '#ffd779', x-3, y-r+2, 3, 1);
}
function shadow(ctx, x, width, alpha = .18) {
  ctx.globalAlpha = alpha; rect(ctx, '#171c25', Math.round(x-width/2), FLOOR+1, width, 3);
  rect(ctx, '#171c25', Math.round(x-width/2+3), FLOOR, width-6, 5); ctx.globalAlpha = 1;
}
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false; this.backgrounds = new Map();
  }
  bg(court) {
    if (!this.backgrounds.has(court)) this.backgrounds.set(court, background(court));
    return this.backgrounds.get(court);
  }
  draw(game, prev, alpha = 1, menu = false) {
    const ctx = this.ctx;
    ctx.drawImage(this.bg(menu ? 0 : game.court), 0, 0);
    const sway = game.phase === 'score' ? Math.round(Math.sin(game.timer*.22)*3) : 0;
    for (const h of HOOPS) hoop(ctx, h, sway);
    if (menu) {
      text(ctx, 'BASKET', 82, 39, 4, '#e8edf0', 'left', true);
      text(ctx, 'RANDOM', 250, 39, 4, '#f4bd43', 'left', true);
      text(ctx, 'RAGDOLL BASKETBALL', 240, 76, 1, '#253447', 'center');
      for (const p of game.players) {
        const flat = [];
        for (let i = 0; i < p.pts.length; i++) flat.push(num(p.pts[i].x), num(p.pts[i].y));
        shadow(ctx, flat[0], 23); player(ctx, p, flat);
      }
      ball(ctx, 240, 177 + Math.sin(performance.now()/430)*5, 0);
      return;
    }
    const points = game.players.map((p, pi) => {
      const out = new Array(22);
      for (let i = 0; i < 11; i++) for (let k = 0; k < 2; k++) {
        const index = pi*22+i*2+k, current = k ? p.pts[i].y : p.pts[i].x;
        out[i*2+k] = num(prev[index] + (current-prev[index])*alpha);
      }
      return out;
    });
    for (let i = 0; i < 2; i++) shadow(ctx, points[i][0], 22);
    const bx = num(prev[44]+(game.ball.x-prev[44])*alpha), by = num(prev[45]+(game.ball.y-prev[45])*alpha);
    shadow(ctx, bx, 12, .12);
    for (let i = 0; i < 2; i++) player(ctx, game.players[i], points[i], game.ball.owner === i);
    ball(ctx, bx, by, game.ballType, [7,8,6,7][game.ballType], num(game.ball.spin));
    for (const h of HOOPS) rim(ctx, h);
    if (game.ball.owner !== -1) {
      const p = game.players[game.ball.owner], pts = points[game.ball.owner];
      const x = pts[0], y = pts[1]-43;
      rect(ctx, '#20232a', Math.round(x)-13, Math.round(y), 26, 3);
      rect(ctx, '#f4c644', Math.round(x)-12, Math.round(y)+1, Math.round(24*clamp(game.ball.holdTicks/165,0,1)), 1);
    }
    if (game.phase === 'countdown') {
      text(ctx, game.round === 1 ? 'GET READY' : 'NEW ROUND', 240, 83, 2, '#fff', 'center', true);
      text(ctx, Math.max(1, Math.ceil(game.timer/30)), 240, 108, 5, '#f4c644', 'center', true);
    } else if (game.phase === 'score') {
      text(ctx, 'BASKET!', 240, 48, 5, game.lastScorer ? '#ff7962' : '#ffd35a', 'center', true);
      text(ctx, game.ballType === 3 ? '+2' : '+1', 240, 91, 2, '#fff', 'center', true);
    }
  }
}

export function paintIcons(root = document) {
  for (const canvas of root.querySelectorAll('canvas[data-icon]')) {
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const kind = canvas.dataset.icon;
    if (kind === 'local') {
      for (const [x, color] of [[14,'#f4c644'],[34,'#ee6555']]) {
        rect(ctx, '#171c25', x-5, 3, 10, 10); rect(ctx, '#dba87e', x-3, 5, 6, 6);
        line(ctx, x, 15, x, 25, 7, '#171c25'); line(ctx, x, 15, x, 24, 4, color);
        line(ctx, x-2, 24, x-6, 30, 3, '#171c25'); line(ctx, x+2, 24, x+6, 30, 3, '#171c25');
      }
    } else if (kind === 'online') {
      for (let y = -12; y <= 12; y++) {
        const w = Math.floor(Math.sqrt(144-y*y)); rect(ctx, '#172b39', 24-w, 16+y, w*2, 1);
        if (Math.abs(y)<11) rect(ctx, '#65bedb', 25-w, 16+y, w*2-2, 1);
      }
      line(ctx, 13, 16, 35, 16, 1, '#244b61'); line(ctx, 24, 5, 24, 27, 1, '#244b61');
      line(ctx, 18, 7, 15, 16, 1, '#244b61'); line(ctx, 15, 16, 18, 25, 1, '#244b61');
      line(ctx, 30, 7, 33, 16, 1, '#244b61'); line(ctx, 33, 16, 30, 25, 1, '#244b61');
    } else {
      rect(ctx, '#171c25', 10, 7, 28, 22); rect(ctx, '#b8c9cb', 12, 9, 24, 18);
      rect(ctx, '#171c25', 15, 13, 18, 8); rect(ctx, '#f4c644', 17, 15, 4, 3); rect(ctx, '#f4c644', 27, 15, 4, 3);
      rect(ctx, '#171c25', 22, 2, 4, 6); rect(ctx, '#ee6555', 21, 1, 6, 3);
      rect(ctx, '#171c25', 18, 24, 12, 2); rect(ctx, '#b8c9cb', 16, 29, 16, 3);
    }
  }
}
