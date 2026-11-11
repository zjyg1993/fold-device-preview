import { createMotion } from './motion.js';
import { proxyOrigin, proxyMessageOrigin, configurePreview } from './preview-origin.js';
const $ = (id) => document.getElementById(id);
const paths = {
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>',
  refresh: '<path d="M20 5v5h-5M20 10a8 8 0 1 0 0 6"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 19h4"/>',
  'phone-wide': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M5 10v4"/>',
  'tablet-wide': '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M12 4v16" opacity=".25"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M4 12h16" opacity=".25"/>',
  external: '<path d="M14 3h7v7m0-7-10 10M10 5H4v15h15v-6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const modes = {
  innerLandscape: { name:'横屏内屏', w:880, h:624, inner:true, portrait:false },
  innerPortrait: { name:'竖屏内屏', w:624, h:880, inner:true, portrait:true },
  outerPortrait: { name:'外屏竖屏', w:432, h:624, inner:false, portrait:true },
  outerLandscape: { name:'外屏横屏', w:624, h:432, inner:false, portrait:false },
};
const state = { mode:'innerLandscape', url:'', safe:false, theme:'light', proxy:true, timer:null };
try { const saved = JSON.parse(localStorage.getItem('folden-preferences') || '{}'); if (modes[saved.mode]) state.mode = saved.mode; if(saved.theme === 'dark') state.theme = 'dark'; state.safe = saved.safe === true; } catch {}
function save() { try { localStorage.setItem('folden-preferences', JSON.stringify({mode:state.mode, theme:state.theme, safe:state.safe})); } catch {} }
function hint(text, error=false) { $('hint').textContent=text; $('hint').classList.toggle('error', error); }
function layout() {
  const m=modes[state.mode];
  // Geometry measured from the original simulator. The frame rotates; the iframe stays upright.
  const base = m.inner ? {w:954.576271, h:699.237378, x:37.288136, y:37.618689} : {w:487.218045, h:673.735793, x:27.609023, y:24.867897};
  const rotate = m.inner ? m.portrait : !m.portrait;
  const width=rotate?base.h:base.w, height=rotate?base.w:base.h;
  const area=$('stage').getBoundingClientRect();
  const scale=Math.max(.05, Math.min(1,area.width/width,area.height/height));
  $('device-wrap').style.cssText=`width:${width*scale}px;height:${height*scale}px`;
  $('device').style.cssText=`width:${width}px;height:${height}px;transform:scale(${scale})`;
  $('device').className=`device ${m.inner?'inner':'outer'} ${m.portrait?'portrait':'landscape'}`;
  $('frame').src=`/assets/frame-${m.inner?'inner':'outer'}.png`;
  $('frame').style.cssText=`width:${base.w}px;height:${base.h}px;left:${(width-base.w)/2}px;top:${(height-base.h)/2}px;transform:rotate(${rotate?90:0}deg)`;
  const x=rotate ? base.h-base.y-(m.inner?624:624) : base.x;
  const y=rotate ? base.x : base.y;
  $('screen').style.cssText=`left:${x}px;top:${y}px;width:${m.w}px;height:${m.h}px;border-radius:${m.inner?'40px':m.portrait?'4px 55px 55px 4px':'4px 4px 55px 55px'}`;
  $('mode-name').textContent=m.name; $('dimensions').textContent=`${m.w} × ${m.h}`; $('scale').textContent=`${Math.round(scale*100)}%`;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  $('reserved').hidden=!state.safe; $('safe-toggle').setAttribute('aria-pressed',String(state.safe));
}
function theme() {
  document.body.classList.toggle('dark',state.theme==='dark');
  $('theme-label').textContent=state.theme==='dark'?'深色':'浅色';
  $('theme').querySelector('[data-icon]').innerHTML=icon(state.theme==='dark'?'moon':'sun');
  $('theme').title=state.theme==='dark'?'切换为浅色模式':'切换为深色模式';
}
function normalize(raw) {
  let value=raw.trim();
  if(!value) return '';
  if(!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    if(/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(localhost|[\w.-]+):\d+(\/|$)/i.test(value)) throw Error('请输入 http 或 https 网址');
    value=(/^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)([:/]|$)/i.test(value)?'http://':'https://')+value;
  }
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)) throw Error('仅支持 http 和 https 网址');
  if(url.username||url.password) throw Error('请使用不含用户名和密码的网址');
  if(url.origin===location.origin && !url.pathname.startsWith('/demo.html')) throw Error('这是模拟器自身地址，请输入要预览的项目网址');
  return url.href;
}
function clearPreview() {
  clearTimeout(state.timer); state.url=''; $('url').value=''; $('clear').hidden=true; $('preview').hidden=true; $('preview').removeAttribute('src'); $('empty').hidden=false; $('open-external').disabled=true; $('embed-note').hidden=true; hint('支持网址和本地项目地址');
}
function previewURL(url) {
  if(!state.proxy || new URL(url).origin===location.origin) return url;
  const target=new URL(url);
  const token=btoa(target.origin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${proxyOrigin}/__proxy/${token}${target.pathname}${target.search}${target.hash}`;
}
function load(url) {
  clearTimeout(state.timer);state.url=url; $('url').value=url; $('clear').hidden=false; $('empty').hidden=true; $('preview').hidden=false; $('open-external').disabled=false; $('embed-note').hidden=false;
  configurePreview($('preview'), state.proxy && new URL(url).origin !== location.origin);
  hint(state.proxy?'正在通过本地代理加载…':'正在直接加载网页…'); $('preview').src=previewURL(url);
  state.timer=setTimeout(()=>hint('加载时间较长；若网页空白，可尝试新窗口打开'),12000);
}
$('url-form').addEventListener('submit', e=>{e.preventDefault();if(motion.busy)return;try { const url=normalize($('url').value); if(url) load(url); else {clearPreview();$('url').focus();} } catch(err) {hint(err.message || '请输入有效网址',true);$('url').focus();} });
$('url').addEventListener('input',()=>{$('clear').hidden=!$('url').value;});
$('clear').addEventListener('click',()=>{clearPreview();$('url').focus();});
$('preview').addEventListener('load',()=>{if(!state.url)return;clearTimeout(state.timer);hint(state.proxy?'代理页面已响应 · 可切换设备姿态预览':'已请求网页 · 可切换设备姿态预览');});
$('preview').addEventListener('error',()=>{clearTimeout(state.timer);hint('网页加载失败，请检查地址或在新窗口打开',true);});
const motion = createMotion({ state, modes, layout, save });
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>motion.change(b.dataset.mode)));
$('theme').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';theme();motion.feedback($('theme').querySelector('svg'),'theme');save();});
$('refresh').addEventListener('click',()=>{motion.feedback($('refresh').querySelector('svg'), 'spin'); if(state.url) load(state.url); else hint('请先输入要预览的网址');});
$('safe-toggle').addEventListener('click',()=>{state.safe=!state.safe;layout();if(state.safe)motion.feedback($('reserved'),'reveal');save();});
$('proxy-toggle').addEventListener('click',()=>{state.proxy=!state.proxy;$('proxy-toggle').setAttribute('aria-pressed',String(state.proxy));hint(state.proxy?'外部网址通过本地代理加载':'直接加载：适合已允许嵌入的本地项目');if(state.url)load(state.url);});
$('open-external').addEventListener('click',()=>{if(state.url) window.open(state.url,'_blank','noopener,noreferrer');});
new ResizeObserver(layout).observe($('stage'));
theme();layout();

window.addEventListener('message',event=>{
  if(event.source!==$('preview').contentWindow)return;
  if(event.origin!==proxyMessageOrigin)return;
  if(event.data?.type==='folden:proxy-ready'){
    try { const url=normalize(event.data.url);if(url){state.url=url;$('url').value=url;hint('代理页面已响应 · 可切换设备姿态预览');} }catch{}
  }
  if(event.data?.type==='folden:proxy-error')hint('代理连接失败，请检查网址或网络',true);
});
