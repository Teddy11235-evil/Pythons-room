import { DiscordSDK } from "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@latest/+esm";
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// Discord setup
const APP_ID = "1444052119794487326"; // Your actual App ID
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

// Initialize Discord
async function setupDiscord() {
  try {
    await discord.ready();
    console.log("Discord SDK is ready!");
    
    // Get authenticated user
    const { user } = await discord.authenticate();
    authUser = user;
    console.log("Authenticated as:", user.username);
    
    // Start the game
    initGame();
    setupEventListeners();
    
  } catch (error) {
    console.error("Discord setup failed:", error);
    // Fallback for local testing
    authUser = { id: "local-test", username: "TestPlayer" };
    initGame();
    setupEventListeners();
  }
}

function initGame() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // Ground
  const planeGeometry = new THREE.PlaneGeometry(500, 500);
  const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 50, 25);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Create local player
  localCube = createCube("#00ffea");
  localCube.castShadow = true;
  scene.add(localCube);

  localLabel = createTextLabel(authUser.username);
  scene.add(localLabel);

  // Start animation loop
  animate();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function createCube(color) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: color });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.y = 0.5;

  // Outline
  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
  cube.add(line);

  return cube;
}

function createTextLabel(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.font = '24px Arial';
  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.fillText(text, canvas.width / 2, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  
  return sprite;
}

function setupEventListeners() {
  // Keyboard input
  document.addEventListener('keydown', (event) => {
    if (event.key in keys) keys[event.key] = true;
    if (event.code === 'Space') jump();
  });

  document.addEventListener('keyup', (event) => {
    if (event.key in keys) keys[event.key] = false;
  });

  // Mouse look
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === document.body) {
      mouseX = event.movementX;
      mouseY = event.movementY;
    }
  });

  // Pointer lock
  document.body.addEventListener('click', () => {
    if (!document.pointerLockElement) {
      document.body.requestPointerLock();
    }
  });

  // Color picker
  document.getElementById('colorPicker').addEventListener('input', (event) => {
    localCube.material.color.set(event.target.value);
    sendPlayerState();
  });

  // Zoom
  document.addEventListener('wheel', (event) => {
    cameraDistance += event.deltaY * 0.01;
    cameraDistance = THREE.MathUtils.clamp(cameraDistance, 3, 30);
  });
}

function jump() {
  if (onGround) {
    velocity.y = 0.15;
    onGround = false;
  }
}

function updateMovement() {
  const speed = 0.08;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  if (keys.w) localCube.position.addScaledVector(forward, speed);
  if (keys.s) localCube.position.addScaledVector(forward, -speed);
  if (keys.a) localCube.position.addScaledVector(right, -speed);
  if (keys.d) localCube.position.addScaledVector(right, speed);

  // Gravity
  velocity.y -= 0.01;
  localCube.position.y += velocity.y;

  // Ground collision
  if (localCube.position.y <= 0.5) {
    localCube.position.y = 0.5;
    velocity.y = 0;
    onGround = true;
  }

  // Update label position
  localLabel.position.copy(localCube.position).add(new THREE.Vector3(0, 1.5, 0));

  // Update coordinates display
  document.getElementById('coords').textContent = 
    `x:${localCube.position.x.toFixed(1)} y:${localCube.position.y.toFixed(1)} z:${localCube.position.z.toFixed(1)}`;
}

function updateCamera() {
  yaw -= mouseX * 0.002;
  pitch -= mouseY * 0.002;
  pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 3, Math.PI / 3);

  const offset = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * cameraDistance,
    Math.sin(pitch) * cameraDistance + 2,
    Math.cos(yaw) * Math.cos(pitch) * cameraDistance
  );

  camera.position.copy(localCube.position).add(offset);
  camera.lookAt(localCube.position);

  // Reset mouse movement
  mouseX = 0;
  mouseY = 0;
}

function sendPlayerState() {
  if (!discord.commands) return;
  
  try {
    discord.commands.sendActivityData({
      content: {
        id: authUser.id,
        username: authUser.username,
        color: localCube.material.color.getHex(),
        position: {
          x: localCube.position.x,
          y: localCube.position.y,
          z: localCube.position.z
        }
      }
    });
  } catch (error) {
    console.log('Could not send activity data (might be in local testing)');
  }
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
  sendPlayerState();
  
  renderer.render(scene, camera);
}

// Start the application
setupDiscord();
