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
      context.modelRoot.add(createEmptyStateModel());
      context.frameModel();
      return;
    }

    const modelUrl = model.modelUrl ?? model.downloadUrl;
    if (!modelUrl) {
      context.modelRoot.add(createEmptyStateModel());
      context.frameModel();
      return;
    }

    if (model.format === 'glb') {
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        clearGroup(context.modelRoot);
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
        createModelMaterial(productType, model.source),
      );
      context.modelRoot.add(mesh);
      context.frameModel();
    });
  }, [model, productType]);

  return <div className="viewer" ref={hostRef} />;
}

function createEmptyStateModel(): THREE.Group {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(90, 90, 2),
    new THREE.MeshStandardMaterial({ color: 0xe2ddd1, roughness: 0.72 }),
  );
  plate.position.z = 1;
  group.add(plate);

  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(20, 1.8, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x2f8f83, roughness: 0.52 }),
  );
  marker.position.z = 6;
  group.add(marker);
  return group;
}

function createModelMaterial(
  productType: ProductType,
  source: GeneratedModel['source'],
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:
      source === 'upload'
        ? 0x7f8d92
        : productType === 'urn'
          ? 0x2f8f83
          : productType === 'textures'
            ? 0x6f6ad8
            : 0xb6682f,
    roughness: 0.55,
    metalness: 0.04,
  });
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
