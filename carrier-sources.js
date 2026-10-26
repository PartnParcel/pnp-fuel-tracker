'use strict';
const cheerio = require('cheerio');
const UPS_URL = 'https://assets.ups.com/adobe/assets/urn:aaid:aem:e29054f3-9c5b-45cf-a548-99ec4d4b7799/original/as/ca.json';
const DAY = 86400000;
function dateISO(now = new Date()) { return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); }
function monday(date) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function offset(date, days) { return new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10); }
function rate(text) {
  const m = String(text).trim().match(/^(\d{1,3}(?:\.\d{1,2})?)%$/);
  if (!m || +m[1] > 100) throw new Error('Unrecognized fuel percentage');
  return +m[1];
}
const UPS_FIELDS = {
  'Standard Service to the U.S.': 'Field2',
  'Standard Service within Canada': 'Field3',
  'International Express, Expedited & 3 Day Select': 'Field4',
  'Domestic Express and Expedited': 'Field5'
};
function parseUPS(data, today = dateISO()) {
  const rows = data?.FuelSurchargeResponse?.SurchargeHistory_en?.RevenueSurchargeHistory;
  if (!Array.isArray(rows) || !rows.length) throw new Error('UPS history missing');
  const byDate = new Map();
  for (const row of rows) {
    const m = String(row.Field1).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) throw new Error('UPS date format changed');
    const date = `${m[3]}-${m[2]}-${m[1]}`;
    if (new Date(date + 'T12:00:00Z').toISOString().slice(0,10) !== date || monday(date) !== date || byDate.has(date)) throw new Error('UPS duplicate or invalid effective week');
    byDate.set(date, Object.fromEntries(Object.entries(UPS_FIELDS).map(([name,key]) => [name,rate(row[key])])));
  }
  const weekStart = monday(today), current = byDate.get(weekStart), prior = byDate.get(offset(weekStart,-7));
  if (!current || !prior) throw new Error(`UPS current/prior week missing for ${weekStart}`);
  return { weekStart, services: Object.entries(current).map(([service, value]) => ({service, current:value, previous:prior[service], effectiveDate:weekStart, source:UPS_URL})) };
}
const CP_LABELS = ['Domestic Services', 'USA and International Parcel Services', 'USA and International Packet Services'];
function parseCanadaPost(html, today = dateISO()) {
  const $ = cheerio.load(html), weeks = new Map();
  $('table').each((_, table) => {
    const cap = $(table).find('caption').first().text();
    const m = cap.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})\s*[-–]\s*([A-Z][a-z]{2} \d{1,2}, \d{4})/);
    if (!m) return;
    const start = new Date(m[1] + ' UTC').toISOString().slice(0,10), end = new Date(m[2] + ' UTC').toISOString().slice(0,10);
    if (monday(start) !== start || offset(start,6) !== end || weeks.has(start)) throw new Error('Canada Post invalid or duplicate week');
    weeks.set(start,table);
  });
  const weekStart = monday(today);
  if (!weeks.has(weekStart) || !weeks.has(offset(weekStart,-7))) throw new Error(`Canada Post current/prior table missing for ${weekStart}`);
  function read(table) {
    const rows = new Map();
    $(table).find('tbody tr').each((_, tr) => {
      const label = $(tr).find('td').first().text().replace(/\s+/g,' ').trim();
      if (!CP_LABELS.includes(label)) return;
      if (rows.has(label)) throw new Error('Canada Post duplicate service');
      const cell = $(tr).find('td').eq(1).clone();
      const struck = cell.find('[style*="line-through"],s,del,strike');
      const numbers = s => [...s.matchAll(/\d+(?:\.\d+)?\s*%/g)].map(m=>rate(m[0].replace(/\s/g,'')));
      const list = numbers(struck.text()); struck.remove();
      const charged = numbers(cell.text());
      if (charged.length !== 1 || list.length > 1 || (list.length && list[0] < charged[0])) throw new Error(`Canada Post ambiguous rate for ${label}`);
      rows.set(label,{rate:charged[0],listRate:list[0] ?? null});
    });
    if (rows.size !== CP_LABELS.length) throw new Error('Canada Post services missing');
    return rows;
  }
  const current = read(weeks.get(weekStart)), prior = read(weeks.get(offset(weekStart,-7)));
  return { weekStart, services:CP_LABELS.map(service=>({service,current:current.get(service).rate,previous:prior.get(service).rate,listRate:current.get(service).listRate,effectiveDate:weekStart})) };
}
function applyPublished(carriers, prev, name, result, url, today, sourcePreviousKeys) {
  const old = prev.carriers?.find(c=>c.name===name);
  let carrier;
  if (result.ok) {
    carrier = {name,url,cadence:'weekly',status:'ok',lastVerified:today,services:result.value.services};
    for (const s of carrier.services) sourcePreviousKeys.add(`${name}|${s.service}`);
  } else {
    carrier = old ? structuredClone(old) : {name,url,cadence:'weekly',lastVerified:null,services:[]};
    carrier.status='stale';
    carrier.sourceError = result.error;
  }
  const i = carriers.findIndex(c=>c.name===name);
  if(i<0) carriers.push(carrier); else carriers[i]=carrier;
}
function staleWeeks(carrier, previous, today) {
  if(carrier.status==='ok') return {staleWeeks:0,staleSince:null};
  const since = previous?.staleSince || today;
  return {staleSince:since,staleWeeks:Math.floor((Date.parse(monday(today))-Date.parse(monday(since)))/(7*DAY))+1};
}
// UPS Rating API (list rates, clean tracker account). UPS charges fuel on the
// transportation charge, which is the base rate plus fuel-applicable surcharges
// (its fuel page lists peak surcharges) and any service premium not itemized
// (Express Plus). So the posted percent is
//   fuel / (TransportationCharges - fuel - charges fuel does not apply to).
// Verified against all four posted rows for the week of Oct 26 2026, when every
// quote first carried 434 = Surge Fee (peak). 573 = International Processing
// Fee, which fuel does not apply to. Any other code is unknown: refuse rather
// than guess, so the row goes stale and the alert opens.
const UPS_FUEL_CODE = '375';
const UPS_FUEL_BASE_CODES = new Set(['434']);
const UPS_NON_FUEL_CODES = new Set(['573']);
const UPS_FAMILIES = {
  standardCanada: { dest: 'domestic', codes: ['11'] },
  domesticExpress: { dest: 'domestic', codes: ['01', '02', '13', '14'] },
  standardUS: { dest: 'us', codes: ['11'] },
  // International Express, Expedited & 3 Day Select: Worldwide Express (07),
  // Expedited (08), Express Plus (54), Saver (65), 3 Day Select to the US (12).
  international: { dest: ['us', 'intl'], codes: ['07', '08', '12', '54', '65'] }
};
function upsFuelPercents(ratedShipments) {
  const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const money = v => parseFloat(v?.MonetaryValue ?? 'NaN');
  const out = {};
  for (const s of arr(ratedShipments)) {
    const transport = money(s.TransportationCharges);
    let fuel = null, nonFuel = 0;
    for (const c of arr(s.ItemizedCharges)) {
      if (c.Code === UPS_FUEL_CODE) fuel = money(c);
      else if (UPS_NON_FUEL_CODES.has(c.Code)) nonFuel += money(c);
      else if (!UPS_FUEL_BASE_CODES.has(c.Code)) throw new Error(`UPS quote has an unrecognized charge ${c.Code} ${c.Description || c.SubType || ''}`.trim());
    }
    const fuelBase = transport - (fuel ?? 0) - nonFuel;
    if (fuel == null || !(fuelBase > 0)) continue;
    out[s.Service?.Code] = (fuel / fuelBase) * 100;
  }
  return out;
}
function upsRatesFromQuotes(quotes) {
  const result = {};
  for (const [key, { dest, codes }] of Object.entries(UPS_FAMILIES)) {
    const values = [];
    for (const d of [].concat(dest)) for (const code of codes) {
      const raw = quotes[d]?.[code];
      if (raw == null) continue;
      const snapped = Math.round(raw * 4) / 4;
      // UPS posts in 0.25-point steps; penny rounding keeps a correct ratio
      // within a few hundredths. Further off means the formula no longer holds.
      if (Math.abs(raw - snapped) > 0.05) throw new Error(`UPS ${key} service ${code} (${d}) gives ${raw.toFixed(3)}%, not a posted step`);
      values.push(snapped);
    }
    if (!values.length) throw new Error(`UPS quote missing ${key} services`);
    if (!values.every(v => v === values[0])) throw new Error(`UPS ${key} services disagree: ${values.join(', ')}`);
    if (!(values[0] > 0 && values[0] < 100)) throw new Error(`UPS ${key} out of range: ${values[0]}`);
    result[key] = values[0];
  }
  return result;
}
const UPS_ROW_KEYS = {
  'Standard Service within Canada': 'standardCanada',
  'Standard Service to the U.S.': 'standardUS',
  'International Express, Expedited & 3 Day Select': 'international',
  'Domestic Express and Expedited': 'domesticExpress'
};
module.exports={UPS_URL,UPS_FIELDS,CP_LABELS,UPS_ROW_KEYS,dateISO,monday,offset,parseUPS,parseCanadaPost,applyPublished,staleWeeks,upsFuelPercents,upsRatesFromQuotes};
