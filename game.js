// ... (imports)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; // 引入加载器
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

// --- Global State ---
const state = {
    screen: 'menu', 
    speed: 0,
    score: 0,
    lane: 0, 
    boost: false,
    distance: 0,
    isTransitioning: false
};

// --- Constants ---
const CFG = {
    laneWidth: 16, 
    baseSpeed: 1.0,  
    boostSpeed: 6.0, 
    cameraHeight: 5,
    cameraDist: 14,
    fovBase: 60,
    fovBoost: 110,
    colors: {
        skyTop: 0x000000,
        skyBottom: 0x2a004d, 
        grid: 0xff00ff,
        fog: 0x1a0b2e
    }
};

// --- Three.js Globals ---
let scene, camera, renderer, composer;
let clock = new THREE.Clock();
let container;
let loader = new GLTFLoader(); // Loader 实例

// --- Game Objects ---
let playerCar;
let terrain; 
let buildings = []; 
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
let gateCooldown = 0; 

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
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.2; // 稍微调亮一点以展示车漆
    container.appendChild(renderer.domElement);

    // Post Processing Pipeline
    const renderScene = new RenderPass(scene, camera);
    
    // 1. Bloom
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.6; // 提高阈值，只有发光部件才Bloom，防止车身泛白
    bloomPass.strength = 1.0;  // 稍微降低强度
    bloomPass.radius = 0.5;

    // 2. Motion Blur (动态模糊) - 使用 AfterimagePass 模拟残影
    const afterimagePass = new AfterimagePass();
    afterimagePass.uniforms["damp"].value = 0.0; // 默认关闭，只在加速时开启

    // Export pass to global scope for dynamic update
    window.blurPass = afterimagePass; 

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(afterimagePass); 

    // Environment
    createLights();
    createTerrain(); 
    createCity(); 
    createPlayer(); // Will load GLTF asynchronously

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    document.getElementById('btn-campaign').addEventListener('click', startGame);
    
    const nitroBtn = document.getElementById('nitro-btn');
    const setBoost = (active) => { state.boost = active; };
    nitroBtn.addEventListener('mousedown', () => setBoost(true));
    nitroBtn.addEventListener('mouseup', () => setBoost(false));
    nitroBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setBoost(true); });
    nitroBtn.addEventListener('touchend', (e) => { e.preventDefault(); setBoost(false); });

    animate();
}

function createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.0); // 提高环境光
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xff00ff, 1.5);
    sunLight.position.set(0, 20, -100);
    scene.add(sunLight);
    
    // 增加一个照亮车身的顶光 (纯白)，还原车漆颜色
    const spotLight = new THREE.DirectionalLight(0xffffff, 2.0);
    spotLight.position.set(0, 50, 20);
    scene.add(spotLight);
}

function createCity() {
    for (let i = 0; i < 40; i++) {
        createBuilding();
    }
}

function createBuilding() {
    const width = 5 + Math.random() * 10;
    const height = 20 + Math.random() * 60;
    const depth = 5 + Math.random() * 10;
    
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: Math.random() > 0.5 ? 0x00ffff : 0xff00ff, 
        emissiveIntensity: Math.random() * 0.5,
        roughness: 0.1,
        metalness: 0.8
    });
    
    const mesh = new THREE.Mesh(geo, mat);
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (30 + Math.random() * 50); 
    const z = -Math.random() * 200; 
    
    mesh.position.set(x, height/2 - 10, z);
    scene.add(mesh);
    buildings.push(mesh);
}

