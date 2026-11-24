// ============================================================
// KYRO GAMES — TEMPLE SUBWAY DASH (3D RUNNER + BLACK SHADOW CHASER)
// ============================================================

const STORAGE_KEY = 'kyro_temple_subway_stars_v6';
let starSave = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

let currentLevel = 1;
let gameMode = 'SPLASH'; // SPLASH | HOME | PLAYING | ENDED
let weatherType = 'sunny';

// Straight track lanes (Left, Center, Right)
const LANES = [-2.7, 0, 2.7];
let laneIndex = 1;
let playerX = 0;
let playerY = 0;
let playerVy = 0;
let jumping = false;
let crawling = false;
let crawlTimer = 0;

// Level duration: ~2 min minimum to ~3 min max per level (at ~60fps)
let levelLength = 3100;
let runSpeed = 0.42;
let progressZ = 0;
let coins = 0;
let coinGoal = 20;

// Hit & Black Shadow Chaser mechanics:
// 1st hit brings black shadow runner close for 10s; 2nd hit UNDER 10s = lose + 3.MP3
let chaserActive = false;
let chaserTimeLeft = 0;
let invulnFrames = 0;
let hitSoundCursor = 0;

const funnyHits = [
    "BONK!",
    "OOF! Watch that!",
    "WHOOPS!",
    "RIGHT ON THE SHIN!"
];

// Audio files
const hitAudioList = [
    document.getElementById('snd-1'),
    document.getElementById('snd-2'),
    document.getElementById('snd-3'),
    document.getElementById('snd-4')
];
const winAudio = document.getElementById('snd-win');

function playSound(audioEl) {
    if (!audioEl) return;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
}

function triggerHitSound() {
    playSound(hitAudioList[hitSoundCursor % hitAudioList.length]);
    hitSoundCursor++;
}

// ============================================================
// WEB AUDIO: COIN SOUND, RUNNING FOOTSTEPS & ALTO-STYLE AMBIENT MUSIC
// ============================================================
let audioCtx = null;
let bgmTimer = null;
let stepAccumulator = 0;

function ensureAudioCtx() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function playCoinSound() {
    try {
        const ctx = ensureAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1046.5, now);
        osc.frequency.setValueAtTime(1567.98, now + 0.065);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    } catch (_) {}
}

function playFootstepSound() {
    try {
        const ctx = ensureAudioCtx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);

        gain.gain.setValueAtTime(0.055, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.065);
    } catch (_) {}
}

const altoChords = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 349.23],
    [196.00, 246.94, 293.66, 392.00]
];
let chordIdx = 0;

function playAltoChordStep() {
    if (gameMode !== 'PLAYING') return;
    try {
        const ctx = ensureAudioCtx();
        const now = ctx.currentTime;
        const chord = altoChords[chordIdx % altoChords.length];
        chordIdx++;

        chord.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = i % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.026, now + 0.85);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 3.9);
        });
    } catch (_) {}
}

function startAltoMusic() {
    stopAltoMusic();
    playAltoChordStep();
    bgmTimer = setInterval(playAltoChordStep, 3200);
}

function stopAltoMusic() {
    if (bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
    }
}

// ============================================================
// THREE.JS SCENE & LUSH GREEN RENDERER
// ============================================================
const canvas = document.getElementById('scene-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5ec8f8);
scene.fog = new THREE.FogExp2(0x8be2b4, 0.0045);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 440);
camera.position.set(0, 5.2, 9.2);
camera.lookAt(0, 1.4, -8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;

const hemiLight = new THREE.HemisphereLight(0xd9f99d, 0x15803d, 1.18);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.48);
sunLight.position.set(18, 36, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
scene.add(sunLight);

// ============================================================
// SUBWAY STRAIGHT PATH, RAILS, SLEEPERS & LUSH GREEN VALLEY
// ============================================================
const pathGroup = new THREE.Group();
scene.add(pathGroup);

const roadMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, 0.65, 640),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.68, metalness: 0.14 })
);
roadMesh.position.set(0, -0.325, -290);
roadMesh.receiveShadow = true;
pathGroup.add(roadMesh);

const curbMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.55 });
for (const edgeX of [-5.25, 5.25]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 640), curbMat);
    curb.position.set(edgeX, 0.1, -290);
    curb.receiveShadow = true;
    pathGroup.add(curb);
}

const sleepers = [];
const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.86 });
for (let z = 12; z > -250; z -= 2.4) {
    const row = new THREE.Group();
    for (const laneX of LANES) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.42), sleeperMat);
        tie.position.set(laneX, 0.02, 0);
        tie.receiveShadow = true;
        row.add(tie);
    }
    row.position.z = z;
    scene.add(row);
    sleepers.push(row);
}

const railMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.18 });
for (const laneX of LANES) {
    for (const offset of [-0.52, 0.52]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 640), railMat);
        rail.position.set(laneX + offset, 0.06, -290);
        pathGroup.add(rail);
    }
}

