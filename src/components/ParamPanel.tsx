import type { ParamDefinition, ProductDefinition, ProductParams } from '../types';

interface ParamPanelProps {
  product: ProductDefinition;
  params: ProductParams;
  disabled?: boolean;
  onChange: (key: string, value: ProductParams[string]) => void;
}

export function ParamPanel({ product, params, disabled = false, onChange }: ParamPanelProps) {
  return (
    <aside className={disabled ? 'panel panel-right panel-disabled' : 'panel panel-right'}>
      <div className="panel-heading">
        <p className="eyebrow">Parameters</p>
        <h2>{product.name}</h2>
      </div>

      <div className="controls">
        {product.params.map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={params[param.key] ?? param.defaultValue}
            disabled={disabled}
            onChange={(value) => onChange(param.key, value)}
          />
        ))}
      </div>
    </aside>
  );
}

interface ParamControlProps {
  param: ParamDefinition;
  value: ProductParams[string];
  disabled: boolean;
  onChange: (value: ProductParams[string]) => void;
}

function ParamControl({ param, value, disabled, onChange }: ParamControlProps) {
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

  return (
    <label className="field">
      <span>
        {param.label}
        <strong>
          {formatNumberValue(Number(value), param.step)}
          {param.unit ? ` ${param.unit}` : ''}
        </strong>
      </span>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
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
