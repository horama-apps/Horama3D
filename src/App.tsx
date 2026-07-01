import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Download, FileUp, Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { analyzeModel, generateModel } from './api/stpApi';
import { ParamPanel } from './components/ParamPanel';
import { Viewer3D } from './components/Viewer3D';
import { getDefaultParams, getProduct, products } from './products/catalog';
import type { GeneratedModel, ProductParams, ProductType } from './types';

export function App() {
  const [productType, setProductType] = useState<ProductType>('urn');
  const product = useMemo(() => getProduct(productType), [productType]);
  const [paramsByType, setParamsByType] = useState<Record<ProductType, ProductParams>>({
    urn: getDefaultParams(getProduct('urn')),
    clicker: getDefaultParams(getProduct('clicker')),
  });
  const [model, setModel] = useState<GeneratedModel | null>({ source: 'empty', format: 'stl' });
  const [status, setStatus] = useState('Load an STL to inspect it in the viewer');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isModelValidated, setIsModelValidated] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);

  const params = paramsByType[productType];
  const isLocked = !isModelValidated;

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) URL.revokeObjectURL(uploadedUrlRef.current);
    };
  }, []);

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

  const returnToDefaultState = (nextStatus = 'Load an STL to inspect it in the viewer') => {
    setActiveModel({ source: 'empty', format: 'stl' });
    setIsModelValidated(false);
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

  const runGenerate = async () => {
    if (isLocked) return;
    setIsGenerating(true);
    setStatus('Generating through STP pipeline...');
    try {
      const generated = await generateModel(productType, params);
      setActiveModel(generated);
      setIsModelValidated(generated.source !== 'empty');
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
    setParamsByType((current) => ({
      ...current,
      [productType]: getDefaultParams(product),
    }));
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

      if (!analysis.isValid) {
        window.alert(analysis.message ?? 'The STL model is not valid.');
        returnToDefaultState('Model rejected. Load a valid STL to continue.');
        return;
      }

      const modelUrl = URL.createObjectURL(file);
      setActiveModel({
        source: 'upload',
        name: file.name,
        modelUrl,
        downloadUrl: modelUrl,
        format: 'stl',
      });
      setIsModelValidated(true);
      setStatus(`Loaded ${file.name}`);
      window.alert('The STL file can be loaded correctly.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not validate the STL model.');
      returnToDefaultState('Could not validate the model. Try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadHref = model?.downloadUrl ?? model?.modelUrl;

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
            <p>{model?.source === 'upload' ? model.name : 'Select a local STL to preview.'}</p>
          </div>

          {products.map((item) => (
            <button
              className={item.type === productType ? 'product-button active' : 'product-button'}
              key={item.type}
              disabled={isLocked}
              onClick={() => {
                setProductType(item.type);
                setStatus(model?.source === 'upload' ? 'STL loaded' : 'Load an STL to inspect it in the viewer');
              }}
            >
              <span>{item.name}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <div className="actions">
          <button className="primary-action" disabled={isLocked || isGenerating} onClick={runGenerate}>
            {isGenerating ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            Generate
          </button>
          <button className="secondary-action" disabled={isLocked} onClick={resetParams}>
            <RotateCcw size={17} />
            Reset
          </button>
          <a
            className={downloadHref ? 'secondary-action' : 'secondary-action disabled'}
            href={downloadHref}
            download={model?.name ?? `${productType}-stp-model.${model?.format ?? 'stl'}`}
            aria-disabled={!downloadHref}
          >
            <Download size={17} />
            Download
          </a>
        </div>

        <p className="status">{status}</p>
      </aside>

      <section className={isLocked ? 'stage stage-disabled' : 'stage'}>
        <Viewer3D productType={productType} params={params} model={model} />
        {isLocked && <div className="stage-lock">Load a valid STL to unlock the 3D preview.</div>}
      </section>

      <ParamPanel product={product} params={params} disabled={isLocked} onChange={updateParam} />
    </main>
  );
}