const sideGround = new THREE.Mesh(
    new THREE.PlaneGeometry(380, 660),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.85 })
);
sideGround.rotation.x = -Math.PI / 2;
sideGround.position.set(0, -0.36, -290);
sideGround.receiveShadow = true;
pathGroup.add(sideGround);

// Finish Line Archway at end of level
const finishGroup = new THREE.Group();
const pillarMat = new THREE.MeshStandardMaterial({ color: 0xffbe0b, metalness: 0.65, roughness: 0.25 });
const leftPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 6.8, 18), pillarMat);
leftPillar.position.set(-4.7, 3.4, 0);
const rightPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 6.8, 18), pillarMat);
rightPillar.position.set(4.7, 3.4, 0);
const bannerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 1.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x006655, metalness: 0.35, roughness: 0.25 })
);
bannerMesh.position.set(0, 6.0, 0);
finishGroup.add(leftPillar, rightPillar, bannerMesh);
scene.add(finishGroup);

// ============================================================
// 3D ARTICULATED RUNNER + RUNNING EFFECT + BLACK SHADOW CHASER
// ============================================================
function create3DRunnerRig(options) {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const suitMat = new THREE.MeshStandardMaterial({
        color: options.suitColor,
        roughness: options.roughness,
        metalness: options.metalness
    });
    const skinMat = new THREE.MeshStandardMaterial({
        color: options.headColor,
        roughness: options.roughness,
        metalness: options.metalness
    });
    const limbMat = new THREE.MeshStandardMaterial({
        color: options.limbColor,
        roughness: options.roughness,
        metalness: options.metalness
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.95, 0.42), suitMat);
    torso.position.y = 1.18;
    torso.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 14), skinMat);
    head.position.y = 1.98;
    head.castShadow = true;

    const armGeo = new THREE.BoxGeometry(0.22, 0.72, 0.22);
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.52, 1.25, 0);
    leftArm.castShadow = true;

    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArm.position.set(0.52, 1.25, 0);
    rightArm.castShadow = true;

    const legGeo = new THREE.BoxGeometry(0.26, 0.75, 0.28);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.22, 0.38, 0);
    leftLeg.castShadow = true;

    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0.22, 0.38, 0);
    rightLeg.castShadow = true;

    bodyGroup.add(torso, head, leftArm, rightArm, leftLeg, rightLeg);

    return { root, bodyGroup, leftArm, rightArm, leftLeg, rightLeg };
}

const playerRig = create3DRunnerRig({
    suitColor: 0x0ea5e9,
    headColor: 0xfde68a,
    limbColor: 0x1e293b,
    roughness: 0.42,
    metalness: 0.12
});
scene.add(playerRig.root);

// Running dust / speed-trail puffs behind player
const runPuffs = [];
const puffGeo = new THREE.SphereGeometry(0.22, 8, 8);
const puffMat = new THREE.MeshBasicMaterial({ color: 0xf0fdf4, transparent: true, opacity: 0.65 });
for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(puffGeo, puffMat);
    m.visible = false;
    scene.add(m);
    runPuffs.push({ mesh: m, life: 0 });
}
let puffSpawnTimer = 0;

// Ground shadow under runner
const playerShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 })
);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.y = 0.08;
scene.add(playerShadow);

// Black shadow runner ("black same as who chase when hit")
const chaserRig = create3DRunnerRig({
    suitColor: 0x050507,
    headColor: 0x050507,
    limbColor: 0x09090b,
    roughness: 0.95,
    metalness: 0.05
});
chaserRig.root.scale.set(1.18, 1.18, 1.18);
chaserRig.root.visible = false;
scene.add(chaserRig.root);

// ============================================================
// MOUNTAINS, DENSE FOREST, BIRDS, RUNNING WOLVES & RABBITS, VOLCANO
// ============================================================
const trees = [];
const birds = [];
const wildlife = [];

function buildMountains() {
    const mtnMat1 = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85 });
    const mtnMat2 = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.88 });
    const snowPeakMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });

    const configs = [
        { x: -72, z: -160, r: 46, h: 54, mat: mtnMat1, capped: true },
        { x: -24, z: -190, r: 54, h: 66, mat: mtnMat2, capped: true },
        { x: 68,  z: -165, r: 48, h: 58, mat: mtnMat1, capped: true },
        { x: -102, z: -98, r: 40, h: 44, mat: mtnMat2, capped: false },
        { x: 102, z: -108, r: 42, h: 48, mat: mtnMat2, capped: false }
    ];

    for (const cfg of configs) {
        const g = new THREE.Group();
        const peak = new THREE.Mesh(new THREE.ConeGeometry(cfg.r, cfg.h, 14), cfg.mat);
        peak.position.y = cfg.h * 0.45;
        g.add(peak);

        if (cfg.capped) {
            const cap = new THREE.Mesh(new THREE.ConeGeometry(cfg.r * 0.28, cfg.h * 0.24, 12), snowPeakMat);
            cap.position.y = cfg.h * 0.84;
            g.add(cap);
        }

        g.position.set(cfg.x, -1, cfg.z);
        scene.add(g);
    }
}
buildMountains();

