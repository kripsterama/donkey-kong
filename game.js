'use strict';

// ============================================================
// CANVAS SETUP
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 448, H = 512;
canvas.width = W;
canvas.height = H;

function resizeCanvas() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================================
// CONSTANTS
// ============================================================
const GRAVITY = 0.38;
const MAX_FALL = 7;
const P_SPEED = 1.6;
const P_CLIMB = 1.2;
const P_JUMP = -5.8;
const P_W = 14;
const P_H = 22;
const BARREL_W = 12;
const BARREL_H = 10;
const BARREL_SPD = 1.4;
const GIRDER_H = 8;
const LADDER_W = 14;
const BARREL_LADDER_CHANCE = 0.012;
const HAMMER_TIME = 540;

// ============================================================
// COLORS
// ============================================================
const C = {
    BG: '#000', GIRDER1: '#CC3300', GIRDER2: '#881100',
    LADDER: '#00BBCC', TEXT: '#FFF', TEXT2: '#00CCCC',
    HAT: '#CC0000', SKIN: '#E8A060', SHIRT: '#CC0000',
    OVERALL: '#2828B0', SHOE: '#774400',
    DK: '#A05000', DK_CHEST: '#D8A050', DK_FACE: '#E8A060',
    BARREL1: '#C87030', BARREL2: '#704020', BARREL3: '#503010',
    OIL: '#0000CC', FIRE1: '#FF6800', FIRE2: '#FFD800',
    HAMMER_C: '#00CCCC', PAULINE: '#FF60A0', P_HAIR: '#884400',
};

// ============================================================
// LEVEL DATA
// ============================================================
const PLATS = [
    { x1: 16, y1: 80, x2: 208, y2: 80 },       // 0: DK platform (flat, partial)
    { x1: 16, y1: 152, x2: 432, y2: 172 },      // 1: slopes down-right
    { x1: 16, y1: 248, x2: 432, y2: 228 },      // 2: slopes down-left
    { x1: 16, y1: 300, x2: 432, y2: 320 },      // 3: slopes down-right
    { x1: 16, y1: 392, x2: 432, y2: 372 },      // 4: slopes down-left
    { x1: 16, y1: 456, x2: 432, y2: 456 },      // 5: bottom (flat)
];
const PAULINE_PLAT = { x1: 148, y1: 48, x2: 228, y2: 48 };

function platY(p, x) {
    const t = Math.max(0, Math.min(1, (x - p.x1) / (p.x2 - p.x1)));
    return p.y1 + t * (p.y2 - p.y1);
}

// Ladders: {x, topPlat, botPlat, broken}
const LADDER_DEFS = [
    { x: 408, tp: 4, bp: 5 },
    { x: 228, tp: 4, bp: 5, broken: true },
    { x: 56,  tp: 3, bp: 4 },
    { x: 288, tp: 3, bp: 4, broken: true },
    { x: 408, tp: 2, bp: 3 },
    { x: 168, tp: 2, bp: 3, broken: true },
    { x: 56,  tp: 1, bp: 2 },
    { x: 320, tp: 1, bp: 2, broken: true },
    { x: 168, tp: 0, bp: 1 },
];

const LADDERS = LADDER_DEFS.map(ld => {
    const yTop = platY(PLATS[ld.tp], ld.x) + GIRDER_H;
    const yBot = platY(PLATS[ld.bp], ld.x);
    const mid = (yTop + yBot) / 2;
    return {
        x: ld.x, tp: ld.tp, bp: ld.bp,
        yTop: ld.broken ? mid : yTop,
        yBot: ld.broken ? mid + (yBot - mid) * 0.6 : yBot,
        fullTop: yTop, fullBot: yBot,
        broken: !!ld.broken,
    };
});

const HAMMER_SPOTS = [
    { x: 88, pi: 2 },
    { x: 360, pi: 4 },
];

// ============================================================
// AUDIO
// ============================================================
let audioCtx = null;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function tone(freq, dur, type, vol) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = vol || 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
}
function sfxJump() { tone(260,0.08); setTimeout(()=>tone(520,0.08),60); }
function sfxDie() {
    tone(400,0.15,'sawtooth',0.12); setTimeout(()=>tone(300,0.15,'sawtooth',0.1),150);
    setTimeout(()=>tone(200,0.2,'sawtooth',0.08),300); setTimeout(()=>tone(100,0.3,'sawtooth',0.06),500);
}
function sfxScore() { tone(880,0.05,undefined,0.06); setTimeout(()=>tone(1320,0.05,undefined,0.06),40); }
function sfxHammer() { tone(120,0.06,'square',0.1); }
function sfxSmash() { tone(80,0.12,'sawtooth',0.12); }
function sfxWin() {
    [523,659,784,1047].forEach((n,i)=>setTimeout(()=>tone(n,0.15,'square',0.08),i*140));
}
function sfxWalk() { tone(60,0.03,'square',0.02); }
function sfxBarrelRoll() { tone(40,0.02,'square',0.01); }
function sfxIntro() {
    const melody = [262,294,330,349,392,349,330,294];
    melody.forEach((n,i)=>setTimeout(()=>tone(n,0.12,'square',0.06),i*100));
}

// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    initAudio();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
const kL = () => keys.ArrowLeft || keys.KeyA;
const kR = () => keys.ArrowRight || keys.KeyD;
const kU = () => keys.ArrowUp || keys.KeyW;
const kD = () => keys.ArrowDown || keys.KeyS;
const kJ = () => keys.Space;
const kStart = () => keys.Enter || keys.Space;

// ============================================================
// GAME STATE
// ============================================================
const ST = { TITLE:0, INTRO:1, PLAY:2, DIE:3, OVER:4, WIN:5 };
let state = ST.TITLE, stTimer = 0, score = 0, hi = 0, lives = 3, lvl = 1;
let bonus = 5000, bonusTick = 0, frame = 0;

let pl = {}; // player
let barrels = [], bTimer = 0, bId = 0;
let hammers = [];
let oilFire = false;
let fireballs = [];
let popups = []; // score popups

function showPopup(x, y, text) {
    popups.push({ x, y, text, timer: 45 });
}

function resetPlayer() {
    Object.assign(pl, {
        x: 70, y: 456, vx: 0, vy: 0, dir: 1,
        ground: true, ladder: false, ladderIdx: -1, platIdx: 5,
        hammer: false, hammerT: 0,
        wFrame: 0, wTimer: 0, cFrame: 0,
        jumped: new Set(), dead: false,
    });
}

function resetLevel() {
    resetPlayer();
    barrels = []; bTimer = 0;
    hammers = HAMMER_SPOTS.map((h,i) => ({
        x: h.x, y: platY(PLATS[h.pi], h.x), pi: h.pi, got: false, id: i,
    }));
    oilFire = false;
    fireballs = [];
    popups = [];
    bonus = 5000; bonusTick = 0;
}

function startGame() {
    score = 0; lives = 3; lvl = 1;
    resetLevel();
    state = ST.INTRO; stTimer = 120;
    sfxIntro();
}

// ============================================================
// COLLISION HELPERS
// ============================================================
function findPlat(x, y, vy) {
    for (let i = 0; i < PLATS.length; i++) {
        const p = PLATS[i];
        if (x >= p.x1 + 4 && x <= p.x2 - 4) {
            const sy = platY(p, x);
            if (y >= sy - 2 && y <= sy + 8 && vy >= 0) return i;
        }
    }
    return -1;
}

function findPlatBelow(x, y, margin) {
    const m = margin || 0;
    let best = -1, bestY = 9999;
    for (let i = 0; i < PLATS.length; i++) {
        const p = PLATS[i];
        if (x >= p.x1 - m && x <= p.x2 + m) {
            const cx = Math.max(p.x1, Math.min(p.x2, x));
            const sy = platY(p, cx);
            if (sy > y + 2 && sy < bestY) { bestY = sy; best = i; }
        }
    }
    return best;
}

