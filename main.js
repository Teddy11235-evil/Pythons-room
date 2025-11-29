import { DiscordSDK } from "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@latest/+esm";
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const APP_ID = "1444052119794487326";
const discord = new DiscordSDK(APP_ID);

// Game state
let scene, camera, renderer;
let localCube, localLabel;
const players = {};
const velocity = new THREE.Vector3();
let onGround = false;
const keys = { w: false, a: false, s: false, d: false };

let yaw = 0, pitch = 0;
let mouseX = 0, mouseY = 0;
let cameraDistance = 10;
let authUser = { id: "local", username: "Player" };

// Loading progress
let loadingProgress = 0;
const loadingSteps = {
  DISCORD_SDK: 10,
  AUTHENTICATION: 20,
  SCENE_SETUP: 40,
  LIGHTING: 60,
  PLAYER_SETUP: 80,
  COMPLETE: 100
};

function updateLoadingBar(progress, text) {
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  
  loadingBar.style.width = `${progress}%`;
  loadingText.textContent = text;
  
  console.log(`Loading: ${progress}% - ${text}`);
}

async function setupDiscord() {
  try {
    updateLoadingBar(loadingSteps.DISCORD_SDK, "Connecting to Discord...");
    
    await discord.ready();
    console.log("Discord SDK is ready!");
    
    updateLoadingBar(loadingSteps.AUTHENTICATION, "Authenticating user...");
    
    const { user } = await discord.authenticate();
    authUser = user;
    console.log("Authenticated as:", user.username);
    
    updateLoadingBar(loadingSteps.SCENE_SETUP, "Initializing game world...");
    
    await initGame();
    setupEventListeners();
    
    updateLoadingBar(loadingSteps.COMPLETE, "Ready! Loading complete.");
    
    // Hide loading screen with fade out
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading');
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
        document.getElementById('ui').style.display = 'block';
        document.getElementById('controls').style.display = 'block';
      }, 500);
    }, 500);
    
  } catch (error) {
    console.error("Discord setup failed:", error);
    // Fallback for testing
    authUser = { id: "local-test", username: "TestPlayer" };
    updateLoadingBar(50, "Running in local test mode...");
    
    await initGame();
    setupEventListeners();
    
    updateLoadingBar(100, "Ready! (Local Mode)");
    
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading');
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
        document.getElementById('ui').style.display = 'block';
        document.getElementById('controls').style.display = 'block';
      }, 500);
    }, 1000);
  }
}

async function initGame() {
  console.log("Initializing game...");
  
  updateLoadingBar(loadingSteps.SCENE_SETUP, "Creating scene...");
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue
  scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
  
  updateLoadingBar(loadingSteps.SCENE_SETUP + 5, "Setting up camera...");
  
  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  updateLoadingBar(loadingSteps.SCENE_SETUP + 10, "Initializing renderer...");
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Clear any existing canvas
  const existingCanvas = document.querySelector('canvas');
  if (existingCanvas) {
    document.body.removeChild(existingCanvas);
  }
  document.body.appendChild(renderer.domElement);
  
  // Make canvas focusable
  renderer.domElement.tabIndex = 1;
  renderer.domElement.style.outline = 'none';
  
  updateLoadingBar(loadingSteps.LIGHTING, "Setting up lighting...");
  
  // Ground
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3a7e3a,
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Grid helper
  const gridHelper = new THREE.GridHelper(200, 50, 0x000000, 0x000000);
  gridHelper.material.opacity = 0.1;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(50, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.left = -100;
  directionalLight.shadow.camera.right = 100;
  directionalLight.shadow.camera.top = 100;
  directionalLight.shadow.camera.bottom = -100;
  scene.add(directionalLight);
  
  updateLoadingBar(loadingSteps.PLAYER_SETUP, "Creating player...");
  
  // Create player
  localCube = createCube("#00ffea");
  localCube.castShadow = true;
  localCube.position.set(0, 1, 0);
  scene.add(localCube);
  
  // Player label
  localLabel = createTextLabel(authUser.username);
  scene.add(localLabel);
  
  updateLoadingBar(loadingSteps.PLAYER_SETUP + 5, "Adding environment...");
  
  // Add some environment objects
  createEnvironment();
  
  console.log("Game initialized successfully");
  
  // Start animation loop
  animate();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function createEnvironment() {
  // Add some trees/obstacles
  const treePositions = [
    [10, 0, 10], [-10, 0, 15], [15, 0, -8], [-12, 0, -10],
    [20, 0, 5], [-5, 0, 20], [8, 0, -15], [-18, 0, 8]
  ];
  
  treePositions.forEach(([x, y, z]) => {
    const treeTrunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    treeTrunk.position.set(x, 1, z);
    treeTrunk.castShadow = true;
    scene.add(treeTrunk);
    
    const treeTop = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x228B22 })
    );
    treeTop.position.set(x, 3, z);
    treeTop.castShadow = true;
    scene.add(treeTop);
  });
  
  // Add a central platform
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  platform.position.set(0, 0.25, 0);
  platform.receiveShadow = true;
  scene.add(platform);
}

