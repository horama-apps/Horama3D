import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GeneratedModel, ModelBounds, ProductParams, ProductType } from '../types';
import {
  DEFAULT_COLOR,
  KEYCHAIN_HOLE_RADIUS_MM,
  KEYCHAIN_LOOP_OVERLAP_MM,
  KEYCHAIN_LOOP_RADIUS_MM,
  KEYCHAIN_NECK_LENGTH_MM,
  KEYCHAIN_NECK_WIDTH_MM,
  KEYCHAIN_THICKNESS_MM,
} from '../config/constants';

interface Viewer3DProps {
  productType: ProductType;
  params: ProductParams;
  model: GeneratedModel | null;
  showCutPlane?: boolean;
  onModelBoundsChange?: (bounds: ModelBounds | null) => void;
  onMountingHoleMove?: (key: string, u: number, v: number) => void;
}

export function Viewer3D({
  productType,
  params,
  model,
  showCutPlane = false,
  onModelBoundsChange,
  onMountingHoleMove,
}: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [liveBounds, setLiveBounds] = useState<ModelBounds | null>(null);
  const [isMountingSideView, setIsMountingSideView] = useState(false);
  const onMountingHoleMoveRef = useRef(onMountingHoleMove);
  onMountingHoleMoveRef.current = onMountingHoleMove;
  const materialKey =
    productType === 'urn'
      ? `${params.body_color}|${params.lid_color}|${params.text_color}`
      : productType === 'clicker'
        ? `${params.bottom_color}|${params.top_color}`
        : productType;
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    modelRoot: THREE.Group;
    cutPlaneRoot: THREE.Group;
    keychainHoleRoot: THREE.Group;
    mountingHolePreviewRoot: THREE.Group;
    resizeGrid: (bounds: ModelBounds | null) => void;
    setCameraSide: (mountingSide: boolean, bounds: ModelBounds | null) => void;
    frameModel: () => ModelBounds | null;
    cleanup: () => void;
  } | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const host = hostRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f3ee);

    const camera = new THREE.PerspectiveCamera(
      42,
      host.clientWidth / host.clientHeight,
      0.1,
      5000,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(170, -190, 135);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(70, -80, 140);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const grid = new THREE.GridHelper(360, 36, 0x2f8f83, 0xd8d3c8);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.6;
    scene.add(grid);

    const resizeGrid = (bounds: ModelBounds | null) => {
      const requiredSize = bounds
        ? Math.max(360, Math.ceil(Math.max(bounds.width, bounds.depth) * 1.35 / 20) * 20)
        : 360;
      grid.scale.setScalar(requiredSize / 360);
    };

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const cutPlaneRoot = new THREE.Group();
    scene.add(cutPlaneRoot);

    const keychainHoleRoot = new THREE.Group();
    scene.add(keychainHoleRoot);

    const mountingHolePreviewRoot = new THREE.Group();
    scene.add(mountingHolePreviewRoot);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 55);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    let draggedMarker: THREE.Mesh | null = null;
    let draggedPointerId: number | null = null;

    const updatePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
    };

    const getMarkerAtPointer = (event: PointerEvent) => {
      updatePointer(event);
      return raycaster.intersectObjects(mountingHolePreviewRoot.children, false)[0]
        ?.object as THREE.Mesh | undefined;
    };

    const onMarkerPointerDown = (event: PointerEvent) => {
      const marker = getMarkerAtPointer(event);
      if (!marker?.userData.mountingHoleKey) return;
      event.preventDefault();
      event.stopPropagation();
      draggedMarker = marker;
      draggedPointerId = event.pointerId;
      controls.enabled = false;
      dragPlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1),
        marker.position,
      );
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMarkerPointerMove = (event: PointerEvent) => {
      if (!draggedMarker) {
        renderer.domElement.style.cursor = getMarkerAtPointer(event) ? 'grab' : '';
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updatePointer(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      const bounds = draggedMarker.userData.mountingHoleBounds as {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
      draggedMarker.position.x = THREE.MathUtils.clamp(
        dragPoint.x,
        bounds.minX + modelRoot.position.x,
        bounds.maxX + modelRoot.position.x,
      );
      draggedMarker.position.y = THREE.MathUtils.clamp(
        dragPoint.y,
        bounds.minY + modelRoot.position.y,
        bounds.maxY + modelRoot.position.y,
      );
    };

    const finishMarkerDrag = (event: PointerEvent) => {
      if (!draggedMarker) return;
      event.preventDefault();
      event.stopPropagation();
      const marker = draggedMarker;
      const bounds = marker.userData.mountingHoleBounds as {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
      const localX = marker.position.x - modelRoot.position.x;
      const localY = marker.position.y - modelRoot.position.y;
      const u = THREE.MathUtils.clamp(
        (localX - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 0.001),
        0,
        1,
      );
      const v = THREE.MathUtils.clamp(
        (localY - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 0.001),
        0,
        1,
      );
      draggedMarker = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = '';
      if (
        draggedPointerId !== null &&
        renderer.domElement.hasPointerCapture(draggedPointerId)
      ) {
        renderer.domElement.releasePointerCapture(draggedPointerId);
      }
      draggedPointerId = null;
      onMountingHoleMoveRef.current?.(
        String(marker.userData.mountingHoleKey),
        u,
        v,
      );
    };

    renderer.domElement.addEventListener('pointerdown', onMarkerPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onMarkerPointerMove, true);
    renderer.domElement.addEventListener('pointerup', finishMarkerDrag, true);
    renderer.domElement.addEventListener('pointercancel', finishMarkerDrag, true);

    const setCameraSide = (mountingSide: boolean, bounds: ModelBounds | null) => {
      grid.visible = !mountingSide;
      if (!bounds) return;
      const radius = Math.max(bounds.width, bounds.depth, bounds.height) * 1.75 + 35;
      camera.position.set(
        mountingSide ? radius * 0.12 : radius,
        mountingSide ? -radius * 0.18 : -radius * 1.08,
        radius * (mountingSide ? -0.96 : 0.72),
      );
      controls.target.set(0, 0, bounds.height / 2);
      controls.update();
    };

    const frameModel = () => {
      const box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) return null;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      modelRoot.position.sub(new THREE.Vector3(center.x, center.y, box.min.z));
      const radius = Math.max(size.x, size.y, size.z) * 1.75 + 35;
      camera.position.set(radius, -radius * 1.08, radius * 0.72);
      controls.target.set(0, 0, size.z / 2);
      controls.update();
      const bounds = {
        width: size.x,
        depth: size.y,
        height: size.z,
      };
      resizeGrid(bounds);
      return bounds;
    };

    const onResize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      modelRoot,
      cutPlaneRoot,
      keychainHoleRoot,
      mountingHolePreviewRoot,
      resizeGrid,
      setCameraSide,
      frameModel,
      cleanup: () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('pointerdown', onMarkerPointerDown, true);
        renderer.domElement.removeEventListener('pointermove', onMarkerPointerMove, true);
        renderer.domElement.removeEventListener('pointerup', finishMarkerDrag, true);
        renderer.domElement.removeEventListener('pointercancel', finishMarkerDrag, true);
        clearGroup(modelRoot);
        clearGroup(cutPlaneRoot);
        clearGroup(keychainHoleRoot);
        clearGroup(mountingHolePreviewRoot);
        controls.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    return () => sceneRef.current?.cleanup();
  }, []);

  useEffect(() => {
    const shouldShowMountingSide =
      productType === 'signs' &&
      model?.source === 'local' &&
      Boolean(params.mounting_holes);
    setIsMountingSideView(shouldShowMountingSide);
  }, [model, params.mounting_holes, productType]);

  useEffect(() => {
    sceneRef.current?.setCameraSide(isMountingSideView, liveBounds);
  }, [isMountingSideView, liveBounds]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;
    clearGroup(context.mountingHolePreviewRoot);
    if (!isMountingSideView || !model?.metadata?.mountingHoles) return;

    model.metadata.mountingHoles.forEach((hole) => {
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(hole.radius * 1.42, 36),
        new THREE.MeshBasicMaterial({
          color: 0xd94c43,
          opacity: 0.2,
          transparent: true,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(hole.radius * 0.72, hole.radius * 1.08, 36),
        new THREE.MeshBasicMaterial({
          color: 0xd94c43,
          opacity: 0.95,
          transparent: true,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.z = -0.01;
      ring.renderOrder = 21;
      marker.add(ring);
      marker.position.set(
        hole.x + context.modelRoot.position.x,
        hole.y + context.modelRoot.position.y,
        context.modelRoot.position.z - 0.08,
      );
      marker.userData.mountingHoleKey = hole.key;
      marker.userData.mountingHoleBounds = hole.bounds;
      marker.renderOrder = 20;
      context.mountingHolePreviewRoot.add(marker);
    });
  }, [isMountingSideView, liveBounds, model]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;

    clearGroup(context.modelRoot);
    clearGroup(context.keychainHoleRoot);
    setLiveBounds(null);
    onModelBoundsChange?.(null);
    context.resizeGrid(null);
    context.modelRoot.position.set(0, 0, 0);

    if (!model || model.source === 'empty') {
      return;
    }

    if (model.previewFiles && model.previewFiles.length > 0) {
      const loader = new STLLoader();
      let loadedCount = 0;
      const expectedCount = model.previewFiles.length;

      model.previewFiles.forEach((previewFile) => {
        loader.load(previewFile.url, (geometry) => {
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geometry,
            createModelMaterial(productType, model.source, params, getPreviewRole(previewFile.role, previewFile.object)),
          );
          mesh.name = previewFile.object ?? previewFile.role;
          context.modelRoot.add(mesh);
          loadedCount += 1;
          if (loadedCount === expectedCount) {
            const bounds = context.frameModel();
            setLiveBounds(bounds);
            onModelBoundsChange?.(bounds);
          }
        });
      });
      return;
    }

    const modelUrl = model.modelUrl ?? model.downloadUrl;
    if (!modelUrl) {
      return;
    }

    if (model.format === 'glb') {
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        clearGroup(context.modelRoot);
        applyNamedMaterials(gltf.scene, productType, params, model.source);
        context.modelRoot.add(gltf.scene);
        const bounds = context.frameModel();
        setLiveBounds(bounds);
        onModelBoundsChange?.(bounds);
      });
      return;
    }

    const loader = new STLLoader();
    loader.load(modelUrl, (geometry) => {
      clearGroup(context.modelRoot);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        createModelMaterial(productType, model.source, params),
      );
      context.modelRoot.add(mesh);
      const bounds = context.frameModel();
      setLiveBounds(bounds);
      onModelBoundsChange?.(bounds);
    });
  }, [model, onModelBoundsChange, productType]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;
    applyNamedMaterials(context.modelRoot, productType, params, model?.source ?? 'empty');
  }, [materialKey, model?.source, productType]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;

    clearGroup(context.cutPlaneRoot);
    const bounds = liveBounds;
    const cutHeight = Number(params.cut_height_mm);
    const shouldShowPlane =
      showCutPlane &&
      productType === 'clicker' &&
      model?.source === 'upload' &&
      bounds &&
      Number.isFinite(cutHeight);

    if (!shouldShowPlane) return;

    const planeSize = Math.max(bounds.width, bounds.depth) * 1.18;
    const plane = createCutPlane(planeSize);
    plane.position.z = THREE.MathUtils.clamp(cutHeight, 0, bounds.height);
    context.cutPlaneRoot.add(plane);
  }, [liveBounds, model?.source, params.cut_height_mm, productType, showCutPlane]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;

    clearGroup(context.keychainHoleRoot);
    const bounds = liveBounds;
    const angleDeg = Number(params.keychain_hole_angle_deg);
    const shouldShowHole =
      productType === 'clicker' &&
      model?.source === 'api' &&
      Boolean(params.keychain_hole) &&
      bounds &&
      Number.isFinite(angleDeg);

    if (!shouldShowHole) return;

    const placement = getKeychainPlacement(params.keychain_hole_placement);
    const target = getKeychainTarget(context.modelRoot, placement, angleDeg);
    if (!target) return;

    const color =
      placement === 'top'
        ? getColorParam(params.top_color, DEFAULT_COLOR)
        : getColorParam(params.bottom_color, DEFAULT_COLOR);
    const inset = Math.max(0, Number(params.keychain_hole_inset_mm) || 0);
    const tab = createKeychainTab(target, angleDeg, inset, color);
    context.keychainHoleRoot.add(tab);
  }, [
    liveBounds,
    model?.source,
    params.bottom_color,
    params.keychain_hole,
    params.keychain_hole_angle_deg,
    params.keychain_hole_inset_mm,
    params.keychain_hole_placement,
    params.top_color,
    productType,
  ]);

  const canInspectMountingSide =
    productType === 'signs' &&
    model?.source === 'local' &&
    Boolean(params.mounting_holes);

  return (
    <div className="viewer" ref={hostRef}>
      {canInspectMountingSide && (
        <button
          type="button"
          className="mounting-view-toggle"
          onClick={() => setIsMountingSideView((current) => !current)}
        >
          {isMountingSideView ? 'View front' : 'View mounting side'}
        </button>
      )}
    </div>
  );
}