function findLadder(x, y) {
    for (let i = 0; i < LADDERS.length; i++) {
        const l = LADDERS[i];
        if (l.broken) continue;
        if (Math.abs(x - l.x) < LADDER_W / 2 + 3 && y >= l.yTop - 4 && y <= l.yBot + 4)
            return i;
    }
    return -1;
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

// ============================================================
// UPDATE
// ============================================================
function updatePlayer() {
    const p = pl;
    // Hammer countdown
    if (p.hammer) {
        p.hammerT--;
        if (p.hammerT <= 0) p.hammer = false;
        if (frame % 8 === 0) sfxHammer();
    }

    if (p.ladder) {
        // CLIMBING
        const l = LADDERS[p.ladderIdx];
        p.vx = 0; p.vy = 0;
        if (kU()) {
            p.y -= P_CLIMB; p.cFrame++;
            if (p.y <= l.fullTop + GIRDER_H) {
                p.y = platY(PLATS[l.tp], l.x);
                p.ladder = false; p.ladderIdx = -1;
                p.ground = true; p.platIdx = l.tp;
                p.x = l.x;
            }
        } else if (kD()) {
            p.y += P_CLIMB; p.cFrame++;
            if (p.y >= l.fullBot) {
                p.y = platY(PLATS[l.bp], l.x);
                p.ladder = false; p.ladderIdx = -1;
                p.ground = true; p.platIdx = l.bp;
                p.x = l.x;
            }
        }
    } else if (p.ground) {
        // ON GROUND
        let moving = false;
        if (kL()) { p.x -= P_SPEED; p.dir = -1; moving = true; }
        if (kR()) { p.x += P_SPEED; p.dir = 1; moving = true; }
        if (moving) {
            p.wTimer++;
            if (p.wTimer % 6 === 0) { p.wFrame++; sfxWalk(); }
        } else { p.wTimer = 0; }

        // Stay on platform
        const plat = PLATS[p.platIdx];
        if (plat) {
            p.x = Math.max(plat.x1 + P_W/2, Math.min(plat.x2 - P_W/2, p.x));
            p.y = platY(plat, p.x);
        }

        // Try climb up
        if (kU() && !p.hammer) {
            const li = findLadder(p.x, p.y - 4);
            if (li >= 0 && p.y >= LADDERS[li].yBot - 6) {
                p.ladder = true; p.ladderIdx = li;
                p.ground = false; p.x = LADDERS[li].x;
                return;
            }
        }
        // Try climb down
        if (kD() && !p.hammer) {
            for (let i = 0; i < LADDERS.length; i++) {
                const l = LADDERS[i];
                if (l.broken) continue;
                if (Math.abs(p.x - l.x) < LADDER_W/2 + 3 && Math.abs(p.y - l.yTop) < GIRDER_H + 6) {
                    p.ladder = true; p.ladderIdx = i;
                    p.ground = false; p.x = l.x;
                    p.y = l.yTop + 4;
                    return;
                }
            }
        }
        // Jump
        const noLadderUp = findLadder(p.x, p.y - 4) < 0 || p.hammer;
        if ((kJ() || (kU() && noLadderUp)) && p.ground) {
            p.vy = P_JUMP; p.ground = false;
            p.jumped = new Set();
            sfxJump();
        }
    } else {
        // IN AIR
        p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
        p.y += p.vy;
        if (kL()) p.x -= P_SPEED * 0.8;
        if (kR()) p.x += P_SPEED * 0.8;
        p.x = Math.max(20, Math.min(W - 20, p.x));

        // Land on platform
        const pi = findPlat(p.x, p.y, p.vy);
        if (pi >= 0) {
            p.y = platY(PLATS[pi], p.x);
            p.vy = 0; p.ground = true; p.platIdx = pi;
        }
        // Fall off screen
        if (p.y > H + 20) { killPlayer(); }
    }

    // Pick up hammer
    if (!p.hammer) {
        hammers.forEach(hm => {
            if (!hm.got && Math.abs(p.x - hm.x) < 16 && Math.abs(p.y - hm.y) < 20) {
                hm.got = true; p.hammer = true; p.hammerT = HAMMER_TIME;
            }
        });
    }

    // Check level complete (reach DK platform or Pauline's platform)
    if ((p.platIdx === 0 && p.ground) || p.y < 60) {
        state = ST.WIN; stTimer = 180;
        sfxWin();
        score += bonus;
    }
}

function killPlayer() {
    if (pl.dead) return;
    pl.dead = true;
    sfxDie();
    state = ST.DIE; stTimer = 120;
}

function spawnBarrel() {
    // DK throws barrel right — starts on DK's platform rolling right
    const spawnX = 100;
    const b = {
        x: spawnX, y: platY(PLATS[0], spawnX),
        vx: BARREL_SPD * (1 + lvl * 0.1),
        vy: 0, ground: true, platIdx: 0,
        rolling: true, frame: 0, id: bId++,
        onLadder: false, ladderIdx: -1,
        fallenFrom: -1,
    };
    barrels.push(b);
}

function updateBarrels() {
    // Throw timer
    const interval = Math.max(60, 180 - lvl * 15);
    bTimer++;
    if (bTimer >= interval) {
        bTimer = 0;
        spawnBarrel();
    }

    barrels.forEach(b => {
        b.frame++;

        if (b.onLadder) {
            // Barrel going down a ladder
            const l = LADDERS[b.ladderIdx];
            b.y += 1.5;
            b.x = l.x;
            if (b.y >= l.fullBot) {
                b.onLadder = false;
                b.y = platY(PLATS[l.bp], l.x);
                b.platIdx = l.bp;
                b.ground = true;
                // Determine roll direction from slope
                const p = PLATS[l.bp];
                b.vx = (p.y2 > p.y1) ? BARREL_SPD * (1 + lvl * 0.1) : -BARREL_SPD * (1 + lvl * 0.1);
            }
            return;
        }

        if (b.ground) {
            // Rolling on platform
            const p = PLATS[b.platIdx];
            b.x += b.vx;
            b.y = platY(p, b.x);

            // Check if barrel can go down a ladder (barrels use all ladders)
            for (let i = 0; i < LADDERS.length; i++) {
                const l = LADDERS[i];
                if (l.tp === b.platIdx && Math.abs(b.x - l.x) < 8) {
                    if (Math.random() < BARREL_LADDER_CHANCE) {
                        b.onLadder = true;
                        b.ladderIdx = i;
                        b.x = l.x;
                        b.y = l.fullTop + GIRDER_H;
                        b.ground = false;
                        return;
                    }
                }
            }

            // Fall off platform edge
            if (b.x < p.x1 - 2 || b.x > p.x2 + 2) {
                b.ground = false;
                b.vy = 0;
                b.fallenFrom = b.platIdx; // remember so we don't re-land on same platform
            }
        } else if (!b.onLadder) {
            // Falling
            b.vy = Math.min(b.vy + GRAVITY, MAX_FALL);
            b.y += b.vy;

            // Land on platform (use margin for edge cases, skip the platform we fell from)
            const pi = findPlatBelow(b.x, b.y - BARREL_H - 4, 12);
            if (pi >= 0 && pi !== b.fallenFrom) {
                const cx = Math.max(PLATS[pi].x1 + 4, Math.min(PLATS[pi].x2 - 4, b.x));
                const sy = platY(PLATS[pi], cx);
                if (b.y >= sy - 2) {
                    b.x = cx;
                    b.y = sy;
                    b.vy = 0;
                    b.ground = true;
                    b.platIdx = pi;
                    b.fallenFrom = -1;
                    // Determine roll direction from slope
                    const p = PLATS[pi];
                    const spd = BARREL_SPD * (1 + lvl * 0.1);
                    if (Math.abs(p.y2 - p.y1) < 2) {
                        // Flat platform — bottom rolls left toward oil drum
                        b.vx = (pi === 0) ? spd : -spd;
                    } else {
                        // Sloped — roll downhill (toward higher y value)
                        b.vx = (p.y2 > p.y1) ? spd : -spd;
                    }
                }
            }
        }

        // Reached oil drum area
        if (b.y >= 450 && b.x < 60) {
            oilFire = true;
            b.remove = true;
            // Spawn fireball occasionally
            if (fireballs.length < 2 + lvl && Math.random() < 0.5) {
                fireballs.push({
                    x: 40, y: 450, vx: 0.7, vy: 0,
                    platIdx: 5, ground: true, frame: 0,
                    dir: 1, moveTimer: 0,
                });
            }
        }
        // Off screen
        if (b.y > H + 30 || b.x < -20 || b.x > W + 20) b.remove = true;
    });

    barrels = barrels.filter(b => !b.remove);
}

function updateFireballs() {
    fireballs.forEach(fb => {
        fb.frame++;
        fb.moveTimer++;
        if (fb.ground) {
            const p = PLATS[fb.platIdx];
            fb.x += fb.vx * fb.dir;
            fb.y = platY(p, fb.x);

            // Randomly try to go up ladders toward player
            if (fb.moveTimer % 30 === 0) {
                for (let i = 0; i < LADDERS.length; i++) {
                    const l = LADDERS[i];
                    if (l.broken) continue;
                    if (l.bp === fb.platIdx && Math.abs(fb.x - l.x) < 8) {
                        if (pl.y < fb.y && Math.random() < 0.4) {
                            fb.ground = false;
                            fb.ladder = true;
                            fb.ladderIdx = i;
                            fb.x = l.x;
                            fb.climbDir = -1; // going up
                            break;
                        }
                    }
                    if (l.tp === fb.platIdx && Math.abs(fb.x - l.x) < 8) {
                        if (pl.y > fb.y && Math.random() < 0.4) {
                            fb.ground = false;
                            fb.ladder = true;
                            fb.ladderIdx = i;
                            fb.x = l.x;
                            fb.climbDir = 1; // going down
                            break;
                        }
                    }
                }
            }

            // Reverse at platform edges
            if (fb.x <= p.x1 + 8) fb.dir = 1;
            if (fb.x >= p.x2 - 8) fb.dir = -1;
        } else if (fb.ladder) {
            const l = LADDERS[fb.ladderIdx];
            fb.y += fb.climbDir * 0.8;
            if (fb.climbDir < 0 && fb.y <= l.fullTop + GIRDER_H) {
                fb.y = platY(PLATS[l.tp], l.x);
                fb.platIdx = l.tp;
                fb.ground = true;
                fb.ladder = false;
                fb.dir = pl.x > fb.x ? 1 : -1;
            }
            if (fb.climbDir > 0 && fb.y >= l.fullBot) {
                fb.y = platY(PLATS[l.bp], l.x);
                fb.platIdx = l.bp;
                fb.ground = true;
                fb.ladder = false;
                fb.dir = pl.x > fb.x ? 1 : -1;
            }
        }
    });
}

function checkCollisions() {
    const px = pl.x - P_W/2, py = pl.y - P_H;

    // Barrels
    barrels.forEach(b => {
        const bx = b.x - BARREL_W/2, by = b.y - BARREL_H;
        if (overlap(px, py, P_W, P_H, bx, by, BARREL_W, BARREL_H)) {
            if (pl.hammer) {
                b.remove = true;
                score += 300;
                sfxSmash();
                showPopup(b.x, b.y - 16, '300');
            } else {
                killPlayer();
            }
        }
        // Jump over detection - award points when jumping over a nearby barrel
        if (!pl.ground && !pl.jumped.has(b.id) && b.ground) {
            const above = pl.y - P_H < b.y - BARREL_H + 4;
            const near = Math.abs(pl.x - b.x) < 24;
            const vertClose = Math.abs(pl.y - b.y) < P_H + 8;
            if (above && near && vertClose) {
                pl.jumped.add(b.id);
                score += 100;
                sfxScore();
                // Show score popup
                showPopup(b.x, b.y - 16, '100');
            }
        }
    });
    barrels = barrels.filter(b => !b.remove);

    // Fireballs
    fireballs.forEach(fb => {
        const fx = fb.x - 6, fy = fb.y - 10;
        if (overlap(px, py, P_W, P_H, fx, fy, 12, 10)) {
            if (pl.hammer) {
                fb.remove = true;
                score += 500;
                sfxSmash();
            } else {
                killPlayer();
            }
        }
    });
    fireballs = fireballs.filter(f => !f.remove);
}

function update() {
    frame++;

    if (state === ST.TITLE) {
        if (kStart()) { startGame(); keys.Space = false; keys.Enter = false; }
        return;
    }

    if (state === ST.INTRO) {
        stTimer--;
        if (stTimer <= 0) state = ST.PLAY;
        return;
    }

    if (state === ST.PLAY) {
        updatePlayer();
        updateBarrels();
        updateFireballs();
        checkCollisions();
        // Popups
        popups.forEach(p => { p.timer--; p.y -= 0.5; });
        popups = popups.filter(p => p.timer > 0);
        // Bonus timer
        bonusTick++;
        if (bonusTick >= 120) {
            bonusTick = 0;
            bonus = Math.max(0, bonus - 100);
        }
        return;
    }

    if (state === ST.DIE) {
        stTimer--;
        if (stTimer <= 0) {
            lives--;
            if (lives <= 0) {
                state = ST.OVER; stTimer = 240;
                if (score > hi) hi = score;
            } else {
                resetPlayer();
                barrels = [];
                fireballs = [];
                bTimer = 0;
                state = ST.PLAY;
            }
        }
        return;
    }

    if (state === ST.OVER) {
        stTimer--;
        if (stTimer <= 0 || kStart()) {
            state = ST.TITLE;
            keys.Space = false; keys.Enter = false;
        }
        return;
    }

    if (state === ST.WIN) {
        stTimer--;
        if (stTimer <= 0) {
            if (score > hi) hi = score;
            lvl++;
            resetLevel();
            state = ST.INTRO; stTimer = 60;
        }
        return;
    }
}

// ============================================================
// DRAWING
// ============================================================
function drawGirders() {
    PLATS.forEach(p => {
        const n = Math.ceil((p.x2 - p.x1) / 8);
        for (let i = 0; i < n; i++) {
            const x = p.x1 + i * 8;
            const y = platY(p, x + 4);
            ctx.fillStyle = C.GIRDER1;
            ctx.fillRect(x, y, 8, GIRDER_H);
            ctx.fillStyle = C.GIRDER2;
            ctx.fillRect(x, y + 2, 8, 4);
            ctx.fillStyle = C.GIRDER1;
            ctx.fillRect(x + 1, y + 3, 6, 2);
        }
    });
    // Pauline platform
    const pp = PAULINE_PLAT;
    for (let i = 0; i < Math.ceil((pp.x2 - pp.x1) / 8); i++) {
        const x = pp.x1 + i * 8;
        ctx.fillStyle = C.GIRDER1;
        ctx.fillRect(x, pp.y1, 8, GIRDER_H);
        ctx.fillStyle = C.GIRDER2;
        ctx.fillRect(x, pp.y1 + 2, 8, 4);
    }
}

function drawLadders() {
    LADDERS.forEach(l => {
        const x = l.x - LADDER_W / 2;
        const h = l.yBot - l.yTop;
        ctx.fillStyle = C.LADDER;
        ctx.fillRect(x, l.yTop, 2, h);
        ctx.fillRect(x + LADDER_W - 2, l.yTop, 2, h);
        for (let i = 0; i <= Math.floor(h / 8); i++) {
            const ry = l.yTop + i * 8;
            if (ry <= l.yBot) ctx.fillRect(x + 2, ry, LADDER_W - 4, 2);
        }
    });
}

function drawOilDrum() {
    ctx.fillStyle = C.OIL;
    ctx.fillRect(20, 432, 30, 28);
    ctx.fillStyle = '#4040FF';
    ctx.fillRect(22, 434, 26, 3);
    ctx.fillRect(22, 455, 26, 3);
    ctx.fillStyle = '#FFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OIL', 35, 450);
    if (oilFire) {
        ctx.fillStyle = frame % 4 < 2 ? C.FIRE1 : C.FIRE2;
        ctx.fillRect(28, 420, 6, 12);
        ctx.fillStyle = frame % 4 < 2 ? C.FIRE2 : C.FIRE1;
        ctx.fillRect(34, 422, 5, 10);
        ctx.fillRect(24, 424, 4, 8);
    }
}

