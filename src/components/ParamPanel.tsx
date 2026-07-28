import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  GeneratedModel,
  ModelObjectBounds,
  ParamDefinition,
  ProductDefinition,
  ProductParams,
  NumberParamDefinition,
  ClickerTransformInfo,
  HeadKeychainTransformInfo,
  LampTransformInfo,
  UrnTransformInfo,
  ImageLayersTransformInfo,
} from '../types';

interface ParamPanelProps {
  product: ProductDefinition;
  params: ProductParams;
  disabled?: boolean;
  modelMetadata?: GeneratedModel['metadata'];
  modelObjectBounds?: ModelObjectBounds[];
  paramOverrides?: Record<string, Partial<Pick<NumberParamDefinition, 'min' | 'max' | 'step'>>>;
  paramDetails?: Record<string, string>;
  showMaterialControls?: boolean;
  shouldCollapseSetup?: boolean;
  headerAction?: ReactNode;
  onChange: (key: string, value: ProductParams[string]) => void;
}

export function ParamPanel({
  product,
  params,
  disabled = false,
  modelMetadata,
  modelObjectBounds = [],
  paramOverrides = {},
  paramDetails = {},
  showMaterialControls = false,
  shouldCollapseSetup = false,
  headerAction,
  onChange,
}: ParamPanelProps) {
  const { t } = useTranslation();
  const productName = t(`products.${product.type}.name`, {
    defaultValue: product.name,
  });
  const [openSections, setOpenSections] = useState({
    parameters: true,
    materials: true,
    transformInfo: false,
  });
  const lampInfo = product.type === 'lamp' ? modelMetadata?.lamp : undefined;
  const urnInfo = product.type === 'urn' ? modelMetadata?.urn : undefined;
  const clickerInfo = product.type === 'clicker' ? modelMetadata?.clicker : undefined;
  const headKeychainInfo =
    product.type === 'head_keychains' ? modelMetadata?.headKeychain : undefined;
  const imageLayersInfo =
    product.type === 'image_layers' || product.type === 'brand_decoration'
      ? modelMetadata?.imageLayers
      : undefined;
  const transformInfoRows = lampInfo
    ? getLampInfoRows(lampInfo, t)
    : urnInfo
      ? getUrnInfoRows(urnInfo, t)
      : clickerInfo
        ? getClickerInfoRows(clickerInfo, t)
        : headKeychainInfo
          ? getHeadKeychainInfoRows(headKeychainInfo, t)
        : imageLayersInfo
          ? getImageLayersInfoRows(imageLayersInfo, t)
          : [];
  const dimensionInfoRows = getDimensionInfoRows(modelObjectBounds, t);
  const generalInfoRows = [...dimensionInfoRows, ...transformInfoRows];
  const colorParams = product.params.filter((param) => param.kind === 'color');
  const visibleColorParams = colorParams.filter((param) => {
    if (
      product.type === 'tip_jar' &&
      params.tip_jar_version === 'basic' &&
      param.key === 'qr_color'
    ) {
      return false;
    }
    if (product.type === 'brand_decoration') {
      if (param.key === 'mid_color' && params.simplification_mode !== 'levels') {
        return false;
      }
      if (param.key === 'base_color' && params.backing_style === 'none') {
        return false;
      }
    }
    return true;
  });
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
      : product.type === 'signs' || product.type === 'textures'
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
  const visibleMainParams = mainParams.filter((param) => {
    if (
      (product.type === 'wifi_sign' || product.type === 'business_packages') &&
      param.key === 'wifi_password' &&
      params.wifi_security === 'nopass'
    ) {
      return false;
    }
    if (
      product.type === 'tip_jar' &&
      param.key === 'qr_url' &&
      params.tip_jar_version === 'basic'
    ) {
      return false;
    }
    if (product.type === 'business_signage') {
      if (param.key === 'back_text' && !params.double_sided) return false;
      if (param.key === 'table_number' && params.signage_template !== 'table_number') {
        return false;
      }
    }
    if (product.type === 'brand_decoration') {
      if (
        param.key === 'line_width_mm' &&
        params.simplification_mode !== 'line_art'
      ) {
        return false;
      }
      if (
        ['base_thickness_mm', 'backing_margin_mm'].includes(param.key) &&
        params.backing_style === 'none'
      ) {
        return false;
      }
      if (
        param.key === 'backing_margin_mm' &&
        params.backing_style !== 'contour'
      ) {
        return false;
      }
    }
    if (product.type === 'head_keychains') {
      const exteriorParams = [
        'ring_outer_diameter_mm',
        'ring_offset_x_mm',
        'ring_offset_y_mm',
      ];
      const holeParams = [
        'head_hole_diameter_mm',
        'head_hole_offset_x_mm',
        'head_hole_offset_z_mm',
      ];
      if (exteriorParams.includes(param.key)) {
        return params.head_keychain_attachment !== 'integrated_hole';
      }
      if (holeParams.includes(param.key)) {
        return params.head_keychain_attachment === 'integrated_hole';
      }
      return true;
    }
    return (
      product.type !== 'signs' ||
      (!['wall_thickness_mm', 'wall_height_mm'].includes(param.key) &&
        !['mounting_hole_diameter_mm', 'mounting_hole_depth_mm'].includes(param.key) &&
        param.key !== 'mirror_hollow') ||
      (['wall_thickness_mm', 'wall_height_mm', 'mirror_hollow'].includes(param.key) &&
        params.sign_mode === 'hollow') ||
      (['mounting_hole_diameter_mm', 'mounting_hole_depth_mm'].includes(param.key) &&
        params.sign_mode === 'mounting_holes')
    );
  });
  const visiblePostProcessingParams = postProcessingParams.filter(
    (param) =>
      product.type === 'signs' || product.type === 'textures'
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
  const hasVisibleColors = showMaterialControls && visibleColorParams.length > 0;

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
        <div className="panel-heading-row">
          <h2>{productName}</h2>
          {headerAction}
        </div>
        {(product.type === 'clicker' || product.type === 'head_keychains') && (
          <p className="parameter-note">
            {t(
              product.type === 'head_keychains'
                ? 'notes.headKeychainReset'
                : 'notes.clickerReset',
            )}
          </p>
        )}
      </div>

      <section className="main-param-section" aria-label={`${productName} — ${t('common.setup')}`}>
        <CollapsibleHeading
          label={t('common.setup')}
          isOpen={openSections.parameters}
          onToggle={() => toggleSection('parameters')}
        />
        {openSections.parameters && (
          <div className="controls">
            {visibleMainParams.map((param) => (
              <ParamControl
                key={param.key}
                param={param}
                productType={product.type}
                value={params[param.key] ?? param.defaultValue}
                disabled={disabled}
                override={paramOverrides[param.key]}
                detail={paramDetails[param.key]}
                onChange={(value) => onChange(param.key, value)}
              />
            ))}
          </div>
        )}
      </section>

      {shouldShowPostProcessingSection && (
        <section className="color-section" aria-label={t('common.finishing')}>
          <CollapsibleHeading
            label={
              product.type === 'signs' || product.type === 'textures'
                ? t('common.finishing')
                : t('common.customization')
            }
            isOpen={openSections.materials}
            onToggle={() => toggleSection('materials')}
          />
          {openSections.materials && (
            <div className="controls color-controls">
              {hasVisibleColors && visibleColorParams.map((param) => (
                <ParamControl
                  key={param.key}
                  param={param}
                  productType={product.type}
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
                  productType={product.type}
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

      {generalInfoRows.length > 0 && (
        <section className="transform-info" aria-label={`${productName} — ${t('common.generalInfo')}`}>
          <CollapsibleHeading
            label={t('common.generalInfo')}
            isOpen={openSections.transformInfo}
            onToggle={() => toggleSection('transformInfo')}
          />
          {openSections.transformInfo && (
            <>
              <dl>
                {generalInfoRows.map((row, index) => (
                  <div key={`${row.label}-${index}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {modelMetadata?.objects && modelMetadata.objects.length > 0 && (
                <p className="object-list">{t('common.objects')}: {modelMetadata.objects.join(', ')}</p>
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
  const { t } = useTranslation();
  return (
    <button
      className="collapsible-heading"
      type="button"
      aria-expanded={isOpen}
      aria-label={`${isOpen ? t('common.hide') : t('common.show')} ${label}`}
      onClick={onToggle}
    >
      <span>
        <h3>{label}</h3>
      </span>
      <strong>{isOpen ? t('common.hide') : t('common.show')}</strong>
    </button>
  );
}

interface ParamControlProps {
  param: ParamDefinition;
  productType: ProductDefinition['type'];
  value: ProductParams[string];
  disabled: boolean;
  override?: Partial<Pick<NumberParamDefinition, 'min' | 'max' | 'step'>>;
  detail?: string;
  onChange: (value: ProductParams[string]) => void;
}

function ParamControl({
  param,
  productType,
  value,
  disabled,
  override,
  detail,
  onChange,
}: ParamControlProps) {
  const { t } = useTranslation();
  const translationKey =
    productType === 'bracelet_gems' && param.key === 'text'
      ? 'bracelet_text'
      : productType === 'pet_keychains' && param.key === 'text'
        ? 'pet_name'
      : productType === 'wifi_sign' && param.key === 'base_color'
        ? 'wifi_sign_color'
      : param.key;
  const label = t(`params.${translationKey}.label`, { defaultValue: param.label });
  const help = param.help
    ? t(`params.${param.key}.help`, { defaultValue: param.help })
    : undefined;
  let placeholderKey: string | undefined;
  if (productType === 'tip_jar') {
    placeholderKey = param.key === 'business_name'
      ? 'placeholders.businessName'
      : param.key === 'tip_message'
        ? 'placeholders.tipMessage'
        : 'placeholders.qrUrl';
  } else if (
    (productType === 'wifi_sign' || productType === 'business_packages') &&
    ['wifi_title', 'wifi_label', 'wifi_ssid', 'wifi_password'].includes(param.key)
  ) {
    const wifiPlaceholderKeys: Record<string, string> = {
      wifi_title: 'placeholders.wifiTitle',
      wifi_label: 'placeholders.wifiLabel',
      wifi_ssid: 'placeholders.wifiSsid',
      wifi_password: 'placeholders.wifiPassword',
    };
    placeholderKey = wifiPlaceholderKeys[param.key];
  } else if (param.key === 'text') {
    placeholderKey = productType === 'bracelet_gems'
      ? 'placeholders.braceletText'
      : productType === 'pet_keychains'
        ? 'placeholders.petName'
        : 'placeholders.signText';
  } else if (param.key === 'lid_text') {
    placeholderKey = 'placeholders.lidText';
  } else if (param.key === 'business_name') {
    placeholderKey = 'placeholders.businessName';
  } else if (['qr_url', 'secondary_qr_url', 'tertiary_qr_url'].includes(param.key)) {
    placeholderKey = 'placeholders.qrUrl';
  }
  const placeholder = param.kind === 'text'
    ? placeholderKey
      ? t(placeholderKey, { defaultValue: param.placeholder })
      : param.placeholder
    : undefined;
  const optionLabel = (option: { label: string; value: string }) =>
    t(`options.${param.key}.${option.value}`, { defaultValue: option.label });
  if (param.kind === 'select' && param.key === 'bracelet_charms') {
    return (
      <CharmQuantityControl
        label={label}
        help={help}
        options={param.options}
        value={String(value)}
        disabled={disabled}
        optionLabel={optionLabel}
        onChange={onChange}
      />
    );
  }
  if (param.kind === 'boolean') {
    return (
      <label className="toggle-row">
        <span>
          {label}
          {help && <small>{help}</small>}
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
          label={label}
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
          <legend>{label}</legend>
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
                  <img src={option.preview} alt={option.previewAlt ?? optionLabel(option)} />
                )}
                {option.fontFamily && (
                  <span className="font-sample" style={{ fontFamily: option.fontFamily }}>Aa</span>
                )}
                <span>{optionLabel(option)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    return (
      <label className="field">
        <span>{label}</span>
        <select
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {param.options.map((option) => (
            <option key={option.value} value={option.value}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.kind === 'text') {
    return (
      <label className="field">
        <span>{label}</span>
        {param.multiline ? (
          <textarea
            value={String(value)}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            type="text"
            value={String(value)}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
    );
  }

  if (param.kind === 'color') {
    return (
      <label className="field color-field">
        <span>{label}</span>
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
        {label}
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
      {detail && <small className="field-reference">{detail}</small>}
    </label>
  );
}

function CharmQuantityControl({
  label,
  help,
  options,
  value,
  disabled,
  optionLabel,
  onChange,
}: {
  label: string;
  help?: string;
  options: Array<{
    label: string;
    value: string;
    icon?: string;
    preview?: string;
    previewAlt?: string;
  }>;
  value: string;
  disabled: boolean;
  optionLabel: (option: { label: string; value: string }) => string;
  onChange: (value: string) => void;
}) {
  const quantities = parseCharmQuantities(value);
  const updateQuantity = (key: string, amount: number) => {
    const next = { ...quantities };
    const quantity = Math.max(0, Math.min(9, (next[key] ?? 0) + amount));
    if (quantity === 0) delete next[key];
    else next[key] = quantity;
    onChange(JSON.stringify(next));
  };

  return (
    <fieldset className="charm-quantity-field" disabled={disabled}>
      <legend>{label}</legend>
      {help && <small>{help}</small>}
      <div className="charm-quantity-grid">
        {options.map((option) => {
          const quantity = quantities[option.value] ?? 0;
          const translatedLabel = optionLabel(option);
          return (
            <div
              className={quantity > 0 ? 'charm-quantity-card active' : 'charm-quantity-card'}
              key={option.value}
            >
              <span className="charm-icon" aria-hidden="true">
                {option.preview ? (
                  <img
                    src={option.preview}
                    alt={option.previewAlt ?? ''}
                  />
                ) : (
                  option.icon ?? '◆'
                )}
              </span>
              <span className="charm-label">{translatedLabel}</span>
              <span className="charm-stepper">
                <button
                  type="button"
                  aria-label={`− ${translatedLabel}`}
                  disabled={disabled || quantity === 0}
                  onClick={() => updateQuantity(option.value, -1)}
                >
                  −
                </button>
                <output aria-label={`${translatedLabel}: ${quantity}`}>{quantity}</output>
                <button
                  type="button"
                  aria-label={`+ ${translatedLabel}`}
                  disabled={disabled || quantity === 9}
                  onClick={() => updateQuantity(option.value, 1)}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function parseCharmQuantities(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, item]) => {
        const quantity = Math.floor(Number(item));
        return Number.isFinite(quantity) && quantity > 0
          ? [[key, Math.min(9, quantity)]]
          : [];
      }),
    );
  } catch {
    return {};
  }
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

function formatNumberValue(value: number, step: number): string {
  const stepText = String(step);
  const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
  return value.toFixed(decimals);
}

function getLampInfoRows(info: LampTransformInfo, t: TFunction) {
  const center = info.attachment_center_xy_mm?.length === 2
    ? `${info.attachment_center_xy_mm.map((value) => value.toFixed(2)).join(', ')} mm`
    : undefined;
  return [
    { label: t('info.appliedScale'), value: formatInfoNumber(info.applied_scale) },
    { label: t('info.estimatedCapacity'), value: formatInfoNumber(info.estimated_capacity_ml, 'ml') },
    { label: t('info.attachmentCenter'), value: center },
    { label: t('info.attachmentClearance'), value: formatInfoNumber(info.attachment_clearance_mm, 'mm') },
    { label: t('info.effectiveWall'), value: formatInfoNumber(info.effective_wall_thickness_mm, 'mm') },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getUrnInfoRows(info: UrnTransformInfo, t: TFunction) {
  return [
    { label: t('info.size'), value: info.size?.toUpperCase() },
    { label: t('info.targetCapacity'), value: formatInfoNumber(info.target_capacity_ml, 'ml') },
    { label: t('info.estimatedCapacity'), value: formatInfoNumber(info.estimated_capacity_ml, 'ml') },
    { label: t('info.appliedScale'), value: formatInfoNumber(info.applied_scale) },
    { label: t('info.pressureRibs'), value: formatInfoNumber(info.pressure_rib_count) },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getClickerInfoRows(info: ClickerTransformInfo, t: TFunction) {
  return [
    { label: t('info.appliedScale'), value: formatInfoNumber(info.applied_scale) },
    { label: t('info.cutHeight'), value: formatInfoNumber(info.cut_height_mm, 'mm') },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getHeadKeychainInfoRows(info: HeadKeychainTransformInfo, t: TFunction) {
  return [
    { label: t('info.appliedScale'), value: formatInfoNumber(info.applied_scale) },
    { label: t('info.cutHeight'), value: formatInfoNumber(info.cut_height_mm, 'mm') },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getImageLayersInfoRows(info: ImageLayersTransformInfo, t: TFunction) {
  const processedSize = info.processed_width_px && info.processed_height_px
    ? `${info.processed_width_px} × ${info.processed_height_px} px`
    : undefined;
  const physicalSize = info.width_mm && info.height_mm
    ? `${info.width_mm.toFixed(1)} × ${info.height_mm.toFixed(1)} mm`
    : undefined;
  return [
    { label: t('info.colors'), value: formatInfoNumber(info.color_count) },
    { label: t('info.layers'), value: formatInfoNumber(info.layer_count) },
    { label: t('info.processedSize'), value: processedSize },
    { label: t('info.physicalSize'), value: physicalSize },
    { label: t('info.layerHeight'), value: formatInfoNumber(info.layer_height_mm, 'mm') },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
}

function getDimensionInfoRows(bounds: ModelObjectBounds[], t: TFunction) {
  if (bounds.length === 0) return [];
  if (bounds.length === 1) {
    return [{
      label: t('info.stlSize'),
      value: formatDimensions(bounds[0]),
    }];
  }
  return bounds.map((item, index) => ({
    label: item.name.trim() || t('info.objectNumber', { number: index + 1 }),
    value: formatDimensions(item),
  }));
}

function formatDimensions(bounds: ModelObjectBounds): string {
  return `${bounds.width.toFixed(1)} × ${bounds.depth.toFixed(1)} × ${bounds.height.toFixed(1)} mm`;
}

function formatInfoNumber(value: number | undefined, unit?: string): string | undefined {
  if (value === undefined) return undefined;
  const formatted = value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}
