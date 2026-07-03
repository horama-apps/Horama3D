import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GeneratedModel, ModelBounds, ProductParams, ProductType } from '../types';

interface Viewer3DProps {
  productType: ProductType;
  params: ProductParams;
  model: GeneratedModel | null;
  showCutPlane?: boolean;
  onModelBoundsChange?: (bounds: ModelBounds | null) => void;
}

export function Viewer3D({
  productType,
  params,
  model,
  showCutPlane = false,
  onModelBoundsChange,
}: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [liveBounds, setLiveBounds] = useState<ModelBounds | null>(null);
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
    scene.add(grid);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    const cutPlaneRoot = new THREE.Group();
    scene.add(cutPlaneRoot);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 55);

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
      return {
        width: size.x,
        depth: size.y,
        height: size.z,
      };
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
      frameModel,
      cleanup: () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        clearGroup(modelRoot);
        clearGroup(cutPlaneRoot);
        controls.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      },
    };

    return () => sceneRef.current?.cleanup();
  }, []);

  useEffect(() => {
    const context = sceneRef.current;
    if (!context) return;

    clearGroup(context.modelRoot);
    setLiveBounds(null);
    onModelBoundsChange?.(null);
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
            createModelMaterial(productType, model.source, params, getPreviewRole(previewFile.role)),
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

  return <div className="viewer" ref={hostRef} />;
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
    if (role === 'lid') return getColorParam(params.top_color, '#ffffff');
    if (role === 'body') return getColorParam(params.bottom_color, '#ffffff');
    return getBaseModelColor(productType, source);
  }
  if (productType !== 'urn') return getBaseModelColor(productType, source);
  if (role === 'text') return getColorParam(params.text_color, '#232629');
  if (role === 'lid') return getColorParam(params.lid_color, '#ffffff');
  if (role === 'body') return getColorParam(params.body_color, '#ffffff');
  return getBaseModelColor(productType, source);
}

function getColorParam(value: ProductParams[string] | undefined, fallback: string): THREE.Color {
  return new THREE.Color(typeof value === 'string' && value.trim() ? value : fallback);
}

function getBaseModelColor(productType: ProductType, source: GeneratedModel['source']): THREE.ColorRepresentation {
  return (
    source === 'upload'
      ? 0x7f8d92
      : productType === 'urn'
        ? 0x2f8f83
        : productType === 'textures'
          ? 0x6f6ad8
          : 0xb6682f
  );
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

function getPreviewRole(role: string): PreviewRole {
  const normalized = role.toLowerCase();
  if (normalized === 'lid') return 'lid';
  if (normalized === 'text') return 'text';
  if (normalized === 'detail') return 'detail';
  if (normalized === 'support') return 'support';
  if (normalized === 'texture') return 'texture';
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
      } else if (node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}
