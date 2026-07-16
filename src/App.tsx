import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { analyzeModel, checkStpHealth, generateModel } from './api/stpApi';
import { generateSignModel } from './generation/signGenerator';
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
  ProductParams,
  ProductType,
} from './types';

type ToastTone = 'success' | 'warning' | 'error' | 'issue';
type ToastPlacement = 'center' | 'corner' | 'top';
type StpStatusTone = 'checking' | 'healthy' | 'unhealthy';
type ConfiguratorMode = 'stl' | 'image' | 'create';

interface Toast {
  id: number;
  tone: ToastTone;
  placement: ToastPlacement;
  title: string;
  messages?: string[];
}

interface StpStatus {
  tone: StpStatusTone;
  label: string;
}

const wipProductTypes: ProductType[] = ['keychains', 'image_layers'];
const productsByConfigurator: Record<ConfiguratorMode, ProductType[]> = {
  stl: ['urn', 'clicker', 'textures'],
  image: ['keychains', 'image_layers'],
  create: ['signs'],
};
const defaultProductByConfigurator: Record<ConfiguratorMode, ProductType> = {
  stl: 'urn',
  image: 'keychains',
  create: 'signs',
};

function isWipProductType(type: ProductType): boolean {
  return wipProductTypes.includes(type);
}