const treeGreens = [0x16a34a, 0x22c55e, 0x15803d, 0x4ade80];

function createTree(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32 * scale, 0.52 * scale, 3.4 * scale, 10),
        new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.88 })
    );
    trunk.position.y = 1.7 * scale;
    trunk.castShadow = true;

    const shade = treeGreens[Math.floor(Math.random() * treeGreens.length)];
    const foliageMat = new THREE.MeshStandardMaterial({ color: shade, roughness: 0.68 });

    const tier1 = new THREE.Mesh(new THREE.ConeGeometry(2.4 * scale, 3.6 * scale, 12), foliageMat);
    tier1.position.y = 4.3 * scale;
    tier1.castShadow = true;

    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(1.85 * scale, 3.1 * scale, 12), foliageMat);
    tier2.position.y = 6.2 * scale;
    tier2.castShadow = true;

    g.add(trunk, tier1, tier2);
    g.position.set(x, -0.3, z);
    scene.add(g);
    trees.push(g);
}

function createBird(x, y, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 1.05, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })
    );
    body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.06, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.35 })
    );
    g.add(body, wing);
    g.position.set(x, y, z);
    scene.add(g);
    birds.push({ mesh: g, wing, phase: Math.random() * 6 });
}

function createWolf(x, z) {
    const g = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.68, 1.55), furMat);
    body.position.y = 0.72;
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.55, 0.72), furMat);
    head.position.set(0, 1.08, -0.92);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.42), darkMat);
    snout.position.set(0, 0.98, -1.32);

    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6), darkMat);
    earL.position.set(-0.18, 1.44, -0.88);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6), darkMat);
    earR.position.set(0.18, 1.44, -0.88);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), darkMat);
    tail.position.set(0, 0.75, 1.05);
    tail.rotation.x = 0.65;

    const legGeo = new THREE.BoxGeometry(0.18, 0.55, 0.2);
    const legs = [];
    for (const [lx, lz] of [[-0.25, -0.52], [0.25, -0.52], [-0.25, 0.52], [0.25, 0.52]]) {
        const leg = new THREE.Mesh(legGeo, darkMat);
        leg.position.set(lx, 0.28, lz);
        legs.push(leg);
        g.add(leg);
    }

    g.add(body, head, snout, earL, earR, tail);
    g.position.set(x, -0.32, z);
    scene.add(g);
    wildlife.push({ mesh: g, legs, baseX: x, speedOffset: 0.08, phase: Math.random() * 6 });
}

function createRabbit(x, z) {
    const g = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.6 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), furMat);
    body.scale.set(0.85, 0.85, 1.3);
    body.position.y = 0.42;
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), furMat);
    head.position.set(0, 0.68, -0.38);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.1), furMat);
    earL.position.set(-0.1, 1.02, -0.34);
    earL.rotation.x = 0.2;
    const earR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.1), furMat);
    earR.position.set(0.1, 1.02, -0.34);
    earR.rotation.x = 0.2;

    const pinkL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.06), innerEarMat);
    pinkL.position.set(-0.1, 1.0, -0.38);
    pinkL.rotation.x = 0.2;
    const pinkR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.06), innerEarMat);
    pinkR.position.set(0.1, 1.0, -0.38);
    pinkR.rotation.x = 0.2;

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), furMat);
    tail.position.set(0, 0.45, 0.46);

    const legGeo = new THREE.BoxGeometry(0.12, 0.26, 0.16);
    const legs = [];
    for (const [lx, lz] of [[-0.16, -0.22], [0.16, -0.22], [-0.18, 0.24], [0.18, 0.24]]) {
        const leg = new THREE.Mesh(legGeo, furMat);
        leg.position.set(lx, 0.14, lz);
        legs.push(leg);
        g.add(leg);
    }

    g.add(body, head, earL, earR, pinkL, pinkR, tail);
    g.position.set(x, -0.32, z);
    scene.add(g);
    wildlife.push({ mesh: g, legs, baseX: x, speedOffset: 0.14, phase: Math.random() * 6, isRabbit: true });
}

const volcanoGroup = new THREE.Group();
const cone = new THREE.Mesh(
    new THREE.ConeGeometry(28, 36, 20),
    new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.94 })
);
cone.position.y = 17;
const lavaCap = new THREE.Mesh(
    new THREE.ConeGeometry(6.8, 5.2, 14),
    new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff2200, emissiveIntensity: 1.6 })
);
lavaCap.position.y = 33;
volcanoGroup.add(cone, lavaCap);
volcanoGroup.position.set(22, -2, -195);
scene.add(volcanoGroup);

