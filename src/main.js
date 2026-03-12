// ============================================================
// URBAN VELOCITY - main.js
// Carros com geometria 3D realista (grupos de meshes)
// ============================================================

// --- CONFIG ---
const ROAD_WIDTH = 20;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const START_SPEED = 50;
const ACCEL = 1.5;
const MAX_NITRO = 100;

// --- CATÁLOGO DE CARROS ---
const CAR_CATALOG = [
    {
        id: 'default',
        name: 'Speedster X',
        price: 0,
        w: 2.0, h: 1.1, d: 4.2,
        bodyHex: 0x1a1a3a, roofHex: 0x0d0d1e,
        accentColor: '#00f3ff', accentHex: 0x00f3ff,
        emissive: 0x00f3ff, emissiveInt: 0.6,
        style: 'sedan',
        desc: 'Carro padrão. Rápido e elegante.'
    },
    {
        id: 'flame',
        name: 'Flame Runner',
        price: 150,
        w: 2.1, h: 1.15, d: 4.4,
        bodyHex: 0x3a0800, roofHex: 0x1a0400,
        accentColor: '#ff4400', accentHex: 0xff4400,
        emissive: 0xff2200, emissiveInt: 0.8,
        style: 'coupe',
        desc: 'Motor turbinado. Deixa rastros de fogo.'
    },
    {
        id: 'ghost',
        name: 'Ghost Rider',
        price: 300,
        w: 1.9, h: 0.95, d: 4.6,
        bodyHex: 0x14141e, roofHex: 0x0a0a12,
        accentColor: '#ccccff', accentHex: 0xccccff,
        emissive: 0xaaaaff, emissiveInt: 0.9,
        style: 'sport',
        desc: 'Ultra baixo. Invisível nas sombras.'
    },
    {
        id: 'venom',
        name: 'Venom GT',
        price: 500,
        w: 2.2, h: 1.2, d: 4.8,
        bodyHex: 0x00250a, roofHex: 0x001205,
        accentColor: '#00ff44', accentHex: 0x00ff44,
        emissive: 0x00ff22, emissiveInt: 0.7,
        style: 'coupe',
        desc: 'Bioengineered. Velocidade máxima.'
    },
    {
        id: 'titan',
        name: 'Titan SUV',
        price: 400,
        w: 2.8, h: 1.7, d: 5.0,
        bodyHex: 0x1c1200, roofHex: 0x100a00,
        accentColor: '#ffcc00', accentHex: 0xffcc00,
        emissive: 0xffaa00, emissiveInt: 0.5,
        style: 'suv',
        desc: 'Grande e imponente. Resistente a tudo.'
    },
    {
        id: 'phantom',
        name: 'Phantom V',
        price: 800,
        w: 2.4, h: 1.3, d: 5.2,
        bodyHex: 0x1a0028, roofHex: 0x0d0014,
        accentColor: '#cc00ff', accentHex: 0xcc00ff,
        emissive: 0x9900ff, emissiveInt: 1.0,
        style: 'sedan',
        desc: 'O lendário. Poder absoluto.'
    }
];

// Materiais compartilhados para performance
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.1 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x0a0a14, transparent: true, opacity: 0.75, roughness: 0.1 });
const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 3 });

// ============================================================
//  TAIL TRAIL — sistema de cauda de luz das lanternas traseiras
// ============================================================
class TailTrail {
    constructor(color, scene) {
        this.scene = scene;
        this.color = color;
        this.pool = [];          // partículas ativas
        this.maxAge = 0.55;        // segundos até desaparecer
        this.spawnAcc = 0;           // acumulador de spawn
    }

    // Cria uma partícula na posição mundial dada
    _spawn(wx, wy, wz, speedMult) {
        // Comprimento do streak proporcional à velocidade
        const streakLen = 0.5 + Math.random() * 0.6 + speedMult * 0.4;
        const geo = new THREE.BoxGeometry(
            0.06 + Math.random() * 0.05,  // fino em X
            0.06 + Math.random() * 0.05,  // fino em Y
            streakLen                      // alongado em Z
        );
        const mat = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        // Posição com pequena variação aleatória
        mesh.position.set(
            wx + (Math.random() - 0.5) * 0.12,
            wy + (Math.random() - 0.5) * 0.08,
            wz + streakLen * 0.5          // centro do streak atrás da lanterna
        );
        this.scene.add(mesh);
        this.pool.push({ mesh, age: 0, maxAge: this.maxAge * (0.6 + Math.random() * 0.8) });
    }

    // spawnPos: THREE.Vector3 em coordenadas de mundo
    // dt, deltaMove: do game loop
    // speedMult: nitro multiplier
    update(spawnPos, dt, deltaMove, speedMult) {
        // Taxa de spawn: ~30 partículas/s normal, ~60 com nitro
        const rate = speedMult > 1 ? 60 : 30;
        this.spawnAcc += rate * dt;
        while (this.spawnAcc >= 1) {
            this._spawn(spawnPos.x, spawnPos.y, spawnPos.z, speedMult);
            this.spawnAcc -= 1;
        }

        // Atualiza partículas existentes
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const p = this.pool[i];
            p.age += dt;
            const t = p.age / p.maxAge;   // 0→1

            // Move com o mundo (igual aos prédios)
            p.mesh.position.z += deltaMove;

            // Fade out + encolhe em X/Y
            p.mesh.material.opacity = (1 - t) * (1 - t) * 0.95;
            const s = 1 - t * 0.6;
            p.mesh.scale.set(s, s, 1);    // só mantém comprimento Z

            if (p.age >= p.maxAge) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.pool.splice(i, 1);
            }
        }
    }

    // Remove tudo da cena
    dispose() {
        this.pool.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.pool = [];
        this.spawnAcc = 0;
    }
}

