// Geo Racer Game Logic (Three.js) - v0.2 Visual Upgrade

let scene, camera, renderer;
let playerCar;
let roadGrid;
let obstacles = [];
let particles = [];
let score = 0;
let speed = 0;
// 速度调整：降低基础速度，增加反应时间
let maxSpeed = 0.8; 
let boostSpeed = 2.0; 
let currentSpeed = 0;
let lane = 0; // -1: Left, 1: Right
const LANE_WIDTH = 8; // 加宽赛道
let isGameOver = false;
let isGameRunning = false;
let clock = new THREE.Clock();
let frameCount = 0;

// 题库数据
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

// 初始化
function init() {
    // 场景 - 赛博朋克深紫雾
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050011);
    scene.fog = new THREE.FogExp2(0x050011, 0.015);

    // 相机 - 稍微放低一点，增加速度感
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 12);
    camera.lookAt(0, 0, -20);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // 霓虹灯光
    const pointLight = new THREE.PointLight(0x00ffff, 1, 100);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // 创建赛道
    createRoad();

    // 创建更酷的赛车
    createPlayer();

    // 星空背景
    createStars();

    // 事件监听
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('start-btn').addEventListener('click', startGame);

    animate();
}

function createStars() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 1000; i++) {
        vertices.push(
            THREE.MathUtils.randFloatSpread(1000),
            THREE.MathUtils.randFloat(10, 500),
            THREE.MathUtils.randFloatSpread(1000)
        );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 });
    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
}

function createRoad() {
    // 地面网格 - Synthwave 风格 (移动的 Grid)
    const geometry = new THREE.PlaneGeometry(200, 2000, 100, 100);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xff00ff, // 粉色网格
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    roadGrid = new THREE.Mesh(geometry, material);
    roadGrid.rotation.x = -Math.PI / 2;
    roadGrid.position.z = -500;
    scene.add(roadGrid);

    // 赛道边缘发光线
    const lineGeo = new THREE.PlaneGeometry(1, 2000);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    
    const leftLine = new THREE.Mesh(lineGeo, lineMat);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-LANE_WIDTH - 2, 0.1, -500);
    scene.add(leftLine);

    const rightLine = new THREE.Mesh(lineGeo, lineMat);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(LANE_WIDTH + 2, 0.1, -500);
    scene.add(rightLine);
}

function createPlayer() {
    playerCar = new THREE.Group();

    // 车身主体 (流线型)
    const bodyGeo = new THREE.BoxGeometry(2.2, 0.8, 4.5);
    const bodyMat = new THREE.MeshPhongMaterial({ 
        color: 0x001133, 
        specular: 0x00ffff,
        shininess: 100
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    playerCar.add(body);

    // 驾驶舱
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.6, 2);
    const cabinMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // 发光蓝窗
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.4, -0.5);
    playerCar.add(cabin);

    // 轮子 (4个发光轮)
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // 粉色轮子

    const positions = [
        [-1.3, 0.6, 1.5], [1.3, 0.6, 1.5], // 后轮
        [-1.3, 0.6, -1.5], [1.3, 0.6, -1.5] // 前轮
    ];

    positions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        playerCar.add(wheel);
    });

    // 尾部喷射口
    const engineGeo = new THREE.BoxGeometry(1.8, 0.4, 0.2);
    const engineMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.position.set(0, 0.8, 2.3);
    playerCar.add(engine);

    playerCar.position.set(-LANE_WIDTH/2, 0, 0); 
    lane = -1;
    scene.add(playerCar);
}

function spawnGate(zPos) {
    currentQuestion = questionBank[Math.floor(Math.random() * questionBank.length)];
    document.getElementById('question-box').innerHTML = `<span style="color:#aaa;font-size:16px">MISSION OBJECTIVE:</span><br>${currentQuestion.q}`;
    document.getElementById('question-box').style.borderColor = "#0ff";

    // 增加门之间的距离，给足反应时间
    const gateZ = zPos;

    createGateMesh(-LANE_WIDTH/2, gateZ, currentQuestion.a, currentQuestion.correct === "A" ? "correct" : "wrong");
    createGateMesh(LANE_WIDTH/2, gateZ, currentQuestion.b, currentQuestion.correct === "B" ? "correct" : "wrong");
}

function createGateMesh(x, z, text, type) {
    const group = new THREE.Group();
    
    // 门柱
    const pillarGeo = new THREE.BoxGeometry(0.5, 6, 0.5);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-3, 3, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(3, 3, 0);
    group.add(leftPillar);
    group.add(rightPillar);

    // 顶部横梁
    const topGeo = new THREE.BoxGeometry(6.5, 0.5, 0.5);
    const top = new THREE.Mesh(topGeo, pillarMat);
    top.position.set(0, 6, 0);
    group.add(top);

    // 发光能量场 (半透明)
    const energyGeo = new THREE.PlaneGeometry(6, 6);
    // 统一颜色，不剧透
    const energyMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.2, 
        side: THREE.DoubleSide 
    });
    const energy = new THREE.Mesh(energyGeo, energyMat);
    energy.position.set(0, 3, 0);
    group.add(energy);

    group.position.set(x, 0, z);
    group.userData = { type: type, text: text, isGate: true };
    
    scene.add(group);
    obstacles.push(group);

    // 文字标签
    const label = document.createElement('div');
    label.className = 'option-label';
    label.innerHTML = `<span class="opt-key">${x < 0 ? 'A' : 'B'}</span> ${text}`;
    document.body.appendChild(label);
    group.userData.domElement = label;
}

