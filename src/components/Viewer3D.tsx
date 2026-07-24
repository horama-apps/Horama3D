import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  GeneratedModel,
  ModelBounds,
  ModelObjectBounds,
  ProductParams,
  ProductType,
} from '../types';
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
  onModelObjectBoundsChange?: (bounds: ModelObjectBounds[]) => void;
  onMountingHoleMove?: (key: string, u: number, v: number) => void;
  onHeadKeychainAttachmentMove?: (
    kind: 'exterior_ring' | 'integrated_hole',
    firstOffset: number,
    secondOffset: number,
  ) => void;
}

export function Viewer3D({
  productType,
  params,
  model,
  showCutPlane = false,
  onModelBoundsChange,
  onModelObjectBoundsChange,
  onMountingHoleMove,
  onHeadKeychainAttachmentMove,
}: Viewer3DProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [liveBounds, setLiveBounds] = useState<ModelBounds | null>(null);
  const [isMountingSideView, setIsMountingSideView] = useState(false);
  const onMountingHoleMoveRef = useRef(onMountingHoleMove);
  onMountingHoleMoveRef.current = onMountingHoleMove;
  const onHeadKeychainAttachmentMoveRef = useRef(onHeadKeychainAttachmentMove);
  onHeadKeychainAttachmentMoveRef.current = onHeadKeychainAttachmentMove;
  const materialKey =
    productType === 'lamp'
      ? `${params.body_color}|${params.base_color}`
      : productType === 'urn'
      ? `${params.body_color}|${params.lid_color}|${params.text_color}`
      : productType === 'clicker'
        ? `${params.bottom_color}|${params.top_color}`
      : productType === 'bracelet_gems'
          ? String(params.body_color)
        : productType === 'pet_keychains'
          ? `${params.body_color}|${params.text_color}`
        : productType;
  const uploadedStlScale =
    (productType === 'clicker' || productType === 'head_keychains') &&
    model?.source === 'upload'
      ? THREE.MathUtils.clamp(Number(params.stl_scale_percent) || 100, 10, 200) / 100
      : 1;
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
    const draggedStart = new THREE.Vector3();

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
      const hit = raycaster.intersectObjects(
        [...mountingHolePreviewRoot.children, ...keychainHoleRoot.children],
        true,
      )[0]?.object;
      let candidate: THREE.Object3D | null = hit ?? null;
      while (
        candidate &&
        !candidate.userData.mountingHoleKey &&
        !candidate.userData.headAttachmentKind
      ) {
        candidate = candidate.parent;
      }
      return candidate instanceof THREE.Mesh ? candidate : undefined;
    };

    const onMarkerPointerDown = (event: PointerEvent) => {
      const marker = getMarkerAtPointer(event);
      if (
        !marker?.userData.mountingHoleKey &&
        !marker?.userData.headAttachmentKind
      ) return;
      event.preventDefault();
      event.stopPropagation();
      draggedMarker = marker;
      draggedStart.copy(marker.position);
      draggedPointerId = event.pointerId;
      controls.enabled = false;
      dragPlane.setFromNormalAndCoplanarPoint(
        marker.userData.headAttachmentKind === 'integrated_hole'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1),
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
      const attachmentKind = draggedMarker.userData.headAttachmentKind as
        | 'exterior_ring'
        | 'integrated_hole'
        | undefined;
      if (attachmentKind) {
        const bounds = draggedMarker.userData.headAttachmentBounds as {
          minFirst: number;
          maxFirst: number;
          minSecond: number;
          maxSecond: number;
        };
        draggedMarker.position.x = THREE.MathUtils.clamp(
          dragPoint.x,
          bounds.minFirst,
          bounds.maxFirst,
        );
        if (attachmentKind === 'integrated_hole') {
          draggedMarker.position.z = THREE.MathUtils.clamp(
            dragPoint.z,
            bounds.minSecond,
            bounds.maxSecond,
          );
        } else {
          draggedMarker.position.y = THREE.MathUtils.clamp(
            dragPoint.y,
            bounds.minSecond,
            bounds.maxSecond,
          );
        }
        return;
      }
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
      const attachmentKind = marker.userData.headAttachmentKind as
        | 'exterior_ring'
        | 'integrated_hole'
        | undefined;
      if (attachmentKind) {
        const initialOffsets = marker.userData.headAttachmentInitialOffsets as {
          first: number;
          second: number;
        };
        const first = initialOffsets.first + marker.position.x - draggedStart.x;
        const second = initialOffsets.second + (
          attachmentKind === 'integrated_hole'
            ? marker.position.z - draggedStart.z
            : marker.position.y - draggedStart.y
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
        onHeadKeychainAttachmentMoveRef.current?.(
          attachmentKind,
          Math.round(first * 2) / 2,
          Math.round(second * 2) / 2,
        );
        return;
      }
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
      params.sign_mode === 'mounting_holes';
    setIsMountingSideView(shouldShowMountingSide);
  }, [model, params.sign_mode, productType]);

  useEffect(() => {
    sceneRef.current?.setCameraSide(isMountingSideView, liveBounds);
  }, [isMountingSideView, liveBounds]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;
    clearGroup(context.mountingHolePreviewRoot);
    const isPetKeychain = productType === 'pet_keychains';
    if (
      (!isMountingSideView && !isPetKeychain) ||
      !model?.metadata?.mountingHoles
    ) return;

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
        isPetKeychain
          ? context.modelRoot.position.z + (liveBounds?.height ?? 0) + 0.08
          : context.modelRoot.position.z - 0.08,
      );
      marker.userData.mountingHoleKey = hole.key;
      marker.userData.mountingHoleBounds = hole.bounds;
      marker.renderOrder = 20;
      context.mountingHolePreviewRoot.add(marker);
    });
  }, [isMountingSideView, liveBounds, model, productType]);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;

    clearGroup(context.modelRoot);
    clearGroup(context.keychainHoleRoot);
    setLiveBounds(null);
    onModelBoundsChange?.(null);
    onModelObjectBoundsChange?.([]);
    context.resizeGrid(null);
    context.modelRoot.position.set(0, 0, 0);

    if (!model || model.source === 'empty') {
      return;
    }

    if (model.previewFiles && model.previewFiles.length > 0) {
      const loader = new STLLoader();
      let loadedCount = 0;
      const expectedCount = model.previewFiles.length;
      const objectBounds: ModelObjectBounds[] = [];

      model.previewFiles.forEach((previewFile) => {
        loader.load(previewFile.url, (geometry) => {
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geometry,
            createModelMaterial(
              productType,
              model.source,
              params,
              getPreviewRole(previewFile.role, previewFile.object),
              previewFile.color,
            ),
          );
          mesh.name = previewFile.object ?? previewFile.role;
          mesh.userData.previewColor = previewFile.color;
          context.modelRoot.add(mesh);
          objectBounds.push(
            measureObjectBounds(
              mesh,
              previewFile.object ?? previewFile.filename ?? previewFile.role,
            ),
          );
          loadedCount += 1;
          if (loadedCount === expectedCount) {
            const bounds = context.frameModel();
            setLiveBounds(bounds);
            onModelBoundsChange?.(bounds);
            onModelObjectBoundsChange?.(objectBounds);
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
        const objectBounds: ModelObjectBounds[] = [];
        gltf.scene.updateWorldMatrix(true, true);
        gltf.scene.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          objectBounds.push(
            measureObjectBounds(node, node.name || `object-${objectBounds.length + 1}`),
          );
        });
        onModelObjectBoundsChange?.(objectBounds);
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
      mesh.scale.setScalar(uploadedStlScale);
      context.modelRoot.add(mesh);
      const bounds = context.frameModel();
      setLiveBounds(bounds);
      onModelBoundsChange?.(bounds);
      onModelObjectBoundsChange?.([
        measureObjectBounds(mesh, model.name ?? `${productType}-model`),
      ]);
    });
  }, [
    model,
    onModelBoundsChange,
    onModelObjectBoundsChange,
    productType,
    uploadedStlScale,
  ]);

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
      (productType === 'clicker' || productType === 'head_keychains') &&
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
    const isHeadKeychain = productType === 'head_keychains';
    const isIntegratedHeadHole =
      isHeadKeychain && params.head_keychain_attachment === 'integrated_hole';
    const angleDeg = isHeadKeychain ? 0 : Number(params.keychain_hole_angle_deg);
    const shouldShowHole =
      (productType === 'clicker' || isHeadKeychain) &&
      model?.source !== 'empty' &&
      (!isIntegratedHeadHole || model?.source === 'upload') &&
      (isHeadKeychain || model?.source !== 'upload') &&
      (isHeadKeychain || Boolean(params.keychain_hole)) &&
      bounds &&
      Number.isFinite(angleDeg);

    if (!shouldShowHole) return;

    const placement = isHeadKeychain
      ? 'top'
      : getKeychainPlacement(params.keychain_hole_placement);
    const target = getKeychainTarget(context.modelRoot, placement, angleDeg);
    if (!target) return;

    if (isIntegratedHeadHole) {
      const radius = THREE.MathUtils.clamp(
        Number(params.head_hole_diameter_mm) || 3,
        1.5,
        10,
      ) / 2;
      const margin = Math.max(0.6, radius * 0.45);
      const centerX = THREE.MathUtils.clamp(
        target.bounds.getCenter(new THREE.Vector3()).x +
          (Number(params.head_hole_offset_x_mm) || 0),
        target.bounds.min.x + radius + margin,
        target.bounds.max.x - radius - margin,
      );
      const centerZ = THREE.MathUtils.clamp(
        target.bounds.max.z - radius - margin +
          (Number(params.head_hole_offset_z_mm) || 0),
        target.bounds.min.z + radius + margin,
        target.bounds.max.z - radius - margin,
      );
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 1.45, 40),
        new THREE.MeshBasicMaterial({
          color: 0xd94c43,
          opacity: 0.24,
          transparent: true,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.78, radius * 1.08, 40),
        new THREE.MeshBasicMaterial({
          color: 0xd94c43,
          opacity: 0.96,
          transparent: true,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.z = 0.01;
      marker.add(ring);
      marker.rotation.x = Math.PI / 2;
      marker.position.set(centerX, target.bounds.min.y - 0.12, centerZ);
      marker.userData.headAttachmentKind = 'integrated_hole';
      marker.userData.headAttachmentInitialOffsets = {
        first: Number(params.head_hole_offset_x_mm) || 0,
        second: Number(params.head_hole_offset_z_mm) || 0,
      };
      marker.userData.headAttachmentBounds = {
        minFirst: target.bounds.min.x + radius + margin,
        maxFirst: target.bounds.max.x - radius - margin,
        minSecond: target.bounds.min.z + radius + margin,
        maxSecond: target.bounds.max.z - radius - margin,
      };
      marker.renderOrder = 20;
      context.keychainHoleRoot.add(marker);
      return;
    }

    const color =
      placement === 'top'
        ? getColorParam(params.top_color, DEFAULT_COLOR)
        : getColorParam(params.bottom_color, DEFAULT_COLOR);
    const inset = isHeadKeychain
      ? 0
      : Math.max(0, Number(params.keychain_hole_inset_mm) || 0);
    const tab = createKeychainTab(
      target,
      angleDeg,
      inset,
      color,
      getKeychainLoopConfig(productType, params),
    );
    const draggableMesh = tab.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh,
    );
    if (isHeadKeychain && draggableMesh) {
      const radius = getKeychainLoopConfig(productType, params).radius;
      draggableMesh.userData.headAttachmentKind = 'exterior_ring';
      draggableMesh.userData.headAttachmentInitialOffsets = {
        first: Number(params.ring_offset_x_mm) || 0,
        second: Number(params.ring_offset_y_mm) || 0,
      };
      draggableMesh.userData.headAttachmentBounds = {
        minFirst: target.bounds.min.x - radius,
        maxFirst: target.bounds.max.x + radius,
        minSecond: target.bounds.min.y - radius,
        maxSecond: target.bounds.max.y + radius,
      };
    }
    context.keychainHoleRoot.add(tab);
  }, [
    liveBounds,
    model?.source,
    params.bottom_color,
    params.keychain_hole,
    params.keychain_hole_angle_deg,
    params.keychain_hole_inset_mm,
    params.keychain_hole_placement,
    params.head_hole_diameter_mm,
    params.head_hole_offset_x_mm,
    params.head_hole_offset_z_mm,
    params.head_keychain_attachment,
    params.ring_offset_x_mm,
    params.ring_offset_y_mm,
    params.ring_outer_diameter_mm,
    params.top_color,
    productType,
  ]);

  const canInspectMountingSide =
    productType === 'signs' &&
    model?.source === 'local' &&
    params.sign_mode === 'mounting_holes';

  return (
    <div className="viewer" ref={hostRef}>
      {canInspectMountingSide && (
        <button
          type="button"
          className="mounting-view-toggle"
          onClick={() => setIsMountingSideView((current) => !current)}
        >
          {isMountingSideView ? t('viewer.front') : t('viewer.mounting')}
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

interface KeychainLoopConfig {
  radius: number;
  holeRadius: number;
  thickness: number;
  neckWidth: number;
  neckLength: number;
  overlap: number;
  offsetX: number;
  offsetY: number;
}

function createKeychainTab(
  target: KeychainTarget,
  angleDeg: number,
  inset: number,
  color: THREE.ColorRepresentation,
  config: KeychainLoopConfig,
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
                  config.radius -
                  config.overlap -
                  inset,
              ),
          );
  loopCenter.x += config.offsetX;
  loopCenter.y += config.offsetY;
  loopCenter.z = target.placement === 'top' ? target.z - inset : target.z;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.04,
  });

  const keychain = new THREE.Mesh(
    new THREE.ExtrudeGeometry(createKeychainShape(config), {
      depth: config.thickness,
      bevelEnabled: false,
      curveSegments: 64,
      steps: 1,
    }),
    material,
  );
  keychain.position.copy(loopCenter);
  if (target.placement === 'top') {
    keychain.rotation.x = Math.PI / 2;
    keychain.position.z += config.radius;
  }
  if (target.placement === 'bottom') {
    keychain.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.clone().negate());
  }
  keychain.renderOrder = 7;
  group.add(keychain);

  return group;
}