// ============================================================
//  BUILD CAR GROUP  — coração do sistema visual
// ============================================================
function buildCarGroup(car) {
    const group = new THREE.Group();

    const bw = car.w, bh = car.h, bd = car.d;

    // ---- CORPO PRINCIPAL (carroceria baixa) ----
    const bodyMat = new THREE.MeshStandardMaterial({
        color: car.bodyHex,
        emissive: car.emissive,
        emissiveIntensity: 0.08,
        roughness: 0.3,
        metalness: 0.7
    });
    const bodyH = bh * 0.52;
    const bodyGeo = new THREE.BoxGeometry(bw, bodyH, bd);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyH / 2;
    group.add(body);

    // Hood taper (frente baixa) — pequena cunha sobre o body
    const hoodH = bodyH * 0.25;
    const hoodGeo = new THREE.BoxGeometry(bw * 0.9, hoodH, bd * 0.28);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, bodyH + hoodH / 2 - 0.005, -bd * 0.35);
    group.add(hood);

    // Trunk taper (traseira)
    const trunkGeo = new THREE.BoxGeometry(bw * 0.88, hoodH, bd * 0.2);
    const trunk = new THREE.Mesh(trunkGeo, bodyMat);
    trunk.position.set(0, bodyH + hoodH / 2 - 0.005, bd * 0.38);
    group.add(trunk);

    // ---- CABINE / TETO ----
    const roofMat = new THREE.MeshStandardMaterial({
        color: car.roofHex,
        roughness: 0.35,
        metalness: 0.6
    });

    const roofStyle = car.style;
    let cabW, cabH, cabD, cabZ;
    if (roofStyle === 'suv') {
        cabW = bw * 0.88; cabH = bh * 0.52; cabD = bd * 0.60; cabZ = 0;
    } else if (roofStyle === 'sport') {
        cabW = bw * 0.70; cabH = bh * 0.35; cabD = bd * 0.42; cabZ = bd * 0.04;
    } else if (roofStyle === 'coupe') {
        cabW = bw * 0.72; cabH = bh * 0.42; cabD = bd * 0.48; cabZ = bd * 0.02;
    } else { // sedan
        cabW = bw * 0.78; cabH = bh * 0.46; cabD = bd * 0.52; cabZ = 0;
    }
    const cabGeo = new THREE.BoxGeometry(cabW, cabH, cabD);
    const cabin = new THREE.Mesh(cabGeo, roofMat);
    cabin.position.set(0, bodyH + cabH / 2, cabZ);
    group.add(cabin);

    // ---- PÁRA-BRISA (frente) e VIDRO TRASEIRO ----
    const wshH = cabH * 0.72, wshD = 0.08;
    const wsFrontGeo = new THREE.BoxGeometry(cabW * 0.88, wshH, wshD);
    const wsFront = new THREE.Mesh(wsFrontGeo, GLASS_MAT);
    wsFront.position.set(0, bodyH + cabH * 0.52, cabZ - cabD / 2 + 0.04);
    wsFront.rotation.x = -0.28; // inclinado
    group.add(wsFront);

    const wsRearGeo = new THREE.BoxGeometry(cabW * 0.82, wshH, wshD);
    const wsRear = new THREE.Mesh(wsRearGeo, GLASS_MAT);
    wsRear.position.set(0, bodyH + cabH * 0.52, cabZ + cabD / 2 - 0.04);
    wsRear.rotation.x = 0.28;
    group.add(wsRear);

    // Janelas laterais
    const winH = cabH * 0.62, winD = cabD * 0.7;
    const winSideGeo = new THREE.BoxGeometry(0.07, winH, winD);
    [-cabW / 2 + 0.03, cabW / 2 - 0.03].forEach(x => {
        const win = new THREE.Mesh(winSideGeo, GLASS_MAT);
        win.position.set(x, bodyH + cabH * 0.52, cabZ);
        group.add(win);
    });

    // ---- RODAS + AROS ----
    const wheelR = Math.max(0.28, bh * 0.26);
    const wheelW = bw * 0.18;
    const wPos = [
        { x: -bw / 2 - wheelW * 0.3, z: -bd * 0.30 },
        { x: bw / 2 + wheelW * 0.3, z: -bd * 0.30 },
        { x: -bw / 2 - wheelW * 0.3, z: bd * 0.30 },
        { x: bw / 2 + wheelW * 0.3, z: bd * 0.30 }
    ];
    const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 16);
    const rimGeo = new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, wheelW + 0.04, 8);
    const rimCapGeo = new THREE.CylinderGeometry(wheelR * 0.22, wheelR * 0.22, wheelW + 0.06, 6);

    wPos.forEach(p => {
        const tire = new THREE.Mesh(tireGeo, WHEEL_MAT);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(p.x, wheelR, p.z);
        group.add(tire);

        const rim = new THREE.Mesh(rimGeo, RIM_MAT);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(p.x, wheelR, p.z);
        group.add(rim);

        const cap = new THREE.Mesh(rimCapGeo, bodyMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(p.x, wheelR, p.z);
        group.add(cap);
    });

    // ---- ARCO DE RODA (fender) ----
    const fenderGeo = new THREE.BoxGeometry(bw + wheelW * 0.6, bodyH * 0.38, wheelW * 1.3);
    const fenderMat = bodyMat;
    wPos.forEach(p => {
        const fender = new THREE.Mesh(fenderGeo, fenderMat);
        fender.position.set(0, wheelR * 0.6, p.z);
        group.add(fender);
    });

    // ---- FARÓIS (frente) ----
    const hlGeo = new THREE.BoxGeometry(bw * 0.28, bodyH * 0.14, 0.12);
    [-bw * 0.28, bw * 0.28].forEach(x => {
        const hl = new THREE.Mesh(hlGeo, HEADLIGHT_MAT);
        hl.position.set(x, bodyH * 0.6, -bd / 2 - 0.06);
        group.add(hl);
        // DRL strip
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(bw * 0.26, bodyH * 0.04, 0.07),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 })
        );
        strip.position.set(x, bodyH * 0.46, -bd / 2 - 0.04);
        group.add(strip);
    });

    // ---- LANTERNAS TRASEIRAS ----
    const tailMat = new THREE.MeshStandardMaterial({
        color: car.emissive,
        emissive: car.emissive,
        emissiveIntensity: 3.5,
        transparent: false
    });
    // Halo atrás da lanterna (plano brilhante extra)
    const tailHaloMat = new THREE.MeshStandardMaterial({
        color: car.emissive,
        emissive: car.emissive,
        emissiveIntensity: 6,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
    });
    const tlGeo = new THREE.BoxGeometry(bw * 0.30, bodyH * 0.16, 0.12);
    const haloGeo = new THREE.PlaneGeometry(bw * 0.34, bodyH * 0.22);
    group.userData.tailLights = [];
    [-bw * 0.28, bw * 0.28].forEach(x => {
        // Corpo da lanterna
        const tl = new THREE.Mesh(tlGeo, tailMat);
        tl.position.set(x, bodyH * 0.62, bd / 2 + 0.06);
        group.add(tl);

        // Halo brilhante plano
        const halo = new THREE.Mesh(haloGeo, tailHaloMat);
        halo.position.set(x, bodyH * 0.62, bd / 2 + 0.13);
        group.add(halo);

        // Objeto invisível marcador — usado para obter a posição mundial nos trails
        const anchor = new THREE.Object3D();
        anchor.position.set(x, bodyH * 0.62, bd / 2 + 0.15);
        group.add(anchor);

        // Salva referências
        group.userData.tailLights.push({ tl, halo, anchor });
    });

    // SpotLights traseiros (dois, um por lanterna)
    group.userData.tailSpots = [];
    [-bw * 0.28, bw * 0.28].forEach(x => {
        const spot = new THREE.SpotLight(car.emissive, 6, 12, Math.PI * 0.18, 0.5, 1.5);
        spot.position.set(x, bodyH * 0.62, bd / 2 + 0.2);
        // Target aponta para trás
        spot.target.position.set(x, bodyH * 0.62, bd / 2 + 10);
        group.add(spot);
        group.add(spot.target);
        group.userData.tailSpots.push(spot);
    });

    // ---- ESCAPAMENTO (traseiro central) ----
    const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
    [-0.3, 0.3].forEach(x => {
        const ex = new THREE.Mesh(exhaustGeo, exhaustMat);
        ex.rotation.x = Math.PI / 2;
        ex.position.set(x, bodyH * 0.18, bd / 2 + 0.05);
        group.add(ex);
    });

    // ---- NEON UNDERGLOW ----
    const neonMat = new THREE.MeshStandardMaterial({
        color: car.emissive,
        emissive: car.emissive,
        emissiveIntensity: 2.5
    });
    const neonGeo = new THREE.BoxGeometry(bw + 0.1, 0.04, bd * 0.9);
    const neon = new THREE.Mesh(neonGeo, neonMat);
    neon.position.y = 0.05;
    group.add(neon);

    // ---- NEON STRIPES (laterais) ----
    const stripeGeo = new THREE.BoxGeometry(0.04, bodyH * 0.3, bd * 0.8);
    [-bw / 2, bw / 2].forEach(x => {
        const stripe = new THREE.Mesh(stripeGeo, neonMat);
        stripe.position.set(x, bodyH * 0.3, 0);
        group.add(stripe);
    });

    return group;
}