function createCube(color) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ 
    color: color,
    roughness: 0.7,
    metalness: 0.3
  });
  const cube = new THREE.Mesh(geometry, material);
  
  // Add wireframe
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(
    edges, 
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  cube.add(line);
  
  return cube;
}

function createTextLabel(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  
  // Background
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Text
  context.font = 'bold 20px Arial';
  context.fillStyle = '#00ffea';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  // Border
  context.strokeStyle = '#00ffea';
  context.lineWidth = 2;
  context.strokeRect(0, 0, canvas.width, canvas.height);
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ 
    map: texture,
    transparent: true 
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  
  return sprite;
}

function setupEventListeners() {
  // Keyboard
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
      keys[key] = true;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      jump();
    }
  });

  document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (keys.hasOwnProperty(key)) {
      keys[key] = false;
    }
  });

  // Mouse look
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
      mouseX = event.movementX;
      mouseY = event.movementY;
    }
  });

  // Pointer lock
  renderer.domElement.addEventListener('click', () => {
    if (!document.pointerLockElement) {
      renderer.domElement.requestPointerLock();
    }
  });

  // Color picker
  document.getElementById('colorPicker').addEventListener('input', (event) => {
    localCube.material.color.set(event.target.value);
    sendPlayerState();
  });

  // Mouse wheel for zoom
  document.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance += event.deltaY * 0.01;
    cameraDistance = Math.max(3, Math.min(30, cameraDistance));
  }, { passive: false });
}

function jump() {
  if (onGround) {
    velocity.y = 0.15;
    onGround = false;
  }
}

function updateMovement() {
  const speed = 0.1;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  if (keys.w) localCube.position.addScaledVector(forward, speed);
  if (keys.s) localCube.position.addScaledVector(forward, -speed);
  if (keys.a) localCube.position.addScaledVector(right, -speed);
  if (keys.d) localCube.position.addScaledVector(right, speed);

  // Gravity
  velocity.y -= 0.015;
  localCube.position.y += velocity.y;

  // Ground collision
  if (localCube.position.y <= 0.5) {
    localCube.position.y = 0.5;
    velocity.y = 0;
    onGround = true;
  }

  // Update label
  localLabel.position.copy(localCube.position).add(new THREE.Vector3(0, 2.2, 0));
  localLabel.lookAt(camera.position);

  // Update UI coordinates
  document.getElementById('coords').textContent = 
    `x:${localCube.position.x.toFixed(1)} y:${localCube.position.y.toFixed(1)} z:${localCube.position.z.toFixed(1)}`;
}

function updateCamera() {
  yaw -= mouseX * 0.002;
  pitch -= mouseY * 0.002;
  pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

  const offset = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * cameraDistance,
    Math.sin(pitch) * cameraDistance + 2,
    Math.cos(yaw) * Math.cos(pitch) * cameraDistance
  );

  camera.position.copy(localCube.position).add(offset);
  camera.lookAt(localCube.position);

  mouseX = 0;
  mouseY = 0;
}

function sendPlayerState() {
  // Multiplayer sync would go here
  console.log("Player state updated");
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  
  updateMovement();
  updateCamera();
  
  renderer.render(scene, camera);
}

// Start the application
setupDiscord();
