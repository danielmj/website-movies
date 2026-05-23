// Sign in with Google — id_token verification.
//
// Google Identity Services on the frontend returns a JWT signed by Google's
// RS256 keys. We verify it against Google's published JWKS and pin the
// audience to our OAuth Client ID. Anything else throws.
//
// Required env:
//   GOOGLE_CLIENT_ID  the OAuth 2.0 Client ID from Google Cloud Console
//                     (e.g. 123456789-abcdef.apps.googleusercontent.com)

const { createRemoteJWKSet, jwtVerify } = require('jose');

// Google publishes id_tokens with the issuer "https://accounts.google.com"
// (older flows omit the scheme). Both forms are valid per Google's docs.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

// Bump the default 5s fetch timeout — first call from a fresh container
// can blow past it on a slow link. Shrink the post-failure cooldown from
// the default 30s so the next retry isn't gated on jose's internal timer.
const JWKS_OPTS = {
  timeoutDuration: 15_000,
  cooldownDuration: 5_000,
};

let _jwks = null;
function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(GOOGLE_JWKS_URL, JWKS_OPTS);
  return _jwks;
}

// Pre-warm the JWKS at module load so the first sign-in request doesn't
// pay the round-trip. Failures here are silent — the next verifyIdToken
// call will retry on its own.
function warmup() {
  try {
    const set = jwks();
    set({ alg: 'RS256' }).catch(() => {});
  } catch {}
}
warmup();

async function verifyIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw Object.assign(new Error('GOOGLE_CLIENT_ID not configured'), { status: 503 });
  }
  try {
    const { payload } = await jwtVerify(idToken, jwks(), {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    return payload;
  } catch (err) {
    // Surface the underlying cause to the API logs so debugging this kind of
    // failure doesn't require turning on jose tracing. The browser still
    // only sees the short reason for security.
    console.error('[google] id_token verification failed:', err);
    throw Object.assign(new Error(`Google id_token rejected: ${err.message}`), { status: 401 });
  }
}

module.exports = { verifyIdToken };
