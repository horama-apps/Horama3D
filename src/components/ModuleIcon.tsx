import {
  Link, QrCode, Wifi, CreditCard, Signpost, Coins, PanelsTopLeft, Package, Badge,
  Type, KeyRound, PawPrint, Gem, Smartphone, Lamp, Cylinder, TreePine, Layers3,
  MousePointer2, ScanFace, Grid3X3, LayoutGrid, Store, Image, Wrench,
} from 'lucide-react';

const icons = {
  anchor: Link, qr: QrCode, wifi: Wifi, card: CreditCard, sign: Signpost, coins: Coins,
  display: PanelsTopLeft, package: Package, badge: Badge, type: Type, key: KeyRound,
  paw: PawPrint, gem: Gem, phone: Smartphone, lamp: Lamp, urn: Cylinder, tree: TreePine,
  layers: Layers3, click: MousePointer2, face: ScanFace, grid: Grid3X3, all: LayoutGrid,
  business: Store, personal: Type, home: Lamp, season: TreePine, images: Image, tools: Wrench,
};

export function ModuleIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? LayoutGrid;
  return <Icon size={size} strokeWidth={1.6} aria-hidden='true' />;
}