// ============================================================
//  OBSTACLE CAR GROUP (inimigos na pista)
// ============================================================
function buildObstacleCarGroup(type) {
    const defs = {
        truck: {
            w: 3.0, h: 2.8, d: 7.5,
            bodyHex: 0x880000, roofHex: 0x440000, emissive: 0xff2200, emissiveInt: 0.7, style: 'suv'
        },
        pickup: {
            w: 2.2, h: 1.3, d: 5.0,
            bodyHex: 0x004410, roofHex: 0x002208, emissive: 0x00cc22, emissiveInt: 0.6, style: 'coupe'
        }
    };
    const d = defs[type];
    return { group: buildCarGroup(d), data: d };
}

// --- GLOBALS ---
const ENV_TYPES = {
    CITY_NIGHT: 'city_night',
    CITY_MORNING: 'city_morning',
    DESERT: 'desert'
};
const ROAD_TYPES = {
    ONE_WAY: 'one_way',
    TWO_WAY: 'two_way'
};
let gameSettings = {
    environment: ENV_TYPES.CITY_NIGHT,
    roadType: ROAD_TYPES.ONE_WAY
};

let scene, camera, renderer, clock;
let playerGroup;
let playerBox = new THREE.Box3();
let obstacles = [];
let buildings = [];
let coinObjects = [];

let isPlaying = false;
let isPaused = false;
let score = 0;
let gameTime = 0;
let nitroCounter = MAX_NITRO;
let nitroActive = false;
let currentSpeed = START_SPEED;
let coinsThisRun = 0;

const keys = {
    arrowleft: false, arrowright: false, arrowup: false, arrowdown: false,
    w: false, s: false, a: false, d: false, n: false
};
let playerTargetX = 0;
let playerVelocityX = 0;
let speedOffset = 0;
let buildingTex;

// Persisted
let highScore = parseInt(localStorage.getItem('urbanVelocityHighScore') || '0');
let totalCoins = parseInt(localStorage.getItem('urbanVelocityCoins') || '0');
let unlockedCars = JSON.parse(localStorage.getItem('urbanVelocityUnlocked') || '["default"]');
let selectedCarId = localStorage.getItem('urbanVelocitySelectedCar') || 'default';

// UI
const uiMainMenu = document.getElementById('main-menu');
const uiHUD = document.getElementById('hud');
const uiPauseMenu = document.getElementById('pause-menu');
const uiGameOverMenu = document.getElementById('game-over-menu');
const uiGarageMenu = document.getElementById('garage-menu');
const uiEnvMenu = document.getElementById('env-menu');
const uiRoadMenu = document.getElementById('road-menu');

const scoreDisplay = document.getElementById('score-display');
const speedDisplay = document.getElementById('speed-display');
const nitroBar = document.getElementById('nitro-bar');
const finalScore = document.getElementById('final-score');
const finalCoins = document.getElementById('final-coins');
const finalRecord = document.getElementById('final-record');
const totalCoinsDisplay = document.getElementById('total-coins-display');
const highScoreDisplay = document.getElementById('high-score-display');
const coinsDisplay = document.getElementById('coins-display');
const recordDisplay = document.getElementById('record-display');
const coinHudCount = document.getElementById('coin-hud-count');
const garageCoinsEl = document.getElementById('garage-coins');
const actionTextContainer = document.getElementById('action-text-container');

function refreshPersistentUI() {
    highScoreDisplay.innerText = highScore;
    coinsDisplay.innerText = totalCoins;
    recordDisplay.innerText = `🏆 ${highScore}`;
    garageCoinsEl.innerText = totalCoins;
}
refreshPersistentUI();

// ============================================================
//  AUDIO
// ============================================================
let audioCtx, engineOsc, engineGain, windGain;

function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(audioCtx.destination);
    engineOsc.start();

    const bufSize = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) out[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'lowpass'; windFilter.frequency.value = 400;
    windGain = audioCtx.createGain(); windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(audioCtx.destination);
    noise.start();
    window.windFilter = windFilter;
}

