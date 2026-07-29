// speech.mjs — turning Jarvis's written reply into something a VOICE should say.
//
// Operator, 2026-07-29: *"she reads the ** stars in each word that comes from the markdown file and that ruins
// her flow a bit."* Exactly right, and it was structural: `/api/tts` was handed the raw reply, so every
// `**bold**` the model wrote became "star star bold star star" out loud. Markdown is a screen format. The
// screen keeps it; the voice must not hear it.
//
// The transcript on screen is deliberately NOT changed — he should still see the emphasis. This is the last
// step before audio only.

// PURE: written reply → spoken line. Eval-pinned.
export function speakable(text = '') {
  if (text == null) return '';
  let t = String(text);
  t = t.replace(/```[\s\S]*?```/g, ' . ');                   // code blocks are unspeakable
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1');
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');           // link text, never the URL
  t = t.replace(/(\*\*\*|___)(\S[\s\S]*?\S|\S)\1/g, '$2');
  t = t.replace(/(\*\*|__)(\S[\s\S]*?\S|\S)\1/g, '$2');      // **bold** — THE bug he heard
  t = t.replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1');
  t = t.replace(/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, '$1');
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');                  // heading marks
  t = t.replace(/^\s{0,3}>\s?/gm, '');                       // block quotes
  t = t.replace(/^\s*[-*+]\s+/gm, '');                       // bullets — the pause comes from punctuation
  t = t.replace(/^\s*\d+[.)]\s+/gm, '');
  t = t.replace(/^\s*([-*_]\s*){3,}$/gm, ' ');               // horizontal rules
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\|/g, ' ');                                 // table pipes read as nothing useful
  // Symbols a voice stumbles on. Percent/dollar are spoken well by every engine, so they stay.
  t = t.replace(/[•▪●✓✔→←⇒]/g, ' ');
  t = t.replace(/—|–/g, ', ');                     // em/en dash → a real breath
  t = t.replace(/…/g, '. ');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{2,}/g, '. ').replace(/\n/g, '. ');       // paragraph breaks become sentence breaks
  t = t.replace(/\s*\.\s*(?=\.)/g, '').replace(/\.{2,}/g, '.');
  t = t.replace(/\s+([,.!?;:])/g, '$1');
  return t.replace(/\s+/g, ' ').trim();
}
