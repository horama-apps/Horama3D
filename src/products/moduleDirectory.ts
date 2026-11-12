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
  wifi_sign: { category: 'business', mode: 'create', icon: 'wifi' },
  tap_to_pay_sleeve: { category: 'business', mode: 'image', icon: 'card', thumbnail: 'paycards.webp' },
  business_signage: { category: 'business', mode: 'create', icon: 'sign' },
  tip_jar: { category: 'business', mode: 'create', icon: 'coins' },
  display_accessories: { category: 'business', mode: 'create', icon: 'display' },
  business_packages: { category: 'business', mode: 'create', icon: 'package' },
  brand_decoration: { category: 'business', mode: 'image', icon: 'badge' },
  signs: { category: 'personal', mode: 'create', icon: 'type' },
  keychains: { category: 'personal', mode: 'create', icon: 'key' },
  pet_keychains: { category: 'personal', mode: 'create', icon: 'paw' },
  bracelet_gems: { category: 'personal', mode: 'create', icon: 'gem' },
  phone_case: { category: 'personal', mode: 'image', icon: 'phone' },
  lamp: { category: 'home', mode: 'stl', icon: 'lamp' },
  urn: { category: 'home', mode: 'stl', icon: 'urn' },
  christmas_tree_ornament: { category: 'season', mode: 'create', icon: 'tree', thumbnail: 'christmas-ornament.webp' },
  image_layers: { category: 'images', mode: 'image', icon: 'layers' },
  clicker: { category: 'tools', mode: 'stl', icon: 'click' },
  head_keychains: { category: 'tools', mode: 'stl', icon: 'face' },
  textures: { category: 'tools', mode: 'stl', icon: 'grid' },
};

export const moduleOrder = Object.keys(moduleDirectory) as ProductType[];