function createCutPlane(size: number): THREE.Group {
  const group = new THREE.Group();

  const geometry = new THREE.PlaneGeometry(size, size);
  const fill = new THREE.MeshBasicMaterial({
    color: 0xff7a1a,
    opacity: 0.24,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, fill);
  mesh.renderOrder = 4;
  group.add(mesh);

  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.9,
    }),
  );
  edges.renderOrder = 5;
  group.add(edges);

  return group;
}

type KeychainPlacement = 'bottom' | 'top';

interface KeychainTarget {
  bounds: THREE.Box3;
  center: THREE.Vector3;
  placement: KeychainPlacement;
  supportDistance?: number;
  z: number;
}

interface KeychainMeshCandidate {
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
  score: number;
}

function createKeychainTab(
  target: KeychainTarget,
  angleDeg: number,
  inset: number,
  color: THREE.ColorRepresentation,
): THREE.Group {
  const group = new THREE.Group();
  const angle = THREE.MathUtils.degToRad(angleDeg);
  const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
  const loopCenter =
    target.placement === 'top'
      ? target.center.clone()
      : target.center
          .clone()
          .add(
            direction
              .clone()
                  .multiplyScalar(
                    (target.supportDistance ?? 0) +
                  KEYCHAIN_LOOP_RADIUS_MM -
                  KEYCHAIN_LOOP_OVERLAP_MM -
                  inset,
              ),
          );
  loopCenter.z = target.placement === 'top' ? target.z - inset : target.z;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.04,
  });

  const keychain = new THREE.Mesh(
    new THREE.ExtrudeGeometry(createKeychainShape(), {
      depth: KEYCHAIN_THICKNESS_MM,
      bevelEnabled: false,
      curveSegments: 64,
      steps: 1,
    }),
    material,
  );
  keychain.position.copy(loopCenter);
  if (target.placement === 'top') {
    keychain.rotation.x = Math.PI / 2;
    keychain.position.z += KEYCHAIN_LOOP_RADIUS_MM;
  }
  if (target.placement === 'bottom') {
    keychain.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.clone().negate());
  }
  keychain.renderOrder = 7;
  group.add(keychain);

  return group;
}