function createTerrain() {
    const gridGeo = new THREE.PlaneGeometry(400, 400, 80, 80);
    const pos = gridGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i); 
        if (Math.abs(x) > 20) {
            const noise = Math.sin(x * 0.1) * Math.cos(y * 0.05) * 10;
            pos.setZ(i, Math.abs(x * 0.2) + noise); 
        } else {
            pos.setZ(i, 0); 
        }
    }
    gridGeo.computeVertexNormals();

    const gridMat = new THREE.MeshStandardMaterial({
        color: 0x111111, // 深灰色沥青
        roughness: 0.8,
        metalness: 0.2,
        wireframe: false // 关闭网格，显示实体地面
    });

    terrain = new THREE.Mesh(gridGeo, gridMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.z = -100; 
    scene.add(terrain);

    const lineGeo = new THREE.BoxGeometry(0.5, 0.1, 400);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); 
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
    scene.add(playerCar);
    
    // Placeholder while loading
    // ... 可以放个方块 ...
    
    // Load Real Model
    loader.load(
        'assets/car.glb', 
        function (gltf) {
            const model = gltf.scene;
            
            // 调整模型大小和方向（每个模型不一样，通常需要试错）
            model.scale.set(2.5, 2.5, 2.5); 
            model.rotation.y = Math.PI; // 通常模型是朝前的，我们这里可能需要转180度
            model.position.y = 0;
            
            // 材质增强：让车身反光
            model.traverse((o) => {
                if (o.isMesh) {
                    console.log("Model Part Found:", o.name); // 打印所有部件名称
                    
                    o.castShadow = true;
                    o.receiveShadow = true;
                    o.material.envMapIntensity = 1;

                    // 暴力匹配：只要不是车身 (Body/Chassis)，就假设是轮子？
                    // 或者我们把所有名字都变成小写再匹配
                    const name = o.name.toLowerCase();
                    let isWheelByName = name.includes('wheel') || name.includes('tire') || name.includes('rim') || name.includes('cylinder') || name.includes('disk');
                    
                    if (isWheelByName) {
                        o.userData.isWheel = true;
                        console.log(">> Identified as Wheel:", o.name);
                    }
                }
            });
            
            playerCar.add(model);
            
            // 添加尾焰 (引擎发光)
            const engineGeo = new THREE.BoxGeometry(0.5, 0.2, 0.1);
            const engineMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
            const engine = new THREE.Mesh(engineGeo, engineMat);
            engine.position.set(0, 0.8, 2.2); // 调整到兰博基尼排气管位置
            playerCar.add(engine);

            const light = new THREE.PointLight(0xff0055, 2, 8);
            light.position.set(0, 1, 3);
            playerCar.add(light);
            
            console.log("Car Loaded!");
        },
        undefined,
        function (error) {
            console.error(error);
            // Fallback to Box Car if failed
            createBoxCar();
        }
    );

    playerCar.position.y = 0.5;
    playerCar.position.x = -CFG.laneWidth / 2;
    state.lane = -1;
}

function createBoxCar() {
    // Futuristic Chassis (Fallback)
    const chassisGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        0, 1, 2,  -1.5, 0.5, 2,  1.5, 0.5, 2, 
        0, 1, 2,  -1.5, 0.5, 2,  0, 0.2, -3, 
        0, 1, 2,  1.5, 0.5, 2,   0, 0.2, -3, 
        -1.5, 0.5, 2, 1.5, 0.5, 2, 0, 0.2, -3 
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
}

function spawnGate() {
    if (gateCooldown > 0) return;
    currentQuestion = questionBank[Math.floor(Math.random() * questionBank.length)];
    const qPanel = document.getElementById('question-text');
    qPanel.innerHTML = currentQuestion.q;
    qPanel.style.opacity = 0;
    setTimeout(() => { qPanel.style.opacity = 1; }, 100); 
    const zPos = -400; 
    createGateMesh(-CFG.laneWidth/2, zPos, currentQuestion.a, currentQuestion.correct === "A" ? "correct" : "wrong");
    createGateMesh(CFG.laneWidth/2, zPos, currentQuestion.b, currentQuestion.correct === "B" ? "correct" : "wrong");
    gateCooldown = 500; 
}

function createGateMesh(x, z, text, type) {
    const group = new THREE.Group();
    const archGeo = new THREE.TorusGeometry(4, 0.2, 8, 30, Math.PI);
    const archMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.position.y = 0;
    group.add(arch);
    const baseGeo = new THREE.BoxGeometry(1, 4, 1);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const leftBase = new THREE.Mesh(baseGeo, baseMat);
    leftBase.position.set(-4, 2, 0);
    group.add(leftBase);
    const rightBase = new THREE.Mesh(baseGeo, baseMat);
    rightBase.position.set(4, 2, 0);
    group.add(rightBase);
    const holoGeo = new THREE.PlaneGeometry(7, 6);
    const holoMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const holo = new THREE.Mesh(holoGeo, holoMat);
    holo.position.y = 3;
    group.add(holo);
    group.position.set(x, 0, z);
    group.userData = { type: type, text: text, isGate: true };
    scene.add(group);
    obstacles.push(group);
    const label = document.createElement('div');
    label.className = 'world-label';
    label.innerHTML = `<span class="key-hint">${x < 0 ? 'A' : 'B'}</span> ${text}`;
    document.body.appendChild(label);
    group.userData.domElement = label;
}

function startGame() {
    state.screen = 'game';
    state.score = 0;
    state.speed = 0;
    state.distance = 0;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    playerCar.position.x = -CFG.laneWidth/2;
    state.lane = -1;
    obstacles.forEach(o => {
        scene.remove(o);
        if(o.userData.domElement) o.userData.domElement.remove();
    });
    obstacles = [];
    spawnGate();
}

