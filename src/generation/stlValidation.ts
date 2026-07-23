import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export interface AnalyzeModelResult {
  isValid: boolean;
  isValidScenario?: boolean;
  issues: string[];
  message?: string;
  warnings: string[];
}

export async function analyzeStlLocally(file: File): Promise<AnalyzeModelResult> {
  try {
    const buffer = await file.arrayBuffer();
    const parsed = new STLLoader().parse(buffer);
    parsed.deleteAttribute('normal');
    const geometry = mergeVertices(parsed, 1e-5);
    parsed.dispose();
    geometry.computeBoundingBox();
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const bounds = geometry.boundingBox;
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);

    if (
      !bounds ||
      !index ||
      position.count < 4 ||
      index.count < 12 ||
      ![
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        bounds.max.x,
        bounds.max.y,
        bounds.max.z,
      ].every(Number.isFinite)
    ) {
      geometry.dispose();
      return invalidResult('El STL no contiene una geometría triangular válida.');
    }

    const edgeUse = new Map<string, number>();
    let signedVolumeTimesSix = 0;
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset);
      const b = index.getX(offset + 1);
      const c = index.getX(offset + 2);
      countEdge(edgeUse, a, b);
      countEdge(edgeUse, b, c);
      countEdge(edgeUse, c, a);

      const ax = position.getX(a);
      const ay = position.getY(a);
      const az = position.getZ(a);
      const bx = position.getX(b);
      const by = position.getY(b);
      const bz = position.getZ(b);
      const cx = position.getX(c);
      const cy = position.getY(c);
      const cz = position.getZ(c);
      signedVolumeTimesSix +=
        ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx);
    }

    const openEdgeCount = Array.from(edgeUse.values()).filter((count) => count !== 2).length;
    geometry.dispose();
    if (openEdgeCount > 0) {
      return invalidResult(
        `El STL no es hermético: se detectaron ${openEdgeCount} bordes abiertos o no manifold.`,
      );
    }
    if (Math.abs(signedVolumeTimesSix) <= 1e-6) {
      return invalidResult('El STL no representa un volumen sólido válido.');
    }

    const warnings = triangleCount > 500_000
      ? [`El STL contiene ${triangleCount.toLocaleString()} triángulos; el proceso local puede usar bastante memoria.`]
      : [];
    return { isValid: true, issues: [], warnings };
  } catch {
    return invalidResult('No se pudo interpretar el archivo como un STL válido.');
  }
}

function countEdge(edges: Map<string, number>, a: number, b: number) {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

function invalidResult(message: string): AnalyzeModelResult {
  return {
    isValid: false,
    isValidScenario: false,
    issues: [message],
    message,
    warnings: [],
  };
}
