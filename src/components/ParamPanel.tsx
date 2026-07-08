import { useEffect, useState } from 'react';
import type {
  GeneratedModel,
  ParamDefinition,
  ProductDefinition,
  ProductParams,
  NumberParamDefinition,
  ClickerTransformInfo,
  UrnTransformInfo,
} from '../types';

interface ParamPanelProps {
  product: ProductDefinition;
  params: ProductParams;
  disabled?: boolean;
  modelMetadata?: GeneratedModel['metadata'];
  paramOverrides?: Record<string, Partial<Pick<NumberParamDefinition, 'min' | 'max' | 'step'>>>;
  showMaterialControls?: boolean;
  shouldCollapseSetup?: boolean;
  onChange: (key: string, value: ProductParams[string]) => void;
}

export function ParamPanel({
  product,
  params,
  disabled = false,
  modelMetadata,
  paramOverrides = {},
  showMaterialControls = false,
  shouldCollapseSetup = false,
  onChange,
}: ParamPanelProps) {
  const [openSections, setOpenSections] = useState({
    parameters: true,
    materials: false,
    transformInfo: false,
  });
  const urnInfo = product.type === 'urn' ? modelMetadata?.urn : undefined;
  const clickerInfo = product.type === 'clicker' ? modelMetadata?.clicker : undefined;
  const transformInfoRows = urnInfo
    ? getUrnInfoRows(urnInfo)
    : clickerInfo
      ? getClickerInfoRows(clickerInfo)
      : [];
  const colorParams = product.params.filter((param) => param.kind === 'color');
  const postProcessingParams =
    product.type === 'clicker'
      ? product.params.filter((param) =>
          [
            'keychain_hole',
            'keychain_hole_placement',
            'keychain_hole_angle_deg',
            'keychain_hole_inset_mm',
          ].includes(param.key),
        )
      : [];
  const mainParams = product.params.filter(
    (param) =>
      param.kind !== 'color' &&
      !postProcessingParams.some((postParam) => postParam.key === param.key),
  );
  const visiblePostProcessingParams = postProcessingParams.filter(
    (param) =>
      param.key === 'keychain_hole' ||
      (Boolean(params.keychain_hole) &&
        (
          param.key !== 'keychain_hole_angle_deg' ||
          params.keychain_hole_placement !== 'top'
        )),
  );
  const shouldShowPostProcessingSection =
    showMaterialControls &&
    (colorParams.length > 0 || visiblePostProcessingParams.length > 0);
  const hasVisibleColors = showMaterialControls && colorParams.length > 0;

  useEffect(() => {
    setOpenSections((current) => ({
      ...current,
      parameters: !shouldCollapseSetup,
    }));
  }, [shouldCollapseSetup]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <aside className={disabled ? 'panel panel-right panel-disabled' : 'panel panel-right'}>
      <div className="panel-heading">
        <p className="eyebrow">Parameters</p>
        <h2>{product.name}</h2>
        {product.type === 'clicker' && (
          <p className="parameter-note">
            After generating, use Reset to return to the original STL and show the Z cut plane again.
          </p>
        )}
      </div>

      <section className="main-param-section" aria-label={`${product.name} parameters`}>
        <CollapsibleHeading
          eyebrow="Setup"
          title="Parameters"
          isOpen={openSections.parameters}
          onToggle={() => toggleSection('parameters')}
        />
        {openSections.parameters && (
          <div className="controls">
            {mainParams.map((param) => (
              <ParamControl
                key={param.key}
                param={param}
                value={params[param.key] ?? param.defaultValue}
                disabled={disabled}
                override={paramOverrides[param.key]}
                onChange={(value) => onChange(param.key, value)}
              />
            ))}
          </div>
        )}
      </section>

      {shouldShowPostProcessingSection && (
        <section className="color-section" aria-label="Model post processing">
          <CollapsibleHeading
            eyebrow="Customization"
            title="Options"
            isOpen={openSections.materials}
            onToggle={() => toggleSection('materials')}
          />
          {openSections.materials && (
            <div className="controls color-controls">
              {hasVisibleColors && colorParams.map((param) => (
                <ParamControl
                  key={param.key}
                  param={param}
                  value={params[param.key] ?? param.defaultValue}
                  disabled={disabled}
                  override={paramOverrides[param.key]}
                  onChange={(value) => onChange(param.key, value)}
                />
              ))}
              {visiblePostProcessingParams.map((param) => (
                <ParamControl
                  key={param.key}
                  param={param}
                  value={params[param.key] ?? param.defaultValue}
                  disabled={disabled}
                  override={paramOverrides[param.key]}
                  onChange={(value) => onChange(param.key, value)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {transformInfoRows.length > 0 && (
        <section className="transform-info" aria-label={`${product.name} transform information`}>
          <CollapsibleHeading
            eyebrow="Transform info"
            title={`Generated ${product.type === 'clicker' ? 'clicker' : 'urn'}`}
            isOpen={openSections.transformInfo}
            onToggle={() => toggleSection('transformInfo')}
          />
          {openSections.transformInfo && (
            <>
              <dl>
                {transformInfoRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {modelMetadata?.objects && modelMetadata.objects.length > 0 && (
                <p className="object-list">Objects: {modelMetadata.objects.join(', ')}</p>
              )}
            </>
          )}
        </section>
      )}
    </aside>
  );
}

interface CollapsibleHeadingProps {
  eyebrow: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}

function CollapsibleHeading({
  eyebrow,
  title,
  isOpen,
  onToggle,
}: CollapsibleHeadingProps) {
  return (
    <button
      className="collapsible-heading"
      type="button"
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Hide' : 'Show'} ${eyebrow}`}
      onClick={onToggle}
    >
      <span>
        <p className="eyebrow">{eyebrow}</p>
        {isOpen && <h3>{title}</h3>}
      </span>
      <strong>{isOpen ? 'Hide' : 'Show'}</strong>
    </button>
  );
}

interface ParamControlProps {
  param: ParamDefinition;
  value: ProductParams[string];
  disabled: boolean;
  override?: Partial<Pick<NumberParamDefinition, 'min' | 'max' | 'step'>>;
  onChange: (value: ProductParams[string]) => void;
}

function ParamControl({ param, value, disabled, override, onChange }: ParamControlProps) {
  if (param.kind === 'boolean') {
    return (
      <label className="toggle-row">
        <span>{param.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (param.kind === 'select') {
    return (
      <label className="field">
        <span>{param.label}</span>
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {param.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.kind === 'text') {
    return (
      <label className="field">
        <span>{param.label}</span>
        {param.multiline ? (
          <textarea
            value={String(value)}
            disabled={disabled}
            placeholder={param.placeholder}
            rows={3}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            type="text"
            value={String(value)}
            disabled={disabled}
            placeholder={param.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
    );
  }

  if (param.kind === 'color') {
    return (
      <label className="field color-field">
        <span>{param.label}</span>
        <span className="color-control">
          <input
            type="color"
            value={String(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
          <input
            type="text"
            value={String(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      </label>
    );
  }

  const min = override?.min ?? param.min;
  const max = override?.max ?? param.max;
  const step = override?.step ?? param.step;

  return (
    <label className="field">
      <span>
        {param.label}
        <strong>
          {formatNumberValue(Number(value), step)}
          {param.unit ? ` ${param.unit}` : ''}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(value)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function formatNumberValue(value: number, step: number): string {
  const stepText = String(step);
  const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
  return value.toFixed(decimals);
}

function getUrnInfoRows(info: UrnTransformInfo) {
  return [
    { label: 'Size', value: info.size?.toUpperCase() },
    { label: 'Target capacity', value: formatInfoNumber(info.target_capacity_ml, 'ml') },
    { label: 'Estimated capacity', value: formatInfoNumber(info.estimated_capacity_ml, 'ml') },
    { label: 'Applied scale', value: formatInfoNumber(info.applied_scale) },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getClickerInfoRows(info: ClickerTransformInfo) {
  return [
    { label: 'Cut height', value: formatInfoNumber(info.cut_height_mm, 'mm') },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function formatInfoNumber(value: number | undefined, unit?: string): string | undefined {
  if (value === undefined) return undefined;
  const formatted = value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}