function updateAudio(speed, isNitro) {
    if (!audioCtx) return;
    if (!isPlaying || isPaused) {
        engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }
    const ns = speed / 200;
    engineOsc.frequency.setTargetAtTime(50 + ns * 150 + (isNitro ? 50 : 0), audioCtx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(0.1 + ns * 0.1, audioCtx.currentTime, 0.1);
    window.windFilter.frequency.setTargetAtTime(400 + ns * 1000, audioCtx.currentTime, 0.1);
    windGain.gain.setTargetAtTime(ns * 0.3, audioCtx.currentTime, 0.2);
}

// ============================================================
//  APPLY SELECTED CAR TO PLAYER GROUP
// ============================================================
function applySelectedCar() {
    // Descarta trails antigos
    if (playerGroup.userData.tailTrails) {
        playerGroup.userData.tailTrails.forEach(t => t.dispose());
    }
    // Limpa children do grupo do jogador
    while (playerGroup.children.length > 0) {
        const child = playerGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        playerGroup.remove(child);
    }
    const carData = CAR_CATALOG.find(c => c.id === selectedCarId) || CAR_CATALOG[0];
    const built = buildCarGroup(carData);
    // Transfer children
    while (built.children.length > 0) playerGroup.add(built.children[0]);
    // Transfer userData (tail lights, spots, etc.)
    Object.assign(playerGroup.userData, built.userData);
    playerGroup.position.y = 0;

    // Cria um TailTrail por lanterna traseira
    playerGroup.userData.tailTrails = playerGroup.userData.tailLights.map(
        () => new TailTrail(carData.emissive, scene)
    );
}

// ============================================================
//  INIT
// ============================================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, -15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 3);
    scene.add(ambient);
    window.ambientLight = ambient;
    const sun = new THREE.DirectionalLight(0xff007f, 1.5);
    sun.position.set(5, 10, 5);
    scene.add(sun);
    window.sunLight = sun;

    const blue = new THREE.DirectionalLight(0x00f3ff, 1.2);
    blue.position.set(-5, 5, -5);
    scene.add(blue);
    window.blueLight = blue;

    // Point light that follows player for car detail
    const carLight = new THREE.PointLight(0x9900ff, 2, 12);
    carLight.position.set(0, 3, 2);
    scene.add(carLight);
    window.carLight = carLight;

    // Grid
    const grid = new THREE.GridHelper(200, 40, 0x00f3ff, 0x9d00ff);
    grid.position.y = 0;
    scene.add(grid);
    window.gridHelper = grid;

    // Road - store reference
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 200);
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x030308, side: THREE.DoubleSide });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = Math.PI / 2;
    road.position.set(0, -0.01, -50);
    scene.add(road);
    window.roadMesh = road;

    // Lane markers
    window.laneMarkers = [];
    for (let z = -150; z < 20; z += 8) {
        const laneGeo = new THREE.PlaneGeometry(0.15, 3.5);
        const laneMat = new THREE.MeshBasicMaterial({ color: 0x334433 });
        [-LANE_WIDTH / 2, LANE_WIDTH / 2].forEach(x => {
            const marker = new THREE.Mesh(laneGeo, laneMat);
            marker.rotation.x = Math.PI / 2;
            marker.position.set(x, 0, z);
            scene.add(marker);
            window.laneMarkers.push(marker);
        });
    }

    // Player Group
    playerGroup = new THREE.Group();
    scene.add(playerGroup);
    applySelectedCar();

    // Buildings
    for (let i = 0; i < 40; i++) spawnBuilding(true);

    // Events
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // UI Selection Flow
    document.getElementById('start-btn').addEventListener('click', showEnvMenu);
    document.getElementById('env-back-btn').addEventListener('click', hideEnvMenu);
    document.querySelectorAll('[data-env]').forEach(card => {
        card.addEventListener('click', () => showRoadMenu(card.dataset.env));
    });
    document.getElementById('road-back-btn').addEventListener('click', hideRoadMenu);
    document.querySelectorAll('[data-road]').forEach(card => {
        card.addEventListener('click', () => startGame(card.dataset.road));
    });

    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('quit-btn').addEventListener('click', showMainMenu);
    document.getElementById('restart-btn').addEventListener('click', () => startGame(gameSettings.roadType));
    document.getElementById('menu-btn').addEventListener('click', showMainMenu);
    document.getElementById('garage-btn').addEventListener('click', showGarage);
    document.getElementById('garage-back-btn').addEventListener('click', hideGarage);

    buildGarageUI();
    animate();
}

function showEnvMenu() {
    uiMainMenu.classList.add('hidden');
    uiEnvMenu.classList.remove('hidden');
}
function hideEnvMenu() {
    uiEnvMenu.classList.add('hidden');
    uiMainMenu.classList.remove('hidden');
}
function showRoadMenu(env) {
    gameSettings.environment = env;
    uiEnvMenu.classList.add('hidden');
    uiRoadMenu.classList.remove('hidden');
}
function hideRoadMenu() {
    uiRoadMenu.classList.add('hidden');
    uiEnvMenu.classList.remove('hidden');
}

function applyEnvironment() {
    const env = gameSettings.environment;
    let bgColor, fogColor, fogDensity, ambientInt, sunColor, sunInt, blueInt;
    let roadColor, markerColor, gridColor1, gridColor2;

    if (env === ENV_TYPES.CITY_NIGHT) {
        bgColor = 0x050510; fogColor = 0x050510; fogDensity = 0.015;
        ambientInt = 3; sunColor = 0xff007f; sunInt = 1.5; blueInt = 1.2;
        roadColor = 0x030308; markerColor = 0x334433; gridColor1 = 0x00f3ff; gridColor2 = 0x9d00ff;
    } else if (env === ENV_TYPES.CITY_MORNING) {
        bgColor = 0xaaccff; fogColor = 0xaaccff; fogDensity = 0.01;
        ambientInt = 4; sunColor = 0xffffff; sunInt = 2.0; blueInt = 1.0;
        roadColor = 0x111111; markerColor = 0xaaaaaa; gridColor1 = 0x99ccff; gridColor2 = 0x6699cc;
    } else if (env === ENV_TYPES.DESERT) {
        bgColor = 0xffcc99; fogColor = 0xffcc99; fogDensity = 0.008;
        ambientInt = 3.5; sunColor = 0xffaa00; sunInt = 2.2; blueInt = 0.5;
        roadColor = 0x221100; markerColor = 0xffcc00; gridColor1 = 0xff8800; gridColor2 = 0xaa4400;
    }

    scene.background.set(bgColor);
    scene.fog.color.set(fogColor);
    scene.fog.density = fogDensity;

    if (window.ambientLight) window.ambientLight.intensity = ambientInt;
    if (window.sunLight) {
        window.sunLight.color.set(sunColor);
        window.sunLight.intensity = sunInt;
    }
    if (window.blueLight) window.blueLight.intensity = blueInt;
    if (window.roadMesh) window.roadMesh.material.color.set(roadColor);
    if (window.laneMarkers) window.laneMarkers.forEach(m => m.material.color.set(markerColor));

    // Re-grid
    scene.remove(window.gridHelper);
    window.gridHelper = new THREE.GridHelper(200, 40, gridColor1, gridColor2);
    scene.add(window.gridHelper);
}

