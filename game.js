import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- Global State ---
const state = {
    screen: 'menu', // menu, game, gameover
    speed: 0,
    score: 0,
    lane: 0, // -1, 1
    boost: false,
    distance: 0,
    isTransitioning: false
};

// --- Constants ---
const CFG = {
    laneWidth: 10,
    baseSpeed: 1.0,  // 稍微提升基础速度
    boostSpeed: 6.0, // NITRO 速度翻倍！(2.5 -> 6.0)
    cameraHeight: 5,
    cameraDist: 14,
    fovBase: 60,
    fovBoost: 85,
    colors: {
        skyTop: 0x000000,
        skyBottom: 0x2a004d, // Deep Purple
        grid: 0xff00ff,
        fog: 0x1a0b2e
    }
};

// --- Three.js Globals ---
let scene, camera, renderer, composer;
let clock = new THREE.Clock();
let container;

// --- Game Objects ---
let playerCar;
let terrain; // The moving grid/mountains
let obstacles = [];
let particles = [];
let roadLines = [];

// --- Data ---
const questionBank = [
    { q: "地球的形状是？", a: "球体", b: "天圆地方", correct: "A" },
    { q: "地球表面海洋占多少比例？", a: "71%", b: "29%", correct: "A" },
    { q: "本初子午线是指？", a: "0°经线", b: "180°经线", correct: "A" },
    { q: "赤道是？", a: "0°纬线", b: "90°纬线", correct: "A" },
    { q: "七大洲中面积最大的是？", a: "亚洲", b: "非洲", correct: "A" },
    { q: "世界最高峰是？", a: "珠穆朗玛峰", b: "乞力马扎罗", correct: "A" },
    { q: "板块构造学说认为地球表层分为几大板块？", a: "六大板块", b: "七大板块", correct: "A" },
    { q: "下列哪个不是大洲？", a: "大洋洲", b: "北冰洋", correct: "B" }
];
let currentQuestion = null;
let gateCooldown = 0; // Timer to prevent overlapping

// --- Init ---
function init() {
    container = document.getElementById('canvas-container');
    
    // Scene Setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(CFG.colors.fog, 0.012);
    
    // Camera
    camera = new THREE.PerspectiveCamera(CFG.fovBase, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, CFG.cameraHeight, CFG.cameraDist);
    camera.lookAt(0, 0, -50);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); // Antialias off for Bloom perf
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(renderer.domElement);

    // Post Processing (Bloom)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0;
    bloomPass.strength = 1.5; // Glow strength
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // Environment
    createLights();
    createTerrain(); // Vaporwave Grid + Mountains
    createPlayer();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // UI Bindings
    document.getElementById('btn-campaign').addEventListener('click', startGame);
    
    const nitroBtn = document.getElementById('nitro-btn');
    const setBoost = (active) => { state.boost = active; };
    nitroBtn.addEventListener('mousedown', () => setBoost(true));
    nitroBtn.addEventListener('mouseup', () => setBoost(false));
    nitroBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setBoost(true); });
    nitroBtn.addEventListener('touchend', (e) => { e.preventDefault(); setBoost(false); });

    // Start Loop
    animate();
}

function createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xff00ff, 1); // Purple Sun
    sunLight.position.set(0, 20, -100);
    scene.add(sunLight);

    // Dynamic Point lights on the car handled in update
}

// --- Procedural Generation ---

function createTerrain() {
    // 1. Endless Grid Floor
    const gridGeo = new THREE.PlaneGeometry(400, 400, 80, 80);
    // Displace vertices to make mountains on sides
    const pos = gridGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i); // This is actually Z in world space before rotation
        
        // Safe zone in middle (road)
        if (Math.abs(x) > 20) {
            const noise = Math.sin(x * 0.1) * Math.cos(y * 0.05) * 10;
            pos.setZ(i, Math.abs(x * 0.2) + noise); // Lift up sides
        } else {
            pos.setZ(i, 0); // Flat road
        }
    }
    gridGeo.computeVertexNormals();

    const gridMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xbc13fe, // Neon Purple
        emissiveIntensity: 0.2,
        wireframe: true,
        roughness: 0.5,
        metalness: 0.8
    });

    terrain = new THREE.Mesh(gridGeo, gridMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.z = -100; // Start ahead
    scene.add(terrain);

    // 2. Road Lines (Glowing)
    const lineGeo = new THREE.BoxGeometry(0.5, 0.1, 400);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan
    
    const leftLine = new THREE.Mesh(lineGeo, lineMat);
    leftLine.position.set(-CFG.laneWidth - 2, 0.1, -100);
    scene.add(leftLine);
    roadLines.push(leftLine);

    const rightLine = new THREE.Mesh(lineGeo, lineMat);
    rightLine.position.set(CFG.laneWidth + 2, 0.1, -100);
    scene.add(rightLine);
    roadLines.push(rightLine);
}

