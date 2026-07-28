import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import packageMetadata from '../package.json';
import {
  ChevronDown,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import {
  generateLampModelLocally,
} from './generation/lampGenerator';
import { generateClickerModelLocally } from './generation/clickerGenerator';
import { generateHeadKeychainModelLocally } from './generation/headKeychainGenerator';
import { generateUrnModelLocally } from './generation/urnGenerator';
import { generateSignModel } from './generation/signGenerator';
import { generatePetKeychainModel } from './generation/petKeychainGenerator';
import { generateBraceletGemsModel } from './generation/braceletGenerator';
import { generateTipJarModel } from './generation/tipJarGenerator';
import { generateWifiSignModel } from './generation/wifiSignGenerator';
import {
  generateBusinessKeychainModel,
  generateBusinessPackageModel,
  generateBusinessSignageModel,
  generateDisplayAccessoryModel,
  generateQrSignModel,
} from './generation/businessProductGenerator';
import { generateTextureModelLocally } from './generation/textureGenerator';
import { analyzeStlLocally } from './generation/stlValidation';
import { generateImageLayersLocally } from './generation/imageLayersGenerator';
import { generateBrandDecorationLocally } from './generation/brandDecorationGenerator';
import { ParamPanel } from './components/ParamPanel';
import { Viewer3D } from './components/Viewer3D';
import {
  exportModel,
  getDefaultExportName,
  type DownloadFormat,
} from './export/modelExport';
import { getDefaultParams, getProduct, products } from './products/catalog';
import type {
  GeneratedModel,
  ModelBounds,
  ModelObjectBounds,
  ProductParams,
  ProductType,
} from './types';

type ToastTone = 'success' | 'warning' | 'error' | 'issue';
type ToastPlacement = 'center' | 'corner' | 'top';
type ConfiguratorMode = 'stl' | 'image' | 'create';

interface Toast {
  id: number;
  tone: ToastTone;
  placement: ToastPlacement;
  title: string;
  messages?: string[];
}

const wipProductTypes: ProductType[] = [];
const productsByConfigurator: Record<ConfiguratorMode, ProductType[]> = {
  stl: ['lamp', 'urn', 'clicker', 'head_keychains', 'textures'],
  image: ['image_layers', 'brand_decoration'],
  create: [
    'signs',
    'business_signage',
    'qr_sign',
    'wifi_sign',
    'keychains',
    'pet_keychains',
    'bracelet_gems',
    'tip_jar',
    'display_accessories',
    'business_packages',
  ],
};
const defaultProductByConfigurator: Record<ConfiguratorMode, ProductType> = {
  stl: 'lamp',
  image: 'image_layers',
  create: 'signs',
};
const configureStatusByProduct: Partial<Record<ProductType, string>> = {
  signs: 'status.configureSign',
  pet_keychains: 'status.configurePetKeychain',
  bracelet_gems: 'status.configureBracelet',
  tip_jar: 'status.configureTipJar',
  wifi_sign: 'status.configureWifiSign',
  qr_sign: 'status.configureQrSign',
  business_signage: 'status.configureBusinessSignage',
  keychains: 'status.configureBusinessKeychain',
  display_accessories: 'status.configureDisplayAccessory',
  business_packages: 'status.configureBusinessPackage',
  brand_decoration: 'status.configureBrandDecoration',
};
const generatingStatusByProduct: Partial<Record<ProductType, string>> = {
  signs: 'status.generatingSign',
  pet_keychains: 'status.generatingPetKeychain',
  bracelet_gems: 'status.generatingBracelet',
  tip_jar: 'status.generatingTipJar',
  wifi_sign: 'status.generatingWifiSign',
  qr_sign: 'status.generatingQrSign',
  business_signage: 'status.generatingBusinessSignage',
  keychains: 'status.generatingBusinessKeychain',
  display_accessories: 'status.generatingDisplayAccessory',
  business_packages: 'status.generatingBusinessPackage',
  brand_decoration: 'status.generatingBrandDecoration',
};

function isWipProductType(type: ProductType): boolean {
  return wipProductTypes.includes(type);
}

function isImageProduct(type: ProductType): boolean {
  return type === 'image_layers' || type === 'brand_decoration';
}

function isLocalCreator(type: ProductType): boolean {
  return (
    type === 'signs' ||
    type === 'pet_keychains' ||
    type === 'bracelet_gems' ||
    type === 'tip_jar' ||
    type === 'wifi_sign' ||
    type === 'qr_sign' ||
    type === 'business_signage' ||
    type === 'keychains' ||
    type === 'display_accessories' ||
    type === 'business_packages'
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const isDemoMode = useMemo(
    () => new URLSearchParams(window.location.search).get('demo') === 'true',
    [],
  );
  const [configuratorMode, setConfiguratorMode] =
    useState<ConfiguratorMode>(isDemoMode ? 'create' : 'stl');
  const [productType, setProductType] = useState<ProductType>(
    isDemoMode ? 'signs' : 'lamp',
  );
  const product = useMemo(() => getProduct(productType), [productType]);
  const [paramsByType, setParamsByType] = useState<
    Record<ProductType, ProductParams>
  >({
    lamp: getDefaultParams(getProduct('lamp')),
    urn: getDefaultParams(getProduct('urn')),
    clicker: getDefaultParams(getProduct('clicker')),
    head_keychains: getDefaultParams(getProduct('head_keychains')),
    textures: getDefaultParams(getProduct('textures')),
    keychains: getDefaultParams(getProduct('keychains')),
    image_layers: getDefaultParams(getProduct('image_layers')),
    brand_decoration: getDefaultParams(getProduct('brand_decoration')),
    signs: getDefaultParams(getProduct('signs')),
    pet_keychains: getDefaultParams(getProduct('pet_keychains')),
    bracelet_gems: getDefaultParams(getProduct('bracelet_gems')),
    tip_jar: getDefaultParams(getProduct('tip_jar')),
    wifi_sign: getDefaultParams(getProduct('wifi_sign')),
    qr_sign: getDefaultParams(getProduct('qr_sign')),
    business_signage: getDefaultParams(getProduct('business_signage')),
    display_accessories: getDefaultParams(getProduct('display_accessories')),
    business_packages: getDefaultParams(getProduct('business_packages')),
  });
  const [model, setModel] = useState<GeneratedModel | null>({
    source: 'empty',
    format: 'stl',
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [status, setStatus] = useState(
    t('status.loadStl'),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('stl');
  const [isModelValidated, setIsModelValidated] = useState(false);
  const [hasUsedViewerActions, setHasUsedViewerActions] = useState(false);
  const [shouldCollapseSetup, setShouldCollapseSetup] = useState(false);
  const [isCutPlaneDismissed, setIsCutPlaneDismissed] = useState(false);
  const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null);
  const [modelObjectBounds, setModelObjectBounds] = useState<ModelObjectBounds[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);
  const localUrlRefs = useRef<Set<string>>(new Set());
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(0);
  const toastTimeoutRefs = useRef<number[]>([]);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [signHolePositions, setSignHolePositions] = useState<
    Record<string, { u: number; v: number }>
  >({});
  const [petHolePosition, setPetHolePosition] = useState({ u: 0.18, v: 0.72 });

  const params = paramsByType[productType];
  const visibleProducts = useMemo(
    () =>
      products.filter((item) =>
        productsByConfigurator[configuratorMode].includes(item.type),
      ),
    [configuratorMode],
  );
  const isWipProduct = isWipProductType(productType);
  const requiresUploadedModel = !isLocalCreator(productType);
  const canUseInvalidStlForHead =
    productType === 'head_keychains' && Boolean(uploadedFile);
  const isLocked =
    isWipProduct ||
    (requiresUploadedModel && !isModelValidated && !canUseInvalidStlForHead);
  const cutHeightMin =
    modelBounds && productType === 'clicker'
      ? roundToTenth(modelBounds.height * 0.2)
      : 0;
  const cutHeightMax = modelBounds
    ? roundToTenth(modelBounds.height * 0.8)
    : 1;
  const signMountingDepthMax = Math.min(
    40,
    Math.max(
      1,
      Math.floor(
        (Number(params.base_thickness_mm ?? 2.4) +
          Number(params.wall_height_mm ?? 20) -
          1.2) *
          2,
      ) / 2,
    ),
  );
  const paramOverrides = useMemo<
    Record<string, { min?: number; max?: number; step?: number }> | undefined
  >(
    () => {
      const overrides: Record<
        string,
        { min?: number; max?: number; step?: number }
      > = {};
      if (productType === 'clicker' || productType === 'head_keychains') {
        overrides.cut_height_mm = {
          min: cutHeightMin,
          max: cutHeightMax,
          step: 0.1,
        };
      }
      if (productType === 'head_keychains' && modelBounds) {
        overrides.ring_outer_diameter_mm = {
          min: 2,
          max: Math.max(
            2,
            roundToTenth(Math.min(20, Math.min(modelBounds.width, modelBounds.depth) * 0.8)),
          ),
          step: 0.5,
        };
        overrides.ring_offset_x_mm = {
          min: -roundDownToHalf(modelBounds.width / 2),
          max: roundDownToHalf(modelBounds.width / 2),
          step: 0.5,
        };
        overrides.ring_offset_y_mm = {
          min: -roundDownToHalf(modelBounds.depth / 2),
          max: roundDownToHalf(modelBounds.depth / 2),
          step: 0.5,
        };
        overrides.head_hole_diameter_mm = {
          min: 1.5,
          max: Math.max(
            1.5,
            roundToTenth(Math.min(10, Math.min(modelBounds.width, modelBounds.height) * 0.45)),
          ),
          step: 0.5,
        };
        overrides.head_hole_offset_x_mm = {
          min: -roundDownToHalf(modelBounds.width / 2),
          max: roundDownToHalf(modelBounds.width / 2),
          step: 0.5,
        };
        overrides.head_hole_offset_z_mm = {
          min: -roundDownToHalf(modelBounds.height * 0.8),
          max: 0,
          step: 0.5,
        };
      }
      if (productType === 'signs') {
        overrides.mounting_hole_depth_mm = {
          min: 1,
          max: signMountingDepthMax,
          step: 0.5,
        };
      }
      if (productType === 'pet_keychains') {
        overrides.keychain_hole_diameter_mm = {
          min: 3,
          max: Math.max(
            3,
            Math.min(10, Math.floor(Number(params.tag_width_mm ?? 60) * 0.3 * 2) / 2),
          ),
          step: 0.5,
        };
      }
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    },
    [cutHeightMax, cutHeightMin, modelBounds, params.tag_width_mm, productType, signMountingDepthMax],
  );
  const scaledModelIsVerySmall =
    modelBounds !== null &&
    Math.max(modelBounds.width, modelBounds.depth, modelBounds.height) < 20;
  const paramDetails =
    model?.source === 'upload' &&
    modelBounds &&
    (productType === 'clicker' || productType === 'head_keychains')
      ? {
          stl_scale_percent: [
            t('params.stl_scale_percent.dimensions', {
              dimensions: `${modelBounds.width.toFixed(1)} × ${modelBounds.depth.toFixed(1)} × ${modelBounds.height.toFixed(1)} mm`,
            }),
            scaledModelIsVerySmall
              ? t('params.stl_scale_percent.smallWarning')
              : '',
          ].filter(Boolean).join(' · '),
        }
      : undefined;

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
      localUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
      toastTimeoutRefs.current.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!isDownloadMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target as Node)
      ) {
        setIsDownloadMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDownloadMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDownloadMenuOpen]);

  const showToast = (toast: Omit<Toast, 'id'>, duration = 3600) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((current) => [...current, { ...toast, id }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, duration);
    toastTimeoutRefs.current.push(timeoutId);
  };

  const setActiveModel = (nextModel: GeneratedModel | null) => {
    localUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
    localUrlRefs.current.clear();
    if (
      uploadedUrlRef.current &&
      nextModel?.modelUrl !== uploadedUrlRef.current
    ) {
      URL.revokeObjectURL(uploadedUrlRef.current);
      uploadedUrlRef.current = null;
    }
    if (nextModel?.source === 'upload' && nextModel.modelUrl) {
      uploadedUrlRef.current = nextModel.modelUrl;
    }
    if (nextModel?.source === 'local') {
      nextModel.previewFiles?.forEach((file) => localUrlRefs.current.add(file.url));
      if (nextModel.modelUrl?.startsWith('blob:')) localUrlRefs.current.add(nextModel.modelUrl);
      if (nextModel.downloadUrl?.startsWith('blob:')) localUrlRefs.current.add(nextModel.downloadUrl);
    }
    setModel(nextModel);
  };

  const restoreUploadedModel = (
    nextStatus = t('status.stlReady'),
    validated = isModelValidated,
  ) => {
    if (!uploadedFile) return;

    const modelUrl = URL.createObjectURL(uploadedFile);
    setActiveModel({
      source: 'upload',
      name: uploadedFile.name,
      modelUrl,
      downloadUrl: modelUrl,
      format: 'stl',
    });
    setIsModelValidated(validated);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);
    setStatus(nextStatus);
  };

  const returnToDefaultState = (
    nextStatus = t('status.loadStl'),
  ) => {
    setActiveModel({ source: 'empty', format: 'stl' });
    setUploadedFile(null);
    setIsModelValidated(false);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);
    setStatus(nextStatus);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const updateParam = (key: string, value: ProductParams[string]) => {
    if (
      productType === 'signs' &&
      ['text', 'font', 'font_size_mm'].includes(key)
    ) {
      setSignHolePositions({});
    }
    if (
      productType === 'signs' &&
      key === 'sign_mode' &&
      value === 'mounting_holes'
    ) {
      showToast(
        {
          tone: 'warning',
          placement: 'center',
          title: t('alerts.moveHoles'),
        },
        6200,
      );
    }
    if (
      productType === 'pet_keychains' &&
      ['pet_shape', 'tag_width_mm', 'keychain_hole_diameter_mm'].includes(key)
    ) {
      setPetHolePosition({ u: 0.18, v: 0.72 });
    }
    setParamsByType((current) => {
      const nextProductParams = {
        ...current[productType],
        [key]: value,
      };
      if (productType === 'pet_keychains' && key === 'tag_width_mm') {
        const maximumHoleDiameter = Math.max(
          3,
          Math.min(10, Math.floor(Number(value) * 0.3 * 2) / 2),
        );
        nextProductParams.keychain_hole_diameter_mm = Math.min(
          Number(nextProductParams.keychain_hole_diameter_mm),
          maximumHoleDiameter,
        );
      }
      return {
        ...current,
        [productType]: nextProductParams,
      };
    });
    setStatus(
      model?.source === 'upload'
        ? isModelValidated
          ? t('status.stlReady')
          : t('status.invalidStlHeadKeychainReady')
        : t('status.parametersUpdated'),
    );
  };

  const handleModelBoundsChange = useCallback((bounds: ModelBounds | null) => {
    setModelBounds(bounds);
  }, []);
  const handleModelObjectBoundsChange = useCallback(
    (bounds: ModelObjectBounds[]) => {
      setModelObjectBounds(bounds);
    },
    [],
  );

  useEffect(() => {
    if (isGenerating || isExporting) return;
    if (model?.source === 'local') {
      setStatus(t('status.generated'));
    } else if (model?.source === 'upload') {
      setStatus(
        isModelValidated
          ? t('status.stlReady')
          : t('status.invalidStlHeadKeychainReady'),
      );
    } else if (configuratorMode === 'stl') {
      setStatus(t('status.loadStl'));
    } else if (configuratorMode === 'create') {
      setStatus(t(configureStatusByProduct[productType] ?? 'status.configureSign'));
    } else {
      setStatus(uploadedImageFile ? t('status.imageReady') : t('status.loadImage'));
    }
  }, [i18n.resolvedLanguage]);

  useEffect(() => {
    if (
      (productType !== 'clicker' && productType !== 'head_keychains') ||
      model?.source !== 'upload' ||
      !modelBounds
    )
      return;

    const minCutHeight =
      productType === 'head_keychains'
        ? 0
        : roundToTenth(modelBounds.height * 0.2);
    const maxCutHeight = roundToTenth(modelBounds.height * 0.8);
    setParamsByType((current) => {
      const currentValue = Number(current[productType].cut_height_mm);
      if (
        Number.isFinite(currentValue) &&
        currentValue >= minCutHeight &&
        currentValue <= maxCutHeight
      )
        return current;
      return {
        ...current,
        [productType]: {
          ...current[productType],
          cut_height_mm: minCutHeight,
        },
      };
    });
  }, [model?.source, modelBounds, productType]);

  const runGenerate = async () => {
    if (isLocked) return;
    setHasUsedViewerActions(true);
    setShouldCollapseSetup(true);
    setIsCutPlaneDismissed(true);
    setIsGenerating(true);
    setStatus(
      generatingStatusByProduct[productType]
        ? t(generatingStatusByProduct[productType] as string)
        : isImageProduct(productType)
          ? t('status.generatingImageLayersLocal')
        : productType === 'lamp'
          ? t('status.generatingLampLocal')
        : productType === 'clicker'
          ? t('status.generatingClickerLocal')
        : productType === 'head_keychains'
          ? t('status.generatingHeadKeychainLocal')
        : productType === 'textures'
          ? t('status.generatingTexturesLocal')
        : t('status.generatingUrnLocal'),
    );
    try {
      const generated =
        productType === 'image_layers'
          ? await generateImageLayersLocally(uploadedImageFile as File, params)
        : productType === 'brand_decoration'
          ? await generateBrandDecorationLocally(
              uploadedImageFile as File,
              params,
            )
        : productType === 'signs'
          ? await generateSignModel({
              ...params,
              mounting_hole_positions: JSON.stringify(signHolePositions),
            })
          : productType === 'pet_keychains'
            ? await generatePetKeychainModel({
                ...params,
                keychain_hole_position: JSON.stringify(petHolePosition),
              })
          : productType === 'tip_jar'
            ? await generateTipJarModel(params)
          : productType === 'wifi_sign'
            ? await generateWifiSignModel(params)
          : productType === 'qr_sign'
            ? await generateQrSignModel(params)
          : productType === 'business_signage'
            ? await generateBusinessSignageModel(params)
          : productType === 'keychains'
            ? await generateBusinessKeychainModel(params)
          : productType === 'display_accessories'
            ? await generateDisplayAccessoryModel(params)
          : productType === 'business_packages'
            ? await generateBusinessPackageModel(params)
          : productType === 'bracelet_gems'
            ? await generateBraceletGemsModel(params)
          : productType === 'lamp'
            ? await generateLampModelLocally(uploadedFile as File, params)
          : productType === 'clicker'
            ? await generateClickerModelLocally(uploadedFile as File, params)
          : productType === 'head_keychains'
            ? await generateHeadKeychainModelLocally(uploadedFile as File, params)
          : productType === 'textures'
            ? await generateTextureModelLocally(uploadedFile as File, params)
          : await generateUrnModelLocally(uploadedFile as File, params);
      if (isImageProduct(productType)) setDownloadFormat('3mf');
      setActiveModel(generated);
      setIsModelValidated(generated.source !== 'empty');
      if (
        generated.metadata?.warnings &&
        generated.metadata.warnings.length > 0
      ) {
        showToast(
          {
            tone: 'warning',
            placement: 'corner',
            title: t('messages.transformWarnings'),
            messages: generated.metadata.warnings,
          },
          6200,
        );
      }
      setStatus(
        generated.source === 'empty'
          ? t('messages.noModel')
          : t('status.generated'),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('status.generationFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMountingHoleMove = useCallback(
    async (key: string, u: number, v: number) => {
      if (productType === 'pet_keychains') {
        const nextPosition = { u, v };
        setPetHolePosition(nextPosition);
        setIsGenerating(true);
        setStatus(t('status.movingHole'));
        try {
          const generated = await generatePetKeychainModel({
            ...params,
            keychain_hole_position: JSON.stringify(nextPosition),
          });
          setActiveModel(generated);
          setStatus(t('status.holeMoved'));
        } catch (error) {
          setStatus(error instanceof Error ? error.message : t('status.holeMoveFailed'));
        } finally {
          setIsGenerating(false);
        }
        return;
      }
      if (productType !== 'signs' || params.sign_mode !== 'mounting_holes') return;
      const nextPositions = {
        ...signHolePositions,
        [key]: { u, v },
      };
      setSignHolePositions(nextPositions);
      setIsGenerating(true);
      setStatus(t('status.movingHole'));
      try {
        const generated = await generateSignModel({
          ...params,
          mounting_hole_positions: JSON.stringify(nextPositions),
        });
        setActiveModel(generated);
        setStatus(t('status.holeMoved'));
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : t('status.holeMoveFailed'),
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [params, productType, signHolePositions],
  );

  const handleHeadKeychainAttachmentMove = useCallback(
    (kind: 'exterior_ring' | 'integrated_hole', firstOffset: number, secondOffset: number) => {
      if (productType !== 'head_keychains') return;
      setParamsByType((current) => ({
        ...current,
        head_keychains: {
          ...current.head_keychains,
          ...(kind === 'integrated_hole'
            ? {
                head_hole_offset_x_mm: firstOffset,
                head_hole_offset_z_mm: secondOffset,
              }
            : {
                ring_offset_x_mm: firstOffset,
                ring_offset_y_mm: secondOffset,
              }),
        },
      }));
      setStatus(t('status.attachmentMoved'));
    },
    [productType],
  );

  const selectProduct = (nextType: ProductType) => {
    setProductType(nextType);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);

    if (isLocalCreator(nextType) || isWipProductType(nextType)) {
      setActiveModel({ source: 'empty', format: 'stl' });
      setStatus(t(configureStatusByProduct[nextType] ?? 'status.moduleWip'));
      return;
    }

    if (isImageProduct(nextType)) {
      setActiveModel({ source: 'empty', format: 'stl' });
      setIsModelValidated(Boolean(uploadedImageFile));
      setStatus(uploadedImageFile ? t('status.imageReady') : t('status.loadImage'));
      setDownloadFormat('3mf');
      return;
    }

    if (uploadedFile) {
      restoreUploadedModel(
        isModelValidated
          ? t('status.stlReady')
          : t('status.invalidStlHeadKeychainReady'),
      );
    } else {
      setActiveModel({ source: 'empty', format: 'stl' });
      setIsModelValidated(false);
      setStatus(t('status.loadStl'));
    }
  };

  const selectConfiguratorMode = (nextMode: ConfiguratorMode) => {
    if (isDemoMode && nextMode !== 'create') return;

    const nextProduct = defaultProductByConfigurator[nextMode];
    setConfiguratorMode(nextMode);
    setProductType(nextProduct);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);
    setHasUsedViewerActions(false);
    setSignHolePositions({});
    setPetHolePosition({ u: 0.18, v: 0.72 });

    if (nextMode === 'stl' && uploadedFile) {
      restoreUploadedModel(
        isModelValidated
          ? t('status.stlReady')
          : t('status.invalidStlHeadKeychainReady'),
      );
      return;
    }

    if (nextMode === 'image' && uploadedImageFile) {
      setActiveModel({ source: 'empty', format: 'stl' });
      setIsModelValidated(true);
      setDownloadFormat('3mf');
      setStatus(t('status.imageReady'));
      return;
    }

    setActiveModel({ source: 'empty', format: 'stl' });
    setIsModelValidated(false);
    setModelBounds(null);
    setStatus(
      nextMode === 'stl'
        ? t('status.loadStl')
        : nextMode === 'create'
          ? t('status.configureSign')
          : t('status.loadImage'),
    );
  };

  const resetParams = () => {
    setHasUsedViewerActions(true);
    if (productType === 'signs') setSignHolePositions({});
    if (productType === 'pet_keychains') setPetHolePosition({ u: 0.18, v: 0.72 });
    setParamsByType((current) => ({
      ...current,
      [productType]: getDefaultParams(product),
    }));

    if (
      (productType === 'clicker' || productType === 'head_keychains') &&
      uploadedFile
    ) {
      restoreUploadedModel(
        isModelValidated
          ? t('status.stlReady')
          : t('status.invalidStlHeadKeychainReady'),
      );
      return;
    }

    if (isImageProduct(productType) && uploadedImageFile) {
      setActiveModel({ source: 'empty', format: 'stl' });
      setIsModelValidated(true);
      setStatus(t('status.imageReady'));
      return;
    }

    setStatus(t('status.defaultsRestored'));
  };

  const loadStlFile = async (file: File | undefined) => {
    if (!file) return;
    const isStl = file.name.toLowerCase().endsWith('.stl');
    if (!isStl) {
      setStatus(t('upload.select'));
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      return;
    }

    returnToDefaultState(`${t('upload.analyzing')}: ${file.name}`);
    setIsAnalyzing(true);

    try {
      const analysis = await analyzeStlLocally(file);

      if (analysis.warnings.length > 0) {
        showToast(
          {
            tone: 'warning',
            placement: 'corner',
            title: t('messages.validationWarnings'),
            messages: analysis.warnings,
          },
          6200,
        );
      }

      if (!analysis.isValid) {
        if (analysis.isValidScenario === false && analysis.issues.length > 0) {
          showToast(
            {
              tone: 'issue',
              placement: 'top',
              title: t('messages.validationIssues'),
              messages: analysis.issues,
            },
            6200,
          );
        } else {
          showToast({
            tone: 'error',
            placement: 'center',
            title: analysis.message ?? t('messages.invalidStl'),
          });
        }
        const modelUrl = URL.createObjectURL(file);
        setUploadedFile(file);
        setActiveModel({
          source: 'upload',
          name: file.name,
          modelUrl,
          downloadUrl: modelUrl,
          format: 'stl',
        });
        setIsModelValidated(false);
        setShouldCollapseSetup(false);
        setIsCutPlaneDismissed(false);
        setStatus(t('status.invalidStlHeadKeychainReady'));
        return;
      }

      const modelUrl = URL.createObjectURL(file);
      setUploadedFile(file);
      setActiveModel({
        source: 'upload',
        name: file.name,
        modelUrl,
        downloadUrl: modelUrl,
        format: 'stl',
      });
      setIsModelValidated(true);
      setShouldCollapseSetup(false);
      setIsCutPlaneDismissed(false);
      setStatus(t('status.loaded', { filename: file.name }));
      showToast({
        tone: 'success',
        placement: 'center',
        title: t('messages.validStl'),
      });
    } catch (error) {
      showToast({
        tone: 'error',
        placement: 'center',
        title:
          error instanceof Error
            ? error.message
            : t('messages.validateFailed'),
      });
      returnToDefaultState(t('messages.validateFailed'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadImageFile = (file: File | undefined) => {
    if (!file) return;
    const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!isImage) {
      setStatus(t('upload.selectImage'));
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }
    setUploadedImageFile(file);
    setActiveModel({ source: 'empty', format: 'stl' });
    setIsModelValidated(true);
    setShouldCollapseSetup(false);
    setDownloadFormat('3mf');
    setStatus(t('status.imageReady'));
  };

  const runDownload = async (format = downloadFormat) => {
    if (isDemoMode || !model || model.source === 'empty' || isExporting) return;

    const requestedFormat = isLocalCreator(productType) ? 'stl' : format;
    setDownloadFormat(requestedFormat);
    setHasUsedViewerActions(true);
    setIsExporting(true);
    setStatus(
      requestedFormat === '3mf'
        ? t('status.preparing3mf')
        : isLocalCreator(productType) &&
            (!model.previewFiles || model.previewFiles.length <= 1)
          ? t('status.preparingStl')
          : t('status.preparingZip'),
    );

    try {
      let exported: { blob: Blob; filename: string };
      if (
        isLocalCreator(productType) &&
        (!model.previewFiles || model.previewFiles.length <= 1)
      ) {
        let localBlob = model.blob;
        if (!localBlob) {
          const response = await fetch(model.downloadUrl ?? model.modelUrl ?? '');
          if (!response.ok) throw new Error('Could not prepare the local STL.');
          localBlob = await response.blob();
        }
        exported = {
          blob: localBlob,
          filename: model.name ?? `${productType}.stl`,
        };
      } else {
        exported = await exportModel(
          model,
          productType,
          params,
          requestedFormat,
        );
      }
      const url = URL.createObjectURL(exported.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exported.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      playDuckDownloadSound();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(t('status.downloaded', { filename: exported.filename }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('status.downloadFailed');
      setStatus(message);
      showToast({
        tone: 'error',
        placement: 'center',
        title: message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const canDownload =
    !isDemoMode &&
    !isWipProduct &&
    Boolean(
      model &&
      model.source !== 'empty' &&
      (!isLocalCreator(productType) || model.source === 'local'),
    );
  const shouldExpandViewerActions = !isLocked && !hasUsedViewerActions;
  const downloadFormats: DownloadFormat[] = ['stl', '3mf'];

  return (
    <main
      className={isDemoMode ? 'app-shell app-shell-demo' : 'app-shell'}
      style={{ '--accent': product.accent } as React.CSSProperties}
    >
      <aside className='panel panel-left'>
        <div className='brand'>
          <div className='brand-mark'>
            <img
              src={`${import.meta.env.BASE_URL}horama-mark.svg`}
              alt='Horama'
            />
          </div>
          <div className='configurator-selector configurator-selector-brand'>
            <select
              aria-label={t('configurator.label')}
              value={configuratorMode}
              onChange={(event) =>
                selectConfiguratorMode(event.target.value as ConfiguratorMode)
              }
            >
              <option value='stl' disabled={isDemoMode}>{t('configurator.stl')}</option>
              <option value='image' disabled={isDemoMode}>{t('configurator.image')}</option>
              <option value='create'>{t('configurator.create')}</option>
            </select>
          </div>
        </div>

        <div className='product-list'>
          {configuratorMode === 'stl' || isImageProduct(productType) ? (
            <div className='upload-card'>
            <input
              ref={uploadInputRef}
              className='file-input'
              type='file'
              accept={isImageProduct(productType) ? '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp' : '.stl,model/stl,application/vnd.ms-pki.stl'}
              onChange={(event) => isImageProduct(productType)
                ? loadImageFile(event.target.files?.[0])
                : void loadStlFile(event.target.files?.[0])}
            />
            <button
              className='upload-button'
              disabled={isAnalyzing}
              onClick={() => uploadInputRef.current?.click()}
            >
              {isAnalyzing ? (
                <Loader2 className='spin' size={18} />
              ) : (
                <FileUp size={18} />
              )}
              {isAnalyzing
                ? t('upload.analyzing')
                : isImageProduct(productType)
                  ? t('upload.loadImage')
                  : t('upload.load')}
            </button>
            <p>
              {isImageProduct(productType)
                ? uploadedImageFile?.name ?? t('upload.selectImage')
                : uploadedFile?.name ?? t('upload.select')}
            </p>
            </div>
          ) : null}

          {visibleProducts.map((item) => (
            <button
              className={
                item.type === productType
                  ? 'product-button active'
                  : 'product-button'
              }
              key={item.type}
              style={{ '--product-accent': item.accent } as React.CSSProperties}
              disabled={
                (
                  Boolean(uploadedFile) &&
                  !isModelValidated &&
                  item.type !== 'head_keychains' &&
                  !isWipProductType(item.type)
                ) ||
                (
                  isLocked &&
                  !isLocalCreator(item.type) &&
                  !isWipProductType(item.type) &&
                  !isWipProduct &&
                  !(item.type === 'head_keychains' && uploadedFile)
                )
              }
              onClick={() => selectProduct(item.type)}
            >
              <span className='product-button-title'>
                {t(`products.${item.type}.name`, { defaultValue: item.name })}
                {isWipProductType(item.type) ? (
                  <span className='wip-badge'>{t('common.wip')}</span>
                ) : null}
              </span>
              <small>{t(`products.${item.type}.description`, { defaultValue: item.description })}</small>
            </button>
          ))}
        </div>

        <div
          className={`generator-status generator-status-${isWipProduct ? 'checking' : 'healthy'}`}
          title={
            isWipProduct
              ? t('status.imageWorkflow')
              : t('status.localGenerator')
          }
          aria-label={
            isWipProduct
              ? t('status.imageWorkflow')
              : t('status.localGenerator')
          }
        >
          <span aria-hidden='true' />
          <strong>
            {isWipProduct
              ? t('status.imageWorkflow')
              : t('status.localGenerator')}
          </strong>
          <small className='generator-version'>v{packageMetadata.version}</small>
        </div>
      </aside>

      <section className={isLocked ? 'stage stage-disabled' : 'stage'}>
        <div
          className={
            shouldExpandViewerActions
              ? 'stage-toolbar stage-toolbar-expanded'
              : 'stage-toolbar'
          }
          aria-label={t('viewer.actions')}
        >
          <button
            className='primary-action'
            disabled={isLocked || isGenerating}
            onClick={runGenerate}
          >
            {isGenerating ? (
              <Loader2 className='spin' size={18} />
            ) : (
              <Wand2 size={18} />
            )}
            <span>{t('common.generate')}</span>
          </button>
          <button
            className='tool-action'
            disabled={isLocked}
            onClick={resetParams}
            aria-label={t('common.reset')}
            title={t('common.reset')}
          >
            <RotateCcw size={17} />
            <span>{t('common.reset')}</span>
          </button>
          {isLocalCreator(productType) ? (
            <button
              className='tool-action'
              disabled={!canDownload || isExporting}
              aria-label={`${t('common.download')} ${model?.name ?? `${productType}.stl`}`}
              title={t('common.download')}
              onClick={() => void runDownload('stl')}
            >
              {isExporting ? (
                <Loader2 className='spin' size={17} />
              ) : (
                <Download size={17} />
              )}
              <span>{t('common.download')}</span>
            </button>
          ) : (
            <div className='download-menu' ref={downloadMenuRef}>
              <button
                className='tool-action download-menu-trigger'
                disabled={!canDownload || isExporting}
                aria-label={`${t('common.download')} ${getDefaultExportName(model, productType, downloadFormat)}`}
                aria-haspopup='menu'
                aria-expanded={isDownloadMenuOpen}
                title={t('common.download')}
                onClick={() => setIsDownloadMenuOpen((isOpen) => !isOpen)}
              >
                {isExporting ? (
                  <Loader2 className='spin' size={17} />
                ) : (
                  <Download size={17} />
                )}
                <span>{t('common.download')}</span>
                <ChevronDown className='download-menu-chevron' size={15} />
              </button>
              {isDownloadMenuOpen && canDownload && !isExporting ? (
                <div className='download-menu-list' role='menu'>
                  {downloadFormats.map((format) => (
                    <button
                      key={format}
                      className='download-menu-item'
                      type='button'
                      role='menuitem'
                      onClick={() => {
                        setIsDownloadMenuOpen(false);
                        void runDownload(format);
                      }}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <Viewer3D
          productType={productType}
          params={params}
          model={isWipProduct ? { source: 'empty', format: 'stl' } : model}
          showCutPlane={!isGenerating && !isCutPlaneDismissed}
          onModelBoundsChange={handleModelBoundsChange}
          onModelObjectBoundsChange={handleModelObjectBoundsChange}
          onMountingHoleMove={handleMountingHoleMove}
          onHeadKeychainAttachmentMove={handleHeadKeychainAttachmentMove}
        />
        <div className='stage-statusbar' aria-live='polite'>
          <span>{status}</span>
        </div>
        {isGenerating && (
          <div className='stage-loader' role='status' aria-live='polite'>
            <Loader2 className='spin' size={30} />
            <span>{t('status.generatingPreview')}</span>
          </div>
        )}
        {isLocked && (
          <div className={isWipProduct ? 'stage-lock stage-lock-wip' : 'stage-lock'}>
            {isWipProduct
              ? t('common.workInProgress')
              : isImageProduct(productType)
                ? t('status.loadImage')
                : t('status.loadValidStl')}
          </div>
        )}
      </section>

      <ParamPanel
        product={product}
        params={params}
        disabled={isLocked}
        modelMetadata={model?.metadata}
        modelObjectBounds={modelObjectBounds}
        paramOverrides={paramOverrides}
        paramDetails={paramDetails}
        showMaterialControls={
          isLocalCreator(productType) ||
          productType === 'textures' ||
          (model?.source === 'local' && ['lamp', 'urn', 'clicker'].includes(productType))
        }
        shouldCollapseSetup={shouldCollapseSetup}
        headerAction={<LanguageMenu />}
        onChange={updateParam}
      />

      <div
        className='toast-layer toast-layer-center'
        aria-live='polite'
        aria-atomic='true'
      >
        {toasts
          .filter((toast) => toast.placement === 'center')
          .map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id}>
              <strong>{toast.title}</strong>
            </div>
          ))}
      </div>
      <div
        className='toast-layer toast-layer-top'
        aria-live='assertive'
        aria-atomic='true'
      >
        {toasts
          .filter((toast) => toast.placement === 'top')
          .map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id}>
              <strong>{toast.title}</strong>
              {toast.messages && (
                <ul>
                  {toast.messages.map((message, index) => (
                    <li key={`${toast.id}-${index}`}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </div>
      <div
        className='toast-layer toast-layer-corner'
        aria-live='polite'
        aria-atomic='true'
      >
        {toasts
          .filter((toast) => toast.placement === 'corner')
          .map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id}>
              <strong>{toast.title}</strong>
              {toast.messages && (
                <ul>
                  {toast.messages.map((message, index) => (
                    <li key={`${toast.id}-${index}`}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </div>
    </main>
  );
}

function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const currentLanguage = (i18n.resolvedLanguage ?? 'es').split('-')[0];
  const languages = [
    { code: 'es', flag: '🇪🇸', label: t('language.es') },
    { code: 'en', flag: '🇺🇸', label: t('language.en') },
    { code: 'fr', flag: '🇫🇷', label: t('language.fr') },
  ];
  const current = languages.find((language) => language.code === currentLanguage) ?? languages[0];

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (
        detailsRef.current?.open &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        detailsRef.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current) {
        detailsRef.current.open = false;
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <details className='language-menu' ref={detailsRef}>
      <summary aria-label={t('language.label')} title={t('language.label')}>
        <span aria-hidden='true'>{current.flag}</span>
      </summary>
      <div className='language-menu-popover' role='menu'>
        {languages.map((language) => (
          <button
            type='button'
            role='menuitemradio'
            aria-checked={language.code === currentLanguage}
            className={language.code === currentLanguage ? 'active' : ''}
            key={language.code}
            onClick={() => {
              window.localStorage.setItem('horama-language', language.code);
              void i18n.changeLanguage(language.code);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <span aria-hidden='true'>{language.flag}</span>
            <strong>{language.label}</strong>
          </button>
        ))}
      </div>
    </details>
  );
}

function roundToTenth(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function roundDownToHalf(value: number): number {
  return Math.max(0, Math.floor(value * 2) / 2);
}

function playDuckDownloadSound() {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/duck-quack.mp3`);
  audio.volume = 0.55;
  void audio.play().catch(() => {
    // Browsers can block audio in some contexts; downloading should continue silently.
  });
}