function updatePhysics(dt) {
    if (state.screen !== 'game') {
        state.speed = 0.2;
    } else {
        const targetSpeed = state.boost ? CFG.boostSpeed : CFG.baseSpeed;
        state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, dt * 2);
    }
    
    const moveDist = state.speed * 60 * dt; 
    state.distance += moveDist;

    // 1. Terrain Loop
    terrain.position.z += moveDist;
    if (terrain.position.z > 100) terrain.position.z = -100;
    roadLines.forEach(l => {
        l.position.z += moveDist;
        if (l.position.z > 100) l.position.z = -100;
    });

    // 2. City Loop
    buildings.forEach(b => {
        b.position.z += moveDist;
        if (b.position.z > 50) {
            b.position.z = -250 - Math.random() * 100;
            b.scale.y = 1 + Math.random(); 
        }
    });

    // 3. Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obj = obstacles[i];
        obj.position.z += moveDist;
        if (state.screen === 'game' && Math.abs(obj.position.z - playerCar.position.z) < 2) {
             if (Math.abs(obj.position.x - playerCar.position.x) < 4) {
                 handleCollision(obj);
                 removeObstacle(i);
                 continue;
             }
        }
        if (obj.position.z > 20) {
            removeObstacle(i);
            if (obstacles.length === 0 && gateCooldown <= 0) {
                setTimeout(() => spawnGate(), 500); 
            }
        }
    }
    
    if (gateCooldown > 0) gateCooldown -= dt * 1000;

    // 3. Camera Effects (FOV Boost & Blur Control)
    const targetFov = state.boost ? 110 : CFG.fovBase; 
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 3);
    camera.updateProjectionMatrix();
    camera.position.y = CFG.cameraHeight + Math.sin(clock.elapsedTime * 5) * 0.05 + (state.boost ? (Math.random()*0.1) : 0);

    // Dynamic Motion Blur Intensity
    if (window.blurPass) {
        // 如果在加速 (Boost)，则开启模糊 (damp -> 0.7)
        // 如果正常行驶，则关闭模糊 (damp -> 0.0)
        const targetBlur = state.boost ? 0.7 : 0.0;
        window.blurPass.uniforms["damp"].value = THREE.MathUtils.lerp(window.blurPass.uniforms["damp"].value, targetBlur, dt * 5);
    }

    updateLabels();

    const targetX = state.lane === -1 ? -CFG.laneWidth/2 : CFG.laneWidth/2;
    playerCar.position.x = THREE.MathUtils.lerp(playerCar.position.x, targetX, dt * 10);
    const tilt = (playerCar.position.x - targetX) * -0.05;
    playerCar.rotation.z = tilt;

    // 6. Rotate Wheels (Aggressive Debug)
    if (playerCar) {
        playerCar.traverse((o) => {
            if (o.userData.isWheel) {
                // 绕 X 轴旋转 (标准 GLTF 车辆通常是 X 轴为轮轴)
                // 如果模型坐标系不同，可能是 Z 轴。
                // 试错：如果轮子歪着转，就改这里。
                o.rotation.x += state.speed * 0.5; 
            }
        });
    }
}

function removeObstacle(index) {
    const obj = obstacles[index];
    scene.remove(obj);
    if(obj.userData.domElement) obj.userData.domElement.remove();
    obstacles.splice(index, 1);
    if (obstacles.length === 0 && gateCooldown <= 0) {
        setTimeout(() => spawnGate(), 500);
    }
}

function handleCollision(gate) {
    if (gate.userData.type === "correct") {
        state.score += 100;
        document.getElementById('disp-score').innerText = state.score;
        document.getElementById('question-panel').style.borderColor = "#0f0";
    } else {
        document.getElementById('question-panel').style.borderColor = "#f00";
        state.speed = 0; 
    }
    setTimeout(() => {
        document.getElementById('question-panel').style.borderColor = "rgba(0, 255, 255, 0.3)";
    }, 1000);
}

function updateLabels() {
    obstacles.forEach(obj => {
        if (obj.userData.domElement) {
            const el = obj.userData.domElement;
            const pos = obj.position.clone();
            const dist = Math.abs(pos.z - camera.position.z);
            const yOffset = dist > 100 ? 8 : 5; 
            pos.y += yOffset; 
            pos.project(camera);
            const x = (pos.x * .5 + .5) * window.innerWidth;
            const y = (-(pos.y * .5) + .5) * window.innerHeight;
            if (pos.z < 1) { 
                el.style.transform = `translate(-50%, -50%)`;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
                el.style.display = 'block';
                el.style.opacity = 1; 
            } else {
                el.style.display = 'none';
            }
        }
    });
}

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

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    updatePhysics(dt);
    document.getElementById('disp-speed').innerText = Math.floor(state.speed * 300);
    composer.render();
}

init();