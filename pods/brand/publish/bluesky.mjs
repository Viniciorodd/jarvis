// bluesky.mjs — the first real channel. Free, no approval, no review.
//
// ⚠ NO SDK, DELIBERATELY. The handoff specifies `@atproto/api`. It is not installed, and his standing
// rule is absolute: *"No external code gets installed anywhere in the system without a logged CLEAN
// verdict from this audit."* Installing an unaudited package to save writing two fetch calls is
// exactly the trade that rule exists to prevent.
//
// AT Protocol is two plain HTTP calls — `createSession` for a token, `createRecord` to post — so the
// SDK buys nothing here. The handoff already specifies plain HTTP for Mastodon for the same reason.
// Zero new dependencies, and the audit rule stays intact.
//
// 🔒 VERIFIED SEND (L-014). After posting, the record is read back from the API. If the read-back
// fails, this reports a FAILURE — never a success with a missing receipt. A claimed send is not a
// send, and a publishing system that cannot prove it published is worse than one that did not.
//
// The adapter holds no credential of its own: `publish()` takes them, so a misconfigured deploy
// posts nothing rather than posting wrongly. Same contract as pods/redos/executor.mjs.

const API = 'https://bsky.social/xrpc';

const j = async (res) => {
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: { raw: text.slice(0, 400) } }; }
};

// PURE: Bluesky counts GRAPHEMES, not UTF-16 code units, and caps at 300. Emoji and accented
// characters make `.length` lie, and a post silently truncated at the API is a post he did not write.
export function graphemes(text = '') {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return [...seg.segment(String(text))].length;
  } catch { return [...String(text)].length; }
}

export const MAX = 300;
export function fits(text = '') {
  const n = graphemes(text);
  return { ok: n <= MAX, count: n, over: Math.max(0, n - MAX) };
}

// ── ⚠ FACETS ARE MEASURED IN UTF-8 BYTES, NOT CHARACTERS ────────────────────────────────────────
// A link is only clickable if the record carries a facet with byte offsets into the text. JavaScript
// string indices are UTF-16 code units, so any emoji or accented character BEFORE a link shifts the
// real byte offset and the link highlights the wrong span, or lands mid-word. Added when the social
// pod started posting his content pack, which writes links as bare domains ("redoshq.com/quick") —
// unfaceted, those are grey text nobody can tap.
const enc = new TextEncoder();

/** PURE: UTF-8 byte length of a string. The unit AT Protocol facets are measured in. */
export const byteLen = (s = '') => enc.encode(String(s)).length;

/**
 * PURE: find links and return AT Protocol facets with correct UTF-8 byte offsets.
 *
 * Matches bare domains as well as http(s):// — his pack writes "redoshq.com/quick" without a scheme,
 * and an unfaceted link is just grey text nobody can tap.
 */
export function detectFacets(text = '') {
  const src = String(text || '');
  const re = /(https?:\/\/[^\s)]+[^\s.,)!?])|(\b[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|xyz|me)(?:\/[^\s)]*[^\s.,)!?])?)/gi;
  const facets = [];
  let m;
  while ((m = re.exec(src))) {
    const raw = m[0];
    // Byte offsets, computed from the slices — NOT from m.index, which is a UTF-16 code-unit index.
    const byteStart = byteLen(src.slice(0, m.index));
    const byteEnd = byteStart + byteLen(raw);
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: /^https?:\/\//i.test(raw) ? raw : 'https://' + raw }],
    });
  }
  return facets;
}

// PURE: the record body. `createdAt` is the client's clock — Bluesky orders by it, so a wrong one
// buries the post.
export function record(text, at = new Date().toISOString()) {
  const t = String(text);
  return { $type: 'app.bsky.feed.post', text: t, createdAt: at, langs: ['en'], facets: detectFacets(t) };
}

// PURE: the public URL for a post, from the AT URI it returns.
export function postUrl(handle, uri = '') {
  const rkey = String(uri).split('/').pop();
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : '';
}

async function login({ handle, password }) {
  const res = await fetch(`${API}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  const { status, body } = await j(res);
  if (status !== 200 || !body.accessJwt) {
    throw new Error(`bluesky login failed (${status}): ${body.message || body.error || body.raw || 'unknown'}`);
  }
  return { jwt: body.accessJwt, did: body.did, handle: body.handle };
}

/**
 * publish({ text, handle, password }) -> { ok, remoteId, url, verified, error }
 *
 * `dryRun` is honoured and is what every caller should use first: it logs in (proving the credential
 * works) and returns what WOULD be posted, without posting it.
 */
export async function publish({ text, handle, password, dryRun = false, at = null } = {}) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'nothing to post' };
  const f = fits(body);
  if (!f.ok) return { ok: false, error: `${f.count} graphemes, ${f.over} over the ${MAX} limit` };
  if (!handle || !password) return { ok: false, error: 'no bluesky credentials supplied' };

  let session;
  try { session = await login({ handle, password }); }
  catch (e) { return { ok: false, error: e.message }; }

  if (dryRun) return { ok: true, dryRun: true, wouldPost: body, graphemes: f.count, as: session.handle };

  const res = await fetch(`${API}/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.jwt}` },
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record: record(body, at || new Date().toISOString()) }),
  });
  const { status, body: out } = await j(res);
  if (status !== 200 || !out.uri) {
    return { ok: false, error: `createRecord failed (${status}): ${out.message || out.error || out.raw || 'unknown'}` };
  }

  // 🔒 READ IT BACK. This is the difference between "the API returned 200" and "the post exists".
  let verified = false, verifyError = '';
  try {
    const chk = await fetch(`${API}/com.atproto.repo.getRecord?repo=${encodeURIComponent(session.did)}`
      + `&collection=app.bsky.feed.post&rkey=${encodeURIComponent(String(out.uri).split('/').pop())}`);
    const got = await j(chk);
    verified = got.status === 200 && got.body && got.body.value && got.body.value.text === body;
    if (!verified) verifyError = `read-back mismatch (${got.status})`;
  } catch (e) { verifyError = e.message; }

  return {
    ok: verified,
    remoteId: out.uri,
    cid: out.cid,
    url: postUrl(session.handle, out.uri),
    verified,
    // An unverifiable send is a FAILURE, and it says why rather than quietly succeeding.
    error: verified ? '' : `posted but could not verify: ${verifyError}`,
  };
}

/** healthCheck() -> { ok, tokenExpiresAt } — app passwords do not expire, so there is nothing to warn about. */
export async function healthCheck({ handle, password } = {}) {
  if (!handle || !password) return { ok: false, error: 'no bluesky credentials' };
  try {
    const s = await login({ handle, password });
    return { ok: true, as: s.handle, tokenExpiresAt: null, note: 'app passwords do not expire' };
  } catch (e) { return { ok: false, error: e.message }; }
}