function drawMario() {
    const p = pl;
    const x = Math.round(p.x), y = Math.round(p.y);
    const d = p.dir;

    if (state === ST.DIE) {
        // Death spin animation
        const spin = Math.floor(stTimer / 8) % 4;
        ctx.save();
        ctx.translate(x, y - 11);
        ctx.rotate(spin * Math.PI / 2);
        ctx.fillStyle = C.HAT;
        ctx.fillRect(-7, -11, 14, 6);
        ctx.fillStyle = C.SKIN;
        ctx.fillRect(-5, -5, 10, 5);
        ctx.fillStyle = C.OVERALL;
        ctx.fillRect(-5, 0, 10, 8);
        ctx.fillStyle = C.SHOE;
        ctx.fillRect(-5, 8, 10, 3);
        ctx.restore();
        return;
    }

    if (p.ladder) {
        // Climbing
        const alt = Math.floor(p.cFrame / 4) % 2;
        // Head
        ctx.fillStyle = C.HAT;
        ctx.fillRect(x - 6, y - 22, 12, 3);
        ctx.fillStyle = C.SKIN;
        ctx.fillRect(x - 5, y - 19, 10, 4);
        // Body
        ctx.fillStyle = C.SHIRT;
        ctx.fillRect(x - 6, y - 15, 12, 5);
        // Arms alternating
        ctx.fillStyle = C.SKIN;
        ctx.fillRect(x - 9 + alt * 3, y - 16, 3, 3);
        ctx.fillRect(x + 6 - alt * 3, y - 13, 3, 3);
        // Overalls
        ctx.fillStyle = C.OVERALL;
        ctx.fillRect(x - 5, y - 10, 10, 5);
        // Legs alternating
        ctx.fillRect(x - 5 + alt * 2, y - 5, 4, 3);
        ctx.fillRect(x + 1 - alt * 2, y - 5, 4, 3);
        // Shoes
        ctx.fillStyle = C.SHOE;
        ctx.fillRect(x - 5 + alt * 2, y - 2, 4, 2);
        ctx.fillRect(x + 1 - alt * 2, y - 2, 4, 2);
        return;
    }

    const fl = d < 0;
    // Hat
    ctx.fillStyle = C.HAT;
    ctx.fillRect(x + (fl ? -7 : -5), y - 23, 12, 3);
    ctx.fillRect(x + (fl ? -5 : -3), y - 25, 7, 2);
    // Face
    ctx.fillStyle = C.SKIN;
    ctx.fillRect(x - 5, y - 20, 10, 5);
    // Nose
    ctx.fillRect(x + (fl ? -7 : 5), y - 18, 2, 2);
    // Eye
    ctx.fillStyle = '#000';
    ctx.fillRect(x + (fl ? -3 : 3), y - 19, 2, 2);
    // Body
    ctx.fillStyle = C.SHIRT;
    ctx.fillRect(x - 6, y - 15, 12, 5);
    // Arms
    ctx.fillStyle = C.SKIN;
    if (p.hammer) {
        const hf = Math.floor(frame / 6) % 2;
        if (hf === 0) {
            // Hammer up
            ctx.fillRect(x + (d > 0 ? 6 : -9), y - 22, 3, 8);
            ctx.fillStyle = C.HAMMER_C;
            ctx.fillRect(x + (d > 0 ? 4 : -11), y - 28, 7, 6);
            ctx.fillStyle = C.SHOE;
            ctx.fillRect(x + (d > 0 ? 7 : -8), y - 22, 2, 10);
        } else {
            // Hammer forward
            ctx.fillRect(x + (d > 0 ? 6 : -9), y - 14, 3, 3);
            ctx.fillStyle = C.HAMMER_C;
            ctx.fillRect(x + (d > 0 ? 9 : -18), y - 17, 9, 6);
            ctx.fillStyle = C.SHOE;
            ctx.fillRect(x + (d > 0 ? 6 : -11), y - 14, 12, 2);
        }
    } else {
        ctx.fillRect(x - 9, y - 14, 3, 3);
        ctx.fillRect(x + 6, y - 14, 3, 3);
    }
    // Overalls
    ctx.fillStyle = C.OVERALL;
    ctx.fillRect(x - 5, y - 10, 10, 5);
    // Suspenders
    ctx.fillStyle = C.OVERALL;
    ctx.fillRect(x - 3, y - 14, 2, 4);
    ctx.fillRect(x + 1, y - 14, 2, 4);
    // Legs walk animation
    const wf = Math.floor(p.wFrame / 1) % 2;
    const moving = kL() || kR();
    if (moving && p.ground) {
        ctx.fillRect(x - 5 + wf * 3, y - 5, 4, 3);
        ctx.fillRect(x + 1 - wf * 3, y - 5, 4, 3);
        ctx.fillStyle = C.SHOE;
        ctx.fillRect(x - 6 + wf * 3, y - 2, 5, 2);
        ctx.fillRect(x + 1 - wf * 3, y - 2, 5, 2);
    } else {
        ctx.fillRect(x - 5, y - 5, 4, 3);
        ctx.fillRect(x + 1, y - 5, 4, 3);
        ctx.fillStyle = C.SHOE;
        ctx.fillRect(x - 6, y - 2, 5, 2);
        ctx.fillRect(x + 1, y - 2, 5, 2);
    }
}

