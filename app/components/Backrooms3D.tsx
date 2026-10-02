"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type GameStats = {
  sanity: number;
  stamina: number;
  elapsed: number;
  distance: number;
  sector: number;
};

type MobileInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

type WallData = {
  x: number;
  z: number;
  w: number;
  d: number;
};

type ChunkData = {
  group: THREE.Group;
  walls: WallData[];
  lights: THREE.PointLight[];
  flickerSeed: number;
};

const CHUNK_SIZE = 26;
const WALL_HEIGHT = 4.8;
const WALL_THICKNESS = 0.32;
const PLAYER_RADIUS = 0.55;
const PLAYER_HEIGHT = 1.72;
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.0;

const COLORS = {
  carpet: 0x8b8152,
  carpetDark: 0x71693f,
  wall: 0xb9a961,
  wallShadow: 0x8a7a43,
  ceiling: 0x8f8875,
  trim: 0x665e3a,
  light: 0xffefb0,
  shadow: 0x070705,
};

function hash2(x: number, z: number, salt = 0) {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function createNoiseTexture(
  base: string,
  accent: string,
  cells: number,
  strength: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const alpha = Math.random() * strength;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = accent;
      const size = 256 / cells;
      ctx.fillRect(x * size, y * size, size + 1, size + 1);
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wallMaterial() {
  const texture = createNoiseTexture("#b8a761", "#746937", 52, 0.1);
  return new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    map: texture ?? undefined,
    roughness: 0.96,
    metalness: 0,
  });
}

function carpetMaterial() {
  const texture = createNoiseTexture("#82784b", "#534d30", 86, 0.2);
  return new THREE.MeshStandardMaterial({
    color: COLORS.carpet,
    map: texture ?? undefined,
    roughness: 1,
    metalness: 0,
  });
}

function ceilingMaterial() {
  const texture = createNoiseTexture("#a39d89", "#5c574b", 32, 0.08);
  return new THREE.MeshStandardMaterial({
    color: COLORS.ceiling,
    map: texture ?? undefined,
    roughness: 1,
  });
}

function addBox(
  group: THREE.Group,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  castShadow = false,
  receiveShadow = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  group.add(mesh);
  return mesh;
}

function addWall(
  group: THREE.Group,
  material: THREE.Material,
  x: number,
  z: number,
  w: number,
  d: number,
  walls: WallData[],
) {
  addBox(group, material, x, WALL_HEIGHT / 2, z, w, WALL_HEIGHT, d);
  walls.push({ x, z, w, d });
}

function edgeOpen(cx: number, cz: number, dir: "n" | "e" | "s" | "w") {
  if (dir === "e") return hash2(cx, cz, 8) > 0.29;
  if (dir === "w") return hash2(cx - 1, cz, 8) > 0.29;
  if (dir === "n") return hash2(cx, cz - 1, 16) > 0.31;
  return hash2(cx, cz, 16) > 0.31;
}

function addSegmentedWall(
  group: THREE.Group,
  material: THREE.Material,
  axis: "x" | "z",
  fixed: number,
  start: number,
  end: number,
  openingCenter: number | null,
  walls: WallData[],
) {
  const openingWidth = 5.2;
  const total = end - start;

  if (openingCenter === null || openingCenter < start + 2 || openingCenter > end - 2) {
    if (axis === "x") {
      addWall(group, material, (start + end) / 2, fixed, total, WALL_THICKNESS, walls);
    } else {
      addWall(group, material, fixed, (start + end) / 2, WALL_THICKNESS, total, walls);
    }
    return;
  }

  const leftEnd = openingCenter - openingWidth / 2;
  const rightStart = openingCenter + openingWidth / 2;

  if (leftEnd > start) {
    if (axis === "x") {
      addWall(group, material, (start + leftEnd) / 2, fixed, leftEnd - start, WALL_THICKNESS, walls);
    } else {
      addWall(group, material, fixed, (start + leftEnd) / 2, WALL_THICKNESS, leftEnd - start, walls);
    }
  }

  if (rightStart < end) {
    if (axis === "x") {
      addWall(group, material, (rightStart + end) / 2, fixed, end - rightStart, WALL_THICKNESS, walls);
    } else {
      addWall(group, material, fixed, (rightStart + end) / 2, WALL_THICKNESS, end - rightStart, walls);
    }
  }

  const portal = addBox(
    group,
    new THREE.MeshStandardMaterial({
      color: 0xc2b06b,
      emissive: 0x66551f,
      emissiveIntensity: 0.08,
      roughness: 1,
    }),
    axis === "x" ? openingCenter : fixed,
    0.35,
    axis === "x" ? fixed : openingCenter,
    axis === "x" ? openingWidth : 0.55,
    0.08,
    axis === "x" ? 0.55 : openingWidth,
  );
  portal.visible = true;
}

