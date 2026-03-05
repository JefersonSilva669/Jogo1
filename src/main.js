// --- CONFIG ---
const ROAD_WIDTH = 20;
const LANE_COUNT = 3;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const START_SPEED = 50;
const ACCEL = 1.5;
const MAX_NITRO = 100;

// --- GLOBALS ---
let scene, camera, renderer, clock;
let player;
let playerBox = new THREE.Box3();
let obstacles = [];
let buildings = [];

let isPlaying = false;
let isPaused = false;
let score = 0;
let gameTime = 0;
let nitroCounter = MAX_NITRO;
let nitroActive = false;
let currentSpeed = START_SPEED;

// Keys
const keys = { arrowleft: false, arrowright: false, arrowup: false, arrowdown: false, w: false, s: false, a: false, d: false, n: false };
let playerTargetX = 0;
let playerVelocityX = 0;
let speedOffset = 0;
let buildingTex, playerCarTex;

// UI Elements
const uiMainMenu = document.getElementById('main-menu');
const uiHUD = document.getElementById('hud');
const uiPauseMenu = document.getElementById('pause-menu');
const uiGameOverMenu = document.getElementById('game-over-menu');
const scoreDisplay = document.getElementById('score-display');
const speedDisplay = document.getElementById('speed-display');
const nitroBar = document.getElementById('nitro-bar');
const finalScore = document.getElementById('final-score');
const highScoreDisplay = document.getElementById('high-score-display');
const actionTextContainer = document.getElementById('action-text-container');

let highScore = localStorage.getItem('urbanVelocityHighScore') || 0;
highScoreDisplay.innerText = highScore;

// Audio
let audioCtx;
let engineOsc, engineGain, windGain;

function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // Engine Synth
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineGain).connect(audioCtx.destination);
    engineOsc.start();

    // Wind / Road noise
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) { output[i] = Math.random() * 2 - 1; }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = buffer;
    whiteNoise.loop = true;

    const windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;

    windGain = audioCtx.createGain();
    windGain.gain.value = 0;
    whiteNoise.connect(windFilter).connect(windGain).connect(audioCtx.destination);
    whiteNoise.start();

    window.windFilter = windFilter;
}

function updateAudio(speed, isNitro) {
    if (!audioCtx) return;
    if (!isPlaying || isPaused) {
        engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }

    let normalizedSpeed = speed / 200;
    engineOsc.frequency.setTargetAtTime(50 + normalizedSpeed * 150 + (isNitro ? 50 : 0), audioCtx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(0.1 + normalizedSpeed * 0.1, audioCtx.currentTime, 0.1);

    window.windFilter.frequency.setTargetAtTime(400 + normalizedSpeed * 1000, audioCtx.currentTime, 0.1);
    windGain.gain.setTargetAtTime(normalizedSpeed * 0.3, audioCtx.currentTime, 0.2);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 10);
    camera.lookAt(0, 0, -10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xff007f, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);
    const blueLight = new THREE.DirectionalLight(0x00f3ff, 1);
    blueLight.position.set(-5, 5, -5);
    scene.add(blueLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(200, 40, 0x00f3ff, 0x9d00ff);
    gridHelper.position.y = 0;
    scene.add(gridHelper);
    window.gridHelper = gridHelper;

    // Road Base
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 200);
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x030308, side: THREE.DoubleSide });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = Math.PI / 2;
    road.position.y = -0.01; // Slightly below grid
    road.position.z = -50;
    scene.add(road);

    // Player Car
    playerCarTex = createCarTexture('#222233', '#00f3ff');
    const carGeo = new THREE.BoxGeometry(2, 1, 4);
    const carMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        map: playerCarTex,
        emissive: 0xff007f,
        emissiveIntensity: 0.3,
        wireframe: false
    });
    player = new THREE.Mesh(carGeo, carMat);
    scene.add(player);

    // Initial buildings environment
    for (let i = 0; i < 40; i++) spawnBuilding(true);

    // Events
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('quit-btn').addEventListener('click', showMainMenu);
    document.getElementById('restart-btn').addEventListener('click', startGame);
    document.getElementById('menu-btn').addEventListener('click', showMainMenu);

    // Render loop
    animate();
}

function spawnBuilding(initial = false) {
    if (!buildingTex) buildingTex = createBuildingTexture();
    const geo = new THREE.BoxGeometry(Math.random() * 5 + 5, Math.random() * 30 + 10, Math.random() * 5 + 5);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x555566,
        map: buildingTex,
        emissive: Math.random() > 0.5 ? 0xff007f : 0x00f3ff,
        emissiveIntensity: 0.15,
        wireframe: false
    });
    const b = new THREE.Mesh(geo, mat);

    let isLeft = Math.random() > 0.5;
    let xOffset = (ROAD_WIDTH / 2) + 5 + Math.random() * 30;
    b.position.x = isLeft ? -xOffset : xOffset;
    b.position.y = geo.parameters.height / 2;
    b.position.z = initial ? (-Math.random() * 150 + 10) : -150;

    scene.add(b);
    buildings.push(b);
}