const lavaParticles = [];
const lavaGeo = new THREE.SphereGeometry(0.68, 8, 8);
const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6a00 });
for (let i = 0; i < 20; i++) {
    const p = new THREE.Mesh(lavaGeo, lavaMat);
    p.position.set(22, 33, -195);
    scene.add(p);
    lavaParticles.push({
        mesh: p,
        vx: (Math.random() - 0.5) * 0.45,
        vy: 0.35 + Math.random() * 0.55,
        vz: (Math.random() - 0.5) * 0.45,
        age: Math.random() * 40
    });
}

function populateScenery() {
    for (let i = 0; i < 34; i++) {
        const z = -i * 9.5 + 8;
        createTree(-7.6 - Math.random() * 18, z, 0.85 + Math.random() * 0.65);
        createTree(7.6 + Math.random() * 18, z - 4, 0.85 + Math.random() * 0.65);
    }
    for (let i = 0; i < 12; i++) {
        createBird((Math.random() - 0.5) * 28, 7.5 + Math.random() * 5, -i * 18);
    }
    for (let i = 0; i < 6; i++) {
        createWolf(-6.9, -i * 34 - 8);
        createRabbit(6.8, -i * 28 - 4);
    }
}
populateScenery();

// ============================================================
// WEATHER SYSTEM
// ============================================================
let weatherPoints = null;
const WEATHER_COUNT = 680;

function rebuildWeatherParticles(mode) {
    if (weatherPoints) {
        scene.remove(weatherPoints);
        weatherPoints = null;
    }

    const skyColors = {
        sunny: { bg: 0x5ec8f8, fog: 0x8be2b4, ground: 0x22c55e, light: 1.2 },
        rain: { bg: 0x3b6978, fog: 0x4a7c59, ground: 0x16a34a, light: 0.85 },
        snow: { bg: 0xe0f2fe, fog: 0xdbeafe, ground: 0xf1f5f9, light: 1.15 },
        spring: { bg: 0xbae6fd, fog: 0xfce7f3, ground: 0x4ade80, light: 1.2 },
        volcanic: { bg: 0x3b1818, fog: 0x451a1a, ground: 0x3f6212, light: 0.88 }
    };

    const cfg = skyColors[mode] || skyColors.sunny;
    scene.background = new THREE.Color(cfg.bg);
    scene.fog = new THREE.FogExp2(cfg.fog, mode === 'volcanic' ? 0.0085 : 0.0046);
    sideGround.material.color.setHex(cfg.ground);
    sunLight.intensity = cfg.light;

    if (mode === 'sunny') return;

    const positions = new Float32Array(WEATHER_COUNT * 3);
    for (let i = 0; i < WEATHER_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 55;
        positions[i * 3 + 1] = Math.random() * 24;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 95;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const matConfig = {
        rain: { color: 0x93c5fd, size: 0.22 },
        snow: { color: 0xffffff, size: 0.34 },
        spring: { color: 0xff8fab, size: 0.32 },
        volcanic: { color: 0xf97316, size: 0.3 }
    };
    const m = matConfig[mode];
    const mat = new THREE.PointsMaterial({ color: m.color, size: m.size, transparent: true, opacity: 0.85 });

    weatherPoints = new THREE.Points(geo, mat);
    scene.add(weatherPoints);
}

function updateWeatherParticles() {
    if (!weatherPoints) return;
    const pos = weatherPoints.geometry.attributes.position.array;
    for (let i = 0; i < WEATHER_COUNT; i++) {
        const idx = i * 3;
        if (weatherType === 'rain') {
            pos[idx + 1] -= 0.75;
            pos[idx + 2] += 0.25;
        } else if (weatherType === 'snow') {
            pos[idx + 1] -= 0.14;
            pos[idx] += Math.sin(Date.now() * 0.002 + i) * 0.03;
        } else if (weatherType === 'spring') {
            pos[idx + 1] -= 0.1;
            pos[idx] += Math.cos(Date.now() * 0.003 + i) * 0.04;
        } else if (weatherType === 'volcanic') {
            pos[idx + 1] += 0.08;
            pos[idx] += (Math.random() - 0.5) * 0.08;
        }

        if (pos[idx + 1] < 0) pos[idx + 1] = 22;
        if (pos[idx + 1] > 24) pos[idx + 1] = 1;
        if (pos[idx + 2] > 18) pos[idx + 2] = -75;
    }
    weatherPoints.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
// REALISTIC SUBWAY/TEMPLE OBSTACLES & 3D BEVELED COINS
// ============================================================
let obstacles = [];
let coinMeshes = [];

function clearTrackEntities() {
    obstacles.forEach(o => scene.remove(o.mesh));
    coinMeshes.forEach(c => scene.remove(c.mesh));
    obstacles = [];
    coinMeshes = [];
}

function createObstacleMesh(type) {
    const g = new THREE.Group();
    if (type === 'fire') {
        const bowl = new THREE.Mesh(
            new THREE.CylinderGeometry(1.08, 0.82, 0.45, 16),
            new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.65, metalness: 0.35 })
        );
        bowl.position.y = 0.22;
        const outerFlame = new THREE.Mesh(
            new THREE.ConeGeometry(0.9, 1.5, 14),
            new THREE.MeshStandardMaterial({ color: 0xff5400, emissive: 0xff2400, emissiveIntensity: 1.5 })
        );
        outerFlame.position.y = 0.94;
        const innerCore = new THREE.Mesh(
            new THREE.ConeGeometry(0.46, 1.08, 12),
            new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffaa00, emissiveIntensity: 1.9 })
        );
        innerCore.position.y = 0.88;
        g.add(bowl, outerFlame, innerCore);
    } else if (type === 'wood') {
        const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.56, 0.56, 2.25, 18),
            new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.8 })
        );
        log.rotation.z = Math.PI / 2;
        log.position.y = 0.56;
        g.add(log);

        const bandMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
        for (const bx of [-0.75, 0.75]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.14, 18), bandMat);
            band.rotation.z = Math.PI / 2;
            band.position.set(bx, 0.56, 0);
            g.add(band);
        }
    } else if (type === 'spikes') {
        const basePlate = new THREE.Mesh(
            new THREE.BoxGeometry(2.15, 0.2, 1.25),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 })
        );
        basePlate.position.y = 0.1;
        g.add(basePlate);

        const spikeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.92, roughness: 0.15 });
        for (let s = -0.72; s <= 0.72; s += 0.72) {
            const sp = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.18, 12), spikeMat);
            sp.position.set(s, 0.74, 0);
            g.add(sp);
        }
    } else {
        const postMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.45, roughness: 0.35 });
        const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 12), postMat);
        leftPost.position.set(-1.04, 1.2, 0);
        const rightPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 12), postMat);
        rightPost.position.set(1.04, 1.2, 0);

        const beam = new THREE.Mesh(
            new THREE.BoxGeometry(2.28, 1.05, 0.95),
            new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.4, metalness: 0.25 })
        );
        beam.position.y = 1.74;

        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(2.3, 0.24, 0.98),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 })
        );
        stripe.position.y = 1.4;

        g.add(leftPost, rightPost, beam, stripe);
    }
    g.castShadow = true;
    return g;
}