function createKeychainShape(): THREE.Shape {
  const halfNeckWidth = KEYCHAIN_NECK_WIDTH_MM / 2;
  const neckJoinY = -Math.sqrt(Math.max(0, KEYCHAIN_LOOP_RADIUS_MM ** 2 - halfNeckWidth ** 2));
  const rightJoinAngle = Math.atan2(neckJoinY, halfNeckWidth);
  const leftJoinAngle = Math.atan2(neckJoinY, -halfNeckWidth);
  const shape = new THREE.Shape();
  shape.moveTo(halfNeckWidth, neckJoinY);
  shape.absarc(0, 0, KEYCHAIN_LOOP_RADIUS_MM, rightJoinAngle, leftJoinAngle, false);
  shape.lineTo(-halfNeckWidth, -KEYCHAIN_LOOP_RADIUS_MM - KEYCHAIN_NECK_LENGTH_MM);
  shape.lineTo(halfNeckWidth, -KEYCHAIN_LOOP_RADIUS_MM - KEYCHAIN_NECK_LENGTH_MM);
  shape.lineTo(halfNeckWidth, neckJoinY);

  const holePath = new THREE.Path();
  holePath.absarc(0, 0, KEYCHAIN_HOLE_RADIUS_MM, 0, Math.PI * 2, true);
  shape.holes.push(holePath);
  return shape;
}