// ... (other refs removed, moved to top)

// ============================================================
//  BUILDING SPAWNER
// ============================================================
function spawnBuilding(initial = false) {
    if (!buildingTex) buildingTex = createBuildingTexture();
    const geo = new THREE.BoxGeometry(
        Math.random() * 5 + 5,
        Math.random() * 30 + 10,
        Math.random() * 5 + 5
    );
    const mat = new THREE.MeshStandardMaterial({
        color: 0x555566,
        map: buildingTex,
        emissive: Math.random() > 0.5 ? 0xff007f : 0x00f3ff,
        emissiveIntensity: 0.15
    });
    const b = new THREE.Mesh(geo, mat);
    const isLeft = Math.random() > 0.5;
    const xOff = (ROAD_WIDTH / 2) + 5 + Math.random() * 30;
    b.position.x = isLeft ? -xOff : xOff;
    b.position.y = geo.parameters.height / 2;
    b.position.z = initial ? (-Math.random() * 150 + 10) : -150;
    scene.add(b);
    buildings.push(b);
}

// ============================================================
//  OBSTACLE SPAWNER
// ============================================================
function spawnObstacle() {
    const types = ['truck', 'pickup'];
    const typeName = types[Math.floor(Math.random() * types.length)];
    const { group, data } = buildObstacleCarGroup(typeName);

    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
    const laneX = lanes[Math.floor(Math.random() * lanes.length)];

    // Mão única vs Mão dupla
    let isOpposite = false;
    if (gameSettings.roadType === ROAD_TYPES.TWO_WAY) {
        // Na mão dupla, o lane da esquerda vem na contra-mão
        if (laneX === -LANE_WIDTH) isOpposite = true;
        // O lane central tem 50% de chance de ser contra-mão
        if (laneX === 0 && Math.random() > 0.5) isOpposite = true;
    }

    const speedBase = isOpposite ? -0.8 : 0.6;
    const speedRatio = speedBase + (Math.random() * 0.2);

    group.rotation.y = isOpposite ? 0 : Math.PI;
    group.position.x = laneX;
    group.position.y = 0;
    group.position.z = isOpposite ? -180 : -150;

    // Prevenção de spawn sobreposto
    const tooClose = obstacles.some(o => Math.abs(o.position.x - laneX) < 1 && Math.abs(o.position.z - group.position.z) < 15);
    if (tooClose) {
        scene.remove(group);
        return;
    }

    group.userData = {
        type: typeName,
        speedRatio: speedRatio,
        isOpposite: isOpposite,
        passed: false,
        box: new THREE.Box3(),
        w: data.w, h: data.h, d: data.d,
        targetX: group.position.x,
        laneChangeTimer: 2 + Math.random() * 5
    };

    scene.add(group);
    obstacles.push(group);
}

// ============================================================
//  DESERT DECOR
// ============================================================
function spawnDesertDecor(initial = false) {
    const isPlateau = Math.random() > 0.7;
    let mesh;

    if (isPlateau) {
        const geo = new THREE.BoxGeometry(Math.random() * 20 + 30, Math.random() * 15 + 15, Math.random() * 20 + 30);
        const mat = new THREE.MeshStandardMaterial({ color: 0xaa6644, roughness: 0.9 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = geo.parameters.height / 2 - 2;
    } else {
        const cactus = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x228822 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        cactus.add(body);
        for (let i = 0; i < 2; i++) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), bodyMat);
            arm.position.y = (i === 0 ? 0.5 : 1);
            arm.position.x = (i === 0 ? 0.8 : -0.8);
            arm.rotation.z = (i === 0 ? Math.PI / 2.5 : -Math.PI / 2.5);
            cactus.add(arm);
        }
        mesh = cactus;
        mesh.position.y = 1.5;
    }

    const isLeft = Math.random() > 0.5;
    const xOff = (ROAD_WIDTH / 2) + 12 + Math.random() * 60;
    mesh.position.x = isLeft ? -xOff : xOff;
    mesh.position.z = initial ? (-Math.random() * 180 + 20) : -180;
    mesh.userData.isDesertDecor = true;
    scene.add(mesh);
    buildings.push(mesh);
}

// ============================================================
//  MOEDA 3D
// ============================================================
let coinSpawnTimer = 0;

function spawnCoin() {
    const coinGroup = new THREE.Group();

    const torusGeo = new THREE.TorusGeometry(0.38, 0.12, 10, 20);
    const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 1.5,
        metalness: 1.0, roughness: 0.1
    });
    const torus = new THREE.Mesh(torusGeo, coinMat);
    torus.rotation.x = Math.PI / 2;
    coinGroup.add(torus);

    // Símbolo $ no centro
    const discGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({
        color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 1,
        metalness: 0.9, roughness: 0.1
    }));
    coinGroup.add(disc);

    // Aura glow
    const auraGeo = new THREE.TorusGeometry(0.55, 0.04, 6, 16);
    const auraMat = new THREE.MeshStandardMaterial({
        color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 3,
        transparent: true, opacity: 0.5
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = Math.PI / 2;
    coinGroup.add(aura);

    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
    coinGroup.position.x = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 2;
    coinGroup.position.y = 1.4;
    coinGroup.position.z = -150;
    coinGroup.userData = { box: new THREE.Box3(), collected: false };
    scene.add(coinGroup);
    coinObjects.push(coinGroup);
}

// ============================================================
//  INPUT
// ============================================================
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
    if (k === 'escape' && isPlaying) togglePause();
}

function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
}