function addFluorescent(group: THREE.Group, x: number, z: number, rotation = 0) {
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.light,
    emissive: COLORS.light,
    emissiveIntensity: 4.5,
    roughness: 0.25,
  });

  const fixture = addBox(
    group,
    material,
    x,
    WALL_HEIGHT - 0.12,
    z,
    rotation === 0 ? 3.2 : 0.32,
    0.08,
    rotation === 0 ? 0.32 : 3.2,
  );
  fixture.rotation.y = rotation;

  const shade = new THREE.Mesh(
    new THREE.BoxGeometry(
      rotation === 0 ? 3.6 : 0.48,
      0.02,
      rotation === 0 ? 0.48 : 3.6,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xfff2bd,
      transparent: true,
      opacity: 0.72,
    }),
  );
  shade.position.set(x, WALL_HEIGHT - 0.2, z);
  shade.rotation.y = rotation;
  group.add(shade);

  return fixture;
}

function addAnomaly(group: THREE.Group, x: number, z: number, variant: number) {
  if (variant === 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x241e10,
      emissive: 0x8f7828,
      emissiveIntensity: 0.55,
      roughness: 0.8,
    });
    const frame = addBox(group, mat, x, 1.35, z, 0.18, 2.7, 2.2);
    frame.rotation.y = Math.PI / 2;
  } else if (variant === 1) {
    const glow = new THREE.PointLight(0xff3344, 2.2, 10, 2);
    glow.position.set(x, 2.2, z);
    group.add(glow);

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.4, 0.15),
      new THREE.MeshStandardMaterial({
        color: 0x260f0f,
        emissive: 0x6a1111,
        emissiveIntensity: 1.6,
      }),
    );
    box.position.set(x, 1.3, z);
    group.add(box);
  } else {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.12, 16, 48),
      new THREE.MeshStandardMaterial({
        color: 0xd8bf62,
        emissive: 0x5b4812,
        emissiveIntensity: 1.2,
        roughness: 0.45,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.35, z);
    group.add(ring);
  }
}

