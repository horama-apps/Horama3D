import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GeneratedModel, ProductParams, ProductType } from '../types';

interface Viewer3DProps {
  productType: ProductType;
  params: ProductParams;
  model: GeneratedModel | null;
}

export function Viewer3D({ productType, params, model }: Viewer3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    modelRoot: THREE.Group;
    frameModel: () => void;
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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 55);

    const frameModel = () => {
      const box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      modelRoot.position.sub(new THREE.Vector3(center.x, center.y, box.min.z));
      const radius = Math.max(size.x, size.y, size.z) * 1.75 + 35;
      camera.position.set(radius, -radius * 1.08, radius * 0.72);
      controls.target.set(0, 0, size.z / 2);
      controls.update();
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
      frameModel,
      cleanup: () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        clearGroup(modelRoot);
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
            context.frameModel();
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
        context.frameModel();
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
      context.frameModel();
    });
  }, [model, params, productType]);

  return <div className="viewer" ref={hostRef} />;
}

function createModelMaterial(
  productType: ProductType,
  source: GeneratedModel['source'],
  params: ProductParams,
  role: 'body' | 'lid' | 'text' | 'detail' | 'support' | 'texture' = 'body',
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
  role: 'body' | 'lid' | 'text' | 'detail' | 'support' | 'texture',
): THREE.ColorRepresentation {
  if (productType !== 'urn' || source === 'upload') return getBaseModelColor(productType, source);
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

function getObjectRole(node: THREE.Object3D): 'body' | 'text' {
  const name = getObjectNamePath(node).toLowerCase();
  return /(^|[^a-z0-9])(text|label|letter|letters|engraving|inscription)([^a-z0-9]|$)/.test(name)
    ? 'text'
    : 'body';
}

function getPreviewRole(role: string): 'body' | 'lid' | 'text' | 'detail' | 'support' | 'texture' {
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
      }
    });
  }
}
