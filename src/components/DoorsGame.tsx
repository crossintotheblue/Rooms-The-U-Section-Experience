import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import faceAsset from "@/assets/u25-face.png.asset.json";
import spawnAsset from "@/assets/spawn.mp3.asset.json";
import despawnAsset from "@/assets/despawn.wav.asset.json";
import ambianceAsset from "@/assets/u25-ambiance.mp3.asset.json";
import jumpscareGif from "@/assets/jumpscare.gif.asset.json";
import jumpscareSfx from "@/assets/jumpscare-new.mp3.asset.json";
import u60FaceAsset from "@/assets/u60-face.gif.asset.json";
import u60AmbianceAsset from "@/assets/u60-ambiance.mp3.asset.json";
import u60ScreamAsset from "@/assets/u60-scream.mp3.asset.json";
import u60SpawnAsset from "@/assets/u60-spawn.mp3.asset.json";

type RoomType = "empty" | "plant" | "lockers" | "threeLocker" | "metal";

const ROOM_W = 14;
const ROOM_H = 6;
const DOOR_W = 2.2;
const DOOR_H = 3.6;
const TOTAL_ROOMS = 200;

function makeWoodTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#d8d5cf";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = `rgba(140,130,115,${Math.random() * 0.25})`;
    ctx.lineWidth = Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * 512;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(128, y + (Math.random() - 0.5) * 30, 384, y + (Math.random() - 0.5) * 30, 512, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeCarpetTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3d4d63";
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 60;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n + 5;
  }
  ctx.putImageData(img, 0, 0);
  for (let x = 0; x < 512; x += 3) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    ctx.fillRect(x, 0, 1, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeDiamondPlate(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9a9a9e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#6f6f74";
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const ox = (y / 32) % 2 === 0 ? 0 : 16;
      ctx.save();
      ctx.translate(x + ox + 8, y + 8);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeSignTexture(label: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5e97a";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 124);
  ctx.fillStyle = "#000";
  ctx.font = "bold 72px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 68);
  return new THREE.CanvasTexture(c);
}

type Box = { min: THREE.Vector3; max: THREE.Vector3 };

interface Room {
  index: number;
  z: number;
  type: RoomType;
  colliders: Box[];
  doorCollider: Box;
  hidingSpots: { pos: THREE.Vector3; type: "table" | "locker" }[];
  doorOpen: boolean;
  doorAngle: number;
  doorHinge: THREE.Group;
}

export default function DoorsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [currentRoom, setCurrentRoom] = useState(1);
  const [hiding, setHiding] = useState(false);
  const [prompt, setPrompt] = useState<string>("");
  const [gameOver, setGameOver] = useState(false);
  const [jumpscare, setJumpscare] = useState(false);
  const [showRespawn, setShowRespawn] = useState(false);
  const [device, setDevice] = useState<"mobile" | "computer" | null>(null);
  const [nearHide, setNearHide] = useState(false);
  const [nearDoor, setNearDoor] = useState(false);
  const isMobile = device === "mobile";
  const moveRef = useRef({ x: 0, y: 0 });
  const interactRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!device) return;
    // Preload jumpscare media so it appears instantly
    const preloadImg = new Image();
    preloadImg.src = jumpscareGif.url;
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.Fog(0x0a0a0a, 8, 28);

    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 1.7, -2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    mount.appendChild(renderer.domElement);

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    scene.add(new THREE.HemisphereLight(0xf0f4ff, 0x2a2a2a, 0.4));

    const woodTex = makeWoodTexture();
    const carpetTex = makeCarpetTexture();
    const diamondTex = makeDiamondPlate();

    const wallMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9, side: THREE.DoubleSide });
    const ceilMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.95, side: THREE.DoubleSide });
    const floorMat = new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.7 });
    const lockerMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.6, metalness: 0.4 });
    const tableTopMat = new THREE.MeshStandardMaterial({ color: 0xd4a94a, roughness: 0.5 });
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x2fa54a, roughness: 0.7 });
    const potMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.6 });
    const diamondMat = new THREE.MeshStandardMaterial({ map: diamondTex, metalness: 0.6, roughness: 0.4 });

    const rooms: Room[] = [];

    function buildRoom(index: number, zStart: number): Room {
      const type: RoomType =
        index === 0
          ? "empty"
          : (["empty", "plant", "lockers", "threeLocker", "metal"] as RoomType[])[Math.floor(Math.random() * 5)];
      const centerZ = zStart - ROOM_W / 2;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_W), floorMat.clone());
      (floor.material as THREE.MeshStandardMaterial).map = carpetTex.clone();
      (floor.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
      (floor.material as THREE.MeshStandardMaterial).map!.repeat.set(6, 6);
      (floor.material as THREE.MeshStandardMaterial).map!.wrapS = THREE.RepeatWrapping;
      (floor.material as THREE.MeshStandardMaterial).map!.wrapT = THREE.RepeatWrapping;
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, centerZ);
      scene.add(floor);

      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_W), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(0, ROOM_H, centerZ);
      scene.add(ceil);

      const wallGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
      const wl = new THREE.Mesh(wallGeo, wallMat);
      wl.position.set(-ROOM_W / 2, ROOM_H / 2, centerZ);
      wl.rotation.y = Math.PI / 2;
      scene.add(wl);
      const wr = new THREE.Mesh(wallGeo, wallMat);
      wr.position.set(ROOM_W / 2, ROOM_H / 2, centerZ);
      wr.rotation.y = -Math.PI / 2;
      scene.add(wr);

      const backZ = zStart;
      // Back wall only on first room (otherwise the previous room's front wall serves as this room's back)
      if (index === 0) {
        const back = new THREE.Mesh(wallGeo, wallMat);
        back.position.set(0, ROOM_H / 2, backZ);
        back.rotation.y = Math.PI;
        scene.add(back);
      }

      const frontZ = zStart - ROOM_W;
      const sideW = (ROOM_W - DOOR_W) / 2;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(sideW, ROOM_H), wallMat);
      fl.position.set(-ROOM_W / 2 + sideW / 2, ROOM_H / 2, frontZ);
      scene.add(fl);
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(sideW, ROOM_H), wallMat);
      fr.position.set(ROOM_W / 2 - sideW / 2, ROOM_H / 2, frontZ);
      scene.add(fr);
      const ftop = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, ROOM_H - DOOR_H), wallMat);
      ftop.position.set(0, DOOR_H + (ROOM_H - DOOR_H) / 2, frontZ);
      scene.add(ftop);

      const hinge = new THREE.Group();
      hinge.position.set(-DOOR_W / 2, 0, frontZ);
      scene.add(hinge);
      const door = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.1), doorMat);
      door.position.set(DOOR_W / 2, DOOR_H / 2, 0);
      hinge.add(door);
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xd4b04a, metalness: 0.8, roughness: 0.3 })
      );
      knob.position.set(DOOR_W - 0.2, DOOR_H / 2, 0.08);
      hinge.add(knob);

      const signMat = new THREE.MeshBasicMaterial({ map: makeSignTexture(`U-${index + 1}`) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), signMat);
      sign.position.set(0, DOOR_H + 0.35, frontZ + 0.06);
      scene.add(sign);

      const colliders: Box[] = [];
      // side walls
      colliders.push({
        min: new THREE.Vector3(-ROOM_W / 2 - 0.5, 0, centerZ - ROOM_W / 2 - 0.5),
        max: new THREE.Vector3(-ROOM_W / 2, ROOM_H, centerZ + ROOM_W / 2 + 0.5),
      });
      colliders.push({
        min: new THREE.Vector3(ROOM_W / 2, 0, centerZ - ROOM_W / 2 - 0.5),
        max: new THREE.Vector3(ROOM_W / 2 + 0.5, ROOM_H, centerZ + ROOM_W / 2 + 0.5),
      });
      if (index === 0) {
        colliders.push({
          min: new THREE.Vector3(-ROOM_W / 2, 0, backZ),
          max: new THREE.Vector3(ROOM_W / 2, ROOM_H, backZ + 0.2),
        });
      }
      // front wall segments (either side of door)
      colliders.push({
        min: new THREE.Vector3(-ROOM_W / 2, 0, frontZ - 0.1),
        max: new THREE.Vector3(-ROOM_W / 2 + sideW, ROOM_H, frontZ + 0.1),
      });
      colliders.push({
        min: new THREE.Vector3(ROOM_W / 2 - sideW, 0, frontZ - 0.1),
        max: new THREE.Vector3(ROOM_W / 2, ROOM_H, frontZ + 0.1),
      });
      // Door collider — blocks door gap when closed; removed while door open
      const doorCollider: Box = {
        min: new THREE.Vector3(-DOOR_W / 2, 0, frontZ - 0.15),
        max: new THREE.Vector3(DOOR_W / 2, DOOR_H, frontZ + 0.15),
      };

      const hidingSpots: { pos: THREE.Vector3; type: "table" | "locker" }[] = [];

      if (type === "plant" || type === "empty") {
        const table = new THREE.Group();
        const tabletop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.9), tableTopMat);
        tabletop.position.y = 0.9;
        table.add(tabletop);
        const legGeo = new THREE.BoxGeometry(0.1, 0.9, 0.1);
        for (const [lx, lz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
          const leg = new THREE.Mesh(legGeo, tableTopMat);
          leg.position.set(lx, 0.45, lz);
          table.add(leg);
        }
        const px = type === "plant" ? 3.5 : -3.5;
        table.position.set(px, 0, centerZ + 1);
        scene.add(table);
        // Only the tabletop is a collider — legs let you crawl under
        colliders.push({
          min: new THREE.Vector3(px - 0.7, 0.85, centerZ + 0.55),
          max: new THREE.Vector3(px + 0.7, 1.0, centerZ + 1.45),
        });
        hidingSpots.push({ pos: new THREE.Vector3(px, 0, centerZ + 1), type: "table" });

        const pot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), potMat);
        pot.position.set(px, 1.12, centerZ + 1);
        scene.add(pot);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), plantMat);
        leaves.position.set(px, 1.5, centerZ + 1);
        leaves.scale.set(1.2, 0.8, 1.2);
        scene.add(leaves);
      } else if (type === "lockers") {
        for (const lx of [-2.4, 2.4]) {
          const locker = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 1.0), lockerMat);
          locker.position.set(lx, 1.1, frontZ + 1.1);
          scene.add(locker);
          const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.25), new THREE.MeshStandardMaterial({ color: 0x1a1a1e }));
          vent.position.set(lx, 1.8, frontZ + 1.1 + 0.51);
          scene.add(vent);
          colliders.push({
            min: new THREE.Vector3(lx - 0.65, 0, frontZ + 0.6),
            max: new THREE.Vector3(lx + 0.65, 2.2, frontZ + 1.6),
          });
          hidingSpots.push({ pos: new THREE.Vector3(lx, 0, frontZ + 1.1), type: "locker" });
        }
      } else if (type === "threeLocker") {
        for (let i = 0; i < 3; i++) {
          const lz = centerZ - 1.8 + i * 1.2;
          const locker = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.1), lockerMat);
          locker.position.set(ROOM_W / 2 - 0.6, 1.1, lz);
          scene.add(locker);
          colliders.push({
            min: new THREE.Vector3(ROOM_W / 2 - 1.1, 0, lz - 0.55),
            max: new THREE.Vector3(ROOM_W / 2 - 0.1, 2.2, lz + 0.55),
          });
          hidingSpots.push({ pos: new THREE.Vector3(ROOM_W / 2 - 0.6, 0, lz), type: "locker" });
        }
      } else if (type === "metal") {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.1, 4), diamondMat);
        plate.position.set(0, 0.05, centerZ - 2);
        scene.add(plate);
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), tableTopMat);
        desk.position.set(-3, 0.55, centerZ + 1);
        scene.add(desk);
        colliders.push({
          min: new THREE.Vector3(-3.8, 0.85, centerZ + 0.55),
          max: new THREE.Vector3(-2.2, 1.0, centerZ + 1.45),
        });
        hidingSpots.push({ pos: new THREE.Vector3(-3, 0, centerZ + 1), type: "table" });
        const pot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), potMat);
        pot.position.set(-3, 1.05, centerZ + 1);
        scene.add(pot);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), plantMat);
        leaves.position.set(-3, 1.35, centerZ + 1);
        scene.add(leaves);
      }

      return {
        index,
        z: centerZ,
        type,
        colliders,
        doorCollider,
        hidingSpots,
        doorOpen: false,
        doorAngle: 0,
        doorHinge: hinge,
      };
    }

    let builtUpTo = 0;
    function ensureRoomsUpTo(n: number) {
      while (builtUpTo < n && builtUpTo < TOTAL_ROOMS) {
        const zStart = -builtUpTo * ROOM_W;
        rooms.push(buildRoom(builtUpTo, zStart));
        builtUpTo++;
      }
    }
    ensureRoomsUpTo(4);

    // === Entities (U-25 & U-60) ===
    const jumpscareAudio = new Audio(jumpscareSfx.url);
    jumpscareAudio.volume = 1.0;
    jumpscareAudio.preload = "auto";
    jumpscareAudio.load();

    function makeGlowTexture(inner: string, mid: string, outer: string) {
      const gc = document.createElement("canvas");
      gc.width = gc.height = 256;
      const gx = gc.getContext("2d")!;
      const g = gx.createRadialGradient(128, 128, 10, 128, 128, 128);
      g.addColorStop(0, inner);
      g.addColorStop(0.4, mid);
      g.addColorStop(1, outer);
      gx.fillStyle = g;
      gx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(gc);
    }

    interface ParticleSys {
      pts: THREE.Points;
      geo: THREE.BufferGeometry;
      vel: THREE.Vector3[];
      life: Float32Array;
      count: number;
      spread: number;
      speed: number;
    }

    function makeParticles(count: number, color: number, size: number, spread: number, speed: number): ParticleSys {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const mat = new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      scene.add(pts);
      const vel: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) vel.push(new THREE.Vector3());
      return { pts, geo, vel, life: new Float32Array(count), count, spread, speed };
    }

    function updateParticles(p: ParticleSys, dt: number, cx: number, cy: number, cz: number) {
      const attr = p.geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        p.life[i] -= dt;
        if (p.life[i] <= 0) {
          p.life[i] = 0.6 + Math.random() * 0.8;
          attr.setXYZ(
            i,
            cx + (Math.random() - 0.5) * p.spread,
            cy + (Math.random() - 0.5) * (p.spread * 1.6),
            cz + (Math.random() - 0.5) * 0.6
          );
          p.vel[i].set(
            (Math.random() - 0.5) * p.speed * 0.4,
            (Math.random() - 0.2) * p.speed * 0.6,
            p.speed * (0.8 + Math.random())
          );
        } else {
          attr.setXYZ(
            i,
            attr.getX(i) + p.vel[i].x * dt,
            attr.getY(i) + p.vel[i].y * dt,
            attr.getZ(i) + p.vel[i].z * dt
          );
        }
      }
      attr.needsUpdate = true;
    }

    interface EntityRig {
      name: string;
      minRoom: number;
      roomsPerSec: number;
      group: THREE.Group;
      face: THREE.Mesh;
      ring?: THREE.Mesh;
      systems: ParticleSys[];
      state: "idle" | "active" | "cooldown";
      z: number;
      targetRoom: number;
      spawnChance: number;
      hasEncountered: boolean;
      screamPlayed: boolean;
      spawnAudio: HTMLAudioElement;
      ambiance: HTMLAudioElement;
      screamUrl?: string;
      updateTexture?: () => void;
    }

    // --- U-25 ---
    const faceTex = new THREE.TextureLoader().load(faceAsset.url);
    faceTex.colorSpace = THREE.SRGBColorSpace;

    const u25Group = new THREE.Group();
    u25Group.visible = false;
    scene.add(u25Group);
    const u25Face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    );
    u25Group.add(u25Face);
    const u25Glow = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture("rgba(0,220,255,0.9)", "rgba(0,160,255,0.35)", "rgba(0,120,255,0)"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    u25Glow.position.z = -0.05;
    u25Face.add(u25Glow);
    u25Group.add(new THREE.PointLight(0x33ccff, 3, 12, 2));

    // --- U-60 (animated GIF face) ---
    const gifImg = document.createElement("img");
    gifImg.src = u60FaceAsset.url;
    gifImg.style.cssText = "position:fixed;left:-9999px;top:0;width:64px;height:64px;opacity:0.01;pointer-events:none";
    document.body.appendChild(gifImg);
    const gifCanvas = document.createElement("canvas");
    gifCanvas.width = gifCanvas.height = 320;
    const gifCtx = gifCanvas.getContext("2d")!;
    const u60Tex = new THREE.CanvasTexture(gifCanvas);
    u60Tex.colorSpace = THREE.SRGBColorSpace;

    const u60Group = new THREE.Group();
    u60Group.visible = false;
    scene.add(u60Group);
    const u60Face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 3.8),
      new THREE.MeshBasicMaterial({ map: u60Tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide })
    );
    u60Group.add(u60Face);
    const u60Glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture("rgba(90,140,255,0.95)", "rgba(30,60,255,0.45)", "rgba(0,20,180,0)"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    u60Glow.position.z = -0.05;
    u60Face.add(u60Glow);
    u60Group.add(new THREE.PointLight(0x3355ff, 6, 20, 2));
    const u60Ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.09, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    u60Group.add(u60Ring);

    const rigs: EntityRig[] = [
      {
        name: "U-25",
        minRoom: 15,
        roomsPerSec: 2,
        group: u25Group,
        face: u25Face,
        systems: [makeParticles(240, 0x33ccff, 0.22, 1.5, 1.5)],
        state: "idle",
        z: 0,
        targetRoom: 0,
        spawnChance: 0,
        hasEncountered: false,
        screamPlayed: false,
        spawnAudio: new Audio(spawnAsset.url),
        ambiance: new Audio(ambianceAsset.url),
      },
      {
        name: "U-60",
        minRoom: 24,
        roomsPerSec: 4,
        group: u60Group,
        face: u60Face,
        ring: u60Ring,
        systems: [
          makeParticles(700, 0x2244ff, 0.2, 2.2, 3.0),
          makeParticles(260, 0x88bbff, 0.42, 3.4, 5.0),
          makeParticles(160, 0x00ffff, 0.12, 1.0, 1.2),
        ],
        state: "idle",
        z: 0,
        targetRoom: 0,
        spawnChance: 0,
        hasEncountered: false,
        screamPlayed: false,
        spawnAudio: new Audio(u60SpawnAsset.url),
        ambiance: new Audio(u60AmbianceAsset.url),
        screamUrl: u60ScreamAsset.url,
      },
    ];

    for (const r of rigs) {
      r.spawnAudio.volume = 0.9;
      r.ambiance.volume = 0.7;
      r.ambiance.loop = true;
    }

    function setRigVisible(r: EntityRig, v: boolean) {
      r.group.visible = v;
      for (const s of r.systems) s.pts.visible = v;
    }

    function trySpawnEntity(playerRoomIdx: number) {
      const anyActive = rigs.some((r) => r.state === "active");
      if (anyActive) return;
      for (const r of rigs) {
        if (r.state !== "idle") continue;
        if (playerRoomIdx < r.minRoom) continue;
        const cap = r.hasEncountered ? 1.0 : 0.3;
        const guaranteed = !r.hasEncountered && r.spawnChance >= 0.3;
        if (guaranteed || Math.random() < r.spawnChance) {
          r.state = "active";
          r.targetRoom = playerRoomIdx;
          r.z = 0;
          r.screamPlayed = false;
          r.group.position.set(0, 1.8, 0);
          setRigVisible(r, true);
          r.spawnAudio.currentTime = 0;
          r.spawnAudio.play().catch(() => {});
          try { r.ambiance.currentTime = 0; r.ambiance.play().catch(() => {}); } catch { /* noop */ }
          r.spawnChance = 0;
          return;
        }
        r.spawnChance = Math.min(cap, r.spawnChance + (r.hasEncountered ? 0.001 : 0.01));
      }
    }

    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => { keys[e.code] = true; };
    const ku = (e: KeyboardEvent) => { keys[e.code] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let isLocked = false;
    let dragging = false;
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked && !dragging) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= e.movementX * 0.003;
      euler.x -= e.movementY * 0.003;
      euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    document.addEventListener("mousemove", onMouseMove);
    const onLockChange = () => { isLocked = document.pointerLockElement === renderer.domElement; };
    document.addEventListener("pointerlockchange", onLockChange);
    const onMouseDown = () => {
      if (device === "mobile") return;
      dragging = true;
      try { renderer.domElement.requestPointerLock?.(); } catch { /* noop */ }
    };
    const onMouseUp = () => { dragging = false; };
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // --- Mobile look: only touches that land on the canvas rotate the camera ---
    let lookTouchId: number | null = null;
    let lastTX = 0;
    let lastTY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (lookTouchId !== null) return;
      const t = e.changedTouches[0];
      lookTouchId = t.identifier;
      lastTX = t.clientX;
      lastTY = t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== lookTouchId) continue;
        const dx = t.clientX - lastTX;
        const dy = t.clientY - lastTY;
        lastTX = t.clientX;
        lastTY = t.clientY;
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * 0.005;
        euler.x -= dy * 0.005;
        euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.x));
        camera.quaternion.setFromEuler(euler);
      }
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
      }
    };
    if (device === "mobile") {
      renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
      renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
      renderer.domElement.addEventListener("touchend", onTouchEnd);
      renderer.domElement.addEventListener("touchcancel", onTouchEnd);
    }

    let hidingState: { room: Room; spotIdx: number; savedPos: THREE.Vector3 } | null = null;
    const tryInteract = () => {
      if (gameOverRef.current) return;
      const pos = camera.position;
      let nearest: Room | null = null;
      let nd = Infinity;
      for (const r of rooms) {
        const d = Math.abs(r.z - pos.z);
        if (d < nd) { nd = d; nearest = r; }
      }
      if (!nearest) return;

      if (hidingState) {
        camera.position.copy(hidingState.savedPos);
        hidingState = null;
        setHiding(false);
        return;
      }

      for (let i = 0; i < nearest.hidingSpots.length; i++) {
        const s = nearest.hidingSpots[i];
        const dx = pos.x - s.pos.x;
        const dz = pos.z - s.pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
          hidingState = { room: nearest, spotIdx: i, savedPos: pos.clone() };
          setHiding(true);
          return;
        }
      }

      const doorPos = new THREE.Vector3(0, DOOR_H / 2, nearest.z - ROOM_W / 2);
      if (pos.distanceTo(doorPos) < 2.5) {
        nearest.doorOpen = true;
      }
    };
    const onKeyPress = (e: KeyboardEvent) => {
      if (e.code === "KeyE") tryInteract();
    };
    window.addEventListener("keydown", onKeyPress);
    interactRef.current = tryInteract;

    const velocity = new THREE.Vector3();
    const playerRadius = 0.35;

    function collide(pos: THREE.Vector3) {
      for (const r of rooms) {
        if (Math.abs(r.z - pos.z) > ROOM_W) continue;
        const boxes: Box[] = r.doorOpen ? r.colliders : [...r.colliders, r.doorCollider];
        for (const b of boxes) {
          const closestX = Math.max(b.min.x, Math.min(pos.x, b.max.x));
          const closestZ = Math.max(b.min.z, Math.min(pos.z, b.max.z));
          const dx = pos.x - closestX;
          const dz = pos.z - closestZ;
          const dist2 = dx * dx + dz * dz;
          if (dist2 < playerRadius * playerRadius && pos.y - 0.9 < b.max.y && pos.y + 0.9 > b.min.y) {
            const dist = Math.sqrt(dist2) || 0.0001;
            const push = (playerRadius - dist) / dist;
            pos.x += dx * push;
            pos.z += dz * push;
          }
        }
      }
    }

    const gameOverRef = { current: false };
    const clock = new THREE.Clock();
    let lastRoomReport = 1;
    let lastRoomForSpawn = 0;

    function animate() {
      const dt = Math.min(0.05, clock.getDelta());

      for (const r of rooms) {
        const target = r.doorOpen ? Math.PI / 2 : 0;
        r.doorAngle += (target - r.doorAngle) * Math.min(1, dt * 6);
        r.doorHinge.rotation.y = -r.doorAngle;
      }

      if (!hidingState && !gameOverRef.current) {
        const speed = (keys["ShiftLeft"] ? 5.5 : 3.5) * dt;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        velocity.set(0, 0, 0);
        if (keys["KeyW"]) velocity.add(forward);
        if (keys["KeyS"]) velocity.addScaledVector(forward, -1);
        if (keys["KeyD"]) velocity.add(right);
        if (keys["KeyA"]) velocity.addScaledVector(right, -1);
        const mv = moveRef.current;
        if (mv.x !== 0 || mv.y !== 0) {
          velocity.addScaledVector(forward, mv.y);
          velocity.addScaledVector(right, mv.x);
        }
        if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed);
        camera.position.add(velocity);
        camera.position.y = 1.7;
        collide(camera.position);
      } else if (hidingState) {
        const s = hidingState.room.hidingSpots[hidingState.spotIdx];
        const targetY = s.type === "locker" ? 1.2 : 0.6;
        camera.position.lerp(new THREE.Vector3(s.pos.x, targetY, s.pos.z), 0.2);
      }

      const roomIdx = Math.max(0, Math.round(-camera.position.z / ROOM_W));
      if (roomIdx + 1 !== lastRoomReport) {
        lastRoomReport = roomIdx + 1;
        setCurrentRoom(Math.min(TOTAL_ROOMS, roomIdx + 1));
      }
      ensureRoomsUpTo(roomIdx + 4);

      // Entity spawn roll — once per new room entered
      if (roomIdx !== lastRoomForSpawn) {
        lastRoomForSpawn = roomIdx;
        trySpawnEntity(roomIdx);
      }

      // Entity motion
      for (const rig of rigs) {
        if (rig.state !== "active") continue;
        rig.z -= ROOM_W * rig.roomsPerSec * dt;
        rig.group.position.z = rig.z;
        rig.group.position.y = 1.8;
        rig.face.lookAt(camera.position.x, rig.group.position.y, camera.position.z);
        if (rig.ring) {
          rig.ring.rotation.z += dt * 2.5;
          rig.ring.rotation.x = Math.sin(performance.now() * 0.002) * 0.6;
          rig.ring.lookAt(camera.position.x, rig.group.position.y, camera.position.z);
        }
        if (rig.name === "U-60" && gifImg.complete && gifImg.naturalWidth > 0) {
          gifCtx.clearRect(0, 0, gifCanvas.width, gifCanvas.height);
          gifCtx.drawImage(gifImg, 0, 0, gifCanvas.width, gifCanvas.height);
          u60Tex.needsUpdate = true;
        }

        for (const s of rig.systems) {
          updateParticles(s, dt, rig.group.position.x, rig.group.position.y, rig.z);
        }

        // Approach scream (~10 seconds out) — plays fully even after despawn
        if (rig.screamUrl && !rig.screamPlayed) {
          const distance = rig.z - camera.position.z;
          const eta = distance / (ROOM_W * rig.roomsPerSec);
          if (eta <= 10) {
            rig.screamPlayed = true;
            try {
              const scream = new Audio(rig.screamUrl);
              scream.volume = 1.0;
              scream.play().catch(() => {});
            } catch { /* noop */ }
          }
        }

        const targetDoorZ = -(rig.targetRoom * ROOM_W + ROOM_W);
        if (!hidingState && !gameOverRef.current && rig.z <= camera.position.z + 1.5 && rig.z >= camera.position.z - 1.5) {
          gameOverRef.current = true;
          setGameOver(true);
          setJumpscare(true);
          for (const other of rigs) { try { other.ambiance.pause(); } catch { /* noop */ } }
          try { jumpscareAudio.currentTime = 0; jumpscareAudio.play().catch(() => {}); } catch { /* noop */ }
          setTimeout(() => { setJumpscare(false); setShowRespawn(true); }, 1000);
          rig.state = "cooldown";
          setRigVisible(rig, false);
        }
        if (rig.state === "active" && rig.z <= targetDoorZ) {
          rig.state = "cooldown";
          rig.hasEncountered = true;
          rig.spawnChance = 0;
          setRigVisible(rig, false);
          try { rig.ambiance.pause(); rig.ambiance.currentTime = 0; } catch { /* noop */ }
          try {
            const d = new Audio(despawnAsset.url);
            d.volume = 0.9;
            d.play().catch(() => {});
          } catch { /* noop */ }
          setTimeout(() => { rig.state = "idle"; }, 3000);
        }
      }

      let promptText = "";
      let hideAvailable = false;
      let doorAvailable = false;
      const pos = camera.position;
      const room = rooms[roomIdx];
      if (room && !gameOverRef.current) {
        if (hidingState) {
          promptText = "[E] Leave hiding spot";
          hideAvailable = true;
        } else {
          for (const s of room.hidingSpots) {
            const dx = pos.x - s.pos.x;
            const dz = pos.z - s.pos.z;
            if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
              promptText = s.type === "locker" ? "[E] Hide in locker" : "[E] Hide under table";
              hideAvailable = true;
              break;
            }
          }
          const doorPos = new THREE.Vector3(0, DOOR_H / 2, room.z - ROOM_W / 2);
          if (!room.doorOpen && pos.distanceTo(doorPos) < 2.5) {
            doorAvailable = true;
            if (!promptText) promptText = `[E] Open door ${room.index + 2}`;
          }
        }
      }
      setPrompt(device === "mobile" ? "" : promptText);
      setNearHide(hideAvailable);
      setNearDoor(doorAvailable);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("keydown", onKeyPress);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
      for (const r of rigs) { try { r.ambiance.pause(); } catch { /* noop */ } }
      gifImg.remove();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [device]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute top-4 left-4 text-yellow-300 font-mono text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">
        Room {currentRoom} / {TOTAL_ROOMS}
      </div>
      {hiding && (
        <div className="absolute top-4 right-4 text-red-400 font-mono text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">
          HIDING
        </div>
      )}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-xl">
        +
      </div>
      {prompt && (
        <div className="pointer-events-none absolute left-1/2 bottom-24 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded font-mono">
          {prompt}
        </div>
      )}
      {isMobile && !gameOver && (
        <>
          <Joystick moveRef={moveRef} />
          {nearHide && (
            <HoldButton
              label={hiding ? "LEAVE" : "HIDE"}
              onHold={() => interactRef.current()}
            />
          )}
        </>
      )}
      {gameOver && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-black text-red-500 font-mono text-5xl font-bold">
          YOU DIED
          {showRespawn && (
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 text-xl border-2 border-red-600 text-red-400 hover:bg-red-600 hover:text-black transition-colors rounded"
            >
              RESPAWN
            </button>
          )}
        </div>
      )}
      {jumpscare && (
        <img
          src={jumpscareGif.url}
          alt=""
          className="pointer-events-none absolute inset-0 w-full h-full object-cover z-50"
        />
      )}
      {!isMobile && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 font-mono text-xs text-center">
          WASD move · Shift sprint · Click &amp; drag to look · E to open doors / hide
        </div>
      )}
      {!device && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-10 bg-black">
          <h1 className="text-white font-mono text-3xl md:text-4xl font-bold text-center px-6">
            What device are you playing on?
          </h1>
          <div className="flex gap-6">
            <button
              onClick={() => setDevice("mobile")}
              className="px-10 py-4 border-2 border-white/60 text-white font-mono text-xl rounded hover:bg-white hover:text-black transition-colors"
            >
              Mobile
            </button>
            <button
              onClick={() => setDevice("computer")}
              className="px-10 py-4 border-2 border-white/60 text-white font-mono text-xl rounded hover:bg-white hover:text-black transition-colors"
            >
              Computer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Joystick({ moveRef }: { moveRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);
  const RADIUS = 56;

  const update = (cx: number, cy: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    moveRef.current = { x: dx / RADIUS, y: -dy / RADIUS };
  };

  const reset = () => {
    touchId.current = null;
    setKnob({ x: 0, y: 0 });
    moveRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={baseRef}
      className="absolute bottom-8 left-8 h-32 w-32 rounded-full border-2 border-white/40 bg-white/10 touch-none z-30"
      onTouchStart={(e) => {
        e.stopPropagation();
        if (touchId.current !== null) return;
        const t = e.changedTouches[0];
        touchId.current = t.identifier;
        update(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === touchId.current) update(t.clientX, t.clientY);
        }
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId.current) reset();
        }
      }}
      onTouchCancel={reset}
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function HoldButton({ label, onHold }: { label: string; onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressing, setPressing] = useState(false);

  const start = () => {
    setPressing(true);
    timer.current = setTimeout(() => {
      setPressing(false);
      onHold();
    }, 200);
  };
  const cancel = () => {
    setPressing(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <button
      onTouchStart={(e) => { e.stopPropagation(); start(); }}
      onTouchEnd={(e) => { e.stopPropagation(); cancel(); }}
      onTouchCancel={cancel}
      className={`absolute bottom-12 right-8 z-30 h-24 w-24 rounded-full border-2 border-white/60 font-mono text-sm touch-none ${
        pressing ? "bg-white text-black" : "bg-black/50 text-white"
      }`}
    >
      {label}
      <span className="block text-[10px] opacity-70">hold</span>
    </button>
  );
}
