// spend.mjs — the DETERMINISTIC spending guard (doctrine §0, §9 rules 1 & 7).
// Pure functions, no I/O, no model. This is the code that "disposes" what the LLM "proposes":
// every money-moving action must pass checkSpend() BEFORE it touches the world. The LLM never
// decides a dollar amount and never enforces a cap — this does, and it is unit-tested in /evals.

/**
 * @param {object} a
 * @param {number} a.amountUsd      proposed spend for THIS action (>= 0)
 * @param {number} a.todaySpentUsd  already spent so far today (from the event store)
 * @param {number} a.actionCapUsd   hard per-action ceiling
 * @param {number} a.dailyCapUsd    hard per-day ceiling
 * @returns {{allow:boolean, reason:string, remainingTodayUsd:number}}
 */
export function checkSpend({ amountUsd, todaySpentUsd = 0, actionCapUsd, dailyCapUsd }) {
  const amt = Number(amountUsd);
  const today = Number(todaySpentUsd) || 0;
  const actionCap = Number(actionCapUsd);
  const dailyCap = Number(dailyCapUsd);
  const remainingTodayUsd = round(Math.max(0, dailyCap - today));

  if (!Number.isFinite(amt) || amt < 0) return deny('invalid amount', remainingTodayUsd);
  if (!Number.isFinite(actionCap) || !Number.isFinite(dailyCap)) return deny('caps not configured', remainingTodayUsd);
  if (amt > actionCap) return deny(`over per-action cap ($${amt} > $${actionCap})`, remainingTodayUsd);
  if (today + amt > dailyCap) return deny(`over daily cap (today $${round(today)} + $${amt} > $${dailyCap})`, remainingTodayUsd);
  return { allow: true, reason: 'within caps', remainingTodayUsd: round(remainingTodayUsd - amt) };
}

function deny(reason, remainingTodayUsd) { return { allow: false, reason, remainingTodayUsd }; }
function round(n) { return Math.round(n * 1000) / 1000; }