// ============================================================
//  GAME FLOW
// ============================================================
function startGame(roadType) {
    if (roadType) gameSettings.roadType = roadType;

    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    uiMainMenu.classList.add('hidden');
    uiEnvMenu.classList.add('hidden');
    uiRoadMenu.classList.add('hidden');
    uiGameOverMenu.classList.add('hidden');
    uiGarageMenu.classList.add('hidden');
    uiHUD.classList.remove('hidden');

    applyEnvironment();

    score = 0;
    gameTime = 0;
    currentSpeed = START_SPEED;
    speedOffset = 0;
    nitroCounter = MAX_NITRO;
    coinsThisRun = 0;
    isPlaying = true;
    isPaused = false;

    playerGroup.position.set(0, 0, 0);
    playerTargetX = 0;
    playerVelocityX = 0;
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, -15);

    obstacles.forEach(o => scene.remove(o));
    obstacles = [];
    coinObjects.forEach(c => scene.remove(c));
    coinObjects = [];

    buildings.forEach(b => scene.remove(b));
    buildings = [];

    // Limpa outros objetos dcorativos (cactos, etc)
    scene.children.filter(c => c.userData.isDesertDecor || c.userData.isBuilding).forEach(c => {
        scene.remove(c);
        if (c.geometry) c.geometry.dispose();
    });

    if (gameSettings.environment === ENV_TYPES.DESERT) {
        for (let i = 0; i < 40; i++) spawnDesertDecor(true);
    } else {
        for (let i = 0; i < 40; i++) spawnBuilding(true);
    }

    coinSpawnTimer = 0;
    obstacleSpawnTimer = 0;

    applySelectedCar();
    updateUI();
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        uiPauseMenu.classList.remove('hidden');
    } else {
        uiPauseMenu.classList.add('hidden');
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
}

function showMainMenu() {
    isPlaying = false;
    uiPauseMenu.classList.add('hidden');
    uiGameOverMenu.classList.add('hidden');
    uiHUD.classList.add('hidden');
    uiGarageMenu.classList.add('hidden');
    uiMainMenu.classList.remove('hidden');
    refreshPersistentUI();
}

function gameOver() {
    isPlaying = false;
    uiHUD.classList.add('hidden');
    uiGameOverMenu.classList.remove('hidden');

    const sessionScore = Math.floor(score);
    finalScore.innerText = sessionScore;
    finalCoins.innerText = `+${coinsThisRun}`;

    if (sessionScore > highScore) {
        highScore = sessionScore;
        localStorage.setItem('urbanVelocityHighScore', highScore);
    }
    finalRecord.innerText = highScore;

    totalCoins += coinsThisRun;
    localStorage.setItem('urbanVelocityCoins', totalCoins);
    totalCoinsDisplay.innerText = totalCoins;
}

function showActionText(text, color = '#ffff00') {
    const el = document.createElement('div');
    el.className = 'action-text';
    el.innerText = text;
    el.style.color = color;
    el.style.textShadow = `0 0 20px ${color}`;
    actionTextContainer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function updateUI() {
    scoreDisplay.innerText = `Pontos: ${Math.floor(score)}`;
    speedDisplay.innerText = `${Math.floor(currentSpeed)} km/h`;
    nitroBar.style.width = `${(nitroCounter / MAX_NITRO) * 100}%`;
    coinHudCount.innerText = coinsThisRun;
    recordDisplay.innerText = `🏆 ${highScore}`;
}

// ============================================================
//  GARAGEM UI
// ============================================================
function showGarage() {
    uiMainMenu.classList.add('hidden');
    uiGarageMenu.classList.remove('hidden');
    garageCoinsEl.innerText = totalCoins;
    buildGarageUI();
}

function hideGarage() {
    uiGarageMenu.classList.add('hidden');
    uiMainMenu.classList.remove('hidden');
    refreshPersistentUI();
}

function buildGarageUI() {
    const grid = document.getElementById('car-grid');
    grid.innerHTML = '';

    CAR_CATALOG.forEach(car => {
        const isUnlocked = unlockedCars.includes(car.id);
        const isSelected = selectedCarId === car.id;
        const canAfford = totalCoins >= car.price;

        const card = document.createElement('div');
        card.className = 'car-card' + (isSelected ? ' selected' : '') + (isUnlocked ? '' : ' locked');

        // Canvas preview
        const cv = document.createElement('canvas');
        cv.width = 130; cv.height = 78;
        cv.className = 'car-preview-canvas';
        drawCarPreview(cv, car, isUnlocked, isSelected);

        // Info
        const info = document.createElement('div');
        info.className = 'car-info';
        const sizeLabel = `${car.style.toUpperCase()} · ${car.w}m × ${car.d}m`;
        info.innerHTML = `
            <div class="car-name">${car.name}</div>
            <div class="car-size-tag">${sizeLabel}</div>
            <div class="car-desc">${car.desc}</div>
        `;

        // Button
        const btn = document.createElement('button');
        btn.className = 'car-action-btn';
        if (isSelected) {
            btn.innerText = '✅ Selecionado'; btn.disabled = true; btn.classList.add('btn-selected');
        } else if (isUnlocked) {
            btn.innerText = '🚗 Usar'; btn.classList.add('btn-use');
            btn.addEventListener('click', () => selectCar(car.id));
        } else if (canAfford) {
            btn.innerText = `🪙 ${car.price} — Comprar`; btn.classList.add('btn-buy');
            btn.addEventListener('click', () => buyCar(car.id, car.price));
        } else {
            btn.innerText = `🔒 ${car.price} moedas`; btn.disabled = true; btn.classList.add('btn-locked');
        }

        card.appendChild(cv);
        card.appendChild(info);
        card.appendChild(btn);
        grid.appendChild(card);
    });
}

function drawCarPreview(canvas, car, isUnlocked, isSelected) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = isSelected ? '#060c14' : '#080810';
    ctx.fillRect(0, 0, W, H);

    if (!isUnlocked) {
        ctx.fillStyle = '#1a1a2e';
        ctx.roundRect(8, 10, W - 16, H - 20, 8); ctx.fill();
        ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#555577';
        ctx.fillText('🔒', W / 2, H / 2 + 9);
        return;
    }

    // Road background strip
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, H * 0.55, W, H * 0.45);

    // === Desenho TOP-DOWN do carro ===
    const scaleX = (W - 20) / (car.d + 1);  // comprimento = profundidade do carro
    const scaleY = (H * 0.5) / (car.w + 0.5);
    const cx = W / 2, cy = H * 0.35;

    function rx(z) { return cx + (z - car.d / 2) * scaleX; }   // z → x na tela
    function ry(x) { return cy + x * scaleY; }                   // x → y na tela

    const bodyW2 = car.w / 2, bodyD = car.d;
    const bodyColor = '#' + car.bodyHex.toString(16).padStart(6, '0');
    const emColor = '#' + car.emissive.toString(16).padStart(6, '0');

    // Sombra
    ctx.shadowColor = emColor; ctx.shadowBlur = 12;

    // Corpo principal
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(rx(0), ry(-bodyW2), car.d * scaleX, car.w * scaleY, 6);
    ctx.fill();

    // Teto (mais estreito)
    ctx.shadowBlur = 0;
    const cabW2 = car.w * 0.38, cabDstart = car.d * 0.18, cabDend = car.d * 0.72;
    ctx.fillStyle = '#' + car.roofHex.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.roundRect(rx(cabDstart), ry(-cabW2), (cabDend - cabDstart) * scaleX, cabW2 * 2 * scaleY, 4);
    ctx.fill();

    // Pára-brisas (front)
    ctx.fillStyle = 'rgba(100,180,255,0.35)';
    ctx.fillRect(rx(cabDstart - 0.3), ry(-cabW2 * 0.95), 0.3 * scaleX, cabW2 * 1.9 * scaleY);
    // Vidro traseiro
    ctx.fillRect(rx(cabDend), ry(-cabW2 * 0.95), 0.3 * scaleX, cabW2 * 1.9 * scaleY);

    // Stripes neon
    ctx.fillStyle = car.accentColor;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(rx(car.d * 0.1), ry(-bodyW2 + 2), car.d * 0.8 * scaleX, 2);
    ctx.fillRect(rx(car.d * 0.1), ry(bodyW2 - 4), car.d * 0.8 * scaleX, 2);
    ctx.globalAlpha = 1;

    // Faróis (frente)
    ctx.shadowColor = '#ffffaa'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffcc';
    ctx.fillRect(rx(0), ry(-bodyW2 * 0.75), 4, bodyW2 * 0.5 * scaleY);
    ctx.fillRect(rx(0), ry(bodyW2 * 0.25), 4, bodyW2 * 0.5 * scaleY);

    // Lanternas (traseira)
    ctx.shadowColor = emColor; ctx.shadowBlur = 8;
    ctx.fillStyle = emColor;
    ctx.fillRect(rx(car.d) - 4, ry(-bodyW2 * 0.75), 4, bodyW2 * 0.5 * scaleY);
    ctx.fillRect(rx(car.d) - 4, ry(bodyW2 * 0.25), 4, bodyW2 * 0.5 * scaleY);
    ctx.shadowBlur = 0;

    // Rodas (top-down = retângulos nas quinas)
    ctx.fillStyle = '#222';
    const wh = bodyW2 * 0.22, wl = 0.9;
    [0.22, 0.78].forEach(frac => {
        const wz = car.d * frac;
        ctx.fillRect(rx(wz - wl / 2), ry(-bodyW2 - 0.2), wl * scaleX, 0.18 * scaleY + 3);
        ctx.fillRect(rx(wz - wl / 2), ry(bodyW2 + 0.02), wl * scaleX, 0.18 * scaleY + 3);
    });

    // Neon underglow stroke
    ctx.strokeStyle = emColor; ctx.lineWidth = 1.5;
    ctx.shadowColor = emColor; ctx.shadowBlur = 10;
    ctx.strokeRect(rx(0) + 1, ry(-bodyW2) + 1, car.d * scaleX - 2, car.w * scaleY - 2);
    ctx.shadowBlur = 0;
}

