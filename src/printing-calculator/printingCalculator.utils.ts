import type {
  Currency,
  PrintingPriceInput,
  PrintingPriceResult,
} from './printingCalculator.types';

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculatePrintingPrice(
  input: PrintingPriceInput,
): PrintingPriceResult {
  const hours = finiteNonNegative(input.hours);
  const minutes = Math.min(59, finiteNonNegative(input.minutes));
  const hoursPerCopy = hours + minutes / 60;
  const copies = Math.max(
    1,
    Math.floor(finiteNonNegative(input.copies)),
  );
  const totalHours = hoursPerCopy * copies;
  const materialCost = finiteNonNegative(input.materialCost);
  const machineCost =
    totalHours * finiteNonNegative(input.machineHourlyRate);
  const productionSubtotal =
    materialCost +
    machineCost +
    finiteNonNegative(input.preparationCost) +
    finiteNonNegative(input.postProcessingCost) +
    finiteNonNegative(input.additionalCosts);
  const riskCost =
    productionSubtotal *
    (Math.min(100, finiteNonNegative(input.riskPercentage)) / 100);
  const costBeforeProfit = productionSubtotal + riskCost;
  const profitAmount =
    costBeforeProfit * (finiteNonNegative(input.profitPercentage) / 100);
  const suggestedPrice = costBeforeProfit + profitAmount;
  const roundingIncrement = finiteNonNegative(input.roundingIncrement);
  const commercialPrice =
    roundingIncrement > 0
      ? Math.ceil(suggestedPrice / roundingIncrement) * roundingIncrement
      : suggestedPrice;
  const quantityPerCopy = Math.max(
    1,
    Math.floor(finiteNonNegative(input.quantity)),
  );
  const totalQuantity = quantityPerCopy * copies;
  const unitPrice = commercialPrice / totalQuantity;

  return {
    hoursPerCopy,
    totalHours,
    totalQuantity,
    machineCost,
    productionSubtotal,
    riskCost,
    costBeforeProfit,
    profitAmount,
    suggestedPrice,
    commercialPrice,
    unitPrice,
  };
}

export function formatCurrency(value: number, currency: Currency): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}
