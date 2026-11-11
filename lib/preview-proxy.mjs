// Shared URL and document rewriting for Node.js and Cloudflare Workers.
export const proxyPrefix = '/__proxy/';

export function createRewriter(isOwnURL) {
  function proxyPath(value, base) {
    try {
      const url = new URL(value, base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return value;
      const local = isOwnURL(url);
      if (local) return value;
      return `${proxyPrefix}${btoa(url.origin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}${url.pathname}${url.search}${url.hash}`;
    } catch { return value; }
  }
  function targetURL(local) {
    const match = local.pathname.match(/^\/__proxy\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (!match) throw Error('代理地址无效');
    const origin = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw Error('仅支持 HTTP/HTTPS 地址');
    if (isOwnURL(parsed)) throw Error('不能代理模拟器自身');
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
  return { proxyPath, targetURL, cssRewrite, htmlRewrite };
}

export function errorPage(message) {
  const safe = message.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:14px/1.8 system-ui;padding:48px;color:#647084}h2{color:#303541;font-weight:500}</style><h2>暂时无法加载这个网页</h2><p>${safe}</p><p>请检查网址或使用底部的“新窗口打开”。</p><script>parent.postMessage({type:'folden:proxy-error'},'*')</script>`;
}
