import type { ParamDefinition, ProductDefinition, ProductParams } from '../types';

interface ParamPanelProps {
  product: ProductDefinition;
  params: ProductParams;
  onChange: (key: string, value: ProductParams[string]) => void;
}

export function ParamPanel({ product, params, onChange }: ParamPanelProps) {
  return (
    <aside className="panel panel-right">
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
  onChange: (value: ProductParams[string]) => void;
}

function ParamControl({ param, value, onChange }: ParamControlProps) {
  if (param.kind === 'boolean') {
    return (
      <label className="toggle-row">
        <span>{param.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (param.kind === 'select') {
    return (
      <label className="field">
        <span>{param.label}</span>
        <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
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
          {Number(value).toFixed(param.step < 1 ? 1 : 0)}
          {param.unit ? ` ${param.unit}` : ''}
        </strong>
      </span>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
