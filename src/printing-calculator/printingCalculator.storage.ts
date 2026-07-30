import {
  DEFAULT_PRINTING_CALCULATOR_SETTINGS,
  PRINTING_CALCULATOR_STORAGE_KEY,
} from './printingCalculator.constants';
import type {
  Currency,
  PrintingCalculatorProfile,
  PrintingCalculatorSettings,
  RoundingIncrement,
} from './printingCalculator.types';

const currencies: Currency[] = ['MXN', 'USD'];
const profiles: PrintingCalculatorProfile[] = [
  'economy',
  'standard',
  'professional',
  'custom',
];
const increments: RoundingIncrement[] = [0, 5, 10, 50, 100];

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function loadPrintingCalculatorSettings(): PrintingCalculatorSettings {
  try {
    const stored = window.localStorage.getItem(
      PRINTING_CALCULATOR_STORAGE_KEY,
    );
    if (!stored) return { ...DEFAULT_PRINTING_CALCULATOR_SETTINGS };
    const value = JSON.parse(stored) as Partial<PrintingCalculatorSettings>;
    return {
      currency: currencies.includes(value.currency as Currency)
        ? (value.currency as Currency)
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.currency,
      machineHourlyRate: isFiniteNonNegative(value.machineHourlyRate)
        ? value.machineHourlyRate
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.machineHourlyRate,
      preparationCost: isFiniteNonNegative(value.preparationCost)
        ? value.preparationCost
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.preparationCost,
      postProcessingCost: isFiniteNonNegative(value.postProcessingCost)
        ? value.postProcessingCost
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.postProcessingCost,
      riskPercentage:
        isFiniteNonNegative(value.riskPercentage) &&
        value.riskPercentage <= 100
          ? value.riskPercentage
          : DEFAULT_PRINTING_CALCULATOR_SETTINGS.riskPercentage,
      profitPercentage: isFiniteNonNegative(value.profitPercentage)
        ? value.profitPercentage
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.profitPercentage,
      roundingIncrement: increments.includes(
        value.roundingIncrement as RoundingIncrement,
      )
        ? (value.roundingIncrement as RoundingIncrement)
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.roundingIncrement,
      profile: profiles.includes(value.profile as PrintingCalculatorProfile)
        ? (value.profile as PrintingCalculatorProfile)
        : DEFAULT_PRINTING_CALCULATOR_SETTINGS.profile,
    };
  } catch {
    return { ...DEFAULT_PRINTING_CALCULATOR_SETTINGS };
  }
}

export function savePrintingCalculatorSettings(
  settings: PrintingCalculatorSettings,
): void {
  try {
    window.localStorage.setItem(
      PRINTING_CALCULATOR_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // The calculator remains usable when storage is unavailable.
  }
}

export function clearPrintingCalculatorSettings(): void {
  try {
    window.localStorage.removeItem(PRINTING_CALCULATOR_STORAGE_KEY);
  } catch {
    // No action is required when storage is unavailable.
  }
}
