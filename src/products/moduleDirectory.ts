import type { ProductType } from '../types';

export type ModuleMode = 'create' | 'image' | 'stl';
export type ModuleCategory = 'business' | 'personal' | 'home' | 'season' | 'images' | 'tools';
export const moduleCategories: ModuleCategory[] = ['business', 'personal', 'home', 'season', 'images', 'tools'];

interface ModulePresentation {
  category: ModuleCategory;
  mode: ModuleMode;
  icon: string;
  thumbnail?: string;
}

export const moduleDirectory: Record<ProductType, ModulePresentation> = {
  qr_sign: { category: 'business', mode: 'create', icon: 'qr', thumbnail: 'qr-sign.webp' },
  wifi_sign: { category: 'business', mode: 'create', icon: 'wifi', thumbnail: 'wifi-sign.webp' },
  tap_to_pay_sleeve: { category: 'business', mode: 'image', icon: 'card', thumbnail: 'paycards.webp' },
  business_signage: { category: 'business', mode: 'create', icon: 'sign', thumbnail: 'business-signage.webp' },
  tip_jar: { category: 'business', mode: 'create', icon: 'coins', thumbnail: 'tip-jar.webp' },
  display_accessories: { category: 'business', mode: 'create', icon: 'display', thumbnail: 'display-accessories.webp' },
  business_packages: { category: 'business', mode: 'create', icon: 'package', thumbnail: 'business-packages.webp' },
  brand_decoration: { category: 'business', mode: 'image', icon: 'badge', thumbnail: 'brand-decoration.webp' },
  signs: { category: 'personal', mode: 'create', icon: 'type', thumbnail: 'letter-signs.webp' },
  keychains: { category: 'personal', mode: 'create', icon: 'key', thumbnail: 'keychains.webp' },
  pet_keychains: { category: 'personal', mode: 'create', icon: 'paw', thumbnail: 'pet-keychains.webp' },
  bracelet_gems: { category: 'personal', mode: 'create', icon: 'gem', thumbnail: 'bracelet-gems.webp' },
  phone_case: { category: 'personal', mode: 'image', icon: 'phone', thumbnail: 'phone-case.webp' },
  lamp: { category: 'home', mode: 'stl', icon: 'lamp', thumbnail: 'lamp.webp' },
  urn: { category: 'home', mode: 'stl', icon: 'urn', thumbnail: 'urn.webp' },
  christmas_tree_ornament: { category: 'season', mode: 'create', icon: 'tree', thumbnail: 'christmas-ornament.webp' },
  image_layers: { category: 'images', mode: 'image', icon: 'layers', thumbnail: 'image-layers.webp' },
  clicker: { category: 'tools', mode: 'stl', icon: 'click', thumbnail: 'clickers.webp' },
  head_keychains: { category: 'tools', mode: 'stl', icon: 'face', thumbnail: 'head-keychains.webp' },
  textures: { category: 'tools', mode: 'stl', icon: 'grid', thumbnail: 'textures.webp' },
};

export const moduleOrder = Object.keys(moduleDirectory) as ProductType[];
