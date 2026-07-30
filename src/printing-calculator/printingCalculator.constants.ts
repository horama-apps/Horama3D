import type {
  PrintingCalculatorProfile,
  PrintingCalculatorSettings,
} from './printingCalculator.types';

export const PRINTING_CALCULATOR_STORAGE_KEY =
  'horama3d-printing-calculator-settings-v1';

export const DEFAULT_PRINTING_CALCULATOR_SETTINGS: PrintingCalculatorSettings = {
  currency: 'MXN',
  machineHourlyRate: 9,
  preparationCost: 35,
  postProcessingCost: 0,
  riskPercentage: 12,
  profitPercentage: 20,
  roundingIncrement: 10,
  profile: 'standard',
};

export const PRINTING_CALCULATOR_PROFILES: Record<
  Exclude<PrintingCalculatorProfile, 'custom'>,
  Pick<
    PrintingCalculatorSettings,
    'machineHourlyRate' | 'riskPercentage' | 'profitPercentage'
  >
> = {
  economy: {
    machineHourlyRate: 7,
    riskPercentage: 10,
    profitPercentage: 15,
  },
  standard: {
    machineHourlyRate: 9,
    riskPercentage: 12,
    profitPercentage: 20,
  },
  professional: {
    machineHourlyRate: 12,
    riskPercentage: 15,
    profitPercentage: 30,
  },
};