export function App() {
  const [configuratorMode, setConfiguratorMode] =
    useState<ConfiguratorMode>('stl');
  const [productType, setProductType] = useState<ProductType>('urn');
  const product = useMemo(() => getProduct(productType), [productType]);
  const [paramsByType, setParamsByType] = useState<
    Record<ProductType, ProductParams>
  >({
    urn: getDefaultParams(getProduct('urn')),
    clicker: getDefaultParams(getProduct('clicker')),
    textures: getDefaultParams(getProduct('textures')),
    keychains: getDefaultParams(getProduct('keychains')),
    image_layers: getDefaultParams(getProduct('image_layers')),
    signs: getDefaultParams(getProduct('signs')),
  });
  const [model, setModel] = useState<GeneratedModel | null>({
    source: 'empty',
    format: 'stl',
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [status, setStatus] = useState(
    'Load an STL to inspect it in the viewer',
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('stl');
  const [isModelValidated, setIsModelValidated] = useState(false);
  const [stpStatus, setStpStatus] = useState<StpStatus>({
    tone: 'checking',
    label: 'Checking STP',
  });
  const [hasUsedViewerActions, setHasUsedViewerActions] = useState(false);
  const [shouldCollapseSetup, setShouldCollapseSetup] = useState(false);
  const [isCutPlaneDismissed, setIsCutPlaneDismissed] = useState(false);
  const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(0);
  const toastTimeoutRefs = useRef<number[]>([]);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [signHolePositions, setSignHolePositions] = useState<
    Record<string, { u: number; v: number }>
  >({});

  const params = paramsByType[productType];
  const visibleProducts = useMemo(
    () =>
      products.filter((item) =>
        productsByConfigurator[configuratorMode].includes(item.type),
      ),
    [configuratorMode],
  );
  const isWipProduct = isWipProductType(productType);
  const requiresUploadedModel = productType !== 'signs';
  const isLocked = isWipProduct || (requiresUploadedModel && !isModelValidated);
  const clickerCutHeightMin = modelBounds
    ? roundToTenth(modelBounds.height * 0.2)
    : 0;
  const clickerCutHeightMax = modelBounds
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
      if (productType === 'clicker') {
        overrides.cut_height_mm = {
          min: clickerCutHeightMin,
          max: clickerCutHeightMax,
          step: 0.1,
        };
      }
      if (productType === 'signs') {
        overrides.mounting_hole_depth_mm = {
          min: 1,
          max: signMountingDepthMax,
          step: 0.5,
        };
      }
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    },
    [clickerCutHeightMax, clickerCutHeightMin, productType, signMountingDepthMax],
  );

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
      toastTimeoutRefs.current.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshStpStatus = async () => {
      const health = await checkStpHealth();
      if (!isMounted) return;
      setStpStatus({
        tone: health.isHealthy ? 'healthy' : 'unhealthy',
        label: health.message,
      });
    };

    void refreshStpStatus();
    const intervalId = window.setInterval(refreshStpStatus, 20000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
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
    setModel(nextModel);
  };

  const restoreUploadedModel = (nextStatus = 'STL loaded') => {
    if (!uploadedFile) return;

    const modelUrl = URL.createObjectURL(uploadedFile);
    setActiveModel({
      source: 'upload',
      name: uploadedFile.name,
      modelUrl,
      downloadUrl: modelUrl,
      format: 'stl',
    });
    setIsModelValidated(true);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);
    setStatus(nextStatus);
  };

  const returnToDefaultState = (
    nextStatus = 'Load an STL to inspect it in the viewer',
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
    if (productType === 'signs' && key === 'mounting_holes' && value) {
      showToast(
        {
          tone: 'warning',
          placement: 'center',
          title: 'Move the red circle indicators to choose each hole position.',
        },
        6200,
      );
    }
    setParamsByType((current) => ({
      ...current,
      [productType]: {
        ...current[productType],
        [key]: value,
        ...(productType === 'signs' && key === 'hollow' && value
          ? { mounting_holes: false }
          : {}),
        ...(productType === 'signs' && key === 'mounting_holes' && value
          ? { hollow: false }
          : {}),
      },
    }));
    setStatus(
      model?.source === 'upload'
        ? 'STL loaded. Parameters are ready for the STP API.'
        : 'Parameters updated',
    );
  };

  const handleModelBoundsChange = useCallback((bounds: ModelBounds | null) => {
    setModelBounds(bounds);
  }, []);

  useEffect(() => {
    if (productType !== 'clicker' || model?.source !== 'upload' || !modelBounds)
      return;

    const minCutHeight = roundToTenth(modelBounds.height * 0.2);
    const maxCutHeight = roundToTenth(modelBounds.height * 0.8);
    setParamsByType((current) => {
      const currentValue = Number(current.clicker.cut_height_mm);
      if (
        Number.isFinite(currentValue) &&
        currentValue >= minCutHeight &&
        currentValue <= maxCutHeight
      )
        return current;
      return {
        ...current,
        clicker: {
          ...current.clicker,
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
      productType === 'signs'
        ? 'Generating sign locally...'
        : 'Generating through STP pipeline...',
    );
    try {
      const generated =
        productType === 'signs'
          ? await generateSignModel({
              ...params,
              mounting_hole_positions: JSON.stringify(signHolePositions),
            })
          : await generateModel(
              productType,
              params,
              uploadedFile ?? undefined,
            );
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
            title: 'Transform warnings',
            messages: generated.metadata.warnings,
          },
          6200,
        );
      }
      setStatus(
        generated.source === 'empty'
          ? 'Add VITE_STP_API_BASE_URL to call STP, or load an STL manually.'
          : 'Generated model loaded',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMountingHoleMove = useCallback(
    async (key: string, u: number, v: number) => {
      if (productType !== 'signs' || !params.mounting_holes) return;
      const nextPositions = {
        ...signHolePositions,
        [key]: { u, v },
      };
      setSignHolePositions(nextPositions);
      setIsGenerating(true);
      setStatus('Updating mounting hole position...');
      try {
        const generated = await generateSignModel({
          ...params,
          mounting_hole_positions: JSON.stringify(nextPositions),
        });
        setActiveModel(generated);
        setStatus('Mounting hole position updated');
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : 'Could not move the mounting hole',
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [params, productType, signHolePositions],
  );

  const selectProduct = (nextType: ProductType) => {
    setProductType(nextType);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);

    if (nextType === 'signs' || isWipProductType(nextType)) {
      setActiveModel({ source: 'empty', format: 'stl' });
      setStatus(
        nextType === 'signs'
          ? 'Configure the sign and generate a preview.'
          : 'This module is still in progress.',
      );
      return;
    }

    if (uploadedFile) {
      restoreUploadedModel('STL loaded');
    } else {
      setActiveModel({ source: 'empty', format: 'stl' });
      setIsModelValidated(false);
      setStatus('Load an STL to inspect it in the viewer');
    }
  };

  const selectConfiguratorMode = (nextMode: ConfiguratorMode) => {
    const nextProduct = defaultProductByConfigurator[nextMode];
    setConfiguratorMode(nextMode);
    setProductType(nextProduct);
    setShouldCollapseSetup(false);
    setIsCutPlaneDismissed(false);
    setHasUsedViewerActions(false);
    setSignHolePositions({});

    if (nextMode === 'stl' && uploadedFile) {
      restoreUploadedModel('STL loaded');
      return;
    }

    setActiveModel({ source: 'empty', format: 'stl' });
    setIsModelValidated(false);
    setModelBounds(null);
    setStatus(
      nextMode === 'stl'
        ? 'Load an STL to inspect it in the viewer'
        : nextMode === 'create'
          ? 'Configure the sign and generate a preview.'
          : 'This image module is still in progress.',
    );
  };

  const resetParams = () => {
    setHasUsedViewerActions(true);
    if (productType === 'signs') setSignHolePositions({});
    setParamsByType((current) => ({
      ...current,
      [productType]: getDefaultParams(product),
    }));

    if (productType === 'clicker' && uploadedFile) {
      restoreUploadedModel('STL loaded');
      return;
    }

    setStatus('Defaults restored');
  };

  const loadStlFile = async (file: File | undefined) => {
    if (!file) return;
    const isStl = file.name.toLowerCase().endsWith('.stl');
    if (!isStl) {
      setStatus('Please select an STL file.');
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
      return;
    }

    returnToDefaultState(`Analyzing ${file.name} through STP...`);
    setIsAnalyzing(true);

    try {
      const analysis = await analyzeModel(file);

      if (analysis.warnings.length > 0) {
        showToast(
          {
            tone: 'warning',
            placement: 'corner',
            title: 'Validation warnings',
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
              title: 'Validation issues',
              messages: analysis.issues,
            },
            6200,
          );
        } else {
          showToast({
            tone: 'error',
            placement: 'center',
            title: analysis.message ?? 'The STL model is not valid.',
          });
        }
        returnToDefaultState('Model rejected. Load a valid STL to continue.');
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
      setStatus(`Loaded ${file.name}`);
      showToast({
        tone: 'success',
        placement: 'center',
        title: 'The STL file can be loaded correctly.',
      });
    } catch (error) {
      showToast({
        tone: 'error',
        placement: 'center',
        title:
          error instanceof Error
            ? error.message
            : 'Could not validate the STL model.',
      });
      returnToDefaultState('Could not validate the model. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runDownload = async (format = downloadFormat) => {
    if (!model || model.source === 'empty' || isExporting) return;

    const requestedFormat = productType === 'signs' ? 'stl' : format;
    setDownloadFormat(requestedFormat);
    setHasUsedViewerActions(true);
    setIsExporting(true);
    setStatus(
      requestedFormat === '3mf'
        ? 'Preparing 3MF with preview materials...'
        : productType === 'signs'
          ? 'Preparing STL...'
          : 'Preparing STL ZIP...',
    );

    try {
      let exported: { blob: Blob; filename: string };
      if (productType === 'signs') {
        let signBlob = model.blob;
        if (!signBlob) {
          const response = await fetch(model.downloadUrl ?? model.modelUrl ?? '');
          if (!response.ok) throw new Error('Could not prepare the sign STL.');
          signBlob = await response.blob();
        }
        exported = {
          blob: signBlob,
          filename: model.name ?? 'sign.stl',
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
      setStatus(`Downloaded ${exported.filename}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Download failed';
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
    !isWipProduct &&
    Boolean(
      model &&
      model.source !== 'empty' &&
      (productType !== 'signs' || model.source === 'local'),
    );
  const shouldExpandViewerActions = !isLocked && !hasUsedViewerActions;
  const downloadFormats: DownloadFormat[] = ['stl', '3mf'];

  return (
    <main
      className='app-shell'
      style={{ '--accent': product.accent } as React.CSSProperties}
    >
      <aside className='panel panel-left'>
        <div className='brand'>
          <div className='brand-mark'>
            <Box size={22} />
          </div>
          <div>
            <h1>Horama Configurator</h1>
          </div>
        </div>

        <div className='configurator-selector'>
          <select
            aria-label='Configurator type'
            value={configuratorMode}
            onChange={(event) =>
              selectConfiguratorMode(event.target.value as ConfiguratorMode)
            }
          >
            <option value='stl'>STL</option>
            <option value='image'>IMG to STL</option>
            <option value='create'>Create from Scratch</option>
          </select>
        </div>

        <div className='product-list'>
          {configuratorMode === 'stl' ? (
            <div className='upload-card'>
            <input
              ref={uploadInputRef}
              className='file-input'
              type='file'
              accept='.stl,model/stl,application/vnd.ms-pki.stl'
              onChange={(event) => loadStlFile(event.target.files?.[0])}
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
              {isAnalyzing ? 'Analyzing STL' : 'Load STL'}
            </button>
            <p>
              {uploadedFile
                ? uploadedFile.name
                : 'Select a local STL to preview.'}
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
                isLocked &&
                item.type !== 'signs' &&
                !isWipProductType(item.type) &&
                !isWipProduct
              }
              onClick={() => selectProduct(item.type)}
            >
              <span className='product-button-title'>
                {item.name}
                {isWipProductType(item.type) ? (
                  <span className='wip-badge'>WIP</span>
                ) : null}
              </span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <div
          className={`stp-status stp-status-${configuratorMode === 'create' ? 'healthy' : configuratorMode === 'image' ? 'checking' : stpStatus.tone}`}
          title={
            configuratorMode === 'create'
              ? 'Generated in this browser'
              : configuratorMode === 'image'
                ? 'Image workflow modules'
                : stpStatus.label
          }
          aria-label={
            configuratorMode === 'create'
              ? 'Local generator ready'
              : configuratorMode === 'image'
                ? 'Image workflow'
              : `STP API Status: ${stpStatus.label}`
          }
        >
          <span aria-hidden='true' />
          <strong>
            {configuratorMode === 'create'
              ? 'Local generator'
              : configuratorMode === 'image'
                ? 'Image workflow'
                : 'STP API Status'}
          </strong>
        </div>
      </aside>

      <section className={isLocked ? 'stage stage-disabled' : 'stage'}>
        <div
          className={
            shouldExpandViewerActions
              ? 'stage-toolbar stage-toolbar-expanded'
              : 'stage-toolbar'
          }
          aria-label='Viewer actions'
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
            <span>Generate</span>
          </button>
          <button
            className='tool-action'
            disabled={isLocked}
            onClick={resetParams}
            aria-label='Reset'
            title='Reset'
          >
            <RotateCcw size={17} />
            <span>Reset</span>
          </button>
          {productType === 'signs' ? (
            <button
              className='tool-action'
              disabled={!canDownload || isExporting}
              aria-label={`Download ${model?.name ?? 'sign.stl'}`}
              title='Download STL'
              onClick={() => void runDownload('stl')}
            >
              {isExporting ? (
                <Loader2 className='spin' size={17} />
              ) : (
                <Download size={17} />
              )}
              <span>Download</span>
            </button>
          ) : (
            <div className='download-menu' ref={downloadMenuRef}>
              <button
                className='tool-action download-menu-trigger'
                disabled={!canDownload || isExporting}
                aria-label={`Download ${getDefaultExportName(model, productType, downloadFormat)}`}
                aria-haspopup='menu'
                aria-expanded={isDownloadMenuOpen}
                title='Download'
                onClick={() => setIsDownloadMenuOpen((isOpen) => !isOpen)}
              >
                {isExporting ? (
                  <Loader2 className='spin' size={17} />
                ) : (
                  <Download size={17} />
                )}
                <span>Download</span>
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
          onMountingHoleMove={handleMountingHoleMove}
        />
        <div className='stage-statusbar' aria-live='polite'>
          <span>{status}</span>
        </div>
        {isGenerating && (
          <div className='stage-loader' role='status' aria-live='polite'>
            <Loader2 className='spin' size={30} />
            <span>Generating preview</span>
          </div>
        )}
        {isLocked && (
          <div className={isWipProduct ? 'stage-lock stage-lock-wip' : 'stage-lock'}>
            {isWipProduct
              ? 'work in progress'
              : 'Load a valid STL to unlock the 3D preview.'}
          </div>
        )}
      </section>

      <ParamPanel
        product={product}
        params={params}
        disabled={isLocked}
        modelMetadata={model?.metadata}
        paramOverrides={paramOverrides}
        showMaterialControls={productType === 'signs' || model?.source === 'api'}
        shouldCollapseSetup={shouldCollapseSetup}
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

function roundToTenth(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function playDuckDownloadSound() {
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/duck-quack.mp3`);
  audio.volume = 0.55;
  void audio.play().catch(() => {
    // Browsers can block audio in some contexts; downloading should continue silently.
  });
}