function spawnObstacle() {
    const types = [
        { type: 'truck', w: 3.5, h: 4, d: 8, speedRatio: 0.5, em: 0xff0000, color: '#882222' },
        { type: 'pickup', w: 2.2, h: 2, d: 5, speedRatio: 0.8, em: 0x00ff00, color: '#228822' },
        { type: 'super', w: 2, h: 0.8, d: 4, speedRatio: -0.5, em: 0xffff00, color: '#888822' }
    ];
    let selectedType = types[Math.floor(Math.random() * types.length)];

    const hexColor = '#' + selectedType.em.toString(16).padStart(6, '0');
    const geo = new THREE.BoxGeometry(selectedType.w, selectedType.h, selectedType.d);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        map: createCarTexture(selectedType.color, hexColor),
        emissive: selectedType.em,
        emissiveIntensity: 0.4,
        wireframe: false
    });
    const obs = new THREE.Mesh(geo, mat);

    // Spawn in a lane
    const lanes = [-LANE_WIDTH, 0, LANE_WIDTH];
    obs.position.x = lanes[Math.floor(Math.random() * lanes.length)];
    obs.position.y = selectedType.h / 2;
    obs.position.z = -150;

    obs.userData = {
        type: selectedType.type,
        speedRatio: selectedType.speedRatio,
        passed: false,
        box: new THREE.Box3()
    };

    scene.add(obs);
    obstacles.push(obs);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
    let key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = true;
    }
    if (key === 'escape' && isPlaying) {
        togglePause();
    }
}

function onKeyUp(e) {
    let key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
        keys[key] = false;
    }
}

function startGame() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    uiMainMenu.classList.add('hidden');
    uiGameOverMenu.classList.add('hidden');
    uiHUD.classList.remove('hidden');

    score = 0;
    gameTime = 0;
    currentSpeed = START_SPEED;
    speedOffset = 0;
    nitroCounter = MAX_NITRO;
    isPlaying = true;
    isPaused = false;

    player.position.set(0, 0.5, 0);
    playerTargetX = 0;
    playerVelocityX = 0;
    camera.position.set(0, 4, 10);

    obstacles.forEach(o => scene.remove(o));
    obstacles = [];

    updateUI();
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        uiPauseMenu.classList.remove('hidden');
    } else {
        uiPauseMenu.classList.add('hidden');
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
}

function showMainMenu() {
    isPlaying = false;
    uiPauseMenu.classList.add('hidden');
    uiGameOverMenu.classList.add('hidden');
    uiHUD.classList.add('hidden');
    uiMainMenu.classList.remove('hidden');
    highScoreDisplay.innerText = highScore;
}

function gameOver() {
    isPlaying = false;
    uiHUD.classList.add('hidden');
    uiGameOverMenu.classList.remove('hidden');
    finalScore.innerText = Math.floor(score);

    if (score > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('urbanVelocityHighScore', highScore);
    }
}

function showActionText(text) {
    const el = document.createElement('div');
    el.className = 'action-text';
    el.innerText = text;
    actionTextContainer.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 1000);
}

function updateUI() {
    scoreDisplay.innerText = `Pontos: ${Math.floor(score)}`;
    speedDisplay.innerText = `${Math.floor(currentSpeed)} km/h`;
    nitroBar.style.width = `${(nitroCounter / MAX_NITRO) * 100}%`;
}