function createCoinMesh() {
    const coinGroup = new THREE.Group();
    const goldOuter = new THREE.MeshStandardMaterial({
        color: 0xffc300,
        emissive: 0x553300,
        metalness: 0.9,
        roughness: 0.15
    });
    const goldInner = new THREE.MeshStandardMaterial({
        color: 0xffe066,
        emissive: 0x664400,
        metalness: 0.94,
        roughness: 0.12
    });

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.085, 14, 30), goldOuter);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.13, 26), goldInner);
    disc.rotation.x = Math.PI / 2;

    const starCore = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.16), goldOuter);
    starCore.rotation.z = Math.PI / 4;

    coinGroup.add(rim, disc, starCore);
    coinGroup.position.y = 1.08;
    return coinGroup;
}

function buildLevel(lvl) {
    clearTrackEntities();
    currentLevel = lvl;

    // ~2 min on Level 1 up to ~3 min on Level 100 (at 60fps)
    levelLength = 3050 + (lvl - 1) * 16;
    runSpeed = Math.min(0.62, 0.42 + (lvl - 1) * 0.002);
    coinGoal = 18 + Math.floor(lvl * 0.8);

    progressZ = 0;
    coins = 0;
    chaserActive = false;
    chaserTimeLeft = 0;
    invulnFrames = 0;
    stepAccumulator = 0;
    puffSpawnTimer = 0;
    laneIndex = 1;
    playerX = LANES[1];
    playerY = 0;
    playerVy = 0;
    jumping = false;
    crawling = false;
    crawlTimer = 0;

    playerRig.root.position.set(playerX, 0, 0);
    chaserRig.root.visible = false;

    finishGroup.position.set(0, 0, -levelLength);

    const types = ['fire', 'wood', 'spikes', 'highbar'];
    let cursorDist = 30;
    while (cursorDist < levelLength - 26) {
        const lane = Math.floor(Math.random() * 3);
        const type = types[Math.floor(Math.random() * types.length)];
        const mesh = createObstacleMesh(type);
        mesh.position.set(LANES[lane], 0, -cursorDist);
        scene.add(mesh);

        obstacles.push({
            mesh,
            lane,
            z: cursorDist,
            type,
            hitDone: false
        });

        if (Math.random() < 0.85) {
            const coinLane = Math.random() < 0.5 ? lane : (lane + 1) % 3;
            const cMesh = createCoinMesh();
            cMesh.position.set(LANES[coinLane], type === 'highbar' ? 0.55 : 1.1, -(cursorDist + 5));
            scene.add(cMesh);
            coinMeshes.push({ mesh: cMesh, lane: coinLane, z: cursorDist + 5, collected: false });
        }

        const minGap = Math.max(13, 24 - lvl * 0.06);
        const randGap = 10 + Math.random() * 15;
        cursorDist += minGap + randGap;
    }

    for (let c = 22; c < levelLength - 14; c += 20) {
        const lane = Math.floor(Math.random() * 3);
        const cMesh = createCoinMesh();
        cMesh.position.set(LANES[lane], 1.1, -c);
        scene.add(cMesh);
        coinMeshes.push({ mesh: cMesh, lane, z: c, collected: false });
    }

    updateHUD();
}

