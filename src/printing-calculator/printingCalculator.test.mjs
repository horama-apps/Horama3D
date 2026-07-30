import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePrintingPrice } from './printingCalculator.utils.ts';

const standardInput = {
  hours: 24,
  minutes: 0,
  copies: 1,
  materialCost: 64,
  machineHourlyRate: 9,
  preparationCost: 35,
  postProcessingCost: 0,
  additionalCosts: 0,
  riskPercentage: 12,
  profitPercentage: 20,
  quantity: 1,
  roundingIncrement: 10,
};

test('calculates the standard example', () => {
  const result = calculatePrintingPrice(standardInput);
  assert.equal(result.machineCost, 216);
  assert.equal(result.productionSubtotal, 315);
  assert.ok(Math.abs(result.riskCost - 37.8) < 1e-9);
  assert.ok(Math.abs(result.suggestedPrice - 423.36) < 1e-9);
  assert.equal(result.commercialPrice, 430);
});

test('converts minutes to decimal hours', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    hours: 2,
    minutes: 30,
  });
  assert.equal(result.totalHours, 2.5);
});

test('multiplies time and final quantity by the number of copies', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    hours: 3,
    minutes: 0,
    copies: 5,
    quantity: 1,
  });
  assert.equal(result.hoursPerCopy, 3);
  assert.equal(result.totalHours, 15);
  assert.equal(result.totalQuantity, 5);
});

test('calculates a unit price for multiple pieces', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    hours: 0,
    materialCost: 450,
    machineHourlyRate: 0,
    preparationCost: 0,
    riskPercentage: 0,
    profitPercentage: 0,
    quantity: 3,
    roundingIncrement: 0,
  });
  assert.equal(result.commercialPrice, 450);
  assert.equal(result.unitPrice, 150);
});

test('supports zero risk and zero profit', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    riskPercentage: 0,
    profitPercentage: 0,
  });
  assert.equal(result.riskCost, 0);
  assert.equal(result.suggestedPrice, result.costBeforeProfit);
});

test('rounds upward to the selected increment', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    materialCost: 423.36,
    hours: 0,
    machineHourlyRate: 0,
    preparationCost: 0,
    riskPercentage: 0,
    profitPercentage: 0,
  });
  assert.equal(result.commercialPrice, 430);
});

test('normalizes invalid values and always returns finite results', () => {
  const result = calculatePrintingPrice({
    ...standardInput,
    hours: -2,
    minutes: 99,
    materialCost: Number.NaN,
    machineHourlyRate: -10,
    preparationCost: Number.POSITIVE_INFINITY,
    riskPercentage: 150,
    profitPercentage: -20,
    quantity: 0,
  });
  assert.equal(result.totalHours, 59 / 60);
  assert.equal(result.riskCost, 0);
  assert.ok(Object.values(result).every(Number.isFinite));
});
