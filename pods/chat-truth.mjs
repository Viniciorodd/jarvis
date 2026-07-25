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

// The honest refusal the tool-less brain returns instead of a confabulated success.
export const FREE_BRAIN_REFUSAL = "I can't actually do that on the free everyday brain — I have no tools here, so I won't pretend I did (no made-up files, paths, or results). Flip the brain chip to Claude (top bar) and ask again, and I'll really do it and show you the verified result.";

// The truthfulness rule appended to the chat system prompt on BOTH brains (belt-and-suspenders for the code guard).
export const TRUTH_RULE = '\n\n## TRUTHFULNESS (non-negotiable — Lessons Ledger L-014)\n'
  + 'You may claim an action happened ONLY if you called its tool and received a SUCCESS result in THIS turn. '
  + 'No tool call → no claim. Never invent or guess a file path, filename, result, number, or name. NEVER output a '
  + 'placeholder path like /Users/YourName/. If a tool returned an error, or you have no tool for what is asked, say '
  + 'so plainly ("I can\'t do that yet" / "that failed — <reason>") and STOP — never narrate a success you did not verify.';
