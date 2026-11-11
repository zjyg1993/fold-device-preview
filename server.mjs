import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const port = Number(process.env.PORT || 9218);
const host = process.env.HOST || '0.0.0.0';
const proxyPrefix = '/__proxy/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };


function proxyPath(value, base) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return value;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port || 80) === port;
    if (local) return value;
    return `${proxyPrefix}${Buffer.from(url.origin).toString('base64url')}${url.pathname}${url.search}${url.hash}`;
  } catch { return value; }
}
function targetURL(local) {
  const match = local.pathname.match(/^\/__proxy\/([A-Za-z0-9_-]+)(\/.*)?$/);
  if (!match) throw Error('代理地址无效');
  const origin = Buffer.from(match[1], 'base64url').toString();
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw Error('仅支持 HTTP/HTTPS 地址');
  if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && Number(parsed.port || 80) === port) throw Error('不能代理模拟器自身');
  return new URL((match[2] || '/') + local.search, parsed.origin);
}
function decodeEntities(value) {
  return value.replace(/&amp;/gi, '&').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
    const n = parseInt(hex || dec, hex ? 16 : 10); return n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
function cssRewrite(css, base) {
  return css.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (all, q, value) => {
    if (/^(data:|blob:|#)/i.test(value)) return all;
    return `url("${proxyPath(value, base).replace(/"/g, '%22')}")`;
  }).replace(/(@import\s+)(['"])([^'"]+)\2/gi, (_, lead, q, value) => `${lead}${q}${proxyPath(value, base)}${q}`);
}
function tagRewrite(tag, base) {
  return tag.replace(/\s(integrity|nonce|crossorigin)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(src|href|action|poster|data-src|data-href|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (all, name, a, b, c) => {
      const value = decodeEntities(a ?? b ?? c);
      if (!value || /^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(value)) return all;
      return ` ${name}="${proxyPath(value, base).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;
    }).replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_, value) => ` style="${cssRewrite(value, base).replace(/"/g,'&quot;')}"`)
    .replace(/\ssrcset\s*=\s*(["'])(.*?)\1/gi, (all, q, value) => {
      if (/data:/i.test(value)) return all;
      return ` srcset=${q}${value.split(',').map(item=>{const [url,...rest]=item.trim().split(/\s+/);return [proxyPath(url,base),...rest].join(' ')}).join(', ')}${q}`;
    });
}
function htmlRewrite(html, target, shellOrigin, runtime) {
  let base = target.href;
  const baseTag = html.match(/<base\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (baseTag) { try { base = new URL(decodeEntities(baseTag[1] ?? baseTag[2] ?? baseTag[3]), target).href; } catch {} }
  const result = html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>|<[^>]+>/gi, (tag, block) => {
    if (tag.startsWith('<!--')) return tag;
    if (/^<meta\b/i.test(tag) && /http-equiv\s*=\s*["']?(content-security-policy|x-frame-options|refresh)/i.test(tag)) return '';
    if (/^<base\b/i.test(tag)) return '';
    if (block) {
      const end = tag.indexOf('>') + 1;
      return tagRewrite(tag.slice(0,end), base) + (block.toLowerCase()==='style' ? cssRewrite(tag.slice(end),base) : tag.slice(end));
    }
    return tagRewrite(tag,base);
  });
  const config = JSON.stringify({target:target.href,base,shellOrigin}).replace(/</g,'\\u003c');
  const injected = `<base href="${proxyPath(base,target).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"><script>(${runtime})(${config});</script>`;
  if (/<head\b[^>]*>/i.test(result)) return result.replace(/<head\b[^>]*>/i, match=>match+injected);
  return result.replace(/(<html\b[^>]*>)?/i, match=>match+`<head>${injected}</head>`);
}
function errorPage(message) {
  const safe = message.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:14px/1.8 system-ui;padding:48px;color:#647084}h2{color:#303541;font-weight:500}</style><h2>暂时无法加载这个网页</h2><p>${safe}</p><p>请检查网址或使用底部的“新窗口打开”。</p><script>parent.postMessage({type:'folden:proxy-error'},'*')</script>`;
}
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
