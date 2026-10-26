const test = require('node:test');
const assert = require('node:assert/strict');
const {upsFuelPercents, upsRatesFromQuotes} = require('../carrier-sources');
const fx = require('./fixtures/ups-rating-api-2026-10-26.json');
const quotes = () => ({domestic: upsFuelPercents(fx.domestic), us: upsFuelPercents(fx.us), intl: upsFuelPercents(fx.intl)});
test('Rating API quotes reproduce all four posted UPS rows (week of Oct 26 2026)', () => {
  assert.deepEqual(upsRatesFromQuotes(quotes()), {standardCanada: 53, domesticExpress: 38.75, standardUS: 23.5, international: 42.25});
});
test('fuel is charged on transport incl. surge fee and Express Plus premium, not the processing fee', () => {
  const us = upsFuelPercents(fx.us), intl = upsFuelPercents(fx.intl);
  assert.ok(Math.abs(us['07'] - 42.25) < 0.05);
  assert.ok(Math.abs(intl['54'] - 42.25) < 0.05); // Express Plus premium is not itemized
  // Dividing by base alone (the old method) is about a point too high.
  assert.ok(28.24 / 66.51 * 100 - 42.25 > 0.2);
});
test('an unrecognized charge stops the reading instead of guessing', () => {
  const bad = structuredClone(fx.domestic);
  bad[0].ItemizedCharges.push({Code: '999', Description: 'NEW CHARGE', MonetaryValue: '1.00'});
  assert.throws(() => upsFuelPercents(bad), /unrecognized charge 999/);
});
test('a ratio off UPS\'s 0.25 steps or a disagreeing family is refused', () => {
  const q = quotes(); q.domestic['11'] = 52.88;
  assert.throws(() => upsRatesFromQuotes(q), /not a posted step/);
  const r = quotes(); r.domestic['02'] = 39.0;
  assert.throws(() => upsRatesFromQuotes(r), /disagree/);
  const m = quotes(); delete m.us['11'];
  assert.throws(() => upsRatesFromQuotes(m), /missing standardUS/);
});
