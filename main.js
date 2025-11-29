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

async function setupDiscord() {
  try {
    await discord.ready();
    console.log("Discord SDK is ready!");
    
    const { user } = await discord.authenticate();
    authUser = user;
    console.log("Authenticated as:", user.username);
    
    // Hide loading, show UI
    document.getElementById('loading').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    initGame();
    setupEventListeners();
    
  } catch (error) {
    console.error("Discord setup failed:", error);
    // Fallback for testing
    authUser = { id: "local-test", username: "TestPlayer" };
    document.getElementById('loading').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    initGame();
    setupEventListeners();
  }
}

function initGame() {
  console.log("Initializing game...");
  
  // Scene with brighter background for testing
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue instead of dark gray
  
  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);
  
  // Renderer with better configuration
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Prevent performance issues
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Clear any existing canvas and add new one
  const existingCanvas = document.querySelector('canvas');
  if (existingCanvas) {
    document.body.removeChild(existingCanvas);
  }
  document.body.appendChild(renderer.domElement);
  
  // Make canvas focusable for pointer lock
  renderer.domElement.tabIndex = 1;
  renderer.domElement.style.outline = 'none';
  
  // Create a more visible ground
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3a7e3a, // Green ground
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Add a grid helper to see the ground better
  const gridHelper = new THREE.GridHelper(100, 20, 0x000000, 0x000000);
  gridHelper.material.opacity = 0.2;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);
  
  // Better lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);
  
  // Create player cube with brighter color
  localCube = createCube("#00ffea");
  localCube.castShadow = true;
  localCube.position.set(0, 1, 0);
  scene.add(localCube);
  
  // Create player label
  localLabel = createTextLabel(authUser.username);
  scene.add(localLabel);
  
  // Add some test objects to verify rendering
  const testCube = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  testCube.position.set(5, 1, 0);
  testCube.castShadow = true;
  scene.add(testCube);
  
  const testCube2 = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x0000ff })
  );
  testCube2.position.set(-5, 1, 0);
  testCube2.castShadow = true;
  scene.add(testCube2);
  
  console.log("Game initialized successfully");
  
  // Start animation
  animate();
  
  // Handle resize
  window.addEventListener('resize', onWindowResize);
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
    new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
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
  context.font = 'bold 24px Arial';
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

  // Mouse look with pointer lock
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
      mouseX = event.movementX;
      mouseY = event.movementY;
    }
  });

  // Pointer lock on canvas click
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
  localLabel.position.copy(localCube.position).add(new THREE.Vector3(0, 2, 0));
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