function createPlayer() {
    playerCar = new THREE.Group();

    // Futuristic Chassis
    const chassisGeo = new THREE.BufferGeometry();
    // Simple custom shape for aerodynamic look (Triangle-ish)
    const vertices = new Float32Array([
        0, 1, 2,  -1.5, 0.5, 2,  1.5, 0.5, 2, // Back
        0, 1, 2,  -1.5, 0.5, 2,  0, 0.2, -3, // Left Side
        0, 1, 2,  1.5, 0.5, 2,   0, 0.2, -3, // Right Side
        -1.5, 0.5, 2, 1.5, 0.5, 2, 0, 0.2, -3 // Bottom
    ]);
    chassisGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    chassisGeo.computeVertexNormals();
    
    const chassisMat = new THREE.MeshStandardMaterial({ 
        color: 0x000000, 
        roughness: 0.2, 
        metalness: 0.9,
        emissive: 0x00ffff,
        emissiveIntensity: 0.2
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    playerCar.add(chassis);

    // Glowing Strips (Tron Lines)
    const stripGeo = new THREE.BoxGeometry(0.1, 0.1, 4.5);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftStrip = new THREE.Mesh(stripGeo, stripMat);
    leftStrip.position.set(-0.8, 0.6, -0.2);
    playerCar.add(leftStrip);
    const rightStrip = new THREE.Mesh(stripGeo, stripMat);
    rightStrip.position.set(0.8, 0.6, -0.2);
    playerCar.add(rightStrip);

    // Engine Exhaust Glow
    const engineGeo = new THREE.BoxGeometry(1, 0.5, 0.1);
    const engineMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.set(0, 0.6, 2.05);
    playerCar.add(engine);

    // Engine Light
    const light = new THREE.PointLight(0xff0055, 2, 10);
    light.position.set(0, 1, 3);
    playerCar.add(light);

    playerCar.position.y = 0.5;
    playerCar.position.x = -CFG.laneWidth / 2;
    state.lane = -1;

    scene.add(playerCar);
}

function spawnGate() {
    // Anti-overlap logic
    if (gateCooldown > 0) return;

    currentQuestion = questionBank[Math.floor(Math.random() * questionBank.length)];
    
    // Update UI
    const qPanel = document.getElementById('question-text');
    qPanel.innerHTML = currentQuestion.q;
    qPanel.style.opacity = 0;
    setTimeout(() => { qPanel.style.opacity = 1; }, 100); // Fade in effect

    const zPos = -400; // Spawn distance
    
    // Create gate objects
    createGateMesh(-CFG.laneWidth/2, zPos, currentQuestion.a, currentQuestion.correct === "A" ? "correct" : "wrong");
    createGateMesh(CFG.laneWidth/2, zPos, currentQuestion.b, currentQuestion.correct === "B" ? "correct" : "wrong");

    gateCooldown = 500; // Wait frames before allowing next spawn logic (will be reset on pass)
}

function createGateMesh(x, z, text, type) {
    const group = new THREE.Group();
    
    // Neon Arches
    const archGeo = new THREE.TorusGeometry(4, 0.2, 8, 30, Math.PI);
    const archMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.y = 0;
    group.add(arch);

    // Base
    const baseGeo = new THREE.BoxGeometry(1, 4, 1);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const leftBase = new THREE.Mesh(baseGeo, baseMat);
    leftBase.position.set(-4, 2, 0);
    group.add(leftBase);
    const rightBase = new THREE.Mesh(baseGeo, baseMat);
    rightBase.position.set(4, 2, 0);
    group.add(rightBase);

    // Hologram Field
    const holoGeo = new THREE.PlaneGeometry(7, 6);
    const holoMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.1, 
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending 
    });
    const holo = new THREE.Mesh(holoGeo, holoMat);
    holo.position.y = 3;
    group.add(holo);

    group.position.set(x, 0, z);
    group.userData = { type: type, text: text, isGate: true };
    scene.add(group);
    obstacles.push(group);

    // HTML Label creation
    const label = document.createElement('div');
    label.className = 'world-label';
    label.innerHTML = `<span class="key-hint">${x < 0 ? 'A' : 'B'}</span> ${text}`;
    document.body.appendChild(label);
    group.userData.domElement = label;
}

// --- Logic ---

function startGame() {
    state.screen = 'game';
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    
    // Reset player
    playerCar.position.x = -CFG.laneWidth/2;
    state.lane = -1;
    
    // Clear old obstacles
    obstacles.forEach(o => {
        scene.remove(o);
        if(o.userData.domElement) o.userData.domElement.remove();
    });
    obstacles = [];
    
    spawnGate();
}

