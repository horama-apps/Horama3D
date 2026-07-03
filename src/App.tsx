import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Download, FileUp, Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { analyzeModel, generateModel } from './api/stpApi';
import { ParamPanel } from './components/ParamPanel';
import { Viewer3D } from './components/Viewer3D';
import { getDefaultParams, getProduct, products } from './products/catalog';
import type { GeneratedModel, ModelBounds, ProductParams, ProductType } from './types';

type ToastTone = 'success' | 'warning' | 'error' | 'issue';
type ToastPlacement = 'center' | 'corner' | 'top';

interface Toast {
  id: number;
  tone: ToastTone;
  placement: ToastPlacement;
  title: string;
  messages?: string[];
}

export function App() {
  const [productType, setProductType] = useState<ProductType>('urn');
  const product = useMemo(() => getProduct(productType), [productType]);
  const [paramsByType, setParamsByType] = useState<Record<ProductType, ProductParams>>({
    urn: getDefaultParams(getProduct('urn')),
    clicker: getDefaultParams(getProduct('clicker')),
    textures: getDefaultParams(getProduct('textures')),
  });
  const [model, setModel] = useState<GeneratedModel | null>({ source: 'empty', format: 'stl' });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [status, setStatus] = useState('Load an STL to inspect it in the viewer');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelValidated, setIsModelValidated] = useState(false);
  const [hasUsedViewerActions, setHasUsedViewerActions] = useState(false);
  const [isCutPlaneDismissed, setIsCutPlaneDismissed] = useState(false);
  const [modelBounds, setModelBounds] = useState<ModelBounds | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);
  const toastIdRef = useRef(0);
  const toastTimeoutRefs = useRef<number[]>([]);

  const params = paramsByType[productType];
  const isLocked = !isModelValidated;
  const clickerCutHeightMin = modelBounds ? roundToTenth(modelBounds.height * 0.2) : 0;
  const clickerCutHeightMax = modelBounds ? roundToTenth(modelBounds.height * 0.8) : 1;
  const paramOverrides = useMemo(
    () =>
      productType === 'clicker'
        ? {
            cut_height_mm: {
              min: clickerCutHeightMin,
              max: clickerCutHeightMax,
              step: 0.1,
            },
          }
        : undefined,
    [clickerCutHeightMax, clickerCutHeightMin, productType],
  );

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
      toastTimeoutRefs.current.forEach(window.clearTimeout);
    };
  }, []);

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
    if (uploadedUrlRef.current && nextModel?.modelUrl !== uploadedUrlRef.current) {
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
    setIsCutPlaneDismissed(false);
    setStatus(nextStatus);
  };

  const returnToDefaultState = (nextStatus = 'Load an STL to inspect it in the viewer') => {
    setActiveModel({ source: 'empty', format: 'stl' });
    setUploadedFile(null);
    setIsModelValidated(false);
    setIsCutPlaneDismissed(false);
    setStatus(nextStatus);
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  };

  const updateParam = (key: string, value: ProductParams[string]) => {
    setParamsByType((current) => ({
      ...current,
      [productType]: {
        ...current[productType],
        [key]: value,
      },
    }));
    setStatus(model?.source === 'upload' ? 'STL loaded. Parameters are ready for the STP API.' : 'Parameters updated');
  };

  const handleModelBoundsChange = useCallback((bounds: ModelBounds | null) => {
    setModelBounds(bounds);
  }, []);

  useEffect(() => {
    if (productType !== 'clicker' || model?.source !== 'upload' || !modelBounds) return;

    const minCutHeight = roundToTenth(modelBounds.height * 0.2);
    const maxCutHeight = roundToTenth(modelBounds.height * 0.8);
    setParamsByType((current) => {
      const currentValue = Number(current.clicker.cut_height_mm);
      if (Number.isFinite(currentValue) && currentValue >= minCutHeight && currentValue <= maxCutHeight) return current;
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
    setIsCutPlaneDismissed(true);
    setIsGenerating(true);
    setStatus('Generating through STP pipeline...');
    try {
      const generated = await generateModel(productType, params, uploadedFile ?? undefined);
      setActiveModel(generated);
      setIsModelValidated(generated.source !== 'empty');
      if (generated.metadata?.warnings && generated.metadata.warnings.length > 0) {
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

  const resetParams = () => {
    setHasUsedViewerActions(true);
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
        title: error instanceof Error ? error.message : 'Could not validate the STL model.',
      });
      returnToDefaultState('Could not validate the model. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadHref = model?.downloadUrl ?? model?.modelUrl;
  const shouldExpandViewerActions = !isLocked && !hasUsedViewerActions;

  return (
    <main className="app-shell" style={{ '--accent': product.accent } as React.CSSProperties}>
      <aside className="panel panel-left">
        <div className="brand">
          <div className="brand-mark">
            <Box size={22} />
          </div>
          <div>
            <p>Horama3D</p>
            <h1>STP Configurator</h1>
          </div>
        </div>

        <div className="product-list">
          <div className="upload-card">
            <input
              ref={uploadInputRef}
              className="file-input"
              type="file"
              accept=".stl,model/stl,application/vnd.ms-pki.stl"
              onChange={(event) => loadStlFile(event.target.files?.[0])}
            />
            <button
              className="upload-button"
              disabled={isAnalyzing}
              onClick={() => uploadInputRef.current?.click()}
            >
              {isAnalyzing ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
              {isAnalyzing ? 'Analyzing STL' : 'Load STL'}
            </button>
            <p>{uploadedFile ? uploadedFile.name : 'Select a local STL to preview.'}</p>
          </div>

          {products.map((item) => (
            <button
              className={item.type === productType ? 'product-button active' : 'product-button'}
              key={item.type}
              disabled={isLocked}
              onClick={() => {
                setProductType(item.type);
                restoreUploadedModel('STL loaded');
              }}
            >
              <span>{item.name}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

      </aside>

      <section className={isLocked ? 'stage stage-disabled' : 'stage'}>
        <div
          className={shouldExpandViewerActions ? 'stage-toolbar stage-toolbar-expanded' : 'stage-toolbar'}
          aria-label="Viewer actions"
        >
          <button className="primary-action" disabled={isLocked || isGenerating} onClick={runGenerate}>
            {isGenerating ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            <span>Generate</span>
          </button>
          <button className="tool-action" disabled={isLocked} onClick={resetParams} aria-label="Reset" title="Reset">
            <RotateCcw size={17} />
            <span>Reset</span>
          </button>
          <a
            className={downloadHref ? 'tool-action' : 'tool-action disabled'}
            href={downloadHref}
            download={model?.name ?? `${productType}-stp-model.${model?.format ?? 'stl'}`}
            aria-disabled={!downloadHref}
            aria-label="Download"
            title="Download"
            onClick={() => {
              if (downloadHref) setHasUsedViewerActions(true);
            }}
          >
            <Download size={17} />
            <span>Download</span>
          </a>
        </div>
        <Viewer3D
          productType={productType}
          params={params}
          model={model}
          showCutPlane={!isGenerating && !isCutPlaneDismissed}
          onModelBoundsChange={handleModelBoundsChange}
        />
        <div className="stage-statusbar" aria-live="polite">
          <span>{status}</span>
        </div>
        {isGenerating && (
          <div className="stage-loader" role="status" aria-live="polite">
            <Loader2 className="spin" size={30} />
            <span>Generating preview</span>
          </div>
        )}
        {isLocked && <div className="stage-lock">Load a valid STL to unlock the 3D preview.</div>}
      </section>

      <ParamPanel
        product={product}
        params={params}
        disabled={isLocked}
        modelMetadata={model?.metadata}
        paramOverrides={paramOverrides}
        showMaterialControls={model?.source === 'api'}
        onChange={updateParam}
      />

      <div className="toast-layer toast-layer-center" aria-live="polite" aria-atomic="true">
        {toasts
          .filter((toast) => toast.placement === 'center')
          .map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id}>
              <strong>{toast.title}</strong>
            </div>
          ))}
      </div>
      <div className="toast-layer toast-layer-top" aria-live="assertive" aria-atomic="true">
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
      <div className="toast-layer toast-layer-corner" aria-live="polite" aria-atomic="true">
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