function createParticles(pos, color) {
    // 简单的粒子爆炸
    for(let i=0; i<10; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = {
            vel: new THREE.Vector3(
                (Math.random()-0.5)*20, 
                Math.random()*20, 
                (Math.random()-0.5)*20
            )
        };
        scene.add(mesh);
        particles.push(mesh);
    }
}

function updateLabels() {
    obstacles.forEach(obj => {
        if (obj.userData.domElement) {
            const vector = obj.position.clone();
            vector.y += 4; // 标签在门上方
            vector.project(camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (-(vector.y * .5) + .5) * window.innerHeight;

            if (vector.z < 1) { 
                obj.userData.domElement.style.left = `${x}px`;
                obj.userData.domElement.style.top = `${y}px`;
                
                // 距离越近字体越大
                const scale = Math.max(0.5, 15 / Math.abs(obj.position.z - playerCar.position.z));
                obj.userData.domElement.style.transform = `translate(-50%, -50%) scale(${scale})`;
                obj.userData.domElement.style.display = 'block';
            } else {
                obj.userData.domElement.style.display = 'none';
            }
        }
    });
}

function onKeyDown(event) {
    if (!isGameRunning) return;
    
    // A / Left Arrow
    if (event.key === 'a' || event.key === 'ArrowLeft') {
        if (lane === 1) {
            lane = -1;
            // 平滑移动逻辑简化
            playerCar.position.x = -LANE_WIDTH/2;
            playerCar.rotation.z = 0.3;
            setTimeout(() => playerCar.rotation.z = 0, 300);
        }
    }
    // D / Right Arrow
    if (event.key === 'd' || event.key === 'ArrowRight') {
        if (lane === -1) {
            lane = 1;
            playerCar.position.x = LANE_WIDTH/2;
            playerCar.rotation.z = -0.3;
            setTimeout(() => playerCar.rotation.z = 0, 300);
        }
    }
}

function startGame() {
    isGameRunning = true;
    score = 0;
    currentSpeed = maxSpeed;
    document.getElementById('start-screen').style.display = 'none';
    spawnGate(-250); // 更远的初始距离
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (isGameRunning) {
        frameCount++;
        
        // 移动障碍物 (模拟前进)
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obj = obstacles[i];
            obj.position.z += currentSpeed; 

            // 碰撞检测
            if (obj.position.z > -2 && obj.position.z < 2) {
                if (Math.abs(obj.position.x - playerCar.position.x) < 2) { // 稍微宽容一点的判定
                    handleCollision(obj);
                    scene.remove(obj);
                    if(obj.userData.domElement) obj.userData.domElement.remove();
                    obstacles.splice(i, 1);
                    continue;
                }
            }

            if (obj.position.z > 20) {
                scene.remove(obj);
                if(obj.userData.domElement) obj.userData.domElement.remove();
                obstacles.splice(i, 1);
                
                if (obstacles.length === 0) {
                     spawnGate(-300); // 每一关间隔更远，约 300 单位
                }
            }
        }

        // 粒子动画
        for(let i = particles.length - 1; i>=0; i--) {
            let p = particles[i];
            p.position.add(p.userData.vel.clone().multiplyScalar(0.02));
            p.rotation.x += 0.1;
            p.scale.multiplyScalar(0.95);
            if(p.scale.x < 0.01) {
                scene.remove(p);
                particles.splice(i, 1);
            }
        }

        // 地面无限滚动视觉
        roadGrid.position.z += currentSpeed;
        if(roadGrid.position.z > 0) roadGrid.position.z = -500;

        // 相机轻微晃动
        camera.position.y = 4 + Math.sin(frameCount * 0.1) * 0.05;
        
        document.getElementById('speed-meter').innerText = `SPEED: ${Math.floor(currentSpeed * 300)} KM/H`;
        updateLabels();
    }

    renderer.render(scene, camera);
}

function handleCollision(gate) {
    if (gate.userData.type === "correct") {
        score += 100;
        document.getElementById('score-board').innerText = `SCORE: ${score}`;
        document.getElementById('question-box').innerHTML = "<span style='color:#0f0;font-size:40px'>CORRECT!</span>";
        document.getElementById('question-box').style.borderColor = "#0f0";
        createParticles(playerCar.position, 0x00ff00);
        
        currentSpeed = boostSpeed;
        setTimeout(() => currentSpeed = maxSpeed, 1500);
        
        setTimeout(() => spawnGate(-300), 1000); 
        
    } else {
        document.getElementById('question-box').innerHTML = "<span style='color:#f00;font-size:40px'>WRONG!</span>";
        document.getElementById('question-box').style.borderColor = "#f00";
        createParticles(playerCar.position, 0xff0000);
        
        currentSpeed = 0.2; 
        setTimeout(() => currentSpeed = maxSpeed, 1500);
        
        setTimeout(() => spawnGate(-300), 1000);
    }
}

init();