import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateStock, getBillItemRemainingQuantity, validateBillItemUsage } from '../src/utils/stockUtils.js';

test('calculateStock totals purchases and consumption', () => {
  const product = {
    limit: 5,
    billItems: [
      { quantity: 20 },
      { quantity: 10 },
    ],
    stockUsages: [
      { quantity: 8 },
      { quantity: 4 },
    ],
  };

  const stock = calculateStock(product);

  assert.equal(stock.purchased, 30);
  assert.equal(stock.consumed, 12);
  assert.equal(stock.currentStock, 18);
  assert.equal(stock.lowStock, false);
});

test('remaining quantity is tracked per purchase batch', () => {
  const billItem = { quantity: 12 };
  const usages = [{ quantity: 4 }, { quantity: 3 }];

  assert.equal(getBillItemRemainingQuantity(billItem, usages), 5);
});

test('usage above the remaining batch quantity is rejected', () => {
  const billItem = { quantity: 10 };
  const usages = [{ quantity: 6 }];

  assert.throws(() => validateBillItemUsage({ billItem, usages, requestedQuantity: 5 }), /Insufficient quantity/);
  assert.doesNotThrow(() => validateBillItemUsage({ billItem, usages, requestedQuantity: 4 }));
});