function getKeychainTarget(
  root: THREE.Group,
  placement: KeychainPlacement,
  angleDeg: number,
): KeychainTarget | null {
  const direction = new THREE.Vector3(
    Math.cos(THREE.MathUtils.degToRad(angleDeg)),
    Math.sin(THREE.MathUtils.degToRad(angleDeg)),
    0,
  ).normalize();
  const candidates: KeychainMeshCandidate[] = [];

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (placement === 'bottom' && getObjectRole(node) !== 'body') return;
    const meshBox = new THREE.Box3().setFromObject(node);
    if (meshBox.isEmpty()) return;
    const score =
      placement === 'top'
        ? meshBox.max.z
        : meshBox.getCenter(new THREE.Vector3()).z;
    candidates.push({ mesh: node, bounds: meshBox, score });
  });

  const selected = candidates.sort((a, b) =>
    placement === 'top' ? b.score - a.score : a.score - b.score,
  )[0];
  if (!selected) return null;

  const slice = getMeshSliceMetrics(
    selected.mesh,
    selected.bounds,
    direction,
    placement,
  );
  return {
    bounds: selected.bounds,
    center: slice.center,
    placement,
    supportDistance: slice.supportDistance,
    z: placement === 'top' ? selected.bounds.max.z : selected.bounds.min.z,
  };
}