function createKeychainShape(config: KeychainLoopConfig): THREE.Shape {
  const halfNeckWidth = config.neckWidth / 2;
  const neckJoinY = -Math.sqrt(Math.max(0, config.radius ** 2 - halfNeckWidth ** 2));
  const rightJoinAngle = Math.atan2(neckJoinY, halfNeckWidth);
  const leftJoinAngle = Math.atan2(neckJoinY, -halfNeckWidth);
  const shape = new THREE.Shape();
  shape.moveTo(halfNeckWidth, neckJoinY);
  shape.absarc(0, 0, config.radius, rightJoinAngle, leftJoinAngle, false);
  shape.lineTo(-halfNeckWidth, -config.radius - config.neckLength);
  shape.lineTo(halfNeckWidth, -config.radius - config.neckLength);
  shape.lineTo(halfNeckWidth, neckJoinY);

  const holePath = new THREE.Path();
  holePath.absarc(0, 0, config.holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(holePath);
  return shape;
}

function getKeychainLoopConfig(
  productType: ProductType,
  params: ProductParams,
): KeychainLoopConfig {
  if (productType === 'head_keychains') {
    const diameter = THREE.MathUtils.clamp(
      Number(params.ring_outer_diameter_mm) || 6,
      2,
      20,
    );
    const radius = diameter / 2;
    return {
      radius,
      holeRadius: radius * 0.52,
      thickness: diameter * 0.3,
      neckWidth: radius * 1.18,
      neckLength: radius * 1.28,
      overlap: radius * 0.16,
      offsetX: Number(params.ring_offset_x_mm) || 0,
      offsetY: Number(params.ring_offset_y_mm) || 0,
    };
  }
  return {
    radius: KEYCHAIN_LOOP_RADIUS_MM,
    holeRadius: KEYCHAIN_HOLE_RADIUS_MM,
    thickness: KEYCHAIN_THICKNESS_MM,
    neckWidth: KEYCHAIN_NECK_WIDTH_MM,
    neckLength: KEYCHAIN_NECK_LENGTH_MM,
    overlap: KEYCHAIN_LOOP_OVERLAP_MM,
    offsetX: 0,
    offsetY: 0,
  };
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
  explicitColor?: string,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: explicitColor || getMaterialColor(productType, source, params, role),
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
  if (productType === 'lamp') {
    if (role === 'lid') return getColorParam(params.base_color, DEFAULT_COLOR);
    if (role === 'body') return getColorParam(params.body_color, DEFAULT_COLOR);
    return getBaseModelColor(productType, source);
  }
  if (productType === 'bracelet_gems') {
    return getColorParam(params.body_color, '#b978d0');
  }
  if (productType === 'pet_keychains') {
    return role === 'text'
      ? getColorParam(params.text_color, '#fff4dc')
      : getColorParam(params.body_color, '#e8794f');
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
    node.material = createModelMaterial(
      productType,
      source,
      params,
      role,
      typeof node.userData.previewColor === 'string' ? node.userData.previewColor : undefined,
    );
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

function measureObjectBounds(
  object: THREE.Object3D,
  name: string,
): ModelObjectBounds {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  return {
    name: name.replace(/\.stl$/i, ''),
    width: size.x,
    depth: size.y,
    height: size.z,
  };
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
