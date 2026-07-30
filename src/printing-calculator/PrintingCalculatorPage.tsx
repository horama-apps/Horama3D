import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CircleDollarSign,
  Clock3,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_PRINTING_CALCULATOR_SETTINGS,
  PRINTING_CALCULATOR_PROFILES,
} from './printingCalculator.constants';
import {
  clearPrintingCalculatorSettings,
  loadPrintingCalculatorSettings,
  savePrintingCalculatorSettings,
} from './printingCalculator.storage';
import type {
  PrintingCalculatorProfile,
  PrintingCalculatorSettings,
  RoundingIncrement,
} from './printingCalculator.types';
import {
  calculatePrintingPrice,
  formatCurrency,
} from './printingCalculator.utils';
import {
  downloadPrintingQuotePdf,
  type PrintingQuoteProduct,
} from './printingQuotePdf';

type NumericField =
  | 'hours'
  | 'minutes'
  | 'copies'
  | 'materialCost'
  | 'quantity'
  | 'additionalCosts';

type ConfiguratorDestination = 'stl' | 'image' | 'create';

interface PrintingCalculatorPageProps {
  currentConfiguratorMode: ConfiguratorDestination;
  onNavigate: (destination: ConfiguratorDestination) => void;
}

interface CartProduct extends PrintingQuoteProduct {
  id: number;
}

const profileLabels: Record<PrintingCalculatorProfile, string> = {
  economy: 'Económico',
  standard: 'Estándar',
  professional: 'Profesional',
  custom: 'Personalizado',
};