function drawDK() {
    const x = 64, y = 80;
    const throwing = barrels.length > 0 && bTimer < 20;
    const beating = state === ST.INTRO;

    // Body
    ctx.fillStyle = C.DK;
    ctx.fillRect(x - 20, y - 34, 40, 24);
    // Chest
    ctx.fillStyle = C.DK_CHEST;
    ctx.fillRect(x - 12, y - 30, 24, 16);
    // Head
    ctx.fillStyle = C.DK;
    ctx.fillRect(x - 14, y - 44, 28, 12);
    // Face
    ctx.fillStyle = C.DK_FACE;
    ctx.fillRect(x - 10, y - 42, 20, 9);
    // Eyes
    ctx.fillStyle = '#FFF';
    ctx.fillRect(x - 7, y - 41, 5, 4);
    ctx.fillRect(x + 3, y - 41, 5, 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 5, y - 40, 2, 2);
    ctx.fillRect(x + 5, y - 40, 2, 2);
    // Brow
    ctx.fillStyle = C.DK;
    ctx.fillRect(x - 8, y - 43, 6, 2);
    ctx.fillRect(x + 3, y - 43, 6, 2);
    // Mouth
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 5, y - 35, 10, 3);
    ctx.fillStyle = '#C04040';
    ctx.fillRect(x - 4, y - 34, 8, 2);
    // Arms
    ctx.fillStyle = C.DK;
    if (beating) {
        const b = Math.floor(frame / 8) % 2;
        ctx.fillRect(x - 26 - b * 3, y - 30, 8, 12);
        ctx.fillRect(x + 18 + b * 3, y - 30, 8, 12);
    } else if (throwing) {
        ctx.fillRect(x - 26, y - 28, 8, 14);
        ctx.fillRect(x + 18, y - 44, 8, 14);
    } else {
        ctx.fillRect(x - 26, y - 28, 8, 14);
        ctx.fillRect(x + 18, y - 28, 8, 14);
    }
    // Hands
    ctx.fillStyle = C.DK_FACE;
    ctx.fillRect(x - 26, y - 18, 6, 4);
    ctx.fillRect(x + 20, y - 18, 6, 4);
    // Legs
    ctx.fillStyle = C.DK;
    ctx.fillRect(x - 14, y - 10, 10, 12);
    ctx.fillRect(x + 4, y - 10, 10, 12);
    // Feet
    ctx.fillRect(x - 16, y, 12, 4);
    ctx.fillRect(x + 4, y, 12, 4);

    // Barrel stack next to DK
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = C.BARREL1;
        ctx.fillRect(x + 30, y - 10 - i * 12, 12, 10);
        ctx.fillStyle = C.BARREL3;
        ctx.fillRect(x + 30, y - 10 - i * 12, 12, 2);
        ctx.fillRect(x + 30, y - 2 - i * 12, 12, 2);
    }
}

