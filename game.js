// Geo Racer Game Logic (Three.js)

let scene, camera, renderer;
let playerCar;
let roadSegments = [];
let obstacles = [];
let score = 0;
let speed = 0;
let maxSpeed = 2.0; // 基础最大速度
let boostSpeed = 4.0; // 加速状态
let currentSpeed = 0;
let lane = 0; // -1: Left, 0: Center, 1: Right (简化为左右两道: -1, 1)
const LANE_WIDTH = 6;
let isGameOver = false;
let isGameRunning = false;
let clock = new THREE.Clock();

// 题库数据 (地理七年级上册 demo)
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
let nextGateZ = -100; // 下一个门的位置

// 初始化
function init() {
    // 场景
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x001133, 0.02);

    // 相机
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -20);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xff00ff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 创建赛道 (网格风格)
    createRoad();

    // 创建玩家赛车
    createPlayer();

    // 事件监听
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('start-btn').addEventListener('click', startGame);

    animate();
}

function createRoad() {
    const geometry = new THREE.PlaneGeometry(40, 2000, 40, 200);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0x000000, 
        emissive: 0x001133,
        wireframe: true 
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -1000;
    scene.add(floor);
}

function createPlayer() {
    // 简单的赛车模型 (Tron 风格)
    const geometry = new THREE.BoxGeometry(2, 1, 4);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        emissive: 0x0088aa,
        emissiveIntensity: 0.5
    });
    playerCar = new THREE.Mesh(geometry, material);
    playerCar.position.set(-LANE_WIDTH/2, 1, 0); // 初始左车道
    lane = -1;
    scene.add(playerCar);
    
    // 尾气粒子 (简化为一个发光尾灯)
    const tailLightGeo = new THREE.BoxGeometry(1.8, 0.2, 0.1);
    const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const tailLight = new THREE.Mesh(tailLightGeo, tailLightMat);
    tailLight.position.set(0, 0, 2);
    playerCar.add(tailLight);
}

function spawnGate(zPos) {
    // 随机出一道题
    currentQuestion = questionBank[Math.floor(Math.random() * questionBank.length)];
    
    // 更新 UI
    document.getElementById('question-box').innerText = currentQuestion.q;

    // 创建左右两个门
    // 左门 (Lane -1)
    createGateMesh(-LANE_WIDTH/2, zPos, currentQuestion.a, currentQuestion.correct === "A" ? "correct" : "wrong");
    
    // 右门 (Lane 1)
    createGateMesh(LANE_WIDTH/2, zPos, currentQuestion.b, currentQuestion.correct === "B" ? "correct" : "wrong");
}

function createGateMesh(x, z, text, type) {
    // 门的边框
    const geometry = new THREE.TorusGeometry(3, 0.2, 8, 20);
    const color = type === "correct" ? 0x00ff00 : 0xff0000; // Debug用颜色，实际应该隐藏答案
    // 游戏中我们不能通过颜色判断，要统一颜色，或者让玩家根据文字判断
    const displayColor = 0xffff00; // 统一黄色

    const material = new THREE.MeshBasicMaterial({ color: displayColor });
    const gate = new THREE.Mesh(geometry, material);
    gate.position.set(x, 3, z);
    
    // 保存门的属性用于碰撞检测
    gate.userData = { type: type, text: text, isGate: true };
    scene.add(gate);
    obstacles.push(gate);

    // 文字标签 (HTML Overlay 简单处理，这里用 Canvas Texture 做贴图太麻烦)
    // 我们用 DOM 元素跟随的方式来实现文字显示
    const label = document.createElement('div');
    label.className = 'option-label';
    label.innerText = text;
    document.body.appendChild(label);
    gate.userData.domElement = label;
}

function updateLabels() {
    obstacles.forEach(obj => {
        if (obj.userData.domElement) {
            const vector = obj.position.clone();
            vector.project(camera);

            const x = (vector.x * .5 + .5) * window.innerWidth;
            const y = (-(vector.y * .5) + .5) * window.innerHeight;

            if (vector.z < 1) { // 只有在相机前面的才显示
                obj.userData.domElement.style.left = `${x}px`;
                obj.userData.domElement.style.top = `${y}px`;
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
            playerCar.position.x = -LANE_WIDTH/2;
            // 简单瞬移，增加倾斜动画会更好
            playerCar.rotation.z = 0.2;
            setTimeout(() => playerCar.rotation.z = 0, 200);
        }
    }
    // D / Right Arrow
    if (event.key === 'd' || event.key === 'ArrowRight') {
        if (lane === -1) {
            lane = 1;
            playerCar.position.x = LANE_WIDTH/2;
            playerCar.rotation.z = -0.2;
            setTimeout(() => playerCar.rotation.z = 0, 200);
        }
    }
}

function startGame() {
    isGameRunning = true;
    score = 0;
    currentSpeed = maxSpeed;
    document.getElementById('start-screen').style.display = 'none';
    spawnGate(-100); // 生成第一道门
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (isGameRunning) {
        // 赛车前进 (其实是世界后退)
        const delta = clock.getDelta();
        
        // 移动障碍物
        for (let i = obstacles.length - 1; i >= 0; i--) {
            let obj = obstacles[i];
            obj.position.z += currentSpeed * 10 * 0.5; // 速度系数

            // 旋转门增加动感
            obj.rotation.z += 0.02;

            // 碰撞检测
            if (obj.position.z > -2 && obj.position.z < 2) {
                // Z轴重叠，检查X轴
                if (Math.abs(obj.position.x - playerCar.position.x) < 1) {
                    handleCollision(obj);
                    // 移除
                    scene.remove(obj);
                    if(obj.userData.domElement) obj.userData.domElement.remove();
                    obstacles.splice(i, 1);
                    continue; // 避免下面的移除逻辑重复
                }
            }

            // 移出屏幕
            if (obj.position.z > 10) {
                scene.remove(obj);
                if(obj.userData.domElement) obj.userData.domElement.remove();
                obstacles.splice(i, 1);
                
                // 如果错过了门，也要生成新的
                if (obstacles.length === 0) {
                     spawnGate(-200);
                }
            }
        }
        
        // 速度计 UI
        document.getElementById('speed-meter').innerText = `SPEED: ${Math.floor(currentSpeed * 100)} km/h`;
        
        updateLabels();
    }

    renderer.render(scene, camera);
}

function handleCollision(gate) {
    if (gate.userData.type === "correct") {
        // 答对
        score += 100;
        document.getElementById('score-board').innerText = `SCORE: ${score}`;
        document.getElementById('question-box').innerText = "CORRECT! 🚀";
        document.getElementById('question-box').style.borderColor = "#0f0";
        
        // 加速效果
        currentSpeed = boostSpeed;
        setTimeout(() => currentSpeed = maxSpeed, 1000);
        
        // 生成下一关
        spawnGate(-200);
        
    } else {
        // 答错
        document.getElementById('question-box').innerText = "WRONG! 💥";
        document.getElementById('question-box').style.borderColor = "#f00";
        currentSpeed = 0.5; // 减速惩罚
        setTimeout(() => currentSpeed = maxSpeed, 1000);
        
        spawnGate(-200);
    }
}

init();