// ============================================================
// CONTROLS: W A S D + TOUCH SWIPE / TAP
// ============================================================
function moveLeft() {
    if (gameMode !== 'PLAYING') return;
    if (laneIndex > 0) laneIndex--;
}

function moveRight() {
    if (gameMode !== 'PLAYING') return;
    if (laneIndex < 2) laneIndex++;
}

function jumpAction() {
    if (gameMode !== 'PLAYING') return;
    if (!jumping) {
        jumping = true;
        crawling = false;
        crawlTimer = 0;
        playerVy = 0.27;
    }
}

function crawlAction() {
    if (gameMode !== 'PLAYING') return;
    if (jumping) {
        playerVy = -0.35;
    }
    crawling = true;
    crawlTimer = 36;
}

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') { e.preventDefault(); jumpAction(); }
    else if (k === 's' || e.key === 'ArrowDown') { e.preventDefault(); crawlAction(); }
    else if (k === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); moveLeft(); }
    else if (k === 'd' || e.key === 'ArrowRight') { e.preventDefault(); moveRight(); }
});

let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length || gameMode !== 'PLAYING') return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) moveLeft();
        else moveRight();
    } else {
        if (dy < 0) jumpAction();
        else crawlAction();
    }
}, { passive: true });

// ============================================================
// HIT, 10s BLACK SHADOW CHASER WINDOW, WIN & STAR SAVING
// ============================================================
function showToast(msg) {
    const el = document.getElementById('funny-toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 1000);
}

function handleObstacleHit() {
    if (invulnFrames > 0 || gameMode !== 'PLAYING') return;
    invulnFrames = 55;
    showToast(funnyHits[Math.floor(Math.random() * funnyHits.length)]);

    if (chaserActive && chaserTimeLeft > 0) {
        // 2nd hit under 10s -> Lose + play 3.MP3
        playSound(document.getElementById('snd-3'));
        finishLevel(false);
    } else {
        // 1st hit -> Play hit sound & bring black shadow runner close for 10s
        triggerHitSound();
        chaserActive = true;
        chaserTimeLeft = 10.0;
        chaserRig.root.visible = true;
    }
}

function calculateStars(won) {
    if (!won) return 0;
    if (coins >= coinGoal + 10) return 3;
    if (coins >= coinGoal) return 2;
    return 1;
}

function finishLevel(won) {
    gameMode = 'ENDED';
    stopAltoMusic();
    chaserActive = false;
    chaserRig.root.visible = false;
    document.getElementById('game-hud').classList.add('hidden');

    const starsEarned = calculateStars(won);
    if (won) {
        playSound(winAudio);
        const prev = starSave[currentLevel] || 0;
        if (starsEarned > prev) {
            starSave[currentLevel] = starsEarned;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(starSave));
        }
    }

    const titleEl = document.getElementById('result-title');
    const starsEl = document.getElementById('result-stars');
    const msgEl = document.getElementById('result-msg');
    const nextBtn = document.getElementById('btn-next-lvl');

    if (won) {
        titleEl.textContent = `LEVEL ${currentLevel} CLEARED!`;
        starsEl.textContent = '⭐'.repeat(starsEarned) + '☆'.repeat(3 - starsEarned);
        msgEl.textContent = `Coins: ${coins} (Goal: ${coinGoal}) · Stars: ${starsEarned}/3`;
        nextBtn.classList.toggle('hidden', currentLevel >= 100);
    } else {
        titleEl.textContent = 'CAUGHT!';
        starsEl.textContent = '☆☆☆ (0 STARS)';
        msgEl.textContent = `Coins collected: ${coins}`;
        nextBtn.classList.add('hidden');
    }

    document.getElementById('result-screen').classList.remove('hidden');
}

function updateHUD() {
    document.getElementById('hud-lvl').textContent = currentLevel;
    document.getElementById('hud-coins').textContent = coins;
    document.getElementById('hud-goal').textContent = coinGoal;
    const pct = Math.min(100, Math.floor((progressZ / levelLength) * 100));
    document.getElementById('hud-progress').textContent = pct;
}