function createChunk(
  cx: number,
  cz: number,
  wallMat: THREE.Material,
  carpetMat: THREE.Material,
  ceilingMat: THREE.Material,
) {
  const group = new THREE.Group();
  const walls: WallData[] = [];
  const lights: THREE.PointLight[] = [];

  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const half = CHUNK_SIZE / 2;

  addBox(
    group,
    carpetMat,
    originX,
    -0.09,
    originZ,
    CHUNK_SIZE,
    0.18,
    CHUNK_SIZE,
    false,
    true,
  );

  addBox(
    group,
    ceilingMat,
    originX,
    WALL_HEIGHT + 0.18,
    originZ,
    CHUNK_SIZE,
    0.18,
    CHUNK_SIZE,
    false,
    false,
  );

  const openings = {
    n: edgeOpen(cx, cz, "n") ? originX + (hash2(cx, cz, 20) - 0.5) * 6 : null,
    e: edgeOpen(cx, cz, "e") ? originZ + (hash2(cx, cz, 21) - 0.5) * 6 : null,
    s: edgeOpen(cx, cz, "s") ? originX + (hash2(cx, cz, 22) - 0.5) * 6 : null,
    w: edgeOpen(cx, cz, "w") ? originZ + (hash2(cx, cz, 23) - 0.5) * 6 : null,
  };

  addSegmentedWall(
    group,
    wallMat,
    "x",
    originZ - half,
    originX - half,
    originX + half,
    openings.n,
    walls,
  );
  addSegmentedWall(
    group,
    wallMat,
    "x",
    originZ + half,
    originX - half,
    originX + half,
    openings.s,
    walls,
  );
  addSegmentedWall(
    group,
    wallMat,
    "z",
    originX - half,
    originZ - half,
    originZ + half,
    openings.w,
    walls,
  );
  addSegmentedWall(
    group,
    wallMat,
    "z",
    originX + half,
    originZ - half,
    originZ + half,
    openings.e,
    walls,
  );

  const variants = [0, 1, 2, 3];
  const variant = Math.floor(hash2(cx, cz, 31) * variants.length);

  if (variant === 0 || variant === 2) {
    const dividerX = originX + (hash2(cx, cz, 33) - 0.5) * 7;
    const opening = originZ + (hash2(cx, cz, 34) - 0.5) * 6;
    addSegmentedWall(
      group,
      wallMat,
      "x",
      dividerX,
      originZ - 9,
      originZ + 9,
      opening,
      walls,
    );
  }

  if (variant === 1 || variant === 3) {
    const dividerZ = originZ + (hash2(cx, cz, 35) - 0.5) * 7;
    const opening = originX + (hash2(cx, cz, 36) - 0.5) * 6;
    addSegmentedWall(
      group,
      wallMat,
      "z",
      dividerZ,
      originX - 9,
      originX + 9,
      opening,
      walls,
    );
  }

  for (let i = 0; i < 4; i += 1) {
    const lx = originX + (i % 2 === 0 ? -6 : 6) + (hash2(cx + i, cz, 45) - 0.5) * 2.4;
    const lz = originZ + (i < 2 ? -6 : 6) + (hash2(cx, cz + i, 46) - 0.5) * 2.4;
    addFluorescent(group, lx, lz, i % 2 === 0 ? 0 : Math.PI / 2);

    const light = new THREE.PointLight(COLORS.light, 2.15, 11, 2.2);
    light.position.set(lx, WALL_HEIGHT - 0.5, lz);
    light.castShadow = false;
    group.add(light);
    lights.push(light);
  }

  if (hash2(cx, cz, 50) > 0.72) {
    const ax = originX + (hash2(cx, cz, 51) - 0.5) * 16;
    const az = originZ + (hash2(cx, cz, 52) - 0.5) * 16;
    addAnomaly(group, ax, az, Math.floor(hash2(cx, cz, 53) * 3));
  }

  if (hash2(cx, cz, 60) > 0.88) {
    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x4f4530,
      roughness: 1,
    });
    const deskX = originX + (hash2(cx, cz, 61) - 0.5) * 13;
    const deskZ = originZ + (hash2(cx, cz, 62) - 0.5) * 13;
    addBox(group, deskMat, deskX, 0.65, deskZ, 2.3, 1.3, 1.1);
    addBox(group, deskMat, deskX, 0.09, deskZ, 2.5, 0.18, 1.3);
  }

  return {
    group,
    walls,
    lights,
    flickerSeed: Math.floor(hash2(cx, cz, 99) * 100000),
  } satisfies ChunkData;
}

function collides(x: number, z: number, walls: WallData[]) {
  for (const wall of walls) {
    const closestX = Math.max(wall.x - wall.w / 2, Math.min(x, wall.x + wall.w / 2));
    const closestZ = Math.max(wall.z - wall.d / 2, Math.min(z, wall.z + wall.d / 2));
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return true;
  }
  return false;
}

