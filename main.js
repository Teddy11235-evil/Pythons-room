import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

let discord;
export function startGame(d) {
  discord = d;
  initGame();
}

let scene, camera, renderer;
let localCube, localLabel;
const players = {};
const velocity = new THREE.Vector3();
let onGround = false;
const keys = { w:false, a:false, s:false, d:false };

let yaw = 0, pitch = 0;
let mouseX = 0, mouseY = 0;
let cameraDistance = 10;

let authUser = { id: "local", username: "Player" }; // placeholder until Discord ready

// -------------------------
// Discord user setup
// -------------------------
async function initDiscordUser() {
  const { user } = await discord.authenticate();
  authUser = user;
  console.log("Logged in:", user.username);
}

initDiscordUser().catch(console.error);

// -------------------------
// Initialize scene
// -------------------------
function initGame() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
  camera.position.set(0,5,10);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  // Plane
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(5000,5000),
    new THREE.MeshStandardMaterial({ color:0x333333 })
  );
  plane.rotation.x = -Math.PI/2;
  scene.add(plane);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff,1);
  dir.position.set(5,10,7);
  scene.add(dir);

  // Player
  localCube = createCube("#00ffea");
  scene.add(localCube);
  localLabel = createTextLabel(authUser.username);
  scene.add(localLabel);

  animate();
}

// -------------------------
// Cube + Label
// -------------------------
function createCube(color){
  const geo = new THREE.BoxGeometry(1,1,1);
  const mat = new THREE.MeshLambertMaterial({ color });
  const cube = new THREE.Mesh(geo, mat);

  const outline = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color:0x000000, wireframe:true })
  );
  outline.scale.set(1.05,1.05,1.05);
  cube.add(outline);
  return cube;
}

function createTextLabel(text){
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "32px sans-serif";
  canvas.width = ctx.measureText(text).width + 20;
  canvas.height = 50;
  ctx.font = "32px sans-serif";
  ctx.fillStyle = "white";
  ctx.fillText(text, 10,35);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map:tex });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(canvas.width/60, canvas.height/60,1);
  return sprite;
}

// -------------------------
// Input
// -------------------------
document.addEventListener("keydown", e => { if(e.key in keys) keys[e.key]=true; if(e.code==="Space") jump(); });
document.addEventListener("keyup", e => { if(e.key in keys) keys[e.key]=false; });

function jump(){ if(onGround){ velocity.y=0.15; onGround=false; } }

document.addEventListener("mousemove", e => {
  mouseX = e.movementX;
  mouseY = e.movementY;
});

document.getElementById("colorPicker").addEventListener("input", e=>{
  localCube.material.color.set(e.target.value);
  sendState();
});

document.addEventListener("wheel", e=>{
  cameraDistance += e.deltaY*0.01;
  cameraDistance = Math.max(3, Math.min(30, cameraDistance));
});

// -------------------------
// Movement + collisions
// -------------------------
function updateMovement(){
  const speed = 0.08;

  const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right = new THREE.Vector3(-forward.z,0,forward.x);

  if(keys.w) localCube.position.addScaledVector(forward,speed);
  if(keys.s) localCube.position.addScaledVector(forward,-speed);
  if(keys.a) localCube.position.addScaledVector(right,-speed);
  if(keys.d) localCube.position.addScaledVector(right,speed);

  // gravity
  velocity.y -= 0.01;
  localCube.position.y += velocity.y;

  // ground collision
  if(localCube.position.y <=0.5){
    localCube.position.y=0.5;
    velocity.y=0;
    onGround=true;
  }

  // player collisions
  for(let id in players){
    const p = players[id].cube;
    if(localCube.position.distanceTo(p.position)<1){
      const pushDir = localCube.position.clone().sub(p.position).normalize();
      localCube.position.add(pushDir.multiplyScalar(0.05));
    }
  }

  localLabel.position.copy(localCube.position).add(new THREE.Vector3(0,1.2,0));
  document.getElementById("coords").innerText =
    `x:${localCube.position.x.toFixed(1)} y:${localCube.position.y.toFixed(1)} z:${localCube.position.z.toFixed(1)}`;
}

// -------------------------
// Camera update
// -------------------------
function updateCamera(){
  yaw -= mouseX*0.002;
  pitch -= mouseY*0.002;
  pitch = Math.max(-Math.PI/4, Math.min(Math.PI/4, pitch));

  const offset = new THREE.Vector3();
  offset.x = Math.sin(yaw)*Math.cos(pitch)*cameraDistance;
  offset.y = Math.sin(pitch)*cameraDistance +2;
  offset.z = Math.cos(yaw)*Math.cos(pitch)*cameraDistance;

  camera.position.copy(localCube.position).add(offset);
  camera.lookAt(localCube.position);

  mouseX=0; mouseY=0;
}

// -------------------------
// Discord multiplayer sync
// -------------------------
function sendState(){
  if(!discord) return;
  discord.commands.sendActivityData({
    content:{
      id:authUser.id,
      name:authUser.username,
      color: localCube.material.color.getHex(),
      pos: localCube.position
    }
  });
}

discord?.subscribe?.("MESSAGE_CREATE", ev=>{
  const d = ev?.content;
  if(!d || d.id===authUser.id) return;
  if(!players[d.id]){
    const cube = createCube(d.color);
    const label = createTextLabel(d.name);
    scene.add(cube); scene.add(label);
    players[d.id] = { cube,label };
  }
  players[d.id].cube.position.set(d.pos.x,d.pos.y,d.pos.z);
  players[d.id].label.position.set(d.pos.x,d.pos.y+1.2,d.pos.z);
});

// -------------------------
// Animate
// -------------------------
function animate(){
  requestAnimationFrame(animate);
  updateMovement();
  updateCamera();
  sendState();
  renderer.render(scene,camera);
}
