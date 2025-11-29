import { DiscordSDK } from "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@latest/+esm";
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const APP_ID = "1444052119794487326";
let discord;

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

function updateLoadingBar(progress, text) {
  const loadingBar = document.getElementById('loading-bar');
  const loadingText = document.getElementById('loading-text');
  
  if (loadingBar && loadingText) {
    loadingBar.style.width = `${progress}%`;
    loadingText.textContent = text;
  }
  
  console.log(`Loading: ${progress}% - ${text}`);
}

async function setupDiscord() {
  try {
    updateLoadingBar(10, "Initializing Discord SDK...");
    
    // Check if we're in Discord
    if (window.DiscordNative) {
      discord = new DiscordSDK(APP_ID);
      
      updateLoadingBar(20, "Waiting for Discord ready...");
      await discord.ready();
      console.log("Discord SDK is ready!");
      
      updateLoadingBar(40, "Authenticating with Discord...");
      const { user } = await discord.authenticate();
      authUser = user;
      console.log("Authenticated as:", user.username);
    } else {
      // Not in Discord - use local mode
      console.log("Not in Discord, running in local mode");
      authUser = { 
        id: "local-" + Math.random().toString(36).substr(2, 9),
        username: "LocalPlayer"
      };
    }
    
    updateLoadingBar(60, "Initializing game world...");
    await initGame();
    
    updateLoadingBar(80, "Setting up controls...");
    setupEventListeners();
    
    updateLoadingBar(100, "Ready! Starting game...");
    
    // Hide loading screen
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          const ui = document.getElementById('ui');
          const controls = document.getElementById('controls');
          if (ui) ui.style.display = 'block';
          if (controls) controls.style.display = 'block';
        }, 500);
      }
    }, 1000);
    
  } catch (error) {
    console.error("Setup failed:", error);
    
    // Fallback - start game anyway
    updateLoadingBar(50, "Fallback mode - starting game locally...");
    
    authUser = { 
      id: "fallback-" + Math.random().toString(36).substr(2, 9),
      username: "FallbackPlayer"
    };
    
    await initGame();
    setupEventListeners();
    
    updateLoadingBar(100, "Ready! (Local Fallback Mode)");
    
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          const ui = document.getElementById('ui');
          const controls = document.getElementById('controls');
          if (ui) ui.style.display = 'block';
          if (controls) controls.style.display = 'block';
        }, 500);
      }
    }, 1000);
  }
}

async function initGame() {
  console.log("Initializing game...");
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
  
  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false
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
  
  // Ground
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3a7e3a,
    roughness: 0.8
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
  scene.add(directionalLight);
  
  // Create player
  localCube = createCube("#00ffea");
  localCube.castShadow = true;
  localCube.position.set(0, 1, 0);
  scene.add(localCube);
  
  // Player label
  localLabel = createTextLabel(authUser.username);
  scene.add(localLabel);
  
  // Add environment
  createEnvironment();
  
  console.log("Game initialized successfully");
  
  // Start animation
  animate();
  
  // Handle resize
  window.addEventListener('resize', onWindowResize);
}

function createEnvironment() {
  // Add some trees
  const treePositions = [
    [10, 0, 10], [-10, 0, 15], [15, 0, -8], [-12, 0, -10]
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
}

function createCube(color) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ 
    color: color,
    roughness: 0.7
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
  const colorPicker = document.getElementById('colorPicker');
  if (colorPicker) {
    colorPicker.addEventListener('input', (event) => {
      localCube.material.color.set(event.target.value);
    });
  }

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
  const coordsElement = document.getElementById('coords');
  if (coordsElement) {
    coordsElement.textContent = 
      `x:${localCube.position.x.toFixed(1)} y:${localCube.position.y.toFixed(1)} z:${localCube.position.z.toFixed(1)}`;
  }
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

// Add timeout fallback
setTimeout(() => {
  const loadingText = document.getElementById('loading-text');
  if (loadingText && loadingText.textContent.includes("Initializing Discord SDK")) {
    console.log("Discord SDK timeout - forcing fallback mode");
    setupDiscord().catch(console.error);
  }
}, 5000);

// Start the application
setupDiscord().catch(console.error);
