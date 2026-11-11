import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRewriter, proxyPrefix, errorPage } from './lib/preview-proxy.mjs';

const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const port = Number(process.env.PORT || 9218);
const host = process.env.HOST || '127.0.0.1';
const { proxyPath, targetURL, cssRewrite, htmlRewrite } = createRewriter(url =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port || 80) === port);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };


async function proxy(req, res, local) {
  const target = targetURL(local);
  const accept = req.headers.accept || '*/*';
  const headers = { 'user-agent': req.headers['user-agent'] || 'Mozilla/5.0', accept, 'accept-language': req.headers['accept-language'] || 'zh-CN,zh;q=0.9', 'accept-encoding':'identity', referer:target.origin+'/' };
  for (const name of ['content-type','range','if-none-match','if-modified-since','x-requested-with']) if(req.headers[name]) headers[name]=req.headers[name];
  if (!['GET','HEAD'].includes(req.method)) headers.origin = target.origin;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),25000);
  const onClose = ()=>{if(!res.writableEnded)controller.abort()};
  res.on('close',onClose);
  try {
    const options = { method:req.method, headers, redirect:'manual', signal:controller.signal };
    if (!['GET','HEAD'].includes(req.method)) { options.body=req;options.duplex='half'; }
    const upstream = await fetch(target,options);
    const contentType=upstream.headers.get('content-type') || 'application/octet-stream';
    const out = {'Content-Type':contentType,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
    for (const name of ['content-range','accept-ranges','etag','last-modified']) if(upstream.headers.has(name))out[name]=upstream.headers.get(name);
    // Framing policy belongs to the remote origin. This local response is the explicit preview representation.
    // Remote cookies and security headers are never installed onto the simulator origin.
    if (upstream.headers.has('location')) {
      out.Location=proxyPath(upstream.headers.get('location'),target);
      await upstream.body?.cancel();res.writeHead(upstream.status,out).end();return;
    }
    if (req.method==='HEAD' || [204,304].includes(upstream.status)) { await upstream.body?.cancel();res.writeHead(upstream.status,out).end();return; }
    const html=/text\/html|application\/xhtml\+xml/i.test(contentType);
    const css=/text\/css/i.test(contentType);
    if(html||css) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      let encoding=contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1];
      if (!encoding && html) encoding = new TextDecoder().decode(bytes.slice(0,4096)).match(/charset\s*=\s*["']?([^\s;"'/>]+)/i)?.[1];
      let body;try{body=new TextDecoder(encoding||'utf-8').decode(bytes)}catch{body=new TextDecoder().decode(bytes)}
      if (html) {
        const shellOrigin = local.hostname === '127.0.0.1' ? `http://localhost:${port}` : local.origin;
        body=htmlRewrite(body,target,shellOrigin,await readFile(path.join(root,'proxy-runtime.js'),'utf8'));
        body=body.replace(/(<meta\b[^>]*charset\s*=\s*["']?)[\w-]+/gi,'$1utf-8');
        out['Content-Type']='text/html; charset=utf-8';
      } else {body=cssRewrite(body,target);out['Content-Type']='text/css; charset=utf-8';}
      res.writeHead(upstream.status,out).end(body);
    } else {
      res.writeHead(upstream.status,out);
      if(upstream.body)for await (const chunk of upstream.body) {if(res.destroyed)break;res.write(chunk);}
      res.end();
    }
  } finally {clearTimeout(timer);res.off('close',onClose);}
}

http.createServer(async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto']?.split(',')[0].trim() === 'https' ? 'https' : 'http';
    const local = new URL(req.url,`${protocol}://${req.headers.host || `localhost:${port}`}`);
    if (!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)) {res.writeHead(405).end();return;}
    if (local.pathname === '/healthz' && ['GET','HEAD'].includes(req.method)) {
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({status:'ok'}));return;
    }
    if (local.pathname.startsWith(proxyPrefix)) {
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Requested-With'}).end();return;}
      await proxy(req,res,local);return;
    }
    // Scripts may navigate to root-relative paths with location.href, which cannot be monkey-patched.
    // Recover the upstream origin from the canonical proxied referrer and restore the proxy path.
    const ownAsset=/^\/(?:vendor\/|assets\/|(?:app|motion|style|proxy-runtime|preview-origin)\.(?:js|css)$|demo\.html$)/.test(local.pathname);
    if(!ownAsset && req.headers.referer) {
      try {
        const referrer=new URL(req.headers.referer);
        if(referrer.origin===local.origin && referrer.pathname.startsWith(proxyPrefix)) {
          const recovered=proxyPath(local.pathname+local.search,targetURL(referrer));
          if(recovered.startsWith(proxyPrefix)) {
            if(['document','iframe'].includes(req.headers['sec-fetch-dest'])) {res.writeHead(307,{Location:recovered}).end();return;}
            await proxy(req,res,new URL(recovered,local.origin));return;
          }
        }
      } catch {}
    }
    // Keep external pages on a different origin from the simulator UI and its saved preferences.
    if(req.headers.host?.startsWith('127.0.0.1') && (local.pathname==='/'||local.pathname==='/simulator')) {
      res.writeHead(302,{Location:`http://localhost:${port}${local.pathname}`}).end();return;
    }
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    const pathname = decodeURIComponent(local.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' || pathname === '/simulator' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(req.method==='HEAD'?undefined:data);
  } catch(err) {
    if(res.headersSent){res.destroy();return;}
    if(req.url.startsWith(proxyPrefix))res.writeHead(502,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(errorPage(err.name==='AbortError'?'目标网站连接超时':err.message));
    else res.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`Folden Device: http://${host}:${port}`));