let obstacleSpawnTimer = 0;

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1); // Cap dt

    if (isPlaying && !isPaused) {
        gameTime += dt;

        // Linear Progression
        let baseSpeed = START_SPEED + (ACCEL * gameTime);

        // Manual Acceleration & Braking
        let accelerationRate = 60;
        let brakingRate = 80;

        if (keys['arrowup'] || keys['w']) {
            speedOffset += accelerationRate * dt;
            if (speedOffset > 80) speedOffset = 80; // Max speed bonus
        } else if (keys['arrowdown'] || keys['s']) {
            speedOffset -= brakingRate * dt;
            if (speedOffset < -80) speedOffset = -80; // Max brake penalty

            // Limit brake so player never stops (minimum 30 km/h)
            if (baseSpeed + speedOffset < 30) {
                speedOffset = 30 - baseSpeed;
            }
        } else {
            // Cruise control (Return to base speed)
            if (speedOffset > 0) {
                speedOffset -= 20 * dt;
                if (speedOffset < 0) speedOffset = 0;
            } else if (speedOffset < 0) {
                speedOffset += 40 * dt; // Brakes un-lock faster 
                if (speedOffset > 0) speedOffset = 0;
            }
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

        let speedMultiplier = nitroActive ? 2.0 : 1.0;
        let deltaMovement = currentSpeed * speedMultiplier * dt;

        // Score
        let pointMultiplier = nitroActive ? 2 : 1;
        score += (1 * dt) * pointMultiplier;

        // Player Movement Lateral
        let moveSpeed = 40;
        if (keys['arrowleft'] || keys['a']) playerVelocityX -= moveSpeed * dt;
        if (keys['arrowright'] || keys['d']) playerVelocityX += moveSpeed * dt;

        playerVelocityX *= 0.85;
        playerTargetX += playerVelocityX * dt;

        // Bounds
        playerTargetX = Math.max(Math.min(playerTargetX, ROAD_WIDTH / 2 - 1.5), -ROAD_WIDTH / 2 + 1.5);
        player.position.x = THREE.MathUtils.lerp(player.position.x, playerTargetX, 0.2);

        // Tilt
        player.rotation.z = -playerVelocityX * 0.05;

        // Camera follow & Nitro effect
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x * 0.5, 0.1);
        let targetFov = nitroActive ? 95 : 75;
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
        camera.updateProjectionMatrix();

        // Animate World (Grid and Buildings)
        window.gridHelper.position.z = (window.gridHelper.position.z + deltaMovement) % 10;

        buildings.forEach((b) => {
            b.position.z += deltaMovement;
            if (b.position.z > 20) {
                b.position.z = -150 - Math.random() * 50;
            }
        });

        // Spawning obstacles
        obstacleSpawnTimer -= dt;
        if (obstacleSpawnTimer <= 0) {
            spawnObstacle();
            obstacleSpawnTimer = 25 / (currentSpeed * speedMultiplier) + Math.random() * 0.5;
        }

        // Collision prep
        playerBox.setFromObject(player);
        let finezaBox = playerBox.clone().expandByScalar(1.5); // Slightly larger for close calls

        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obs = obstacles[i];

            // Movement logic relative to main speed vs obstacle spec
            // Speed = base * speedRatio. Player moves at currentSpeed.
            // Distance difference:
            let relativeSpeed = (currentSpeed * speedMultiplier) - (currentSpeed * obs.userData.speedRatio);

            // Wait, world is coming AT player with 'deltaMovement'
            // Obstacle also drives forward in the world (moves -Z)
            // So its visual movement towards camera = deltaMovement - (obs speed * dt)
            let obsForwardSpeed = (currentSpeed * obs.userData.speedRatio) * dt;
            obs.position.z += (deltaMovement - obsForwardSpeed);

            obs.userData.box.setFromObject(obs);

            // Collision Check
            if (playerBox.intersectsBox(obs.userData.box)) {
                gameOver();
                return;
            } else if (!obs.userData.passed && finezaBox.intersectsBox(obs.userData.box)) {
                // Front / Back alignment for fineza
                if (Math.abs(obs.position.z - player.position.z) < (obs.geometry.parameters.depth / 2 + 2)) {
                    score += 10;
                    showActionText("+10 FINEZA!");
                    obs.userData.passed = true;
                }
            }

            // Remove
            if (obs.position.z > 20 || obs.position.z < -200) {
                scene.remove(obs);
                obstacles.splice(i, 1);
            }
        }

        updateUI();
    }

    updateAudio(currentSpeed, nitroActive);
    renderer.render(scene, camera);
}

// Initial Call
init();

// --- PROCEDURAL TEXTURES ---
function createBuildingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Background facade
    ctx.fillStyle = '#0f111a';
    ctx.fillRect(0, 0, 256, 512);

    // Windows
    for (let y = 10; y < 500; y += 30) {
        for (let x = 10; x < 240; x += 35) {
            // Chance to spawn a window
            if (Math.random() > 0.4) {
                let color = '#333344'; // Lights off
                if (Math.random() > 0.7) color = '#00f3ff'; // Lights On Blue
                if (Math.random() > 0.9) color = '#ff007f'; // Lights On Pink

                ctx.fillStyle = color;
                ctx.fillRect(x, y, 15, 20);
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createCarTexture(baseColor, accentColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Main Body
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);

    // Roof / Windows
    ctx.fillStyle = '#111115';
    ctx.fillRect(20, 20, 88, 88);

    // Glass highlight/Neon outline
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 88, 88);

    // Sport / Neon stripes down the vehicle
    ctx.fillStyle = accentColor;
    ctx.fillRect(50, 0, 8, 128);
    ctx.fillRect(70, 0, 8, 128);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}