function updatePhysics(dt) {
    if (state.screen !== 'game') {
        // Menu animation: slow flyover
        state.speed = 0.2;
    } else {
        // Game Speed Logic
        const targetSpeed = state.boost ? CFG.boostSpeed : CFG.baseSpeed;
        state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, dt * 2);
    }

    // Move Terrain (Endless runner trick: move objects towards camera)
    // Actually better: Move camera/player forward? No, floating point issues.
    // Solution: Move texture/grid offset? Or move objects and respawn.
    // We'll move objects Z positive.
    
    const moveDist = state.speed * 60 * dt; // Units per frame approx
    state.distance += moveDist;

    // 1. Terrain Loop
    terrain.position.z += moveDist;
    if (terrain.position.z > 100) terrain.position.z = -100;
    
    roadLines.forEach(l => {
        l.position.z += moveDist;
        if (l.position.z > 100) l.position.z = -100;
    });

    // 2. Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obj = obstacles[i];
        obj.position.z += moveDist;

        // Collision
        if (state.screen === 'game' && Math.abs(obj.position.z - playerCar.position.z) < 2) {
             if (Math.abs(obj.position.x - playerCar.position.x) < 4) {
                 handleCollision(obj);
                 // Remove immediately
                 removeObstacle(i);
                 continue;
             }
        }

        // Out of view
        if (obj.position.z > 20) {
            removeObstacle(i);
            // Spawn next gate logic
            // 只有当所有障碍物都被清除时，才生成下一道
            // 注意：这里需要配合 gateCooldown 防止瞬间重复触发
            if (obstacles.length === 0 && gateCooldown <= 0) {
                // Delay spawn
                setTimeout(() => spawnGate(), 500); 
            }
        }
    }
    
    if (gateCooldown > 0) gateCooldown -= dt * 1000;

    // 3. Camera Effects (FOV Boost)
    const targetFov = state.boost ? 110 : CFG.fovBase; // FOV 拉得更开，增强速度感
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 3);
    camera.updateProjectionMatrix();

    // Camera Shake
    camera.position.y = CFG.cameraHeight + Math.sin(clock.elapsedTime * 5) * 0.05 + (state.boost ? (Math.random()*0.1) : 0);

    // 4. Update Labels
    updateLabels();

    // 5. Player Smooth Lane Change
    const targetX = state.lane === -1 ? -CFG.laneWidth/2 : CFG.laneWidth/2;
    playerCar.position.x = THREE.MathUtils.lerp(playerCar.position.x, targetX, dt * 10);
    // Tilt
    const tilt = (playerCar.position.x - targetX) * -0.05;
    playerCar.rotation.z = tilt;
}

function removeObstacle(index) {
    const obj = obstacles[index];
    scene.remove(obj);
    if(obj.userData.domElement) obj.userData.domElement.remove();
    obstacles.splice(index, 1);
    
    // 如果是因为碰撞而移除的（即不是自然移出屏幕），也要检查是否需要生成下一关
    if (obstacles.length === 0 && gateCooldown <= 0) {
        setTimeout(() => spawnGate(), 500);
    }
}

function handleCollision(gate) {
    if (gate.userData.type === "correct") {
        state.score += 100;
        document.getElementById('disp-score').innerText = state.score;
        document.getElementById('question-panel').style.borderColor = "#0f0";
        // Particle Burst
        createExplosion(playerCar.position, 0x00ff00);
    } else {
        document.getElementById('question-panel').style.borderColor = "#f00";
        state.speed = 0; // Hit stop
        createExplosion(playerCar.position, 0xff0000);
    }
    
    // Reset color after delay
    setTimeout(() => {
        document.getElementById('question-panel').style.borderColor = "rgba(0, 255, 255, 0.3)";
    }, 1000);
}

function createExplosion(pos, color) {
    // Simple logic, could be better
}

function updateLabels() {
    obstacles.forEach(obj => {
        if (obj.userData.domElement) {
            const el = obj.userData.domElement;
            const pos = obj.position.clone();
            pos.y += 5; // Above gate
            pos.project(camera);

            const x = (pos.x * .5 + .5) * window.innerWidth;
            const y = (-(pos.y * .5) + .5) * window.innerHeight;

            if (pos.z < 1) { // In front
                el.style.transform = `translate(-50%, -50%)`;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
                el.style.display = 'block';
                // Fade by distance
                const dist = obj.position.z - camera.position.z; // negative
                // Simple opacity
                el.style.opacity = 1; 
            } else {
                el.style.display = 'none';
            }
        }
    });
}

// --- Input ---
function onKeyDown(e) {
    if (state.screen !== 'game') return;
    if (e.key === 'a' || e.key === 'ArrowLeft') state.lane = -1;
    if (e.key === 'd' || e.key === 'ArrowRight') state.lane = 1;
    if (e.code === 'Space' || e.key === 'w' || e.key === 'ArrowUp') state.boost = true;
}

function onKeyUp(e) {
    if (e.code === 'Space' || e.key === 'w' || e.key === 'ArrowUp') state.boost = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- Loop ---
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    updatePhysics(dt);
    
    document.getElementById('disp-speed').innerText = Math.floor(state.speed * 300);

    // Use Composer for Bloom
    composer.render();
}

// Run
init();
