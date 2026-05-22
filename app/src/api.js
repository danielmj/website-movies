// Tiny fetch wrapper. All requests are JSON; cookies sent for sessions.
async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  const text = await r.text();
  let data = null;
  let parseFailed = false;
  if (text) {
    try { data = JSON.parse(text); } catch { parseFailed = true; }
  }
  if (!r.ok) {
    const msg = (!parseFailed && data && data.error) || `${r.status} ${r.statusText}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  if (parseFailed) {
    // 2xx but the body wasn't JSON — almost always a proxy misroute returning
    // HTML. Treat it as a hard error rather than silently passing garbage on.
    const err = new Error(`unexpected non-JSON response from ${path}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
};
