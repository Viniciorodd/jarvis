// Regression suite for the SCA wage-determination reader + self-perform price (pods/gov/wage-det.mjs). Pins the
// DETERMINISTIC money math the operator's janitorial bids rest on: the wage floor is parsed (never guessed),
// Health & Welfare per-week converts to per-hour, the knobs clamp, and the bid can NEVER come in below the SCA
// labor floor (a legal-compliance line, in code).

import { parseWageDetermination, janitorialRates, laborLoadedPrice } from '../pods/gov/wage-det.mjs';

const ok = (pass, detail = '') => ({ pass, detail });

const WD = [
  'WAGE DETERMINATION NO. WD 15-4281 (Rev.-22)',
  'OCCUPATION CODE - TITLE                       RATE',
  '11150 - Janitor ............................. 16.85',
  '11210 - Laborer, Grounds Maintenance ........ 17.42',
  '11360 - Window Cleaner ...................... 17.89',
  '01011 - Accounting Clerk I .................. 19.20',
  '',
  'ALL OCCUPATIONS LISTED ABOVE ARE ENTITLED TO THE FOLLOWING BENEFITS:',
  'HEALTH & WELFARE: $5.36 per hour or $214.40 per week',
].join('\n');

export default {
  agent: 'gov-wage-det',
  cases: [
    { name: 'parseWageDetermination extracts the Janitor rate + Health & Welfare + WD number', run: () => {
      const p = parseWageDetermination(WD);
      const jan = p.rates.find((r) => r.code === '11150');
      return ok(jan && jan.hourly === 16.85 && p.healthWelfare === 5.36 && p.wdNumber === '15-4281' && p.revision === 22, JSON.stringify({ jan, hw: p.healthWelfare, wd: p.wdNumber }));
    } },

    { name: 'garbage / empty text → NO rates, H&W 0 (never a fabricated wage)', run: () => {
      const p = parseWageDetermination('This solicitation is for janitorial services. Quotes due Friday.');
      return ok(p.rates.length === 0 && p.healthWelfare === 0, JSON.stringify(p));
    } },

    { name: 'Health & Welfare stated per WEEK converts to per-hour (÷ weekly hours)', run: () => {
      const p = parseWageDetermination('11150 - Janitor 16.00\nHEALTH & WELFARE: $214.40 per week (40 hours per week)');
      return ok(Math.abs(p.healthWelfare - 5.36) < 0.02, JSON.stringify(p.healthWelfare));
    } },

    { name: 'janitorialRates keeps only the 111xx custodial codes', run: () => {
      const codes = janitorialRates(parseWageDetermination(WD)).map((r) => r.code);
      return ok(codes.includes('11150') && codes.includes('11360') && !codes.includes('01011'), codes.join());
    } },

    { name: 'laborLoadedPrice is deterministic + the bid is NEVER below the SCA floor', run: () => {
      const p = laborLoadedPrice({ baseHourly: 16.85, hwHourly: 5.36, hours: 2080, burdenPct: 22, overheadPct: 15, profitPct: 10 });
      const floorTotal = (16.85 + 5.36) * 2080;
      return ok(p.bid > floorTotal && p.directLabor === Math.round(floorTotal * 100) / 100 && p.floorHourly === 22.21, JSON.stringify({ bid: p.bid, floorTotal: Math.round(floorTotal), floorHourly: p.floorHourly }));
    } },

    { name: 'knobs clamp — an absurd env profit can never escape the band', run: () => {
      const prev = process.env.GOV_PROFIT_PCT;
      process.env.GOV_PROFIT_PCT = '999';
      const p = laborLoadedPrice({ baseHourly: 16.85, hwHourly: 5.36, hours: 100 });
      process.env.GOV_PROFIT_PCT = prev;
      return ok(p.profitPct === 30, `profitPct=${p.profitPct}`); // clamped to the 30 ceiling
    } },

    { name: 'laborLoadedPrice: no wage or no hours → null (nothing to price)', run: () =>
      ok(laborLoadedPrice({ baseHourly: 0, hours: 100 }) === null && laborLoadedPrice({ baseHourly: 16, hours: 0 }) === null) },
  ],
};