function getMeshSliceMetrics(
  mesh: THREE.Mesh,
  bounds: THREE.Box3,
  direction: THREE.Vector3,
  placement: KeychainPlacement,
): { center: THREE.Vector3; supportDistance: number } {
  const position = mesh.geometry.getAttribute('position');
  const fallbackCenter = bounds.getCenter(new THREE.Vector3());
  if (!position) {
    return {
      center: fallbackCenter,
      supportDistance: getBoundsSupportDistance(bounds, fallbackCenter, direction),
    };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const planeZ = placement === 'top' ? bounds.max.z : bounds.min.z;
  const tolerance = Math.max(size.z * 0.04, 0.6);
  const vertices: THREE.Vector3[] = [];
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex
      .fromBufferAttribute(position, index)
      .applyMatrix4(mesh.matrixWorld);
    const isOnSlice =
      placement === 'top'
        ? vertex.z >= planeZ - tolerance
        : vertex.z <= planeZ + tolerance;
    if (isOnSlice) vertices.push(vertex.clone());
  }

  const sliceBounds = getVerticesBounds(vertices);
  const center = sliceBounds?.getCenter(new THREE.Vector3()) ?? fallbackCenter;
  const supportDistance = vertices.reduce(
    (maxDistance, item) => Math.max(maxDistance, item.clone().sub(center).dot(direction)),
    Number.NEGATIVE_INFINITY,
  );

  return {
    center,
    supportDistance: Number.isFinite(supportDistance)
      ? supportDistance
      : getBoundsSupportDistance(bounds, center, direction),
  };
}

function getVerticesBounds(vertices: THREE.Vector3[]): THREE.Box3 | null {
  if (vertices.length === 0) return null;
  const box = new THREE.Box3();
  vertices.forEach((vertex) => box.expandByPoint(vertex));
  return box;
}