function drawPauline() {
    const x = 188, y = 48;
    // Hair
    ctx.fillStyle = C.P_HAIR;
    ctx.fillRect(x - 5, y - 18, 10, 6);
    // Face
    ctx.fillStyle = C.SKIN;
    ctx.fillRect(x - 4, y - 14, 8, 4);
    // Dress
    ctx.fillStyle = C.PAULINE;
    ctx.fillRect(x - 5, y - 10, 10, 7);
    ctx.fillRect(x - 7, y - 3, 14, 3);
    // Legs
    ctx.fillStyle = C.SKIN;
    ctx.fillRect(x - 3, y, 3, 2);
    ctx.fillRect(x + 1, y, 3, 2);
    // HELP!
    if (Math.floor(frame / 30) % 2 === 0) {
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('HELP!', x, y - 22);
    }
}

function drawBarrels() {
    barrels.forEach(b => {
        const x = Math.round(b.x), y = Math.round(b.y);
        const r = BARREL_W / 2;
        ctx.fillStyle = C.BARREL1;
        ctx.fillRect(x - r, y - BARREL_H, BARREL_W, BARREL_H);
        ctx.fillStyle = C.BARREL3;
        ctx.fillRect(x - r, y - BARREL_H, BARREL_W, 2);
        ctx.fillRect(x - r, y - 2, BARREL_W, 2);
        ctx.fillStyle = C.BARREL2;
        const rot = Math.floor(b.frame / 4) % 4;
        if (rot % 2 === 0)
            ctx.fillRect(x - 1, y - BARREL_H + 2, 2, BARREL_H - 4);
        else
            ctx.fillRect(x - r + 2, y - BARREL_H / 2 - 1, BARREL_W - 4, 2);
    });
}

