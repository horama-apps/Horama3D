import { useEffect, useRef, useState } from 'react';
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
      : product.type === 'signs'
        ? product.params.filter((param) =>
            [
              'texture',
              'texture_depth_mm',
              'texture_spacing_mm',
            ].includes(param.key),
          )
      : [];
  const mainParams = product.params.filter(
    (param) =>
      param.kind !== 'color' &&
      !postProcessingParams.some((postParam) => postParam.key === param.key),
  );
  const visibleMainParams = mainParams.filter(
    (param) =>
      product.type !== 'signs' ||
      (!['wall_thickness_mm', 'wall_height_mm'].includes(param.key) &&
        !['mounting_hole_diameter_mm', 'mounting_hole_depth_mm'].includes(param.key)) ||
      (['wall_thickness_mm', 'wall_height_mm'].includes(param.key) && Boolean(params.hollow)) ||
      (['mounting_hole_diameter_mm', 'mounting_hole_depth_mm'].includes(param.key) && Boolean(params.mounting_holes)),
  );
  const visiblePostProcessingParams = postProcessingParams.filter(
    (param) =>
      product.type === 'signs'
        ? param.key === 'texture' || params.texture !== 'none'
        : param.key === 'keychain_hole' ||
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
        <h2>{product.name}</h2>
        {product.type === 'clicker' && (
          <p className="parameter-note">
            After generating, use Reset to return to the original STL and show the Z cut plane again.
          </p>
        )}
      </div>

      <section className="main-param-section" aria-label={`${product.name} parameters`}>
        <CollapsibleHeading
          label="Setup"
          isOpen={openSections.parameters}
          onToggle={() => toggleSection('parameters')}
        />
        {openSections.parameters && (
          <div className="controls">
            {visibleMainParams.map((param) => (
              <ParamControl
                key={param.key}
                param={param}
                value={params[param.key] ?? param.defaultValue}
                disabled={disabled || isExclusiveSignOptionDisabled(param.key, params)}
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
            label={product.type === 'signs' ? 'Finishing' : 'Customization'}
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
            label="Transform info"
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
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}

function CollapsibleHeading({
  label,
  isOpen,
  onToggle,
}: CollapsibleHeadingProps) {
  return (
    <button
      className="collapsible-heading"
      type="button"
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
    >
      <span>
        <h3>{label}</h3>
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
        <span>
          {param.label}
          {param.help && <small>{param.help}</small>}
        </span>
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
    if (param.key === 'font') {
      return (
        <FontDropdown
          label={param.label}
          options={param.options}
          value={String(value)}
          disabled={disabled}
          onChange={onChange}
        />
      );
    }
    if (param.options.some((option) => option.preview || option.fontFamily)) {
      return (
        <fieldset className="choice-field" disabled={disabled}>
          <legend>{param.label}</legend>
          <div className={param.options.some((option) => option.preview) ? 'choice-grid texture-choice-grid' : 'choice-grid'}>
            {param.options.map((option) => (
              <label
                className={String(value) === option.value ? 'choice-card active' : 'choice-card'}
                key={option.value}
              >
                <input
                  type="radio"
                  name={param.key}
                  value={option.value}
                  checked={String(value) === option.value}
                  onChange={() => onChange(option.value)}
                />
                {option.preview && (
                  <img src={option.preview} alt={option.previewAlt ?? `${option.label} texture`} />
                )}
                {option.fontFamily && (
                  <span className="font-sample" style={{ fontFamily: option.fontFamily }}>Aa</span>
                )}
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
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

function FontDropdown({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string; fontFamily?: string }>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="font-dropdown-field">
      <span>{label}</span>
      <details
        ref={detailsRef}
        className={disabled ? 'font-dropdown disabled' : 'font-dropdown'}
      >
        <summary onClick={(event) => disabled && event.preventDefault()}>
          <span className="font-preview" style={{ fontFamily: selected.fontFamily }}>Aa</span>
          <strong>{selected.label}</strong>
        </summary>
        <div className="font-dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'font-option active' : 'font-option'}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              <span className="font-preview" style={{ fontFamily: option.fontFamily }}>Aa</span>
              <span>
                <strong style={{ fontFamily: option.fontFamily }}>{option.label}</strong>
                <small style={{ fontFamily: option.fontFamily }}>Horama 3D</small>
              </span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function isExclusiveSignOptionDisabled(key: string, params: ProductParams): boolean {
  if (key === 'hollow') return Boolean(params.mounting_holes);
  if (key === 'mounting_holes') return Boolean(params.hollow);
  return false;
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