function getBoundsSupportDistance(
  bounds: THREE.Box3,
  center: THREE.Vector3,
  direction: THREE.Vector3,
): number {
  const size = bounds.getSize(new THREE.Vector3());
  const halfWidth = Math.max(size.x / 2, 0.001);
  const halfDepth = Math.max(size.y / 2, 0.001);
  return Math.min(
    Math.abs(direction.x) > 0.0001 ? halfWidth / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
    Math.abs(direction.y) > 0.0001 ? halfDepth / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
  );
}

function getKeychainPlacement(value: ProductParams[string] | undefined): KeychainPlacement {
  return value === 'top' ? 'top' : 'bottom';
}

function createModelMaterial(
  productType: ProductType,
  source: GeneratedModel['source'],
  params: ProductParams,
  role: PreviewRole = 'body',
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: getMaterialColor(productType, source, params, role),
    roughness: role === 'text' ? 0.48 : 0.55,
    metalness: 0.04,
    flatShading: productType === 'signs' && params.texture !== 'none',
  });
}

function getMaterialColor(
  productType: ProductType,
  source: GeneratedModel['source'],
  params: ProductParams,
  role: PreviewRole,
): THREE.ColorRepresentation {
  if (source === 'upload') return getBaseModelColor(productType, source);
  if (productType === 'clicker') {
    if (role === 'lid') return getColorParam(params.top_color, DEFAULT_COLOR);
    if (role === 'body') return getColorParam(params.bottom_color, DEFAULT_COLOR);
    return getBaseModelColor(productType, source);
  }
  if (productType !== 'urn') return getBaseModelColor(productType, source);
  if (role === 'text') return getColorParam(params.text_color, '#232629');
  if (role === 'lid') return getColorParam(params.lid_color, DEFAULT_COLOR);
  if (role === 'body') return getColorParam(params.body_color, DEFAULT_COLOR);
  return getBaseModelColor(productType, source);
}

function getColorParam(value: ProductParams[string] | undefined, fallback: string): THREE.Color {
  return new THREE.Color(typeof value === 'string' && value.trim() ? value : fallback);
}

function getBaseModelColor(productType: ProductType, source: GeneratedModel['source']): THREE.ColorRepresentation {
  if (source === 'upload') return 0x7f8d92;
  return DEFAULT_COLOR;
}

function applyNamedMaterials(
  root: THREE.Object3D,
  productType: ProductType,
  params: ProductParams,
  source: GeneratedModel['source'],
) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const role = getObjectRole(node);
    node.material = createModelMaterial(productType, source, params, role);
  });
}

type PreviewRole = 'body' | 'lid' | 'text' | 'detail' | 'support' | 'texture';

function getObjectRole(node: THREE.Object3D): PreviewRole {
  const name = getObjectNamePath(node).toLowerCase();
  if (/(^|[^a-z0-9])(text|label|letter|letters|engraving|inscription)([^a-z0-9]|$)/.test(name)) {
    return 'text';
  }
  if (/(^|[^a-z0-9])(lid|top)([^a-z0-9]|$)/.test(name)) return 'lid';
  return 'body';
}

function getPreviewRole(role: string, object?: string): PreviewRole {
  const normalized = `${role} ${object ?? ''}`.toLowerCase();
  if (/(^|[^a-z0-9])(text|label|letter|letters|engraving|inscription)([^a-z0-9]|$)/.test(normalized)) {
    return 'text';
  }
  if (/(^|[^a-z0-9])(lid|top|cap|cover)([^a-z0-9]|$)/.test(normalized)) return 'lid';
  if (/(^|[^a-z0-9])detail([^a-z0-9]|$)/.test(normalized)) return 'detail';
  if (/(^|[^a-z0-9])support([^a-z0-9]|$)/.test(normalized)) return 'support';
  if (/(^|[^a-z0-9])texture([^a-z0-9]|$)/.test(normalized)) return 'texture';
  return 'body';
}

function getObjectNamePath(node: THREE.Object3D): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current) {
    if (current.name) names.push(current.name);
    current = current.parent;
  }
  return names.join(' ');
}

function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      } else if (node instanceof THREE.LineSegments || node instanceof THREE.Line) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}