export default function Backrooms3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dead, setDead] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    sanity: 100,
    stamina: 100,
    elapsed: 0,
    distance: 0,
    sector: 0,
  });
  const [eventMessage, setEventMessage] = useState(
    "Le néon grésille. Tu n'entends rien d'autre.",
  );

  useEffect(() => {
    if (!started || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0e0a);
    scene.fog = new THREE.FogExp2(0x6f6748, 0.026);

    const camera = new THREE.PerspectiveCamera(
      76,
      window.innerWidth / window.innerHeight,
      0.05,
      220,
    );
    camera.position.set(0, PLAYER_HEIGHT, 0);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene.add(new THREE.HemisphereLight(0xffe7ad, 0x17150e, 0.54));

    const ambient = new THREE.DirectionalLight(0xe2d9ad, 0.24);
    ambient.position.set(0, 12, 0);
    scene.add(ambient);

    const handLamp = new THREE.SpotLight(0xfff0c9, 4.1, 27, Math.PI / 7, 0.38, 1.2);
    handLamp.position.set(0.12, -0.04, -0.18);
    camera.add(handLamp);

    const handLampTarget = new THREE.Object3D();
    handLampTarget.position.set(0, -1.1, -10);
    camera.add(handLampTarget);
    handLamp.target = handLampTarget;
    scene.add(camera);

    const flashlight = {
      enabled: true,
      battery: 100,
    };

    const wallMat = wallMaterial();
    const carpetMat = carpetMaterial();
    const ceilingMat = ceilingMaterial();

    const chunks = new Map<string, ChunkData>();

    const makeKey = (cx: number, cz: number) => cx + ":" + cz;

    function ensureChunks(px: number, pz: number) {
      const cx = Math.floor(px / CHUNK_SIZE + 0.5);
      const cz = Math.floor(pz / CHUNK_SIZE + 0.5);

      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const tx = cx + dx;
          const tz = cz + dz;
          const key = makeKey(tx, tz);
          if (!chunks.has(key)) {
            const data = createChunk(tx, tz, wallMat, carpetMat, ceilingMat);
            scene.add(data.group);
            chunks.set(key, data);
          }
        }
      }

      for (const [key, data] of chunks) {
        const [x, z] = key.split(":").map(Number);
        if (Math.abs(x - cx) > 2 || Math.abs(z - cz) > 2) {
          scene.remove(data.group);
          data.group.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const material = object.material;
              if (Array.isArray(material)) {
                material.forEach((m) => m.dispose());
              } else {
                material.dispose();
              }
            }
          });
          chunks.delete(key);
        }
      }

      return cx + cz * 31;
    }

    ensureChunks(0, 0);

    const keys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      ShiftLeft: false,
      ShiftRight: false,
    };

    const mobile: MobileInput = {
      forward: false,
      back: false,
      left: false,
      right: false,
    };

    let yaw = 0;
    let pitch = 0;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    let running = true;
    let elapsed = 0;
    let distance = 0;
    let sanity = 100;
    let stamina = 100;
    let lastTime = performance.now();
    let messageTimer = 5;
    let spawnTimer = 34;
    let watcher: THREE.Group | null = null;
    let watcherSeed = Math.random() * 100000;

    const audioContext =
      typeof window !== "undefined" && "AudioContext" in window
        ? new AudioContext()
        : null;

    let humGain: GainNode | null = null;
    let humOsc: OscillatorNode | null = null;
    let pulseOsc: OscillatorNode | null = null;

    function startAudio() {
      if (!audioContext || humOsc) return;

      try {
        const master = audioContext.createGain();
        master.gain.value = 0.035;
        master.connect(audioContext.destination);

        humOsc = audioContext.createOscillator();
        humOsc.type = "sine";
        humOsc.frequency.value = 54;
        humGain = audioContext.createGain();
        humGain.gain.value = 0.6;
        humOsc.connect(humGain).connect(master);
        humOsc.start();

        pulseOsc = audioContext.createOscillator();
        pulseOsc.type = "triangle";
        pulseOsc.frequency.value = 88;
        const pulseGain = audioContext.createGain();
        pulseGain.gain.value = 0.025;
        pulseOsc.connect(pulseGain).connect(master);
        pulseOsc.start();
      } catch {
        // Audio is optional.
      }
    }

    function stopAudio() {
      try {
        humOsc?.stop();
        pulseOsc?.stop();
      } catch {
        // Already stopped.
      }
      humOsc = null;
      pulseOsc = null;
      humGain = null;
    }

    function setMessage(text: string, seconds = 4) {
      setEventMessage(text);
      messageTimer = seconds;
    }

    function spawnWatcher() {
      if (watcher) return;

      const group = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.34, 1.2, 4, 10),
        new THREE.MeshStandardMaterial({
          color: COLORS.shadow,
          roughness: 1,
          transparent: true,
          opacity: 0.92,
        }),
      );
      body.position.y = 1.05;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 16, 12),
        new THREE.MeshStandardMaterial({
          color: COLORS.shadow,
          roughness: 1,
          transparent: true,
          opacity: 0.92,
        }),
      );
      head.position.y = 1.95;
      group.add(head);

      const seed = watcherSeed;
      const angle = hash2(Math.floor(seed), Math.floor(elapsed), 91) * Math.PI * 2;
      const dist = 30 + hash2(Math.floor(seed), Math.floor(elapsed), 92) * 18;
      group.position.set(
        camera.position.x + Math.cos(angle) * dist,
        0,
        camera.position.z + Math.sin(angle) * dist,
      );

      scene.add(group);
      watcher = group;
      setMessage("Quelque chose est apparu entre deux zones de lumière.", 6);
    }

    function despawnWatcher() {
      if (!watcher) return;
      scene.remove(watcher);
      watcher.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const mat = object.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      watcher = null;
    }

    function togglePause() {
      if (dead) return;
      setPaused((value) => {
        const next = !value;
        if (next && document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
        return next;
      });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code in keys) {
        keys[event.code as keyof typeof keys] = true;
      }

      if (event.code === "KeyF") {
        flashlight.enabled = !flashlight.enabled;
        handLamp.intensity = flashlight.enabled ? 4.1 : 0;
        setMessage(
          flashlight.enabled
            ? "La lampe torche s'allume."
            : "Tu avances dans la lumière des néons.",
          2.5,
        );
      }

      if (event.code === "KeyP" || event.code === "Escape") {
        togglePause();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code in keys) {
        keys[event.code as keyof typeof keys] = false;
      }
    }

    function onPointerLockChange() {
      if (!document.pointerLockElement && started && !paused && !dead) {
        setPaused(true);
      }
    }

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;

      if (!("ontouchstart" in window) && !paused && !dead) {
        void canvas.requestPointerLock?.();
      }
    }

    function onPointerUp() {
      dragging = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (document.pointerLockElement !== canvas && !dragging) return;

      const multiplier = document.pointerLockElement === canvas ? 0.0021 : 0.004;
      const movementX =
        document.pointerLockElement === canvas
          ? event.movementX
          : event.clientX - lastPointerX;
      const movementY =
        document.pointerLockElement === canvas
          ? event.movementY
          : event.clientY - lastPointerY;

      if (document.pointerLockElement !== canvas && dragging) {
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      }

      yaw -= movementX * multiplier;
      pitch -= movementY * multiplier;
      pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    function mobileButton(
      button: HTMLButtonElement,
      property: keyof MobileInput,
    ) {
      const down = () => {
        mobile[property] = true;
      };
      const up = () => {
        mobile[property] = false;
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
      return () => {
        button.removeEventListener("pointerdown", down);
        button.removeEventListener("pointerup", up);
        button.removeEventListener("pointercancel", up);
        button.removeEventListener("pointerleave", up);
      };
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const touchButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-move]"),
    );
    const cleanupTouch = touchButtons.map((button) =>
      mobileButton(
        button,
        button.dataset.move as keyof MobileInput,
      ),
    );

    startAudio();
    if (audioContext?.state === "suspended") void audioContext.resume();

    const clock = new THREE.Clock();

    function getMovement() {
      let forward = 0;
      let strafe = 0;

      if (keys.KeyW || mobile.forward) forward += 1;
      if (keys.KeyS || mobile.back) forward -= 1;
      if (keys.KeyA || mobile.left) strafe -= 1;
      if (keys.KeyD || mobile.right) strafe += 1;

      const vector = new THREE.Vector3(strafe, 0, -forward);
      if (vector.lengthSq() > 1) vector.normalize();

      return vector;
    }

    function updateWatcher(dt: number) {
      if (!watcher) return;

      const target = new THREE.Vector3(
        camera.position.x,
        0.9,
        camera.position.z,
      );
      const delta = target.clone().sub(watcher.position);
      const dist = delta.length();

      if (dist > 55 || dist < 4) {
        despawnWatcher();
        return;
      }

      const playerDir = new THREE.Vector3();
      camera.getWorldDirection(playerDir);
      playerDir.y = 0;
      playerDir.normalize();

      const toWatcher = watcher.position
        .clone()
        .sub(camera.position);
      toWatcher.y = 0;
      toWatcher.normalize();

      const watched =
        flashlight.enabled && playerDir.dot(toWatcher) > 0.7;

      if (watched) {
        watcher.position.addScaledVector(toWatcher, -dt * 3.2);
        sanity = Math.min(100, sanity + dt * 0.65);
      } else {
        delta.y = 0;
        delta.normalize();
        watcher.position.addScaledVector(delta, dt * 0.48);
      }

      watcher.rotation.y = Math.atan2(
        camera.position.x - watcher.position.x,
        camera.position.z - watcher.position.z,
      );

      if (dist < 12) {
        sanity -= dt * 1.9;
      } else {
        sanity -= dt * 0.05;
      }
    }

    function updateLights(now: number) {
      const seconds = Math.floor(now / 1000);

      for (const [key, chunk] of chunks) {
        const seed = chunk.flickerSeed + seconds;
        if (Math.abs(Math.sin(seed * 0.13)) > 0.965) {
          const intensity = 0.4 + Math.max(0, Math.sin(now * 0.023 + seed)) * 1.8;
          for (const light of chunk.lights) {
            light.intensity = intensity;
          }
        } else {
          for (const light of chunk.lights) {
            light.intensity = 2.15;
          }
        }

        const emissiveMeshes: THREE.Mesh[] = [];
        chunk.group.traverse((object) => {
          if (
            object instanceof THREE.Mesh &&
            object.material instanceof THREE.MeshStandardMaterial &&
            object.material.emissiveIntensity > 2
          ) {
            emissiveMeshes.push(object);
          }
        });

        for (const mesh of emissiveMeshes) {
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity =
            3.4 + Math.max(0, Math.sin(now * 0.02 + chunk.flickerSeed)) * 1.4;
        }

        void key;
      }
    }

    function animate() {
      if (!running) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      if (!paused && !dead) {
        elapsed += dt;

        const movement = getMovement();
        const wantsSprint =
          keys.ShiftLeft ||
          keys.ShiftRight ||
          (mobile.forward && (keys.ShiftLeft || keys.ShiftRight));

        const canSprint = stamina > 3;
        const sprinting = wantsSprint && movement.lengthSq() > 0 && canSprint;
        const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

        if (movement.lengthSq() > 0) {
          const sin = Math.sin(yaw);
          const cos = Math.cos(yaw);
          const worldX = movement.x * cos + movement.z * sin;
          const worldZ = -movement.x * sin + movement.z * cos;

          const oldX = camera.position.x;
          const oldZ = camera.position.z;

          const nextX = oldX + worldX * speed * dt;
          const nextZ = oldZ + worldZ * speed * dt;

          const currentCx = Math.floor(oldX / CHUNK_SIZE + 0.5);
          const currentCz = Math.floor(oldZ / CHUNK_SIZE + 0.5);
          const nearbyWalls: WallData[] = [];

          for (let dz = -1; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const chunk = chunks.get(
                makeKey(currentCx + dx, currentCz + dz),
              );
              if (chunk) nearbyWalls.push(...chunk.walls);
            }
          }

          if (!collides(nextX, oldZ, nearbyWalls)) {
            camera.position.x = nextX;
          }
          if (!collides(camera.position.x, nextZ, nearbyWalls)) {
            camera.position.z = nextZ;
          }

          distance += speed * dt;

          if (sprinting) {
            stamina = Math.max(0, stamina - dt * 22);
          } else {
            stamina = Math.min(100, stamina + dt * 13);
          }
        } else {
          stamina = Math.min(100, stamina + dt * 16);
        }

        const targetY = PLAYER_HEIGHT + Math.sin(elapsed * 5.7) * 0.018;
        camera.position.y = THREE.MathUtils.lerp(
          camera.position.y,
          targetY,
          1 - Math.pow(0.001, dt),
        );
        camera.rotation.set(pitch, yaw, 0);

        ensureChunks(camera.position.x, camera.position.z);

        const sector = Math.floor(
          Math.hypot(camera.position.x, camera.position.z) / 30,
        );

        if (flashlight.enabled) {
          flashlight.battery = Math.max(0, flashlight.battery - dt * 0.7);
          handLamp.intensity =
            flashlight.battery > 2 ? 4.1 : 0.0;
          if (flashlight.battery <= 2) flashlight.enabled = false;
        } else {
          flashlight.battery = Math.min(100, flashlight.battery + dt * 0.02);
        }

        const sectorCenterX = Math.floor(camera.position.x / CHUNK_SIZE + 0.5);
        const sectorCenterZ = Math.floor(camera.position.z / CHUNK_SIZE + 0.5);
        const lightDistance =
          Math.min(
            ...[
              sectorCenterX - 0,
              sectorCenterX + 0.01,
            ].map((value) => Math.abs(value)),
          ) * 0;

        void lightDistance;

        sanity -= dt * (flashlight.enabled ? 0.035 : 0.11);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          if (!watcher && Math.random() > 0.31) spawnWatcher();
          spawnTimer = 42 + Math.random() * 50;
        }

        updateWatcher(dt);
        updateLights(now);

        if (messageTimer > 0) {
          messageTimer -= dt;
        }

        if (messageTimer <= 0 && Math.random() < dt * 0.018) {
          const ambientMessages = [
            "Tu viens de passer devant la même porte.",
            "Les néons viennent de changer de rythme.",
            "Tu entends des pas. Ils ne sont pas derrière toi.",
            "Pendant une seconde, la moquette semblait bleue.",
            "Le couloir est plus long qu’il ne devrait l’être.",
            "Une porte vient de disparaître lorsque tu as regardé ailleurs.",
            "Le silence devient plus profond.",
            "Tu sens un courant d’air sous une porte sans poignée.",
          ];
          setMessage(
            ambientMessages[Math.floor(Math.random() * ambientMessages.length)],
            4.5,
          );
        }

        if (sanity <= 0 || elapsed >= 60 * 60) {
          sanity = Math.max(0, sanity);
          setDead(true);
          if (document.pointerLockElement === canvas) {
            document.exitPointerLock();
          }
        }

        setStats({
          sanity,
          stamina,
          elapsed,
          distance,
          sector,
        });
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    const raf = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      stopAudio();

      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      cleanupTouch.forEach((cleanup) => cleanup());

      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }

      renderer.dispose();
      wallMat.dispose();
      carpetMat.dispose();
      ceilingMat.dispose();
      chunks.clear();
    };
  }, [started]);

  function begin() {
    setPaused(false);
    setDead(false);
    setStarted(true);
  }

  const formatTime = (value: number) => {
    const total = Math.floor(value);
    const minutes = Math.floor(total / 60).toString().padStart(2, "0");
    const seconds = (total % 60).toString().padStart(2, "0");
    return minutes + ":" + seconds;
  };

  return (
    <main className="backrooms">
      <canvas ref={canvasRef} className="gameCanvas" />

      <div className="vignette" />

      <div className="hud">
        <div className="topHud">
          <div className="titleHud">
            <strong>BACKROOMS // LEVEL 0</strong>
            <span>NO CLIP // NO EXIT // KEEP MOVING</span>
          </div>

          <div className="statHud">
            <div className="statLine">
              <span>LUCIDITÉ</span>
              <span>{Math.round(stats.sanity)}%</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: stats.sanity + "%" }} />
            </div>

            <div className="statLine" style={{ marginTop: 8 }}>
              <span>STAMINA</span>
              <span>{Math.round(stats.stamina)}%</span>
            </div>
            <div className="bar">
              <div
                className="fill"
                style={{ width: stats.stamina + "%" }}
              />
            </div>

            <div className="subtle">
              TEMPS {formatTime(stats.elapsed)} · DISTANCE {Math.floor(stats.distance)}m · SECTEUR {stats.sector}
            </div>
          </div>
        </div>

        <div className="centerHud">
          <div className="crosshair" />
        </div>

        <div
          className="eventMessage"
          style={{
            opacity: eventMessage && !dead ? 1 : 0,
            transform:
              messageTimer > 0
                ? "translateX(-50%) translateY(0)"
                : "translateX(-50%) translateY(7px)",
          }}
        >
          {eventMessage}
        </div>

        <div className="bottomHud">
          <div className="helpHud">
            ZQSD / WASD · SHIFT SPRINT · F LAMPE · P PAUSE
            <br />
            Clique pour verrouiller la souris · reste près des néons
          </div>

          <div className="buttonsHud">
            <button
              className="smallButton"
              type="button"
              onClick={() => setPaused(true)}
            >
              Pause
            </button>
            <button
              className="smallButton"
              type="button"
              onClick={() => {
                setStarted(false);
                setDead(false);
                setPaused(false);
              }}
            >
              Quitter
            </button>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 72,
            display: "grid",
            gridTemplateColumns: "repeat(3, 48px)",
            gap: 7,
            pointerEvents: "auto",
          }}
        >
          <span />
          <button className="smallButton" data-move="forward" type="button">↑</button>
          <span />
          <button className="smallButton" data-move="left" type="button">←</button>
          <button className="smallButton" data-move="back" type="button">↓</button>
          <button className="smallButton" data-move="right" type="button">→</button>
        </div>
      </div>

      {!started && (
        <div className="overlay">
          <section className="panel">
            <div className="eyebrow">UNE EXPÉRIENCE PROCÉDURALE 3D</div>
            <h1>BACKROOMS</h1>
            <p>
              Tu as glissé hors du monde. Le niveau paraît banal : moquette
              jaune, murs jaunâtres, néons qui vibrent. Mais le labyrinthe est
              immense, changeant et sans fin apparente.
            </p>
            <button className="enterButton" type="button" onClick={begin}>
              ENTRER DANS LE LEVEL 0
            </button>
            <div className="tips">
              ZQSD / WASD pour marcher · SHIFT pour courir · F pour la lampe
              · P pour mettre en pause.
              <br />
              Le meilleur jeu se joue au casque.
            </div>
          </section>
        </div>
      )}

      {paused && started && !dead && (
        <div className="overlay">
          <section className="panel">
            <div className="eyebrow">PAUSE</div>
            <h1 style={{ fontSize: "clamp(34px, 7vw, 64px)" }}>LE NIVEAU ATTEND.</h1>
            <p>
              Les néons continuent de bourdonner. Rien ne garantit que le
              couloir sera identique lorsque tu reprendras.
            </p>
            <button
              className="enterButton"
              type="button"
              onClick={() => setPaused(false)}
            >
              REPRENDRE
            </button>
          </section>
        </div>
      )}

      {dead && started && (
        <div className="overlay">
          <section className="panel death">
            <div className="eyebrow">SIGNAL PERDU</div>
            <h1>LE LEVEL 0 T’A EU.</h1>
            <p>
              Tu as tenu aussi longtemps que possible. Le niveau est toujours
              là, exactement comme avant.
            </p>
            <div className="finalStats">
              TEMPS {formatTime(stats.elapsed)} · DISTANCE {Math.floor(stats.distance)}m
              <br />
              SECTEUR {stats.sector}
            </div>
            <button
              className="enterButton"
              type="button"
              onClick={() => {
                setStarted(false);
                setDead(false);
                setPaused(false);
                setStats({
                  sanity: 100,
                  stamina: 100,
                  elapsed: 0,
                  distance: 0,
                  sector: 0,
                });
              }}
            >
              RETOUR AU DÉBUT
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