function animateLimbs(rig, stridePhase, isCrawling) {
    if (isCrawling) {
        rig.bodyGroup.rotation.x = 1.05;
        rig.bodyGroup.position.y = -0.35;
        rig.leftArm.rotation.x = -0.8;
        rig.rightArm.rotation.x = -0.8;
        rig.leftLeg.rotation.x = 0.5;
        rig.rightLeg.rotation.x = 0.5;
    } else {
        rig.bodyGroup.rotation.x = 0.16;
        rig.bodyGroup.position.y = Math.abs(Math.sin(stridePhase)) * 0.12;
        rig.leftArm.rotation.x = Math.sin(stridePhase) * 0.95;
        rig.rightArm.rotation.x = -Math.sin(stridePhase) * 0.95;
        rig.leftLeg.rotation.x = -Math.sin(stridePhase) * 0.9;
        rig.rightLeg.rotation.x = Math.sin(stridePhase) * 0.9;
    }
}

// ============================================================
// MAIN GAME LOOP
// ============================================================
let lastTime = performance.now();

function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    for (const lp of lavaParticles) {
        lp.age++;
        lp.mesh.position.x += lp.vx;
        lp.mesh.position.y += lp.vy;
        lp.mesh.position.z += lp.vz;
        lp.vy -= 0.015;
        if (lp.age > 55 || lp.mesh.position.y < 20) {
            lp.age = 0;
            lp.mesh.position.set(22, 33, -195);
            lp.vx = (Math.random() - 0.5) * 0.45;
            lp.vy = 0.35 + Math.random() * 0.55;
            lp.vz = (Math.random() - 0.5) * 0.45;
        }
    }

    for (const b of birds) {
        b.phase += dt * 7;
        b.wing.rotation.x = Math.sin(b.phase) * 0.7;
        b.mesh.position.x += Math.cos(b.phase * 0.25) * 0.03;
    }

    for (const w of wildlife) {
        w.phase += dt * (w.isRabbit ? 13 : 10);
        w.mesh.position.z += runSpeed + w.speedOffset;
        if (w.mesh.position.z > 14) {
            w.mesh.position.z = -180 - Math.random() * 40;
        }
        if (w.isRabbit) {
            w.mesh.position.y = -0.32 + Math.abs(Math.sin(w.phase * 0.6)) * 0.45;
        } else {
            w.mesh.position.y = -0.32 + Math.abs(Math.sin(w.phase)) * 0.08;
        }
        w.legs.forEach((leg, idx) => {
            const dir = idx % 2 === 0 ? 1 : -1;
            leg.rotation.x = Math.sin(w.phase) * 0.65 * dir;
        });
    }

    // Update running dust puffs
    for (const p of runPuffs) {
        if (p.life > 0) {
            p.life--;
            p.mesh.position.z += runSpeed * 0.7;
            p.mesh.position.y += 0.012;
            const s = Math.max(0.1, p.life / 18);
            p.mesh.scale.set(s, s, s);
            if (p.life === 0) p.mesh.visible = false;
        }
    }

    updateWeatherParticles();

    if (gameMode === 'PLAYING') {
        progressZ += runSpeed;

        if (!jumping && !crawling) {
            stepAccumulator += runSpeed;
            if (stepAccumulator >= 3.2) {
                stepAccumulator = 0;
                playFootstepSound();
            }

            puffSpawnTimer++;
            if (puffSpawnTimer % 7 === 0) {
                const puff = runPuffs.find(item => item.life === 0);
                if (puff) {
                    puff.life = 18;
                    puff.mesh.position.set(
                        playerX + (Math.random() - 0.5) * 0.5,
                        0.22,
                        0.75
                    );
                    puff.mesh.scale.set(1, 1, 1);
                    puff.mesh.visible = true;
                }
            }
        }

        const targetX = LANES[laneIndex];
        playerX += (targetX - playerX) * 0.24;

        if (jumping) {
            playerY += playerVy;
            playerVy -= 0.014;
            if (playerY <= 0) {
                playerY = 0;
                playerVy = 0;
                jumping = false;
            }
        }

        if (crawling) {
            crawlTimer--;
            if (crawlTimer <= 0) crawling = false;
        }

        const stridePhase = progressZ * 0.65;
        animateLimbs(playerRig, stridePhase, crawling);
        playerRig.root.position.set(playerX, playerY, 0);

        playerShadow.position.set(playerX, 0.08, 0);
        const shadowScale = Math.max(0.45, 1 - playerY * 0.22);
        playerShadow.scale.set(shadowScale, shadowScale, 1);

        camera.position.x += (playerX * 0.35 - camera.position.x) * 0.1;

        if (chaserActive) {
            chaserTimeLeft -= dt;
            animateLimbs(chaserRig, stridePhase * 1.15, false);
            chaserRig.root.position.set(
                playerX + Math.sin(now * 0.012) * 0.22,
                0,
                2.7
            );
            if (chaserTimeLeft <= 0) {
                chaserActive = false;
                chaserRig.root.visible = false;
            }
        }

        if (invulnFrames > 0) {
            invulnFrames--;
            playerRig.root.visible = Math.floor(invulnFrames / 4) % 2 === 0;
        } else {
            playerRig.root.visible = true;
        }

        finishGroup.position.z = -(levelLength - progressZ);

        for (const s of sleepers) {
            s.position.z += runSpeed;
            if (s.position.z > 14) s.position.z -= 252;
        }
        for (const t of trees) {
            t.position.z += runSpeed;
            if (t.position.z > 14) t.position.z -= 323;
        }
        for (const b of birds) {
            b.mesh.position.z += runSpeed * 0.85;
            if (b.mesh.position.z > 15) b.mesh.position.z -= 216;
        }

        for (const ob of obstacles) {
            const relZ = ob.z - progressZ;
            ob.mesh.position.z = -relZ;

            if (!ob.hitDone && Math.abs(relZ) < 0.95 && Math.abs(playerX - LANES[ob.lane]) < 1.15) {
                const isHigh = ob.type === 'highbar';
                const cleared = isHigh ? crawling : playerY > 1.05;
                if (!cleared) {
                    ob.hitDone = true;
                    handleObstacleHit();
                }
            }
        }

        for (const c of coinMeshes) {
            if (c.collected) continue;
            c.mesh.rotation.y += 0.08;
            const relZ = c.z - progressZ;
            c.mesh.position.z = -relZ;

            if (Math.abs(relZ) < 1.1 && Math.abs(playerX - LANES[c.lane]) < 1.25 && playerY < 2.2) {
                c.collected = true;
                c.mesh.visible = false;
                coins++;
                playCoinSound();
            }
        }

        updateHUD();

        if (progressZ >= levelLength) {
            finishLevel(true);
        }
    }

    renderer.render(scene, camera);
}