function drawFireballs() {
    fireballs.forEach(fb => {
        const x = Math.round(fb.x), y = Math.round(fb.y);
        ctx.fillStyle = frame % 4 < 2 ? C.FIRE1 : C.FIRE2;
        ctx.fillRect(x - 5, y - 10, 10, 10);
        ctx.fillStyle = frame % 4 < 2 ? C.FIRE2 : '#FF0';
        ctx.fillRect(x - 3, y - 8, 6, 6);
        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.fillRect(x - 3, y - 8, 2, 2);
        ctx.fillRect(x + 1, y - 8, 2, 2);
    });
}

function drawHammers() {
    hammers.forEach(hm => {
        if (hm.got) return;
        const x = Math.round(hm.x), y = Math.round(hm.y);
        // Handle
        ctx.fillStyle = C.SHOE;
        ctx.fillRect(x - 1, y - 14, 3, 14);
        // Head
        ctx.fillStyle = C.HAMMER_C;
        ctx.fillRect(x - 4, y - 18, 9, 6);
    });
}

function drawPopups() {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    popups.forEach(p => {
        ctx.fillStyle = '#FFF';
        ctx.fillText(p.text, p.x, p.y);
    });
}

function drawHUD() {
    ctx.fillStyle = '#E04040';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('1UP', 16, 14);
    ctx.fillStyle = C.TEXT;
    ctx.fillText(String(score).padStart(7, '0'), 8, 28);

    ctx.fillStyle = '#E04040';
    ctx.fillText('HIGH SCORE', 156, 14);
    ctx.fillStyle = C.TEXT;
    ctx.fillText(String(hi).padStart(7, '0'), 180, 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.TEXT2;
    ctx.fillText('L=' + String(lvl).padStart(2, '0'), 436, 14);
    ctx.fillStyle = bonus > 1000 ? C.TEXT2 : '#E04040';
    ctx.fillText('BONUS ' + bonus, 436, 28);

    ctx.textAlign = 'left';
    for (let i = 0; i < lives - 1; i++) {
        ctx.fillStyle = C.HAT;
        ctx.fillRect(16 + i * 18, H - 16, 8, 3);
        ctx.fillStyle = C.SKIN;
        ctx.fillRect(17 + i * 18, H - 13, 6, 3);
        ctx.fillStyle = C.OVERALL;
        ctx.fillRect(16 + i * 18, H - 10, 8, 5);
    }
}

function drawTitle() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = C.FIRE1;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DONKEY', W / 2, 160);
    ctx.fillText('KONG', W / 2, 200);

    // Subtitle
    ctx.fillStyle = C.TEXT2;
    ctx.font = '14px monospace';
    ctx.fillText('~ ORIGINAL ARCADE ~', W / 2, 240);

    // High score
    ctx.fillStyle = C.TEXT;
    ctx.font = '12px monospace';
    ctx.fillText('HIGH SCORE: ' + String(hi).padStart(7, '0'), W / 2, 290);

    // Instructions
    ctx.fillStyle = '#888';
    ctx.fillText('ARROW KEYS / WASD = MOVE', W / 2, 340);
    ctx.fillText('SPACE / UP = JUMP', W / 2, 360);
    ctx.fillText('UP / DOWN = CLIMB LADDERS', W / 2, 380);

    // Start prompt
    if (Math.floor(frame / 30) % 2 === 0) {
        ctx.fillStyle = C.FIRE2;
        ctx.font = 'bold 16px monospace';
        ctx.fillText('PRESS ENTER TO START', W / 2, 440);
    }

    // Credits
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText('25m STAGE', W / 2, 490);
}

