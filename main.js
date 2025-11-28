// -------------------------
// DISCORD INITIALIZATION
// -------------------------
let discord, authUser;

async function initDiscord() {
  discord = new DiscordSDK(APP_ID);
  await discord.ready();
  const { user } = await discord.authenticate();
  authUser = user;

  console.log("Logged in:", user);
}

initDiscord();

// -------------------------
// THREE.JS SCENE
// -------------------------
let scene, camera, renderer, controls;
let localCube, localLabel;

const players = {};  // id → { cube, label, color }
const velocity = new THREE.Vector3();
let onGround = false;

const keys = { w:false, a:false, s:false, d:false };

function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2.2;

  // Infinite plane
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // Local player cube
  localCube = createCube("#00ffea");
  scene.add(localCube);

  // Name label
  localLabel = createTextLabel(authUser?.username || "Player");
  scene.add(localLabel);

  animate();
}

// -------------------------
// CUBE + LABEL CREATION
// -------------------------
function createCube(color) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color });
  const cube = new THREE.Mesh(geo, mat);

  // Outline
  const outline = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true })
  );
  outline.scale.set(1.05, 1.05, 1.05);
  cube.add(outline);

  return cube;
}

function createTextLabel(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "32px sans-serif";
  canvas.width = ctx.measureText(text).width + 20;
  canvas.height = 50;

  ctx.font = "32px sans-serif";
  ctx.fillStyle = "white";
  ctx.fillText(text, 10, 35);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width / 60, canvas.height / 60, 1);
  return sprite;
}

// -------------------------
// MOVEMENT
// -------------------------
document.addEventListener("keydown", e => { if(e.key in keys) keys[e.key] = true; if(e.code==="Space") jump(); });
document.addEventListener("keyup", e => { if(e.key in keys) keys[e.key] = false; });

function jump() {
  if (onGround) {
    velocity.y = 0.15;
    onGround = false;
  }
}

function updateMovement() {
  const speed = 0.08;

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  dir.y = 0;
  dir.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();

  if (keys.w) localCube.position.addScaledVector(dir, speed);
  if (keys.s) localCube.position.addScaledVector(dir, -speed);
  if (keys.a) localCube.position.addScaledVector(right, -speed);
  if (keys.d) localCube.position.addScaledVector(right, speed);

  // gravity
  velocity.y -= 0.01;
  localCube.position.y += velocity.y;

  if (localCube.position.y <= 0.5) {
    localCube.position.y = 0.5;
    velocity.y = 0;
    onGround = true;
  }

  localLabel.position.copy(localCube.position).add(new THREE.Vector3(0,1.2,0));

  document.getElementById("coords").innerText =
    `x:${localCube.position.x.toFixed(1)}  y:${localCube.position.y.toFixed(1)}  z:${localCube.position.z.toFixed(1)}`;
}

// -------------------------
// COLOR PICKER
// -------------------------
document.getElementById("colorPicker").addEventListener("input", e => {
  const color = e.target.value;
  localCube.material.color.set(color);

  sendState();
});

// -------------------------
// MULTIPLAYER SYNC
// -------------------------
function sendState() {
  if (!discord) return;

  discord.commands.sendActivityData({
    content: {
      id: authUser.id,
      name: authUser.username,
      color: localCube.material.color.getHex(),
      pos: localCube.position
    }
  });
}

discord?.subscribe?.("MESSAGE_CREATE", ev => {
  const d = ev?.content;
  if (!d || d.id === authUser.id) return;

  if (!players[d.id]) {
    const cube = createCube(d.color);
    const label = createTextLabel(d.name);
    scene.add(cube);
    scene.add(label);

    players[d.id] = { cube, label };
  }

  players[d.id].cube.position.set(d.pos.x, d.pos.y, d.pos.z);
  players[d.id].label.position.set(d.pos.x, d.pos.y + 1.2, d.pos.z);
});

// -------------------------
// RENDER LOOP
// -------------------------
function animate() {
  requestAnimationFrame(animate);
  updateMovement();
  sendState();
  renderer.render(scene, camera);
}

window.onload = init3D;
