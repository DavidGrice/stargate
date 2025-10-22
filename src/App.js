import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import LoadingModal from './components/LoadingModal/LoadingModal';
import dhd from './assets/dhd.glb';
import stargate from './assets/stargate.glb';
import './App.css';


function App() {
  const mountRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
 
  const [loadingStatus, setLoadingStatus] = useState('Initializing Scene...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const hasTransitioned = useRef(false);
  const [, setSelectedGlyphs] = useState([]);
  const selectedGlyphsRef = useRef([]);
  const dialerMeshRef = useRef(null);
  const ringMatRef = useRef(null);
  const ringLockRef = useRef(null);
  const ringLockPoiRef = useRef(null);
  const ringLockBaseAngleRef = useRef(null);
  const stargateGlyphBaseAnglesRef = useRef(new Map());
  const isProcessingRef = useRef(false);
  const rotationLockRef = useRef(false);
  // Rotation configuration: tune these values to slow down/lengthen the visual sequence
  const rotationConfigRef = useRef({
    durationMs: 2200, // per-rotation animation duration
    postRotationPauseMs: 700, // pause after rotation before sampling
    alignmentTimeoutMs: 2500, // waitForAlignment timeout
    alignmentDistanceThreshold: 0.25, // distance threshold to consider aligned
    betweenRotatePauseMs: 400, // short pause between sequential rotations
		strategy: 'shortest', // 'shortest'
		postSequenceHoldMs: 1200, // keep DHD lights and dialer lit after full sequence
  });
  // When using 'alternate' strategy, flip direction each rotation starting with left (true)
  // alternate strategy removed - always use computed shortest delta
  // Expose runtime helpers for quick tuning from the devtools console
  try {
    // eslint-disable-next-line no-undef
    window.getRotationConfig = () => rotationConfigRef.current;
    // eslint-disable-next-line no-undef
    window.setRotationConfig = (patch) => {
      rotationConfigRef.current = { ...(rotationConfigRef.current || {}), ...(patch || {}) };
      console.log('rotationConfig updated', rotationConfigRef.current);
      return rotationConfigRef.current;
    };
  } catch (e) {
    // ignore in non-browser environments
  }
 
  useEffect(() => {
    if (!mountRef.current) {
      console.error('mountRef.current is null');
      return;
    }
    // Copy mountRef.current to a local variable so the cleanup uses the same node
    const mountNode = mountRef.current;
    // Step 1: Initialize Scene
    setLoadingStatus('Initializing Scene...');
    setLoadingProgress(25);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
	mountNode.appendChild(renderer.domElement);
		// Resize handling: listen for window resizes and observe the mount node (handles devtools split panes)
		let resizeObserver = null;
		window.addEventListener('resize', handleResize);
		try {
			resizeObserver = new ResizeObserver(() => handleResize());
			resizeObserver.observe(mountNode);
		} catch (e) {
			// ResizeObserver not available; fallback to window resize only
		}
		// Ensure initial sizing
		handleResize();
  // Sky background (ensure visible even if mesh rendering order changes)
  // darker yellow as requested
  scene.background = new THREE.Color(0xE0C000);
  // Optional skybox mesh (kept for compatibility)
  const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
  const skyboxMaterial = new THREE.MeshBasicMaterial({ color: 0xE0C000, side: THREE.BackSide });
    const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
    skybox.visible = true;
    scene.add(skybox);
  // Ground plane (light brown requested)
  const planeGeometry = new THREE.PlaneGeometry(50, 50);
  const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xA0522D });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.visible = true;
    scene.add(plane);
    // World lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    // Event handlers
		function handleResize() {
			try {
				// Prefer the mount node's actual layout size (handles devtools/resizable panes)
				const rect = mountNode.getBoundingClientRect();
				const width = rect.width || window.innerWidth;
				const height = rect.height || window.innerHeight;
				camera.aspect = width / Math.max(1, height);
				camera.updateProjectionMatrix();
				// Use integer pixel sizes to avoid sub-pixel canvas issues
				renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), false);
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			} catch (e) {
				console.warn('handleResize failed', e);
			}
		}
    // No fallback mouse-drag look. Pointer lock will only be requested on user click.
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      setIsLocked(locked);
      console.log(locked ? 'Pointer locked' : 'Pointer lock exited; click canvas to re-lock', 'isLocked:', locked);
    };
    const handlePointerLockError = () => {
      console.error('Pointer lock error; browser may have denied lock');
    };
  const handleClick = (event) => {
      // Attempt to lock pointer on click (original behaviour). Canvas is focused then pointer lock requested.
      renderer.domElement.focus();
      renderer.domElement.requestPointerLock();
      // Raycast for glyph plate or dialer_button
        const mouse = new THREE.Vector2(0, 0); // Center-screen
	glyphRaycaster.setFromCamera(mouse, camera);
	const intersects = glyphRaycaster.intersectObjects([...Array.from(dhdPlateMeshes.keys()), dialerMeshRef.current].filter(Boolean), true);
        if (intersects.length > 0 && intersects[0].distance <= maxInteractionDistance) {
          const clickedObject = intersects[0].object;
          console.log('handleClick: clickedObject', clickedObject.name || clickedObject.type, 'distance', intersects[0].distance);
					// Handle glyph plate click (prefer DHD plates but fall back to stargate plates)
					if (dhdPlateMeshes.has(clickedObject) || glyphPlateMeshes.has(clickedObject)) {
						if (dhdPlateMeshes.has(clickedObject) && !glyphPlateMeshes.has(clickedObject)) {
							console.log('handleClick: clicked DHD plate:', clickedObject.name);
						} else if (glyphPlateMeshes.has(clickedObject) && !dhdPlateMeshes.has(clickedObject)) {
							console.log('handleClick: clicked stargate plate:', clickedObject.name);
						} else {
							console.log('handleClick: clicked plate present in both maps (unexpected):', clickedObject.name);
						}
            const plateBaseName = clickedObject.name.replace('_plate', '');
            // Try to find the glyph child under the plate using common patterns
            const glyphMesh = clickedObject.children.find(child => child.name === `${plateBaseName}_glyph`) || clickedObject.children.find(child => child.name === plateBaseName) || clickedObject.children.find(child => child.name && child.name.includes('glyph'));
            const edgeMesh = clickedObject.children.find(child => child.name === `${plateBaseName}_edge`) || clickedObject.children.find(child => (child.name || '').endsWith('_edge'));
            if (glyphMesh) {
              console.log('handleClick: glyphMesh found', glyphMesh.name);
              setSelectedGlyphs((prev) => {
                const newQueue = [...prev];
                const index = newQueue.findIndex(g => g === glyphMesh);
                if (index !== -1) {
                  // Deselect glyph
                  newQueue.splice(index, 1);
                  glyphMesh.material.emissive.set(0, 0, 0);
                  glyphMesh.material = glyphMeshes.get(glyphMesh);
                  if (edgeMesh) {
                    edgeMesh.material.emissive.set(0, 0, 0);
                    edgeMesh.material = glyphEdgeMeshes.get(edgeMesh);
                  }
                  // Unhighlight corresponding Stargate glyph
                  // Resolve stargate glyph robustly: try `${plateBaseName}_glyph`, then fallback to older `ring_${...}_glyph` pattern
                  const candidate1 = `${plateBaseName}_glyph`;
                  const candidate2 = `ring_${plateBaseName.replace('glyph_', '')}_glyph`;
                  const stargateGlyph = stargateGlyphByName.get(candidate1) || stargateGlyphByName.get(candidate2);
                  if (stargateGlyph) {
                    const originalMat = stargateGlyphOriginalMaterials.get(stargateGlyph);
                    try { if (originalMat) stargateGlyph.material.emissive.set(0, 0, 0); } catch (_) {}
                    if (originalMat) stargateGlyph.material = originalMat;
                  }
                } else {
                  // Select glyph
                  // Queue cap: if already at 7 glyphs, ignore new selections until the dialer is processed.
                  if (newQueue.length >= 7) {
                    console.log('Glyph queue is full (7). Ignoring additional selection until dialer processed.');
                    // Return the previous queue unchanged
                    return prev;
                  }
                  newQueue.push(glyphMesh);
                  glyphMesh.material = glyphMesh.material.clone();
                  glyphMesh.material.emissive.set(0xADD8E6); // LightBlue highlight
                  if (edgeMesh) {
                    edgeMesh.material = edgeMesh.material.clone();
                    edgeMesh.material.emissive.set(0x87CEFA); // light sky blue
                  }
                  // Highlight corresponding Stargate glyph
                  const candidate1 = `${plateBaseName}_glyph`;
                  const candidate2 = `ring_${plateBaseName.replace('glyph_', '')}_glyph`;
                  const stargateGlyph = stargateGlyphByName.get(candidate1) || stargateGlyphByName.get(candidate2);
                  if (stargateGlyph) {
                    stargateGlyph.material = stargateGlyph.material.clone();
                    stargateGlyph.material.emissive.set(0xADD8E6);
                  }
                }
                console.log('Glyph clicked, selectedGlyphs length:', newQueue.length);
                // Keep ref in sync so long-running loops/closures see the latest selection
                selectedGlyphsRef.current = newQueue;
                return newQueue;
              });
            }
          }
          // Handle dialer_button click: start processing sequence when queue is full
          else if (clickedObject === dialerMeshRef.current && selectedGlyphsRef.current.length === 7) {
            console.log('handleClick: dialer_button clicked and queue full');
            if (!isProcessingRef.current) {
              console.log('dialer pressed: starting processing sequence');
              // Run sequence (exposed on window)
              if (window.processQueueSequence) {
                window.processQueueSequence();
              }
            } else {
              console.log('Processing already in progress');
            }
          }
        }
      // }
    };
    const onKeyDown = (event) => {
      switch (event.code) {
        case 'KeyW':
          moveForward = true;
          break;
        case 'KeyS':
          moveBackward = true;
          break;
        case 'KeyA':
          moveLeft = true;
          break;
        case 'KeyD':
          moveRight = true;
          break;
        case 'KeySpace':
          if (canJump) jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveDown = true;
          break;
        default:
          break;
      }
    };
    const onKeyUp = (event) => {
      switch (event.code) {
        case 'KeyW':
          moveForward = false;
          break;
        case 'KeyS':
          moveBackward = false;
          break;
        case 'KeyA':
          moveLeft = false;
          break;
        case 'KeyD':
          moveRight = false;
          break;
        case 'KeySpace':
          jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          moveDown = false;
          break;
        default:
          break;
      }
    };
    // Movement and control variables
    let controls, moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, moveDown = false, jump = false, canJump = true;
    const baseHeight = 1;
    const jumpStrength = 2;
    const models = { dhd: null, stargate: null };
	const glyphPlateMeshes = new Map();
	// Separate map for DHD plate meshes (we only want to interact with DHD plates)
	const dhdPlateMeshes = new Map();
  const glyphMeshes = new Map();
  const glyphEdgeMeshes = new Map();
  // Debug markers to visualize lock and sampled glyph points
  let debugLockMarker = null;
  let debugGlyphMarker = null;
  // Separate maps for stargate glyph lookup and original material storage
  const stargateGlyphByName = new Map(); // name -> mesh
  const stargateGlyphOriginalMaterials = new Map(); // mesh -> original material
  // Map plate base name (without _plate/_glyph prefix) -> stargate glyph mesh
  const stargatePlateBaseToGlyph = new Map();
  // Map plate base name -> author-placed poi (if exists)
  const stargatePlateBaseToPoi = new Map();
    const glyphRaycaster = new THREE.Raycaster();
    const maxInteractionDistance = 30; // Increased for large translations
    let currentHoveredGlyph = null;
    let currentHoveredEdge = null;
    let dhdBoundingSphere = null;
    // Step 2: Load Models
    const loadModel = (url, key) => {
      return new Promise((resolve, reject) => {
        console.log(`Starting to load ${key} from ${url}`);
        const loader = new GLTFLoader();
        loader.load(url,
          (gltf) => {
            try {
              console.log(`Successfully loaded ${key}`);
              // traverse scene and register nodes
              gltf.scene.traverse((child) => {
                if (key === 'stargate') {
                  if (child.name === 'Ring_Mat') {
                    ringMatRef.current = child;
                    console.log('Registered Ring_Mat (non-mesh) during traverse');
                  }
                  if (child.name === 'ring_lock_4') {
                    ringLockRef.current = child;
                    console.log('Registered ring_lock_4 (non-mesh) during traverse');
                  }
                }
                if (child.isMesh) {
                  if (!child.material || child.material.type === 'MeshBasicMaterial') {
                    child.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, roughness: 0.5 });
                    console.warn(`Applied fallback material to ${key} mesh:`, child.name);
                  }
                  // no automatic material override for ring_lock_4 here; we prefer non-destructive handling
                  if (!child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) {
                    console.warn(`Invalid geometry in ${key} mesh:`, child.name);
                  }
                  child.visible = true;
                  // DHD registration
					if (key === 'dhd') {
						if (child.name.startsWith('glyph_') && child.name.endsWith('_plate')) {
							// store original plate material clone, then assign a modified copy to the plate
							const originalPlateMat = child.material.clone();
							// record DHD plate into its own map so we don't touch stargate plates during interaction
							dhdPlateMeshes.set(child, originalPlateMat);
							// use a separate instance for the visible plate so we can tweak transparency/emissive
							const visiblePlateMat = originalPlateMat.clone();
							visiblePlateMat.transparent = true;
							visiblePlateMat.opacity = 0.55;
							// subtle emissive tint so plate glows slightly when lit via emissive color
							try { visiblePlateMat.emissive = visiblePlateMat.emissive || new THREE.Color(0x050505); visiblePlateMat.emissive.setHex(0x050505); } catch(_){}
							visiblePlateMat.needsUpdate = true;
							child.material = visiblePlateMat;
							const glyphChild = child.children.find(c => c.name === child.name.replace('_plate', ''));
							const edgeChild = child.children.find(c => c.name === `${child.name.replace('_plate', '')}_edge`);
							if (glyphChild) { glyphMeshes.set(glyphChild, glyphChild.material.clone()); console.log('Registered DHD glyph plate:', child.name, 'child:', glyphChild.name); }
							if (edgeChild) { glyphEdgeMeshes.set(edgeChild, edgeChild.material.clone()); console.log('Registered DHD glyph edge:', edgeChild.name); }
						}
						if (child.name === 'dialer_button') { dialerMeshRef.current = child; console.log('Registered dialer_button (baked material preserved):', child.name); }
					}
                  // Stargate plates/glyphs
					if (key === 'stargate' && child.name.startsWith('ring_') && child.name.endsWith('_plate')) {
						// store original plate material and assign a slightly transparent visible material
						const originalPlateMat = child.material.clone();
						// record stargate plates in glyphPlateMeshes for internal mapping, but interaction will ignore these
						glyphPlateMeshes.set(child, originalPlateMat);
						const visiblePlateMat = originalPlateMat.clone();
						visiblePlateMat.transparent = true;
						visiblePlateMat.opacity = 0.6;
						try { visiblePlateMat.emissive = visiblePlateMat.emissive || new THREE.Color(0x040404); visiblePlateMat.emissive.setHex(0x040404); } catch(_){}
						visiblePlateMat.needsUpdate = true;
						child.material = visiblePlateMat;
						const baseName = child.name.replace('_plate', '');
						const glyphChild = child.children.find(c => c.name === `${baseName}_glyph`) || child.children.find(c => c.name === baseName);
						const edgeChild = child.children.find(c => c.name === `${baseName}_edge`) || child.children.find(c => c.name === `${baseName}_edge`);
						if (glyphChild) { stargateGlyphByName.set(glyphChild.name, glyphChild); stargateGlyphOriginalMaterials.set(glyphChild, glyphChild.material.clone()); console.log('Registered Stargate plate and glyph:', child.name, glyphChild.name); }
						else { console.log('Registered Stargate plate (no child glyph found yet):', child.name); }
						if (edgeChild) { glyphEdgeMeshes.set(edgeChild, edgeChild.material.clone()); console.log('Registered Stargate plate edge:', edgeChild.name); }
					}
                  if (key === 'stargate' && child.name.startsWith('ring_') && child.name.endsWith('_glyph')) {
                    if (!stargateGlyphByName.has(child.name)) { stargateGlyphByName.set(child.name, child); stargateGlyphOriginalMaterials.set(child, child.material.clone()); console.log('Registered Stargate glyph (direct node):', child.name); }
                  }
                  if (key === 'stargate' && child.name === 'Ring_Mat') { ringMatRef.current = child; console.log('Registered Ring_Mat parent'); }
                  if (key === 'stargate' && child.name === 'ring_lock_4') {
                      ringLockRef.current = child;
                      try {
                        // look for a child named 'ring_lock_4_poi' which Blender authoring may have placed
                        const poi = child.children.find(c => c.name === 'ring_lock_4_poi');
                        if (poi) {
                          ringLockPoiRef.current = poi;
                          console.log('Registered ring_lock_4_poi child for lock sampling');
                        }
                      } catch (e) { console.warn('Failed to inspect ring_lock_4 children', e); }
                    }
                }
              });
              // finalize scene for this glTF and resolve
              gltf.scene.position.set(key === 'dhd' ? -2 : 2, 0, 0);
              if (key === 'dhd') gltf.scene.position.add(new THREE.Vector3(3.043, -2.642, -13.385));
              else if (key === 'stargate') gltf.scene.position.add(new THREE.Vector3(0.372, -2.338, -6.478));
              gltf.scene.scale.set(1, 1, 1);
              gltf.scene.visible = true;
              resolve(gltf.scene);
            } catch (e) {
              console.warn('Error during onLoad traverse:', e);
              reject(e);
            }
          },
          (progress) => {
            const percent = (progress.loaded / progress.total * 100).toFixed(2);
            setLoadingStatus(`Loading ${key}: ${percent}%`);
            setLoadingProgress(25 + (percent / 100) * 25);
          },
          (error) => {
            console.error(`Error loading ${key}:`, error.message, error);
            reject(error);
          }
        );
      });
    };
    // Step 3: Load Models and Setup Camera
    const setupScene = async () => {
      try {
        await Promise.all([
          loadModel(dhd, 'dhd').then((scene) => { models.dhd = scene; }).catch((err) => {
            console.warn('DHD failed to load:', err);
            models.dhd = null;
          }),
          loadModel(stargate, 'stargate').then((scene) => { models.stargate = scene; }).catch((err) => {
            console.warn('Stargate failed to load:', err);
            models.stargate = null;
          }),
        ]);
        // Add models to scene
        if (models.dhd) {
          models.dhd.position.set(4, 0, 3);
          scene.add(models.dhd);
        } else {
          console.warn('DHD model failed to load; skipping');
        }
        if (models.stargate) {
          models.stargate.position.set(2, 2.4, 0);
          scene.add(models.stargate);
          // Ensure the stargate traverses itself to register plate->glyph mappings and angles
          try {
            if (typeof registerStargateSelf === 'function') {
              registerStargateSelf(models.stargate);
            }
          } catch (e) {
            console.warn('registerStargateSelf failed:', e);
          }
        } else {
          console.warn('Stargate model failed to load; skipping');
        }
        // Helper: return a reliable world-space point representing the lock focal point.
        // Preference order: ring_lock_4_poi child (author-placed), bounding-box center of ring_lock_4 mesh, fall back to ring_lock_4 world position
        const getLockWorldPoint = () => {
          const v = new THREE.Vector3();
          if (!ringLockRef.current) return v;
          ringLockRef.current.updateMatrixWorld(true);
          if (ringLockPoiRef.current) {
            try { ringLockPoiRef.current.updateMatrixWorld(true); ringLockPoiRef.current.getWorldPosition(v); return v; } catch (e) {}
          }
          if (ringLockRef.current.isMesh && ringLockRef.current.geometry) {
            try {
              const geo = ringLockRef.current.geometry;
              if (!geo.boundingBox) geo.computeBoundingBox();
              const localCenter = geo.boundingBox.getCenter(new THREE.Vector3());
              const worldCenter = localCenter.clone().applyMatrix4(ringLockRef.current.matrixWorld);
              v.copy(worldCenter);
              return v;
            } catch (e) {}
          }
          try { ringLockRef.current.getWorldPosition(v); } catch (e) {}
          return v;
        };
        // Precompute stable base angles for stargate glyphs and the lock
        function computeStargateBaseAngles() {
          try {
            if (!ringMatRef.current || !ringLockRef.current) return;
            ringMatRef.current.updateMatrixWorld(true);
            // Only set the lock base angle once, so it remains constant regardless of ring rotation
            if (ringLockBaseAngleRef.current === null || typeof ringLockBaseAngleRef.current === 'undefined') {
              const lockWorld = getLockWorldPoint();
              const lockLocal = ringMatRef.current.worldToLocal(lockWorld.clone());
              ringLockBaseAngleRef.current = Math.atan2(lockLocal.x, lockLocal.z);
              console.log('Lock base angle set ONCE:', ringLockBaseAngleRef.current.toFixed(4));
            }
            const map = new Map();
            for (const [name, mesh] of stargateGlyphByName) {
              if (mesh) {
                try {
                  mesh.updateMatrixWorld(true);
                  // If a POI exists for this plate, prefer its world position
                  const base = name.replace(/^(ring_)?/, '').replace(/_glyph$/, '');
                  const poi = stargatePlateBaseToPoi.get(base) || stargatePlateBaseToPoi.get(`${base}_plate`);
                  let worldCenter = new THREE.Vector3();
                  if (poi) {
                    try { poi.updateMatrixWorld(true); poi.getWorldPosition(worldCenter); }
                    catch (_) { /* ignore poi read errors */ }
                  } else if (mesh.geometry) {
                    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                    const localCenter = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
                    worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);
                  } else {
                    mesh.getWorldPosition(worldCenter);
                  }
                  const pl = ringMatRef.current.worldToLocal(worldCenter.clone());
                  const angle = Math.atan2(pl.x, pl.z);
                  map.set(name, angle);
                } catch (e) {
                  // fallback to world position if centroid fails
                  try {
                    mesh.updateMatrixWorld(true);
                    const pw = new THREE.Vector3();
                    mesh.getWorldPosition(pw);
                    const pl = ringMatRef.current.worldToLocal(pw.clone());
                    const angle = Math.atan2(pl.x, pl.z);
                    map.set(name, angle);
                  } catch (ee) {
                    // give up for this mesh
                  }
                }
              }
            }
            stargateGlyphBaseAnglesRef.current = map;
            console.log('Computed stargate glyph base angles, lockBase:', (ringLockBaseAngleRef.current || 0).toFixed(4));
          } catch (e) {
            console.warn('computeStargateBaseAngles failed', e);
          }
        }
        computeStargateBaseAngles();
        // registerStargateSelf is defined earlier (hoisted) and used to build mappings
        // Register stargate by traversing the stargate scene itself to build robust plate->glyph mappings
        function registerStargateSelf(stScene) {
          try {
            if (!stScene) return;
            // traverse the stargate model and ensure glyph/plate mappings are present
            stScene.traverse((child) => {
              if (!child) return;
              // find ring plate nodes and their glyph children
              if (child.isMesh && child.name && child.name.endsWith('_plate')) {
                const baseName = child.name.replace('_plate', '');
                // look for an author-placed POI under the plate
                const poiChild = child.children.find(c => c.name === `${child.name}_poi` || c.name === `${baseName}_plate_poi` || c.name === `${baseName}_poi`);
                if (poiChild) {
                  stargatePlateBaseToPoi.set(baseName, poiChild);
                }
                // try common glyph child names
                const glyphChild = child.children.find(c => c.name === `${baseName}_glyph`) || child.children.find(c => c.name === baseName) || child.children.find(c => c.name && c.name.includes('_glyph'));
                if (glyphChild) {
                  // register mapping from simplified base -> glyph mesh
                  stargatePlateBaseToGlyph.set(baseName, glyphChild);
                  if (!stargateGlyphByName.has(glyphChild.name)) {
                    stargateGlyphByName.set(glyphChild.name, glyphChild);
                    try { stargateGlyphOriginalMaterials.set(glyphChild, glyphChild.material.clone()); } catch (_) {}
                  }
                }
              }
              // also pick up any ring_*_glyph direct nodes
              if (child.isMesh && child.name && child.name.startsWith('ring_') && child.name.endsWith('_glyph')) {
                if (!stargateGlyphByName.has(child.name)) {
                  stargateGlyphByName.set(child.name, child);
                  try { stargateGlyphOriginalMaterials.set(child, child.material.clone()); } catch (_) {}
                }
                const short = child.name.replace(/^ring_/, '');
                stargatePlateBaseToGlyph.set(short, child);
                // check for nearby poi child pattern
                const maybePoi = child.children.find(c => c.name && c.name.endsWith('_poi'));
                if (maybePoi) stargatePlateBaseToPoi.set(short.replace(/_glyph$/, ''), maybePoi);
              }
            });
            // recompute angles now that mappings are registered (prefer POIs when sampling)
            computeStargateBaseAngles();
            console.log('registerStargateSelf: registered', stargatePlateBaseToGlyph.size, 'plate->glyph entries');
          } catch (e) {
            console.warn('registerStargateSelf error', e);
          }
        }
        // Step 4: Setup Camera and Controls
        setLoadingStatus('Setting up camera and controls...');
        setLoadingProgress(75);
        if (models.dhd) {
          const box = new THREE.Box3().setFromObject(models.dhd);
          dhdBoundingSphere = box.getBoundingSphere(new THREE.Sphere());
          dhdBoundingSphere.center.set(-2, 0, 0);
          console.log('DHD Bounding Sphere:', {
            center: dhdBoundingSphere.center,
            radius: dhdBoundingSphere.radius,
          });
        }
        // PointerLockControls
        controls = new PointerLockControls(camera, renderer.domElement);
        renderer.domElement.addEventListener('click', handleClick);
        document.addEventListener('pointerlockchange', handlePointerLockChange);
        document.addEventListener('pointerlockerror', handlePointerLockError);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
  // Auto-focus canvas (do NOT auto-request pointer lock; browsers require a user gesture)
  renderer.domElement.focus();
        // Camera initial position and orientation
        camera.position.set(0, 1, 20);
        // camera.lookAt(0, 0, 0);
        // Helper: safely set dialer emissive color (hex or 0 to reset)
        const setDialerEmissive = (hex) => {
          try {
            if (!dialerMeshRef.current || !dialerMeshRef.current.material) return;
            const mat = dialerMeshRef.current.material;
            if (!('emissive' in mat)) {
              console.warn('Dialer material does not support emissive');
              return;
            }
            if (hex && hex !== 0) {
              // clone to avoid shared-material side effects
              dialerMeshRef.current.material = mat.clone();
              dialerMeshRef.current.material.emissive.set(hex);
              dialerMeshRef.current.material.needsUpdate = true;
              console.log('Dialer emissive set to', hex.toString(16));
            } else {
              dialerMeshRef.current.material.emissive.set(0, 0, 0);
            }
          } catch (e) {
            console.warn('setDialerEmissive failed:', e);
          }
        };
        // Animation loop
        const clock = new THREE.Clock();
        const velocity = new THREE.Vector3();
        const animate = () => {
          requestAnimationFrame(animate);
          const delta = clock.getDelta();
          // Apply jump or downward movement
          velocity.y = 0;
          if (jump && canJump) {
            velocity.y = jumpStrength;
            canJump = false;
          }
          if (moveDown && camera.position.y > baseHeight) {
            velocity.y -= 5 * delta;
          }
          // Apply movement
          velocity.x = 0;
          velocity.z = 0;
          if (moveForward) velocity.z += 5 * delta;
          if (moveBackward) velocity.z -= 5 * delta;
          if (moveLeft) velocity.x -= 5 * delta;
          if (moveRight) velocity.x += 5 * delta;
          controls.moveRight(velocity.x);
          controls.moveForward(velocity.z);
          camera.position.y += velocity.y;
          // Reset canJump when back at base height
          if (camera.position.y <= baseHeight) {
            camera.position.y = baseHeight;
            velocity.y = 0;
            canJump = true;
          }
					// Update dialer_button emission (stay lit when the sequence is processing)
					try {
						if (selectedGlyphsRef.current.length === 7 || isProcessingRef.current) {
							setDialerEmissive(0xff0000);
						} else {
							setDialerEmissive(0);
						}
					} catch (e) {
						// defensive: ignore if refs not yet initialized
					}
          // Raycasting for glyph hover
          if (dhdBoundingSphere) {
            const distanceToDHD = camera.position.distanceTo(dhdBoundingSphere.center);
            if (distanceToDHD <= dhdBoundingSphere.radius + maxInteractionDistance) {
			  glyphRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
			  const intersects = glyphRaycaster.intersectObjects([...Array.from(dhdPlateMeshes.keys()), dialerMeshRef.current].filter(Boolean), true);
							if (currentHoveredGlyph && !selectedGlyphsRef.current.includes(currentHoveredGlyph)) {
								try {
									if (currentHoveredGlyph.material && currentHoveredGlyph.material.emissive) {
										currentHoveredGlyph.material.emissive.set(0, 0, 0);
									}
								} catch (_) {}
								// restore original material if available
								const origMat = glyphMeshes.get(currentHoveredGlyph);
								if (origMat) {
									try { currentHoveredGlyph.material = origMat; } catch (_) {}
								}
								if (currentHoveredEdge) {
									try {
										if (currentHoveredEdge.material && currentHoveredEdge.material.emissive) {
											currentHoveredEdge.material.emissive.set(0, 0, 0);
										}
									} catch (_) {}
									const origEdge = glyphEdgeMeshes.get(currentHoveredEdge);
									if (origEdge) {
										try { currentHoveredEdge.material = origEdge; } catch (_) {}
									}
									currentHoveredEdge = null;
								}
								currentHoveredGlyph = null;
							}
							if (intersects.length > 0 && intersects[0].distance <= maxInteractionDistance) {
								// Resolve plate ancestor in case a child or nested node was hit
								let hit = intersects[0].object;
								let plate = null;
								let tries = 0;
								while (hit && tries < 6) {
									// only consider DHD plates as interactive plates
									if (dhdPlateMeshes.has(hit)) { plate = hit; break; }
									hit = hit.parent;
									tries += 1;
								}
								if (plate) {
									const glyphName = plate.name.replace('_plate', '');
									// prefer explicit child named `${glyphName}` or `${glyphName}_glyph`
									const hoveredGlyph = plate.children.find(c => c.name === `${glyphName}_glyph`) || plate.children.find(c => c.name === glyphName) || plate.children.find(c => c.name && c.name.includes('glyph'));
									const hoveredEdge = plate.children.find(c => c.name === `${glyphName}_edge`) || plate.children.find(c => (c.name || '').endsWith('_edge'));
									if (hoveredGlyph && !selectedGlyphsRef.current.includes(hoveredGlyph) && hoveredGlyph !== currentHoveredGlyph) {
										console.log('Hovering glyph:', hoveredGlyph.name, 'at distance:', intersects[0].distance);
										// Prefer cloning the original stored material to avoid unexpected state
										const storedOrig = glyphMeshes.get(hoveredGlyph);
										let newGlyphMat = null;
										try {
											if (storedOrig && typeof storedOrig.clone === 'function') {
												newGlyphMat = storedOrig.clone();
											} else if (hoveredGlyph.material && typeof hoveredGlyph.material.clone === 'function') {
												newGlyphMat = hoveredGlyph.material.clone();
											}
										} catch (_) { newGlyphMat = null; }
										if (!newGlyphMat) {
											// fallback: try to preserve the hovered glyph's color when possible
											let fallbackColor = 0xaaaaaa;
											try {
												if (hoveredGlyph.material && hoveredGlyph.material.color) fallbackColor = hoveredGlyph.material.color.getHex();
											} catch (_) {}
											newGlyphMat = new THREE.MeshStandardMaterial({ color: fallbackColor });
										}
										try { if (newGlyphMat.emissive) newGlyphMat.emissive.set(0xADD8E6); } catch (_) {}
										try { hoveredGlyph.material = newGlyphMat; } catch (_) {}
										// clone and set emissive on edge if available (with similar fallbacks)
										if (hoveredEdge) {
											const storedEdgeOrig = glyphEdgeMeshes.get(hoveredEdge);
											let newEdgeMat = null;
											try {
												if (storedEdgeOrig && typeof storedEdgeOrig.clone === 'function') {
													newEdgeMat = storedEdgeOrig.clone();
												} else if (hoveredEdge.material && typeof hoveredEdge.material.clone === 'function') {
													newEdgeMat = hoveredEdge.material.clone();
												}
											} catch (_) { newEdgeMat = null; }
											if (!newEdgeMat) {
												let fallbackEdgeColor = 0xaaaaaa;
												try { if (hoveredEdge.material && hoveredEdge.material.color) fallbackEdgeColor = hoveredEdge.material.color.getHex(); } catch (_) {}
												newEdgeMat = new THREE.MeshStandardMaterial({ color: fallbackEdgeColor });
											}
											try { if (newEdgeMat.emissive) newEdgeMat.emissive.set(0x87CEFA); } catch (_) {}
											try { hoveredEdge.material = newEdgeMat; } catch (_) {}
											currentHoveredEdge = hoveredEdge;
										}
										currentHoveredGlyph = hoveredGlyph;
									}
								}
							}
            } else if (currentHoveredGlyph && !selectedGlyphsRef.current.includes(currentHoveredGlyph)) {
              currentHoveredGlyph.material.emissive.set(0, 0, 0);
              currentHoveredGlyph.material = glyphMeshes.get(currentHoveredGlyph);
              if (currentHoveredEdge) {
                currentHoveredEdge.material.emissive.set(0, 0, 0);
                currentHoveredEdge.material = glyphEdgeMeshes.get(currentHoveredEdge);
                currentHoveredEdge = null;
              }
              currentHoveredGlyph = null;
            }
          }
          renderer.render(scene, camera);
        };
        animate();
        // Create debug markers (small spheres) for visualizing lock and glyph sample points
        try {
          // small red marker for lock, very large blue marker for sampled glyph
          const mkGeoSmall = new THREE.SphereGeometry(0.08, 12, 12);
          const mkGeoLarge = new THREE.SphereGeometry(0.09, 16, 16);
          // Make the lock marker clearly visible and blue for debugging
          const lockMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
          const glyphMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, opacity: 0.2, transparent: true });
          debugLockMarker = new THREE.Mesh(mkGeoSmall, lockMat);
          debugGlyphMarker = new THREE.Mesh(mkGeoLarge, glyphMat);
          // Keep glyph marker hidden until used, but show lock marker so its location is always clear
          debugLockMarker.visible = true;
          debugGlyphMarker.visible = false;
          scene.add(debugLockMarker);
          scene.add(debugGlyphMarker);
        } catch (e) {
          console.warn('Failed to create debug markers', e);
        }
          // Rotation helper: rotate Ring_Mat so a target glyph aligns with ring_lock_4
          // Precompute each glyph's local angle relative to Ring_Mat and the lock angle
          // We'll compute glyph and lock angles fresh on each rotation to avoid stale world positions
          const shortestAngle = (from, to) => {
            let delta = to - from;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            return delta;
          };
          const rotateRingToGlyph = (targetGlyphName, durationMs) => {
            return new Promise((resolve, reject) => {
              if (!ringMatRef.current) return reject(new Error('Ring_Mat not found'));
              if (!ringLockRef.current) return reject(new Error('ring_lock_4 not found'));
              const target = stargateGlyphByName.get(targetGlyphName);
              if (!target) return reject(new Error(`Target glyph ${targetGlyphName} not found`));
              if (rotationLockRef.current) return reject(new Error('Already processing rotation'));
              // Compute fresh angles using precomputed base angles when available
              try {
                ringMatRef.current.updateMatrixWorld(true);
                target.updateMatrixWorld(true);
                ringLockRef.current.updateMatrixWorld(true);
                const baseMap = stargateGlyphBaseAnglesRef.current;
                const lockBase = ringLockBaseAngleRef.current;
                let desiredAngle = null;
                // prepare logging/sample variables
                let pTargetWorld = new THREE.Vector3();
                let pTargetLocal = null;
                let glyphAngle = null;
                let pLockWorld = null;
                let pLockLocal = null;
                let lockAngle = null;
                if (baseMap && typeof lockBase === 'number' && baseMap.has(targetGlyphName)) {
                  // Stable precomputed path (angles are ring-local)
                  const glyphBaseAngle = baseMap.get(targetGlyphName);
                  desiredAngle = lockBase - glyphBaseAngle;
                  // compute positions for logging
                  try {
                    target.getWorldPosition(pTargetWorld);
                    pTargetLocal = ringMatRef.current.worldToLocal(pTargetWorld.clone());
                    glyphAngle = Math.atan2(pTargetLocal.x, pTargetLocal.z);
                    pLockWorld = getLockWorldPoint();
                    pLockLocal = ringMatRef.current.worldToLocal(pLockWorld.clone());
                    lockAngle = Math.atan2(pLockLocal.x, pLockLocal.z);
                  } catch (e) {
                    // ignore logging failures
                  }
                }
                // otherwise we'll compute desiredAngle dynamically below
                // Diagnostic: ensure target is a descendant of ringMatRef
                try {
                  let anc = target;
                  const ancestorNames = [];
                  let found = false;
                  while (anc) {
                    ancestorNames.push(anc.name || anc.type || 'Object');
                    if (anc === ringMatRef.current) {
                      found = true;
                      break;
                    }
                    anc = anc.parent;
                  }
                  if (!found) {
                    console.warn('rotateRingToGlyph: target is NOT a descendant of Ring_Mat. Ancestor chain:', ancestorNames.join(' -> '));
                    if (ringMatRef.current && ringMatRef.current.children) {
                      console.warn('rotateRingToGlyph: Ring_Mat children:', ringMatRef.current.children.map(c => c.name));
                    }
                  }
                } catch (diagErr) {
                  console.warn('rotateRingToGlyph: diagnostic failed', diagErr);
                }
                // If desiredAngle wasn't set by precomputed values, compute dynamically from world positions
                if (desiredAngle === null) {
                  // Use worldToLocal which correctly handles parent transforms
                  try {
                    target.getWorldPosition(pTargetWorld);
                    pTargetLocal = ringMatRef.current.worldToLocal(pTargetWorld.clone());
                    glyphAngle = Math.atan2(pTargetLocal.x, pTargetLocal.z);
                    pLockWorld = getLockWorldPoint();
                    pLockLocal = ringMatRef.current.worldToLocal(pLockWorld.clone());
                    lockAngle = Math.atan2(pLockLocal.x, pLockLocal.z);
                    desiredAngle = lockAngle - glyphAngle;
                  } catch (err) {
                    // if dynamic sampling fails, fall back to desiredAngle = currentAngle (no-op)
                    desiredAngle = ringMatRef.current.rotation.y || 0;
                  }
                }
                const currentAngle = ringMatRef.current.rotation.y || 0;
                const delta = shortestAngle(currentAngle, desiredAngle);
                // normalize delta to [-PI,PI]
                const deltaAbs = Math.abs(delta);
                if (deltaAbs < 0.0005) {
                  console.log('rotateRingToGlyph: delta is tiny, skipping animation', { delta: delta.toFixed(6) });
                  // Ensure ring angle matches desiredAngle exactly to avoid drift
                  ringMatRef.current.rotation.y = desiredAngle;
                  // force matrix update and a render so downstream reads see the new transform
                  try {
                    ringMatRef.current.updateMatrixWorld(true);
                    if (typeof renderer !== 'undefined' && renderer && scene && camera) renderer.render(scene, camera);
                  } catch (e) {
                    // ignore
                  }
                  return resolve();
                }
                console.log('rotateRingToGlyph computed fresh', {
                  target: targetGlyphName,
                  pTarget: [pTargetLocal.x.toFixed(3), pTargetLocal.z.toFixed(3)],
                  glyphAngle: glyphAngle.toFixed(4),
                  pLock: [pLockLocal.x.toFixed(3), pLockLocal.z.toFixed(3)],
                  lockAngle: lockAngle.toFixed(4),
                  desiredAngle: desiredAngle.toFixed(4),
                  currentAngle: currentAngle.toFixed(4),
                  delta: delta.toFixed(4),
                });
                // determine duration from config if not explicitly provided
                const cfg = rotationConfigRef.current || {};
                const actualDuration = typeof durationMs === 'number' ? durationMs : (cfg.durationMs || 1600);
                // Always use the computed shortest-path delta
                const appliedDelta = delta;
                rotationLockRef.current = true;
                const start = performance.now();
                const from = currentAngle;
                const to = currentAngle + appliedDelta;
                console.log('rotateRingToGlyph: starting animation', { from: from.toFixed(4), to: to.toFixed(4), durationMs: actualDuration });
                const animateRotate = (now) => {
                  const t = Math.min(1, (now - start) / actualDuration);
                  const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                  ringMatRef.current.rotation.y = from + (to - from) * eased;
                  if (t < 1) {
                    requestAnimationFrame(animateRotate);
                  } else {
                    rotationLockRef.current = false;
                    // ensure world matrices reflect final rotation
                    try {
                      ringMatRef.current.updateMatrixWorld(true);
                      if (typeof renderer !== 'undefined' && renderer && scene && camera) renderer.render(scene, camera);
                    } catch (e) {
                      // ignore
                    }
                    console.log('rotateRingToGlyph: completed animation', { newAngle: ringMatRef.current.rotation.y.toFixed(4) });
                    resolve();
                  }
                };
                requestAnimationFrame(animateRotate);
              } catch (e) {
                rotationLockRef.current = false;
                console.warn('rotateRingToGlyph internal error, resolving to allow sequence to continue', e);
                // Resolve so the sequence can continue instead of halting entirely
                return resolve();
              }
            });
          };
    // Expose for quick console testing
    window.rotateRingToGlyph = rotateRingToGlyph;
          // Hoisted helper to update debug markers (avoid declaring inside loops)
          const updateDebugMarkers = (pTargetWorld, pLockWorld) => {
            try {
              if (debugGlyphMarker && pTargetWorld) {
                debugGlyphMarker.position.copy(pTargetWorld);
                debugGlyphMarker.visible = true;
              }
              if (debugLockMarker && pLockWorld) {
                debugLockMarker.position.copy(pLockWorld);
                debugLockMarker.visible = true;
              }
            } catch (markerErr) {
              // ignore
            }
          };
          // Hoisted adaptive wait: poll glyph vs lock alignment until close or timeout
          const waitForAlignment = async (sampleMesh, glyphNameLocal, timeoutMs = 1500, distanceThreshold = 0.25) => {
            const start = performance.now();
            while (performance.now() - start < timeoutMs) {
              try {
                if (!ringMatRef.current || !ringLockRef.current || !sampleMesh) break;
                ringMatRef.current.updateMatrixWorld(true);
                sampleMesh.updateMatrixWorld(true);
                ringLockRef.current.updateMatrixWorld(true);
                // sample representative glyph point via boundingSphere center when available
                // Prefer POI for sampling when available
                const pTargetWorld = new THREE.Vector3();
                try {
                  const candidateBase = (sampleMesh.name || '').replace(/^ring_/, '').replace(/_glyph$/, '').replace(/_plate$/, '');
                  const poi = stargatePlateBaseToPoi.get(candidateBase) || stargatePlateBaseToPoi.get(`${candidateBase}_plate`);
                  if (poi) {
                    poi.updateMatrixWorld(true);
                    poi.getWorldPosition(pTargetWorld);
                  } else if (sampleMesh.geometry && sampleMesh.geometry.boundingSphere) {
                    const localCenter = sampleMesh.geometry.boundingSphere.center.clone();
                    pTargetWorld.copy(localCenter.applyMatrix4(sampleMesh.matrixWorld));
                  } else {
                    sampleMesh.getWorldPosition(pTargetWorld);
                  }
                } catch (err) {
                  sampleMesh.getWorldPosition(pTargetWorld);
                }
                const pLockWorld = getLockWorldPoint();
                // Update debug markers via hoisted helper
                updateDebugMarkers(pTargetWorld, pLockWorld);
                const dist = pTargetWorld.distanceTo(pLockWorld);
                if (dist <= distanceThreshold) {
                  console.log('waitForAlignment: aligned by distance', { glyph: glyphNameLocal, dist: dist.toFixed(4) });
                  return true;
                }
                // fallback: check angular alignment in ring local space if distance not yet below threshold
                const pTargetLocal = ringMatRef.current.worldToLocal(pTargetWorld.clone());
                const glyphAngle = Math.atan2(pTargetLocal.x, pTargetLocal.z);
                const pLockLocal = ringMatRef.current.worldToLocal(pLockWorld.clone());
                const lockAngle = Math.atan2(pLockLocal.x, pLockLocal.z);
                const diff = Math.abs(shortestAngle(glyphAngle, lockAngle));
                if (diff <= 0.03) {
                  console.log('waitForAlignment: aligned by angle', { glyph: glyphNameLocal, diff: diff.toFixed(4) });
                  return true;
                }
              } catch (err) {
                // ignore and continue until timeout
              }
              // small sleep before next sample
              await new Promise(r => setTimeout(r, 60));
            }
            console.warn('waitForAlignment: timeout without alignment', { glyph: glyphNameLocal });
            // hide debug markers on timeout
            try { if (debugGlyphMarker) debugGlyphMarker.visible = false; if (debugLockMarker) debugLockMarker.visible = false; } catch (_) {}
            return false;
          };
          // Process the selected glyph queue sequentially: rotate then dequeue
          const processQueueSequence = async () => {
            if (isProcessingRef.current) {
              console.warn('Sequence already running');
              return;
            }
            if (!ringMatRef.current) {
              console.warn('Ring_Mat missing');
              return;
            }
					console.log('processQueueSequence: starting, live queue length', selectedGlyphsRef.current.length);
					isProcessingRef.current = true;
						// collect DHD glyphs/edges we should later restore after full sequence hold
						let toRestoreDHD = [];
						try {
							// process the live selectedGlyphsRef queue (dequeue as we go)
							let stepIndex = 0;
							while (selectedGlyphsRef.current.length > 0) {
                const glyphMesh = selectedGlyphsRef.current[0];
                if (!glyphMesh) break;
                // Resolve the stargate glyph target name. glyphMesh.name may be 'ring_xxx_glyph' or 'xxx_glyph' or 'xxx'
                let glyphName = glyphMesh.name;
                if (!glyphName.endsWith('_glyph')) {
                  if (stargateGlyphByName.has(`${glyphName}_glyph`)) {
                    glyphName = `${glyphName}_glyph`;
                  } else if (stargateGlyphByName.has(`ring_${glyphName.replace('glyph_', '')}_glyph`)) {
                    glyphName = `ring_${glyphName.replace('glyph_', '')}_glyph`;
                  }
                }
                console.log('processQueueSequence: processing glyph', glyphName, 'index', stepIndex);
                stepIndex += 1;
                // perform rotation using configured duration
                const cfg = rotationConfigRef.current || {};
                // Refresh stargate base angles so we use the stargate geometry as source-of-truth per-step
                try { computeStargateBaseAngles(); } catch (e) { /* ignore */ }
                // resolve the stargate glyph mesh we'll sample for alignment (fresh each step)
                let stMesh = stargateGlyphByName.get(glyphName) || null;
                if (!stMesh) {
                  // try mapping from plate base name -> glyph
                  const short = glyphName.replace(/^ring_/, '').replace(/_glyph$/, '');
                  stMesh = stargatePlateBaseToGlyph.get(short) || stargatePlateBaseToGlyph.get(`${short}_glyph`) || null;
                  if (!stMesh) {
                    // try alternative candidate names
                    const alt1 = `${glyphName}`;
                    const alt2 = `${glyphName.replace(/^ring_/, '')}`;
                    stMesh = stargateGlyphByName.get(alt1) || stargateGlyphByName.get(alt2) || null;
                  }
                }
                await rotateRingToGlyph(glyphName, cfg.durationMs);
                // Pause to let world/visuals update after rotation
                const postPause = cfg.postRotationPauseMs || 300;
                console.log('processQueueSequence: rotation complete, pausing to let scene/world settle', { postPause });
                await new Promise(r => setTimeout(r, postPause));
                // Force matrixWorld update and a single render to capture visuals
                try {
                  if (ringMatRef.current) ringMatRef.current.updateMatrixWorld(true);
                  // Use the stargate glyph mesh for capture/alignment sampling when available
                  const captureMesh = stMesh || glyphMesh;
                  if (captureMesh) {
                    // also update geometry bounding spheres if present
                    if (captureMesh.geometry && !captureMesh.geometry.boundingSphere) {
                      try { captureMesh.geometry.computeBoundingSphere(); } catch (e) { }
                    }
                    captureMesh.updateMatrixWorld(true);
                  }
                  if (ringLockRef.current) ringLockRef.current.updateMatrixWorld(true);
                  // renderer, scene, camera are in scope; do a forced render to update visuals immediately
                  if (typeof renderer !== 'undefined' && renderer && scene && camera) {
                    renderer.render(scene, camera);
                  }
                  // Capture diagnostic alignment info after rotation
                    try {
                      // Use boundingSphere center for representative world position if available
                      const pTarget = new THREE.Vector3();
                      const sourceMesh = stMesh || glyphMesh;
                      try {
                        if (sourceMesh.geometry && sourceMesh.geometry.boundingSphere) {
                          const localCenter = sourceMesh.geometry.boundingSphere.center.clone();
                          pTarget.copy(localCenter.applyMatrix4(sourceMesh.matrixWorld));
                        } else {
                          sourceMesh.getWorldPosition(pTarget);
                        }
                      } catch (err) {
                        sourceMesh.getWorldPosition(pTarget);
                      }
                      const pTargetLocal = new THREE.Vector3();
                      pTargetLocal.copy(pTarget).applyMatrix4(new THREE.Matrix4().copy(ringMatRef.current.matrixWorld).invert());
                      const glyphAngle = Math.atan2(pTargetLocal.x, pTargetLocal.z);
                      const pLock = getLockWorldPoint();
                      const pLockLocal = pLock.clone().applyMatrix4(new THREE.Matrix4().copy(ringMatRef.current.matrixWorld).invert());
                      const lockAngle = Math.atan2(pLockLocal.x, pLockLocal.z);
                      const currentAngle = ringMatRef.current.rotation.y || 0;
                      console.log('processQueueSequence: post-rotation capture', {
                        glyph: glyphName,
                        glyphAngle: glyphAngle.toFixed(4),
                        lockAngle: lockAngle.toFixed(4),
                        currentAngle: currentAngle.toFixed(4),
                      });
                    } catch (captureErr) {
                      console.warn('processQueueSequence: post-rotation capture failed', captureErr);
                    }
                } catch (e) {
                  console.warn('processQueueSequence: world update/render failed', e);
                }
                  // waitForAlignment and updateDebugMarkers are hoisted above
                  await waitForAlignment(stMesh || glyphMesh, glyphName, (rotationConfigRef.current && rotationConfigRef.current.alignmentTimeoutMs) || 1500, (rotationConfigRef.current && rotationConfigRef.current.alignmentDistanceThreshold) || 0.25);
                  // hide debug markers after each step
                  try { if (debugGlyphMarker) debugGlyphMarker.visible = false; if (debugLockMarker) debugLockMarker.visible = false; } catch (_) {}
								// After alignment (or timeout), dequeue the first selected glyph
								const currentQueue = selectedGlyphsRef.current;
								if (currentQueue.length > 0) {
									const removed = currentQueue.shift();
									console.log('processQueueSequence: dequeued', removed.name, 'remaining', currentQueue.length);
									// Instead of restoring DHD glyphs immediately, collect them for later restoration
									const orig = glyphMeshes.get(removed);
									if (orig) toRestoreDHD.push({ mesh: removed, orig });
									// collect edge if present
									const edge = Array.from(glyphEdgeMeshes.keys()).find(e => e && e.name === `${removed.name}_edge`);
									if (edge) {
										const origEdge = glyphEdgeMeshes.get(edge);
										if (origEdge) toRestoreDHD.push({ mesh: edge, orig: origEdge });
									}
                  // restore stargate glyph material
                  // When restoring the corresponding stargate glyph, try several lookup patterns
                  const removedBase = removed.name.replace('_glyph', '').replace('_plate', '');
                  const stCandidates = [
                    `${removed.name}`,
                    `${removedBase}_glyph`,
                    `ring_${removedBase.replace('glyph_', '')}_glyph`,
                  ];
                  let stMesh = null;
                  for (const c of stCandidates) {
                    if (stargateGlyphByName.has(c)) { stMesh = stargateGlyphByName.get(c); break; }
                  }
                  if (stMesh) {
                    const original = stargateGlyphOriginalMaterials.get(stMesh);
                    if (original) stMesh.material = original;
                  }
                  // sync state ref and react state
                  selectedGlyphsRef.current = currentQueue;
                  setSelectedGlyphs(currentQueue);
                }
                // short pause before next rotation
                const betweenPause = (rotationConfigRef.current && rotationConfigRef.current.betweenRotatePauseMs) || 150;
                await new Promise(r => setTimeout(r, betweenPause));
              }
						} catch (e) {
							console.error('processQueueSequence failed:', e);
						} finally {
							console.log('processing sequence complete; deferring restore for post-sequence hold');
							try {
								// Hold DHD glyph/button emissive for a short time after the full sequence, then restore
								const holdMs = (rotationConfigRef.current && rotationConfigRef.current.postSequenceHoldMs) || 1200;
								setTimeout(() => {
									try {
										// restore collected DHD glyphs/edges (if any)
										if (typeof toRestoreDHD !== 'undefined' && Array.isArray(toRestoreDHD) && toRestoreDHD.length > 0) {
											toRestoreDHD.forEach(({ mesh, orig }) => {
												try { if (mesh && orig) mesh.material = orig; } catch (_) {}
											});
										}
										// reset dialer emissive
										try { setDialerEmissive(0); } catch (_) {}
									} catch (_) {}
									// Now mark processing as finished so animate loop can update accordingly
									try { isProcessingRef.current = false; } catch (_) {}
									console.log('post-sequence restore complete; isProcessing cleared');
								}, holdMs);
							} catch (_) {
								// Ensure we clear processing flag even if scheduling the timeout fails
								try { isProcessingRef.current = false; } catch (_) {}
							}
						}
          };
          window.processQueueSequence = processQueueSequence;
        // Finalize loading
        setLoadingStatus('Scene ready!');
        setLoadingProgress(100);
        // no runtime setRingLockColor helper (we prefer non-destructive handling and an explicit POI child)
        setTimeout(() => {
          if (!hasTransitioned.current) {
            setIsLoading(false);
            hasTransitioned.current = true;
          }
        }, 500);
      } catch (err) {
        console.error('Error setting up scene:', err);
        setLoadingStatus('Error loading models; rendering partial scene');
        setLoadingProgress(100);
        setTimeout(() => {
          if (!hasTransitioned.current) {
            setIsLoading(false);
            hasTransitioned.current = true;
          }
        }, 500);
      }
    };
    // Start loading
    setupScene();
    // Cleanup
		return () => {
			window.removeEventListener('resize', handleResize);
			try {
				if (resizeObserver && typeof resizeObserver.disconnect === 'function') resizeObserver.disconnect();
			} catch (_) {}
      renderer.domElement.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (mountNode && mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      scene.children.forEach((object) => scene.remove(object));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
	return (
		<div className="App">
			{isLoading ? (
				<LoadingModal status={loadingStatus} progress={loadingProgress} />
			) : null}
			{!isLoading && isLocked ? (
				// subtle center aim dot instead of large white bars
				<div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%, -50%)',width:'10px',height:'10px',borderRadius:'50%',background:'rgba(255,255,255,0.7)',zIndex:1000}} />
			) : null}
			<div ref={mountRef} style={{width:'100%',height:'100%'}} />
		</div>
	);
}

export default App;