function selectCar(carId) {
    selectedCarId = carId;
    localStorage.setItem('urbanVelocitySelectedCar', carId);
    applySelectedCar();
    buildGarageUI();
    showActionText('Carro selecionado!', '#00f3ff');
}

function buyCar(carId, price) {
    if (totalCoins < price) return;
    totalCoins -= price;
    localStorage.setItem('urbanVelocityCoins', totalCoins);
    unlockedCars.push(carId);
    localStorage.setItem('urbanVelocityUnlocked', JSON.stringify(unlockedCars));
    garageCoinsEl.innerText = totalCoins;
    showActionText(`🚗 Desbloqueado!`, '#ffcc00');
    buildGarageUI();
}

// ============================================================
//  GAME LOOP
// ============================================================
let obstacleSpawnTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    if (isPlaying && !isPaused) {
        gameTime += dt;
        let baseSpeed = START_SPEED + (ACCEL * gameTime);

        let accRate = 60, brkRate = 80;
        if (keys['arrowup'] || keys['w']) {
            speedOffset += accRate * dt;
            if (speedOffset > 80) speedOffset = 80;
        } else if (keys['arrowdown'] || keys['s']) {
            speedOffset -= brkRate * dt;
            if (speedOffset < -80) speedOffset = -80;
            if (baseSpeed + speedOffset < 30) speedOffset = 30 - baseSpeed;
        } else {
            if (speedOffset > 0) { speedOffset -= 20 * dt; if (speedOffset < 0) speedOffset = 0; }
            else if (speedOffset < 0) { speedOffset += 40 * dt; if (speedOffset > 0) speedOffset = 0; }
        }
        currentSpeed = baseSpeed + speedOffset;

        // Nitro
        nitroActive = false;
        if (keys['n'] && nitroCounter > 0) {
            nitroActive = true;
            nitroCounter -= dt * 25;
            if (nitroCounter < 0) nitroCounter = 0;
        } else {
            nitroCounter += dt * 5;
            if (nitroCounter > MAX_NITRO) nitroCounter = MAX_NITRO;
        }

        const speedMult = nitroActive ? 2.0 : 1.0;
        const deltaMove = currentSpeed * speedMult * dt;

        // Score
        score += dt * (nitroActive ? 2 : 1);

        // Lateral
        const moveSp = 40;
        if (keys['arrowleft'] || keys['a']) playerVelocityX -= moveSp * dt;
        if (keys['arrowright'] || keys['d']) playerVelocityX += moveSp * dt;
        playerVelocityX *= 0.85;
        playerTargetX += playerVelocityX * dt;
        playerTargetX = Math.max(Math.min(playerTargetX, ROAD_WIDTH / 2 - 1.5), -ROAD_WIDTH / 2 + 1.5);
        playerGroup.position.x = THREE.MathUtils.lerp(playerGroup.position.x, playerTargetX, 0.2);
        playerGroup.rotation.z = -playerVelocityX * 0.04;

        // Camera
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerGroup.position.x * 0.5, 0.1);
        camera.fov = THREE.MathUtils.lerp(camera.fov, nitroActive ? 95 : 75, 0.1);
        camera.updateProjectionMatrix();

        // Point light follows player
        window.carLight.position.x = playerGroup.position.x;

        // ---- CAUDA DE LUZ (trail) + ANIMAÇÃO LANTERNAS ----
        if (playerGroup.userData.tailLights && playerGroup.userData.tailTrails) {
            const pulse = 0.85 + 0.15 * Math.sin(gameTime * 8);
            const speedMult = nitroActive ? 2.0 : 1.0;

            playerGroup.userData.tailLights.forEach((tdata, i) => {
                // Pulsa a lanterna
                tdata.tl.material.emissiveIntensity = 3.5 * pulse * (nitroActive ? 1.4 : 1.0);
                tdata.halo.material.opacity = 0.55 * pulse;

                // Posição mundial do anchor
                const wp = new THREE.Vector3();
                tdata.anchor.getWorldPosition(wp);

                // Atualiza o trail dessa lanterna
                playerGroup.userData.tailTrails[i].update(wp, dt, deltaMove, speedMult);
            });

            // SpotLights
            if (playerGroup.userData.tailSpots) {
                playerGroup.userData.tailSpots.forEach(spot => {
                    spot.intensity = nitroActive ? 12 * pulse : 6 * pulse;
                });
            }
        }

        // World flow (buildings / decor)
        for (let i = buildings.length - 1; i >= 0; i--) {
            const b = buildings[i];
            b.position.z += deltaMove;
            if (b.position.z > 20) {
                scene.remove(b);
                buildings.splice(i, 1);
                if (gameSettings.environment === ENV_TYPES.DESERT) {
                    spawnDesertDecor();
                } else {
                    spawnBuilding();
                }
            }
        }
        window.gridHelper.position.z = (window.gridHelper.position.z + deltaMove) % 10;

        // Spawn obstáculos
        obstacleSpawnTimer -= dt;
        if (obstacleSpawnTimer <= 0) {
            spawnObstacle();
            obstacleSpawnTimer = 25 / (currentSpeed * speedMult) + Math.random() * 0.5;
        }

        // Spawn moedas
        coinSpawnTimer -= dt;
        if (coinSpawnTimer <= 0) {
            spawnCoin();
            coinSpawnTimer = Math.max(0.8, 2.5 - gameTime * 0.01) + Math.random() * 0.5;
        }

        // Bounding box do player (diminuída para facilitar dirigibilidade)
        playerBox.setFromObject(playerGroup);
        const playerMin = playerBox.min.clone();
        const playerMax = playerBox.max.clone();
        playerBox.min.set(
            playerMin.x + (playerMax.x - playerMin.x) * 0.15,
            playerMin.y,
            playerMin.z + (playerMax.z - playerMin.z) * 0.15
        );
        playerBox.max.set(
            playerMax.x - (playerMax.x - playerMin.x) * 0.15,
            playerMax.y,
            playerMax.z - (playerMax.z - playerMin.z) * 0.15
        );

        const finezaBox = playerBox.clone().expandByScalar(1.5);

        // Obstáculos
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            const obsForwardSpeed = (currentSpeed * obs.userData.speedRatio) * dt;
            obs.position.z += (deltaMove - obsForwardSpeed);

            // IA: Troca de faixa ocasional
            if (obs.userData.laneChangeTimer !== undefined) {
                obs.userData.laneChangeTimer -= dt;
                if (obs.userData.laneChangeTimer <= 0) {
                    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
                    const currentLane = lanes.find(l => Math.abs(l - obs.userData.targetX) < 0.1);
                    const possibleNewLanes = lanes.filter(l => Math.abs(l - currentLane) <= LANE_WIDTH + 0.1 && l !== currentLane);
                    if (possibleNewLanes.length > 0) {
                        const newLane = possibleNewLanes[Math.floor(Math.random() * possibleNewLanes.length)];
                        // Verifica se o lane de destino está livre por perto
                        const laneBlocked = obstacles.some(o => o !== obs && Math.abs(o.userData.targetX - newLane) < 0.1 && Math.abs(o.position.z - obs.position.z) < 12);
                        if (!laneBlocked) {
                            obs.userData.targetX = newLane;
                        }
                    }
                    obs.userData.laneChangeTimer = 3 + Math.random() * 10;
                }
                obs.position.x = THREE.MathUtils.lerp(obs.position.x, obs.userData.targetX, 0.05);
            }

            obs.userData.box.setFromObject(obs);

            // Diminui hitbox dos obstáculos também
            const obsMin = obs.userData.box.min.clone();
            const obsMax = obs.userData.box.max.clone();
            obs.userData.box.min.set(
                obsMin.x + (obsMax.x - obsMin.x) * 0.15,
                obsMin.y,
                obsMin.z + (obsMax.z - obsMin.z) * 0.15
            );
            obs.userData.box.max.set(
                obsMax.x - (obsMax.x - obsMin.x) * 0.15,
                obsMax.y,
                obsMax.z - (obsMax.z - obsMin.z) * 0.15
            );

            if (playerBox.intersectsBox(obs.userData.box)) {
                gameOver(); return;
            } else if (!obs.userData.passed && finezaBox.intersectsBox(obs.userData.box)) {
                const depth = obs.userData.d || 5;
                if (Math.abs(obs.position.z - playerGroup.position.z) < (depth / 2 + 2)) {
                    score += 10;
                    coinsThisRun += 2;
                    showActionText('+10 FINEZA! 🪙+2', '#ffcc00');
                    obs.userData.passed = true;
                }
            }

            if (obs.position.z > 20 || obs.position.z < -200) {
                scene.remove(obs);
                obstacles.splice(i, 1);
            }
        }

        // Moedas
        for (let i = coinObjects.length - 1; i >= 0; i--) {
            const coin = coinObjects[i];
            coin.position.z += deltaMove;
            coin.rotation.y += dt * 2.5;
            // Bobbing animation
            coin.position.y = 1.4 + Math.sin(gameTime * 3 + i) * 0.15;

            if (!coin.userData.collected) {
                coin.userData.box.setFromObject(coin);
                if (playerBox.intersectsBox(coin.userData.box)) {
                    coinsThisRun += 5;
                    score += 5;
                    showActionText('🪙 +5', '#ffcc00');
                    scene.remove(coin);
                    coinObjects.splice(i, 1);
                    continue;
                }
            }

            if (coin.position.z > 20) {
                scene.remove(coin);
                coinObjects.splice(i, 1);
            }
        }

        updateUI();
    }

    updateAudio(currentSpeed, nitroActive);
    renderer.render(scene, camera);
}

// Initial call
init();

// ============================================================
//  PROCEDURAL TEXTURES
// ============================================================
function createBuildingTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, 256, 512);
    for (let y = 10; y < 500; y += 30) {
        for (let x = 10; x < 240; x += 35) {
            if (Math.random() > 0.4) {
                let col = '#333344';
                if (Math.random() > 0.7) col = '#00f3ff';
                if (Math.random() > 0.9) col = '#ff007f';
                ctx.fillStyle = col;
                ctx.fillRect(x, y, 15, 20);
            }
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}