function drawGameOver() {
    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#E04040';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, 220);

    ctx.fillStyle = C.TEXT;
    ctx.font = '14px monospace';
    ctx.fillText('SCORE: ' + String(score).padStart(7, '0'), W / 2, 270);
    ctx.fillText('HIGH SCORE: ' + String(hi).padStart(7, '0'), W / 2, 295);

    if (Math.floor(frame / 30) % 2 === 0) {
        ctx.fillStyle = C.FIRE2;
        ctx.font = '14px monospace';
        ctx.fillText('PRESS ENTER', W / 2, 350);
    }
}

function drawIntro() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawGirders();
    drawLadders();
    drawOilDrum();
    drawDK();
    drawPauline();

    ctx.fillStyle = C.TEXT2;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE ' + lvl, W / 2, H / 2 - 10);
    ctx.fillStyle = C.TEXT;
    ctx.font = '12px monospace';
    ctx.fillText('HOW HIGH CAN YOU GET?', W / 2, H / 2 + 14);
}

function render() {
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, W, H);

    if (state === ST.TITLE) { drawTitle(); return; }
    if (state === ST.INTRO) { drawIntro(); return; }

    // Game elements
    drawGirders();
    drawLadders();
    drawOilDrum();
    drawHammers();
    drawBarrels();
    drawFireballs();
    drawDK();
    drawPauline();
    drawMario();
    drawPopups();
    drawHUD();

    if (state === ST.OVER) drawGameOver();
    if (state === ST.WIN) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = C.FIRE2;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STAGE CLEAR!', W / 2, H / 2 - 10);
        ctx.fillStyle = C.TEXT;
        ctx.font = '14px monospace';
        ctx.fillText('BONUS: ' + bonus, W / 2, H / 2 + 20);
    }
}

// ============================================================
// MAIN LOOP
// ============================================================
let lastTime = 0;
const FRAME_TIME = 1000 / 60;
let accumulator = 0;

function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    accumulator += dt;

    while (accumulator >= FRAME_TIME) {
        update();
        accumulator -= FRAME_TIME;
    }

    render();
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
