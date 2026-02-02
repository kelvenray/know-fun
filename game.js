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
let questionBank = [];
let currentQuestion = null;
let gateCooldown = 0; 

// --- Async Loader ---
async function loadQuestions() {
    try {
        const response = await fetch('questions.json');
        questionBank = await response.json();
        console.log("Questions Loaded:", questionBank.length);
    } catch (error) {
        console.error("Failed to load questions:", error);
        // Fallback data
        questionBank = [
            { q: "地球的形状是？", a: "球体", b: "天圆地方", correct: "A" }
        ];
    }
}

// --- Init ---
async function init() {
    await loadQuestions();

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

            // --- 智能轮子识别系统 v2.0 (基于位置与尺寸) ---
            // 既然名字不可靠 (polySurfaceXX)，我们就用几何特征来抓人。
            
            const wheelsToFix = [];
            
            // 1. 先计算整车的包围盒，确定车辆尺寸范围
            const carBox = new THREE.Box3().setFromObject(model);
            const carSize = new THREE.Vector3();
            carBox.getSize(carSize);
            const carCenter = new THREE.Vector3();
            carBox.getCenter(carCenter);
            
            console.log("Car Dimensions:", carSize, "Center:", carCenter);
            
            // 轮子判定阈值：
            // 1. 高度: 必须在车身下半部分 (Y < carBox.min.y + height * 0.4)
            // 2. 偏离中心: X 轴必须有一定偏移 (abs(x - cx) > width * 0.3)
            // 3. 尺寸: 轮子不能太大 (是 Mesh 而不是整个车身 part)，直径通常 < 1.0m
            
            const wheelMaxHeight = carBox.min.y + carSize.y * 0.45; // 稍微放宽一点
            const wheelMinOffsetX = carSize.x * 0.25; 

            model.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                    o.material.envMapIntensity = 1;

                    // 计算 Mesh 的包围盒 (Local -> World 估算)
                    // 由于还没加入 Scene，我们需要小心处理坐标
                    // 简单起见，我们假设 Mesh 的 position 代表了它的位置（对于此模型似乎成立）
                    // 为了更准确，我们用 Geometry 的 BoundingBox + Mesh.position
                    
                    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                    const meshBox = o.geometry.boundingBox.clone();
                    // 将 Box 变换到 Mesh 的位置 (不考虑旋转，只做粗略位置判断)
                    meshBox.translate(o.position);
                    const meshCenter = new THREE.Vector3();
                    meshBox.getCenter(meshCenter);
                    const meshSize = new THREE.Vector3();
                    meshBox.getSize(meshSize);

                    // 特征检测
                    const isLow = meshCenter.y < wheelMaxHeight;
                    const isSide = Math.abs(meshCenter.x) > 0.5; // 只要不是在正中间
                    const isSmall = meshSize.y < 1.0 && meshSize.z < 1.0 && meshSize.x < 1.0; // 轮子大约 0.6-0.8m
                    
                    // 名字辅助检测 (如果名字里明确写了 wheel，那肯定是，不管位置在哪)
                    const name = o.name.toLowerCase();
                    const isWheelByName = name.includes('wheel') || name.includes('tire') || name.includes('tyre') || name.includes('rim');

                    // 综合判定
                    // 如果名字像轮子，或者 (位置低 + 在两侧 + 尺寸小)
                    if (isWheelByName || (isLow && isSide && isSmall)) {
                        
                        // 排除刹车盘/卡钳 (Brake/Caliper)
                        // 通常刹车盘不应该转，或者跟着轮子转。为了简单，我们让它们一起转。
                        // 但要排除太小的碎片
                        if (meshSize.y > 0.2) { 
                            wheelsToFix.push(o);
                            console.log(`>> Wheel Detected by ${isWheelByName ? "NAME" : "POS"}: ${o.name} (H:${meshCenter.y.toFixed(2)}, S:${meshSize.y.toFixed(2)})`);
                        }
                    }
                }
            });

            // 统一修复轮子 (Fix Logic)
            wheelsToFix.forEach(o => {
                // 防止重复处理
                if (o.userData.processed) return;
                o.userData.processed = true;

                o.userData.isWheel = true;
                
                // --- Clone Geometry ---
                o.geometry = o.geometry.clone();

                // --- Pivot Group Wrapper ---
                // 1. 计算几何中心 (Geometric Center)
                o.geometry.computeBoundingBox();
                const center = new THREE.Vector3();
                o.geometry.boundingBox.getCenter(center); 

                const parent = o.parent;
                if (parent) {
                    // 2. 创建 Pivot Group
                    const pivot = new THREE.Group();
                    
                    // 计算 Pivot 应该在的世界位置 (相对于父级)
                    const offset = center.clone();
                    offset.applyQuaternion(o.quaternion);
                    offset.multiply(o.scale);
                    
                    pivot.position.copy(o.position).add(offset);
                    pivot.rotation.copy(o.rotation);
                    pivot.scale.copy(o.scale);
                    
                    // 3. 将 Pivot 插入到层级中
                    parent.add(pivot);
                    
                    // 关键步骤：把 Mesh 从原来的 parent 移除，加到 pivot 中
                    // 注意：add() 会自动从原 parent 移除，不需要手动 remove
                    pivot.add(o); 
                    
                    // 4. 归零 Mesh 的位置和旋转
                    o.geometry.translate(-center.x, -center.y, -center.z);
                    o.position.set(0, 0, 0);
                    o.rotation.set(0, 0, 0);
                    o.scale.set(1, 1, 1); 
                    
                    // 标记 Pivot 为旋转目标
                    pivot.userData.isWheelRotator = true;
                    pivot.name = "Pivot_" + o.name;
                    
                    // 强制标记左右轮，用于反向旋转 (以防 UV 也是反的)
                    // 如果 x > 0 则是左轮(或右轮，取决于模型坐标系)，反之亦然
                    // 我们可以根据 pivot 的初始 x 坐标来判断
                    pivot.userData.side = pivot.position.x > 0 ? 1 : -1;

                    console.log(`>> Wheel Fixed & Cloned: ${o.name} (Parent: ${parent.name})`);
                }
            });
            
            playerCar.add(model);
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
    label.innerHTML = `<span class="key-hint">${x < 0 ? 'A' : 'B'}</span> <div class="answer-text">${text}</div>`;
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

    // 6. Rotate Wheels
    if (playerCar) {
        playerCar.traverse((o) => {
            if (o.userData.isWheelRotator) { // 只旋转被标记为 Rotator 的对象 (可能是 Mesh 也可能是 Pivot)
                // 调整旋转速度，确保肉眼可见且不产生频闪
                // speed ~1.0 -> 0.1 rad/frame ~ 6 rad/sec ~ 1 rev/sec. 比较合理.
                o.rotation.x -= state.speed * 0.15; 
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