// ============================================================
// UI NAVIGATION & LEVEL GRID
// ============================================================
function syncHomeUI() {
    document.getElementById('home-lvl-badge').textContent = currentLevel;
    document.getElementById('btn-play-lvl').textContent = currentLevel;
}

function renderLevelsGrid() {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 100; i++) {
        const st = starSave[i] || 0;
        const tile = document.createElement('div');
        tile.className = 'lvl-tile';
        tile.innerHTML = `
            <div class="num">${i}</div>
            <div class="st">${st > 0 ? '⭐'.repeat(st) : '☆☆☆'}</div>
        `;
        tile.addEventListener('click', () => {
            currentLevel = i;
            syncHomeUI();
            document.getElementById('levels-screen').classList.add('hidden');
            startLevelDirectly(i);
        });
        grid.appendChild(tile);
    }
}

function startLevelDirectly(lvl) {
    buildLevel(lvl);
    gameMode = 'PLAYING';
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('game-hud').classList.remove('hidden');
    startAltoMusic();
}

function goHome() {
    gameMode = 'HOME';
    stopAltoMusic();
    clearTrackEntities();
    finishGroup.position.z = -999;
    chaserRig.root.visible = false;
    runPuffs.forEach(p => { p.life = 0; p.mesh.visible = false; });
    playerRig.root.position.set(0, 0, 0);
    playerShadow.position.set(0, 0.08, 0);
    animateLimbs(playerRig, 0, false);

    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('levels-screen').classList.add('hidden');
    document.getElementById('home-screen').classList.remove('hidden');
    syncHomeUI();
}

document.getElementById('weather-select').addEventListener('change', (e) => {
    weatherType = e.target.value;
    rebuildWeatherParticles(weatherType);
});

document.getElementById('btn-play').addEventListener('click', () => startLevelDirectly(currentLevel));
document.getElementById('btn-levels').addEventListener('click', () => {
    renderLevelsGrid();
    document.getElementById('levels-screen').classList.remove('hidden');
});
document.getElementById('btn-back-home').addEventListener('click', () => {
    document.getElementById('levels-screen').classList.add('hidden');
});
document.getElementById('btn-exit').addEventListener('click', () => {
    stopAltoMusic();
    window.close();
    document.body.innerHTML = `<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:#070b14;color:#fff;font-family:sans-serif;text-align:center;padding:20px;"><div><h2>KYRO GAMES EXITED</h2><p style="margin-top:8px;color:#94a3b8;">You can close this tab now.</p></div></div>`;
});

document.getElementById('btn-hud-home').addEventListener('click', goHome);
document.getElementById('btn-result-home').addEventListener('click', goHome);
document.getElementById('btn-replay').addEventListener('click', () => startLevelDirectly(currentLevel));
document.getElementById('btn-next-lvl').addEventListener('click', () => {
    if (currentLevel < 100) startLevelDirectly(currentLevel + 1);
    else goHome();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot cleanly without blackout
rebuildWeatherParticles('sunny');
syncHomeUI();
requestAnimationFrame(animate);

setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
    if (gameMode === 'SPLASH') {
        document.getElementById('home-screen').classList.remove('hidden');
        gameMode = 'HOME';
    }
}, 2400);