import { createRewriter, proxyPrefix, errorPage } from './lib/preview-proxy.mjs';
// Import as text via Wrangler's Text rule so bundling cannot introduce helper
// references into the script that runs inside the remote preview document.
import runtime from './public/proxy-runtime.js';

const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': methods.join(', '),
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Range, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, ETag, Last-Modified',
};

async function proxy(request, local, rewrite) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const target = rewrite.targetURL(local);
  const headers = new Headers({
    'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
    Accept: request.headers.get('accept') || '*/*',
    'Accept-Language': request.headers.get('accept-language') || 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'identity',
    Referer: target.origin + '/',
  });
  for (const name of ['content-type', 'range', 'if-none-match', 'if-modified-since', 'x-requested-with']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  if (!['GET', 'HEAD'].includes(request.method)) headers.set('Origin', target.origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch(target.href, {
      method: request.method, headers, redirect: 'manual', signal: controller.signal,
      ...(!['GET', 'HEAD'].includes(request.method) ? { body: request.body, duplex: 'half' } : {}),
    });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    // Only copy preview headers: upstream cookies and framing policies must not
    // be installed on the simulator origin. The UI uses an opaque iframe sandbox.
    const out = new Headers({ ...cors, 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-range', 'accept-ranges', 'etag', 'last-modified']) {
      if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
    }
    if (upstream.headers.has('location')) {
      out.set('Location', rewrite.proxyPath(upstream.headers.get('location'), target));
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers: out });
    }
    if (request.method === 'HEAD' || [204, 205, 304].includes(upstream.status)) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers: out });
    }
    const html = /text\/html|application\/xhtml\+xml/i.test(contentType);
    const css = /text\/css/i.test(contentType);
    if (!html && !css) return new Response(upstream.body, { status: upstream.status, headers: out });
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    let encoding = contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1];
    if (!encoding && html) encoding = new TextDecoder().decode(bytes.slice(0, 4096)).match(/charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1];
    let body;
    try { body = new TextDecoder(encoding || 'utf-8').decode(bytes); }
    catch { body = new TextDecoder().decode(bytes); }
    if (html) {
      const shellOrigin = local.protocol === 'http:' && local.hostname === '127.0.0.1'
        ? `http://localhost:${local.port}` : local.origin;
      body = rewrite.htmlRewrite(body, target, shellOrigin, runtime);
      body = body.replace(/(<meta\b[^>]*charset\s*=\s*["']?)[\w-]+/gi, '$1utf-8');
      out.set('Content-Type', 'text/html; charset=utf-8');
    } else {
      body = rewrite.cssRewrite(body, target);
      out.set('Content-Type', 'text/css; charset=utf-8');
    }
    return new Response(body, { status: upstream.status, headers: out });
  } finally { clearTimeout(timer); }
}

export default {
  async fetch(request, env) {
    const local = new URL(request.url);
    const rewrite = createRewriter(url => url.origin === local.origin);
    let proxied = local.pathname.startsWith(proxyPrefix);
    try {
      if (!methods.includes(request.method)) return new Response(null, { status: 405 });
      if (local.pathname === '/healthz' && ['GET', 'HEAD'].includes(request.method)) {
        return new Response(request.method === 'HEAD' ? null : JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      if (proxied) return await proxy(request, local, rewrite);
      if (local.protocol === 'http:' && local.hostname === '127.0.0.1' && ['/', '/simulator'].includes(local.pathname)) {
        const shell = new URL(local);
        shell.hostname = 'localhost';
        return Response.redirect(shell.href, 302);
      }
      // Preserve Node's recovery for scripts that navigate to root-relative URLs.
      const ownAsset = /^\/(?:vendor\/|assets\/|(?:app|motion|style|proxy-runtime|preview-origin)\.(?:js|css)$|demo\.html$)/.test(local.pathname);
      if (!ownAsset && request.headers.has('referer')) {
        let recovered;
        try {
          const referrer = new URL(request.headers.get('referer'));
          if (referrer.origin === local.origin && referrer.pathname.startsWith(proxyPrefix)) {
            recovered = rewrite.proxyPath(local.pathname + local.search, rewrite.targetURL(referrer));
          }
        } catch { /* Ignore unrelated or malformed referrers. */ }
        if (recovered?.startsWith(proxyPrefix)) {
          proxied = true;
          if (['document', 'iframe'].includes(request.headers.get('sec-fetch-dest'))) {
            return new Response(null, { status: 307, headers: { Location: recovered } });
          }
          return await proxy(request, new URL(recovered, local), rewrite);
        }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
      if (local.pathname === '/simulator') {
        local.pathname = '/';
        return await env.ASSETS.fetch(new Request(local, request));
      }
      // Also enables snapshot module imports from the opaque sandbox.
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    } catch (err) {
      if (!proxied) return new Response('Internal server error', { status: 500 });
      return new Response(errorPage(err.name === 'AbortError' ? '目标网站连接超时' : err.message), {
        status: 502, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  },
};