function parseNumber(value: string): number {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLocalDateValue(): string {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

export function PrintingCalculatorPage({
  currentConfiguratorMode,
  onNavigate,
}: PrintingCalculatorPageProps) {
  const [settings, setSettings] = useState<PrintingCalculatorSettings>(
    loadPrintingCalculatorSettings,
  );
  const [productName, setProductName] = useState('');
  const [nextProductNumber, setNextProductNumber] = useState(1);
  const [nextCartId, setNextCartId] = useState(1);
  const [cartProducts, setCartProducts] = useState<CartProduct[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [quoteCustomer, setQuoteCustomer] = useState('');
  const [quoteDate, setQuoteDate] = useState(getLocalDateValue);
  const [quoteNumber] = useState(
    () => `HOR-${Date.now().toString(36).toUpperCase()}`,
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pendingDestination, setPendingDestination] =
    useState<ConfiguratorDestination | null>(null);
  const [values, setValues] = useState<Record<NumericField, string>>({
    hours: '0',
    minutes: '0',
    copies: '1',
    materialCost: '',
    quantity: '1',
    additionalCosts: '0',
  });

  useEffect(() => {
    savePrintingCalculatorSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isSettingsOpen && !pendingDestination) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsSettingsOpen(false);
      setPendingDestination(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isSettingsOpen, pendingDestination]);

  const numericValues = useMemo(
    () => ({
      hours: parseNumber(values.hours),
      minutes: parseNumber(values.minutes),
      copies: parseNumber(values.copies),
      materialCost: parseNumber(values.materialCost),
      quantity: parseNumber(values.quantity),
      additionalCosts: parseNumber(values.additionalCosts),
    }),
    [values],
  );

  const errors = useMemo(() => {
    const next: Partial<
      Record<
        | NumericField
        | 'machineHourlyRate'
        | 'preparationCost'
        | 'postProcessingCost'
        | 'riskPercentage'
        | 'profitPercentage',
        string
      >
    > = {};
    if (numericValues.hours < 0) next.hours = 'Las horas no pueden ser negativas.';
    if (
      !Number.isInteger(numericValues.minutes) ||
      numericValues.minutes < 0 ||
      numericValues.minutes > 59
    ) {
      next.minutes = 'Ingresa minutos enteros entre 0 y 59.';
    }
    if (!Number.isInteger(numericValues.copies) || numericValues.copies < 1) {
      next.copies = 'Las copias deben ser un número entero mayor o igual a 1.';
    }
    if (numericValues.materialCost < 0) {
      next.materialCost = 'El costo no puede ser negativo.';
    }
    if (!Number.isInteger(numericValues.quantity) || numericValues.quantity < 1) {
      next.quantity = 'La cantidad debe ser un número entero mayor o igual a 1.';
    }
    if (numericValues.additionalCosts < 0) {
      next.additionalCosts = 'El costo no puede ser negativo.';
    }
    if (settings.machineHourlyRate < 0) {
      next.machineHourlyRate = 'El costo no puede ser negativo.';
    }
    if (settings.preparationCost < 0) {
      next.preparationCost = 'El costo no puede ser negativo.';
    }
    if (settings.postProcessingCost < 0) {
      next.postProcessingCost = 'El costo no puede ser negativo.';
    }
    if (settings.riskPercentage < 0 || settings.riskPercentage > 100) {
      next.riskPercentage = 'El riesgo debe estar entre 0% y 100%.';
    }
    if (settings.profitPercentage < 0) {
      next.profitPercentage = 'El porcentaje no puede ser negativo.';
    }
    return next;
  }, [numericValues, settings]);

  const isValid = Object.keys(errors).length === 0;
  const hasPrintData =
    numericValues.hours > 0 ||
    numericValues.minutes > 0 ||
    numericValues.materialCost > 0;
  const result = useMemo(
    () =>
      calculatePrintingPrice({
        ...numericValues,
        machineHourlyRate: settings.machineHourlyRate,
        preparationCost: settings.preparationCost,
        postProcessingCost: settings.postProcessingCost,
        riskPercentage: settings.riskPercentage,
        profitPercentage: settings.profitPercentage,
        roundingIncrement: settings.roundingIncrement,
      }),
    [numericValues, settings],
  );
  const money = (value: number) => formatCurrency(value, settings.currency);
  const resolvedProductName =
    productName.trim() || `Producto${nextProductNumber}`;

  const updateValue = (field: NumericField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const updateSetting = <K extends keyof PrintingCalculatorSettings>(
    field: K,
    value: PrintingCalculatorSettings[K],
    markCustom = true,
  ) => {
    setSettings((current) => ({
      ...current,
      [field]: value,
      ...(markCustom ? { profile: 'custom' as const } : {}),
    }));
  };

  const updateNumberSetting = (
    field:
      | 'machineHourlyRate'
      | 'preparationCost'
      | 'postProcessingCost'
      | 'riskPercentage'
      | 'profitPercentage',
    value: string,
  ) => {
    updateSetting(field, parseNumber(value));
  };

  const selectProfile = (profile: PrintingCalculatorProfile) => {
    if (profile === 'custom') {
      updateSetting('profile', 'custom', false);
      return;
    }
    setSettings((current) => ({
      ...current,
      ...PRINTING_CALCULATOR_PROFILES[profile],
      profile,
    }));
  };

  const resetCalculation = () => {
    setProductName('');
    setValues({
      hours: '0',
      minutes: '0',
      copies: '1',
      materialCost: '',
      quantity: '1',
      additionalCosts: '0',
    });
  };

  const restoreDefaults = () => {
    clearPrintingCalculatorSettings();
    setSettings({ ...DEFAULT_PRINTING_CALCULATOR_SETTINGS });
  };

  const addProductToCart = () => {
    if (!hasPrintData || !isValid) return;
    setCartProducts((current) => [
      ...current,
      {
        id: nextCartId,
        name: resolvedProductName,
        quantity: result.totalQuantity,
        commercialPrice: result.commercialPrice,
        unitPrice: result.unitPrice,
        totalHours: result.totalHours,
        currency: settings.currency,
      },
    ]);
    setNextCartId((current) => current + 1);
    setNextProductNumber((current) => current + 1);
    resetCalculation();
  };

  const cartTotals = useMemo(
    () =>
      cartProducts.reduce<Partial<Record<'MXN' | 'USD', number>>>(
        (totals, product) => ({
          ...totals,
          [product.currency]:
            (totals[product.currency] ?? 0) + product.commercialPrice,
        }),
        {},
      ),
    [cartProducts],
  );

  const leaveCalculator = (destination: ConfiguratorDestination) => {
    if (cartProducts.length > 0) {
      setPendingDestination(destination);
      return;
    }
    onNavigate(destination);
  };

  const confirmLeaveCalculator = () => {
    if (!pendingDestination) return;
    const destination = pendingDestination;
    setPendingDestination(null);
    onNavigate(destination);
  };

  const downloadQuote = async () => {
    if (cartProducts.length === 0 || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setPdfError('');
    try {
      await downloadPrintingQuotePdf({
        quoteNumber,
        customer: quoteCustomer,
        date: quoteDate,
        products: cartProducts,
      });
    } catch (error) {
      setPdfError(
        error instanceof Error
          ? error.message
          : 'No se pudo generar la cotización.',
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const breakdown = [
    ['Material', numericValues.materialCost],
    ['Uso de máquina', result.machineCost],
    ['Preparación', settings.preparationCost],
    ['Posprocesado', settings.postProcessingCost],
    ['Costos adicionales', numericValues.additionalCosts],
    ['Subtotal de producción', result.productionSubtotal],
    ['Riesgo', result.riskCost],
    ['Costo antes de ganancia', result.costBeforeProfit],
    ['Ganancia', result.profitAmount],
    ['Precio sugerido', result.suggestedPrice],
    ['Precio comercial', result.commercialPrice],
  ] as const;

  return (
    <main className='calculator-shell' style={{ '--accent': '#2f8f83' } as React.CSSProperties}>
      <header className='calculator-topbar'>
        <div className='brand calculator-brand'>
          <button
            type='button'
            className='brand-mark brand-mark-button'
            aria-label='Volver al configurador'
            onClick={() => leaveCalculator(currentConfiguratorMode)}
          >
            <img src={`${import.meta.env.BASE_URL}horama-mark.svg`} alt='Horama' />
          </button>
        </div>
        <div className='calculator-heading'>
          <span className='calculator-heading-icon' aria-hidden='true'>
            <Calculator size={22} />
          </span>
          <div>
            <p className='eyebrow'>Cotiza con claridad</p>
            <h1>Calculadora de impresión</h1>
            <p>
              Calcula tus costos, cubre el riesgo y protege tu margen antes de
              dar un precio.
            </p>
          </div>
          <button
            type='button'
            className='calculator-settings-button'
            aria-label='Abrir parámetros de cálculo'
            aria-haspopup='dialog'
            aria-expanded={isSettingsOpen}
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings2 size={20} aria-hidden='true' />
          </button>
        </div>
      </header>

      <div className='calculator-layout'>
        <form className='calculator-form' onSubmit={(event) => event.preventDefault()}>
          <section className='calculator-card'>
            <div className='calculator-section-heading'>
              <CircleDollarSign size={19} aria-hidden='true' />
              <div>
                <h2>Información de la impresión</h2>
                <p>Los datos específicos de este trabajo.</p>
              </div>
            </div>

            <div className='calculator-field-grid'>
              <label className='calculator-field calculator-field-wide'>
                <span>Producto <small>Opcional</small></span>
                <input
                  type='text'
                  value={productName}
                  placeholder={resolvedProductName}
                  onChange={(event) => setProductName(event.target.value)}
                />
              </label>
              <label className='calculator-field'>
                <span>Moneda</span>
                <select
                  value={settings.currency}
                  onChange={(event) =>
                    updateSetting(
                      'currency',
                      event.target.value as PrintingCalculatorSettings['currency'],
                      false,
                    )
                  }
                >
                  <option value='MXN'>MXN — Peso mexicano</option>
                  <option value='USD'>USD — Dólar estadounidense</option>
                </select>
              </label>
              <NumberField
                id='quantity'
                label='Piezas por copia'
                value={values.quantity}
                min={1}
                step={1}
                error={errors.quantity}
                onChange={(value) => updateValue('quantity', value)}
              />
            </div>

            <fieldset className='calculator-fieldset'>
              <legend>
                <Clock3 size={17} aria-hidden='true' /> Tiempo de impresión
              </legend>
              <div className='calculator-time-grid'>
                <NumberField
                  id='hours'
                  label='Horas'
                  value={values.hours}
                  min={0}
                  step={1}
                  error={errors.hours}
                  onChange={(value) => updateValue('hours', value)}
                />
                <NumberField
                  id='minutes'
                  label='Minutos'
                  value={values.minutes}
                  min={0}
                  max={59}
                  step={1}
                  error={errors.minutes}
                  onChange={(value) => updateValue('minutes', value)}
                />
                <NumberField
                  id='copies'
                  label='Copias'
                  value={values.copies}
                  min={1}
                  step={1}
                  error={errors.copies}
                  onChange={(value) => updateValue('copies', value)}
                />
              </div>
              <p className='calculator-helper'>
                Por copia: {result.hoursPerCopy.toFixed(2)} h · Tiempo total:{' '}
                <strong>{result.totalHours.toFixed(2)} h</strong>
              </p>
            </fieldset>

            <div className='calculator-field-grid'>
              <NumberField
                id='materialCost'
                label={`Costo total del material (${settings.currency})`}
                value={values.materialCost}
                min={0}
                step='0.01'
                placeholder='64.00'
                error={errors.materialCost}
                help='Ingresa el costo del filamento utilizado según el cálculo de tu laminador.'
                onChange={(value) => updateValue('materialCost', value)}
              />
              <NumberField
                id='additionalCosts'
                label={`Costos adicionales (${settings.currency})`}
                value={values.additionalCosts}
                min={0}
                step='0.01'
                error={errors.additionalCosts}
                help='Empaque, insertos, imanes, comisiones u otros.'
                onChange={(value) => updateValue('additionalCosts', value)}
              />
            </div>
            <p className='calculator-currency-note'>
              Todos los valores deben ingresarse en la misma moneda. Cambiar la
              moneda no convierte los importes.
            </p>

            <div className='calculator-form-actions'>
              <button type='button' className='secondary-action' onClick={resetCalculation}>
                <RotateCcw size={16} aria-hidden='true' />
                Restablecer valores
              </button>
              <span className='calculator-next-product'>
                Se guardará como <strong>{resolvedProductName}</strong>
              </span>
            </div>
          </section>
        </form>

        <aside className='calculator-results' aria-live='polite'>
          {!hasPrintData || !isValid ? (
            <div className='calculator-card calculator-empty-result'>
              <Calculator size={30} aria-hidden='true' />
              <h2>
                {!isValid ? 'Revisa los campos marcados' : 'Tu precio aparecerá aquí'}
              </h2>
              <p>
                {!isValid
                  ? 'Corrige los valores para mostrar una cotización segura.'
                  : 'Ingresa tiempo de impresión o costo de material para comenzar.'}
              </p>
            </div>
          ) : (
            <div className='calculator-result-card'>
              <p className='eyebrow'>Precio final recomendado</p>
              <h2>{resolvedProductName}</h2>
              <strong className='calculator-price'>
                {money(result.commercialPrice)}
                <small>{settings.currency}</small>
              </strong>
              <div className='calculator-result-summary'>
                <div>
                  <span>Precio exacto</span>
                  <strong>{money(result.suggestedPrice)}</strong>
                </div>
                <div>
                  <span>Precio por unidad</span>
                  <strong>{money(result.unitPrice)}</strong>
                </div>
                <div>
                  <span>Ganancia estimada</span>
                  <strong>{money(result.profitAmount)}</strong>
                </div>
              </div>

              <div className='calculator-breakdown'>
                <div className='calculator-breakdown-heading'>
                  <h3>Desglose completo</h3>
                  <span>
                    {result.totalHours.toFixed(2)} h · {result.totalQuantity} pza.
                  </span>
                </div>
                <dl>
                  {breakdown.map(([label, amount], index) => (
                    <div
                      key={label}
                      className={
                        index >= breakdown.length - 2 ? 'breakdown-total' : ''
                      }
                    >
                      <dt>{label}</dt>
                      <dd>{money(amount)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <button
                type='button'
                className='calculator-add-product'
                onClick={addProductToCart}
              >
                <Plus size={18} aria-hidden='true' />
                Agregar producto
              </button>
            </div>
          )}

          <section className='calculator-cart-card' aria-label='Productos agregados'>
            <div className='calculator-cart-heading'>
              <div>
                <ShoppingCart size={19} aria-hidden='true' />
                <h2>Productos</h2>
              </div>
              <span>{cartProducts.length}</span>
            </div>
            {cartProducts.length === 0 ? (
              <p className='calculator-cart-empty'>
                Los productos calculados que agregues aparecerán aquí.
              </p>
            ) : (
              <>
                <div className='calculator-quote-fields'>
                  <label>
                    <span>Cliente <small>Opcional</small></span>
                    <input
                      type='text'
                      value={quoteCustomer}
                      placeholder='Nombre del cliente'
                      onChange={(event) => setQuoteCustomer(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Fecha</span>
                    <input
                      type='date'
                      value={quoteDate}
                      onChange={(event) => setQuoteDate(event.target.value)}
                    />
                  </label>
                  <p>Folio: <strong>{quoteNumber}</strong></p>
                </div>
                <ul className='calculator-cart-list'>
                  {cartProducts.map((product) => (
                    <li key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <small>
                          {product.quantity} pza. · {product.totalHours.toFixed(2)} h ·{' '}
                          {formatCurrency(product.unitPrice, product.currency)} c/u
                        </small>
                      </div>
                      <span>
                        {formatCurrency(product.commercialPrice, product.currency)}
                      </span>
                      <button
                        type='button'
                        aria-label={`Eliminar ${product.name}`}
                        onClick={() =>
                          setCartProducts((current) =>
                            current.filter((item) => item.id !== product.id),
                          )
                        }
                      >
                        <Trash2 size={16} aria-hidden='true' />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className='calculator-cart-totals'>
                  <span>Total</span>
                  <div>
                    {(['MXN', 'USD'] as const).map((currency) =>
                      cartTotals[currency] ? (
                        <strong key={currency}>
                          {formatCurrency(cartTotals[currency] ?? 0, currency)}{' '}
                          <small>{currency}</small>
                        </strong>
                      ) : null,
                    )}
                  </div>
                </div>
                <button
                  type='button'
                  className='calculator-download-quote'
                  disabled={isGeneratingPdf}
                  onClick={() => void downloadQuote()}
                >
                  {isGeneratingPdf ? (
                    <Loader2 className='spin' size={18} aria-hidden='true' />
                  ) : (
                    <Download size={18} aria-hidden='true' />
                  )}
                  {isGeneratingPdf
                    ? 'Preparando cotización…'
                    : 'Descargar cotización PDF'}
                </button>
                {pdfError ? (
                  <p className='calculator-pdf-error' role='alert'>
                    {pdfError}
                  </p>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>

      {pendingDestination ? (
        <div
          className='calculator-modal-backdrop'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingDestination(null);
            }
          }}
        >
          <section
            className='calculator-leave-modal'
            role='alertdialog'
            aria-modal='true'
            aria-labelledby='calculator-leave-title'
            aria-describedby='calculator-leave-description'
          >
            <span className='calculator-leave-icon' aria-hidden='true'>
              <AlertTriangle size={25} />
            </span>
            <div>
              <p className='eyebrow'>Cotización sin guardar</p>
              <h2 id='calculator-leave-title'>¿Salir de la calculadora?</h2>
              <p id='calculator-leave-description'>
                Los productos agregados y los datos de esta cotización se
                perderán al regresar al configurador.
              </p>
            </div>
            <div className='calculator-leave-actions'>
              <button
                type='button'
                className='calculator-stay-button'
                autoFocus
                onClick={() => setPendingDestination(null)}
              >
                Seguir cotizando
              </button>
              <button
                type='button'
                className='calculator-leave-button'
                onClick={confirmLeaveCalculator}
              >
                Salir y perder cambios
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          className='calculator-modal-backdrop'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSettingsOpen(false);
          }}
        >
          <section
            className='calculator-settings-modal'
            role='dialog'
            aria-modal='true'
            aria-labelledby='calculator-settings-title'
          >
            <div className='calculator-modal-heading'>
              <div>
                <p className='eyebrow'>Preferencias</p>
                <h2 id='calculator-settings-title'>Parámetros de cálculo</h2>
                <p>Elige un perfil o ajusta cada costo a tu operación.</p>
              </div>
              <button
                type='button'
                aria-label='Cerrar parámetros de cálculo'
                onClick={() => setIsSettingsOpen(false)}
              >
                <X size={20} aria-hidden='true' />
              </button>
            </div>

            <fieldset className='calculator-profiles'>
              <legend>Perfiles rápidos</legend>
              <div>
                {(Object.keys(profileLabels) as PrintingCalculatorProfile[]).map(
                  (profile) => (
                    <button
                      type='button'
                      key={profile}
                      className={settings.profile === profile ? 'active' : ''}
                      aria-pressed={settings.profile === profile}
                      onClick={() => selectProfile(profile)}
                    >
                      {profileLabels[profile]}
                    </button>
                  ),
                )}
              </div>
            </fieldset>

            <div className='calculator-field-grid'>
              <NumberField
                id='machineHourlyRate'
                label={`Costo de máquina por hora (${settings.currency})`}
                value={String(settings.machineHourlyRate)}
                min={0}
                step='0.01'
                error={errors.machineHourlyRate}
                help='Rango recomendado: 7–15 por hora.'
                onChange={(value) =>
                  updateNumberSetting('machineHourlyRate', value)
                }
              />
              <NumberField
                id='preparationCost'
                label={`Preparación (${settings.currency})`}
                value={String(settings.preparationCost)}
                min={0}
                step='0.01'
                error={errors.preparationCost}
                onChange={(value) =>
                  updateNumberSetting('preparationCost', value)
                }
              />
              <NumberField
                id='postProcessingCost'
                label={`Posprocesado (${settings.currency})`}
                value={String(settings.postProcessingCost)}
                min={0}
                step='0.01'
                error={errors.postProcessingCost}
                onChange={(value) =>
                  updateNumberSetting('postProcessingCost', value)
                }
              />
              <NumberField
                id='riskPercentage'
                label='Riesgo (%)'
                value={String(settings.riskPercentage)}
                min={0}
                max={100}
                step='0.1'
                error={errors.riskPercentage}
                help='Rango recomendado: 10–15%.'
                onChange={(value) =>
                  updateNumberSetting('riskPercentage', value)
                }
              />
              <NumberField
                id='profitPercentage'
                label='Margen de ganancia (%)'
                value={String(settings.profitPercentage)}
                min={0}
                step='0.1'
                error={errors.profitPercentage}
                warning={
                  !errors.profitPercentage && settings.profitPercentage > 100
                    ? 'El margen supera 100%. Verifica que sea intencional.'
                    : undefined
                }
                onChange={(value) =>
                  updateNumberSetting('profitPercentage', value)
                }
              />
              <label className='calculator-field'>
                <span>Incremento de redondeo</span>
                <select
                  value={settings.roundingIncrement}
                  onChange={(event) =>
                    updateSetting(
                      'roundingIncrement',
                      Number(event.target.value) as RoundingIncrement,
                    )
                  }
                >
                  <option value={0}>Sin redondear</option>
                  <option value={5}>Múltiplos de 5</option>
                  <option value={10}>Múltiplos de 10</option>
                  <option value={50}>Múltiplos de 50</option>
                  <option value={100}>Múltiplos de 100</option>
                </select>
                <small>Siempre se redondea hacia arriba.</small>
              </label>
            </div>

            <div className='calculator-modal-actions'>
              <button
                type='button'
                className='calculator-link-button'
                onClick={restoreDefaults}
              >
                Restaurar parámetros predeterminados
              </button>
              <button
                type='button'
                className='primary-action'
                onClick={() => setIsSettingsOpen(false)}
              >
                Listo
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  help?: string;
  error?: string;
  warning?: string;
  onChange: (value: string) => void;
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  placeholder,
  help,
  error,
  warning,
  onChange,
}: NumberFieldProps) {
  const descriptionId =
    error || warning || help ? `${id}-description` : undefined;
  return (
    <label className={`calculator-field${error ? ' calculator-field-error' : ''}`}>
      <span>{label}</span>
      <input
        id={id}
        type='number'
        inputMode='decimal'
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <small id={descriptionId} className='calculator-error'>
          {error}
        </small>
      ) : warning ? (
        <small id={descriptionId} className='calculator-warning'>
          {warning}
        </small>
      ) : help ? (
        <small id={descriptionId}>{help}</small>
      ) : null}
    </label>
  );
}
