// chat-truth.mjs — the deterministic anti-confabulation guard for the Jarvis chat (Lessons Ledger L-014).
// The bug: the FREE everyday brain (local Hermes / OpenRouter) has NO tools, but when asked for a real action
// ("create a note in my vault", "open my photo album") it happily NARRATES a fake success with an invented
// path like /Users/YourName/ — because "done!" is the likely next token when no tool result contradicts it.
// A system-prompt "don't lie" is too weak for a local model. So this is CODE: it detects an action request
// aimed at the tool-less brain and returns an HONEST refusal instead — a fabricated success is structurally
// impossible, not merely discouraged. Pure + eval-pinned. (The paid-Claude brain has real tools + read-back
// verification and is unaffected — it reports actual tool results.)

// PURE: does this message ask for a real, world-changing ACTION the tool-less brain cannot actually perform?
// Deliberately scoped to the L-014 failure classes (create/save a file or note; locate/open a file or photo;
// explicit send/submit) so ordinary chat + prose generation ("write me a cover letter") still flow through.
const ACTION_RE = new RegExp([
  '\\b(create|creating|make|making|write|writing|sav(?:e|ing)|add|adding|generate|generating|put)\\b[^.?!\\n]{0,40}\\b(file|files|note|notes|markdown|\\.md\\b|doc|document|folder|directory)\\b',
  '\\b(locate|find|open|show me|pull up)\\b[^.?!\\n]{0,40}\\b(file|files|folder|album|photo album|photos|directory|the vault)\\b',
  '\\b(send|e-?mail)\\b[^.?!\\n]{0,30}\\b(email|e-?mail|message|reply|it|this|that|to\\s+\\w)\\b',
  '\\bsubmit\\b[^.?!\\n]{0,30}\\b(proposal|bid|it|this|that|form|application|response)\\b',
  '\\b(delete|remove|rename|move)\\b[^.?!\\n]{0,30}\\b(file|note|folder|it|this|that)\\b',
].join('|'), 'i');

export function looksLikeAction(text = '') { return ACTION_RE.test(String(text || '')); }

// PURE: does answering this REQUIRE reading the operator's real world (vault, calendar, inbox, pipeline,
// money, people)? This is the second half of L-014, found live on 2026-07-29.
//
// The original guard only caught ACTIONS, so a QUESTION — "What do I know about Ana's NIH evaluation? Check my
// vault." — fell through to the tool-less brain, which invented an entire document: a filename
// ("Ana's NIH Grant Evaluation - FINAL.pdf"), a folder path, a surname Ana does not have, and an NIH *grant*
// review with h-index and publication metrics. Ana is a transplant patient, not a researcher. Zero tools were
// called. The system prompt told it "never invent or guess... names" and it invented all of it — which is the
// whole doctrine in one example: a prompt is not a guard, only CODE is.
//
// Questions are exactly WHEN memory matters most, so they must reach the tool brain (now free + ~4s via our
// own gateway, so the old "no tools to save money" tradeoff no longer exists).
const REAL_DATA_RE = new RegExp([
  // his own things, by name
  '\\b(vault|second brain|obsidian|my notes?|the notes?)\\b',
  '\\bmy\\b[^.?!\\n]{0,30}\\b(calendar|schedule|inbox|email|tasks?|pipeline|deals?|bids?|proposals?|invoices?|budget|expenses?|clients?|subs?|contracts?|numbers?|money|profit|revenue|goals?)\\b',
  // recall questions — "what do I know / what did we decide / have I written"
  '\\bwhat (do|did) (i|we|you)\\b',
  '\\b(do|did) (i|we) (have|know|decide|say|write|note|record|plan)\\b',
  '\\bhave (i|we)\\b[^.?!\\n]{0,40}\\b(written|noted|decided|saved|recorded|said|planned)\\b',
  '\\bwhat.{0,25}\\b(we|i)\\s+(decide|decided|agree|agreed|discuss|discussed)\\b',
  // explicit lookups
  '\\b(check|search|look (in|up|through)|pull (up|from)|remind me (of|about)|what.s in)\\b',
  // his live status
  '\\b(how much|how many|when is|when did|what.s (next|due|left|the status))\\b',
].join('|'), 'i');

export function needsRealData(text = '') { return REAL_DATA_RE.test(String(text || '')); }

// The honest refusal when a REAL-DATA question reaches a brain with no tools. Never an invented answer.
export const FREE_BRAIN_NO_DATA = "I can't see your real data from here, so I won't guess at it — no invented notes, files, names, or numbers. Ask me again and I'll search your Second Brain properly.";

// The honest refusal the tool-less brain returns instead of a confabulated success.
export const FREE_BRAIN_REFUSAL = "I can't actually do that on the free everyday brain — I have no tools here, so I won't pretend I did (no made-up files, paths, or results). Flip the brain chip to Claude (top bar) and ask again, and I'll really do it and show you the verified result.";

// The truthfulness rule appended to the chat system prompt on BOTH brains (belt-and-suspenders for the code guard).
export const TRUTH_RULE = '\n\n## TRUTHFULNESS (non-negotiable — Lessons Ledger L-014)\n'
  + 'You may claim an action happened ONLY if you called its tool and received a SUCCESS result in THIS turn. '
  + 'No tool call → no claim. Never invent or guess a file path, filename, result, number, or name. NEVER output a '
  + 'placeholder path like /Users/YourName/. If a tool returned an error, or you have no tool for what is asked, say '
  + 'so plainly ("I can\'t do that yet" / "that failed — <reason>") and STOP — never narrate a success you did not verify.';
