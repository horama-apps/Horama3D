export type Currency = 'MXN' | 'USD';
export type PrintingCalculatorProfile =
  | 'economy'
  | 'standard'
  | 'professional'
  | 'custom';
export type RoundingIncrement = 0 | 5 | 10 | 50 | 100;

export interface PrintingPriceInput {
  hours: number;
  minutes: number;
  copies: number;
  materialCost: number;
  machineHourlyRate: number;
  preparationCost: number;
  postProcessingCost: number;
  additionalCosts: number;
  riskPercentage: number;
  profitPercentage: number;
  quantity: number;
  roundingIncrement: number;
}

export interface PrintingPriceResult {
  hoursPerCopy: number;
  totalHours: number;
  totalQuantity: number;
  machineCost: number;
  productionSubtotal: number;
  riskCost: number;
  costBeforeProfit: number;
  profitAmount: number;
  suggestedPrice: number;
  commercialPrice: number;
  unitPrice: number;
}

export interface PrintingCalculatorSettings {
  currency: Currency;
  machineHourlyRate: number;
  preparationCost: number;
  postProcessingCost: number;
  riskPercentage: number;
  profitPercentage: number;
  roundingIncrement: RoundingIncrement;
  profile: PrintingCalculatorProfile;
}
