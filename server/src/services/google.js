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

let _jwks = null;
function jwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  return _jwks;
}

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
    throw Object.assign(new Error(`Google id_token rejected: ${err.message}`), { status: 401 });
  }
}

module.exports = { verifyIdToken };
