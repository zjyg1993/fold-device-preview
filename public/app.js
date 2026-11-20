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
const state = { mode:'innerLandscape', url:'', safe:false, theme:'light', proxy:false, proxied:false, proxyReported:false, timer:null };
const stage = $('stage');
const preview = $('preview');
const immersiveToggle = $('immersive-toggle');
const foldShortcuts = new Map([['ArrowLeft', 'outerPortrait'], ['ArrowRight', 'innerLandscape']]);
try { const saved = JSON.parse(localStorage.getItem('folden-preferences') || '{}'); if (modes[saved.mode]) state.mode = saved.mode; if(saved.theme === 'dark') state.theme = 'dark'; } catch {}
function save() { try { localStorage.setItem('folden-preferences', JSON.stringify({mode:state.mode, theme:state.theme})); } catch {} }
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
  // Layout zoom keeps native iframe scrollbar hit testing aligned with its
  // rendered position; transform scaling can leave thumb dragging stuck.
  $('device').style.cssText=`width:${width}px;height:${height}px;zoom:${scale}`;
  $('device').className=`device ${m.inner?'inner':'outer'} ${m.portrait?'portrait':'landscape'}`;
  $('frame').src=`/assets/frame-${m.inner?'inner':'outer'}.png`;
  $('frame').style.cssText=`width:${base.w}px;height:${base.h}px;left:${(width-base.w)/2}px;top:${(height-base.h)/2}px;transform:rotate(${rotate?90:0}deg)`;
  const x=rotate ? base.h-base.y-(m.inner?624:624) : base.x;
  const y=rotate ? base.x : base.y;
  $('screen').style.cssText=`left:${x}px;top:${y}px;width:${m.w}px;height:${m.h}px;border-radius:${m.inner?'40px':m.portrait?'4px 55px 55px 4px':'4px 4px 55px 55px'}`;
  $('mode-name').textContent=m.name; $('dimensions').textContent=`${m.w} × ${m.h}`; $('scale').textContent=`${Math.round(scale*100)}%`;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  $('reserved').hidden=!state.safe; $('safe-toggle').setAttribute('aria-pressed',String(state.safe));
  $('camera-label').textContent=m.inner?'内屏摄像头':'摄像头';
}
function theme() {
  const dark=state.theme==='dark';
  document.documentElement.dataset.theme=state.theme;
  $('theme-label').textContent=dark?'深色':'浅色';
  $('theme').querySelector('[data-icon]').innerHTML=icon(dark?'moon':'sun');
  $('theme').title=dark?'切换为浅色模式':'切换为深色模式';
}
function updateClock() {
  const now = new Date();
  $('device-time').textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  $('device-time').dateTime = now.toISOString();
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
  state.proxied=false;
  state.proxyReported=false;
  clearTimeout(state.timer); state.url=''; $('url').value=''; $('clear').hidden=true; $('preview').hidden=true; $('preview').removeAttribute('src'); $('empty').hidden=false; $('embed-note').hidden=true; hint('');
}
function previewURL(target) {
  if(!state.proxy || target.origin===location.origin) return target.href;
  const token=btoa(target.origin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${proxyOrigin}/__proxy/${token}${target.pathname}${target.search}${target.hash}`;
}
function load(url) {
  const target = new URL(url);
  if (!target.searchParams.has('deviceModel')) {
    // Append without re-encoding the target's existing query string.
    target.search += `${target.search ? '&' : '?'}deviceModel=iPhone%20Duo`;
  }
  clearTimeout(state.timer);state.url=target.href; $('url').value=target.href; $('clear').hidden=false; $('empty').hidden=true; $('preview').hidden=false; $('embed-note').hidden=false;
  const source=previewURL(target);
  state.proxied=source!==target.href;
  state.proxyReported=false;
  configurePreview(preview, state.proxied);
  $('embed-note').textContent=state.proxied?'外部网址通过代理预览。登录与验证可直接访问原网址。':'当前直接嵌入网页；可按需手动开启代理。';
  hint(state.proxied?'正在通过本地代理加载…':'正在直接加载网页…'); preview.src=source;
  state.timer=setTimeout(()=>hint('加载时间较长，请检查网址和网络连接'),12000);
}
$('url-form').addEventListener('submit', e=>{e.preventDefault();if(motion.busy)return;try { const url=normalize($('url').value); if(url) load(url); else {clearPreview();$('url').focus();} } catch(err) {hint(err.message || '请输入有效网址',true);$('url').focus();} });
$('url').addEventListener('input',()=>{$('clear').hidden=!$('url').value;});
$('clear').addEventListener('click',()=>{clearPreview();$('url').focus();});
preview.addEventListener('load',()=>{
  preview.contentDocument?.addEventListener('keydown', handleShortcut);
  if(!state.url || state.proxyReported)return;
  clearTimeout(state.timer);
  hint(state.proxied?'已请求代理预览 · 结果以预览区为准':'已请求网页 · 可切换设备姿态预览');
});
preview.addEventListener('error',()=>{
  if(!state.url || state.proxyReported)return;
  clearTimeout(state.timer);
  hint('网页加载失败，请检查网址和网络连接',true);
});
const motion = createMotion({ state, modes, layout, save });

function setImmersive(enabled) {
  document.body.classList.toggle('immersive', enabled);
  immersiveToggle.setAttribute('aria-checked', String(enabled));
  (enabled ? stage : immersiveToggle).focus({preventScroll:true});
}

function runShortcut(key) {
  if (key === 'Escape' && document.body.classList.contains('immersive')) {
    setImmersive(false);
    return true;
  }
  const next = foldShortcuts.get(key);
  if (!next) return false;
  motion.change(next);
  return true;
}

function handleShortcut(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== 'Escape' && !foldShortcuts.has(event.key)) return;
  if (event.composedPath().some(element => element.isContentEditable || element.matches?.('input, textarea, select, [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]'))) return;
  if (runShortcut(event.key)) event.preventDefault();
}

immersiveToggle.addEventListener('click', () => setImmersive(true));
document.body.addEventListener('click', event => {
  if ((event.target === stage || event.target === document.body) && document.body.classList.contains('immersive')) setImmersive(false);
});
document.addEventListener('keydown', handleShortcut);
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>motion.change(b.dataset.mode)));
$('theme').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';theme();motion.feedback($('theme').querySelector('svg'),'theme');save();});
$('refresh').addEventListener('click',()=>{motion.feedback($('refresh').querySelector('svg'), 'spin'); if(state.url) load(state.url); else hint('请先输入要预览的网址');});
$('safe-toggle').addEventListener('click',()=>{state.safe=!state.safe;layout();if(state.safe)motion.feedback($('reserved'),'reveal');save();});
$('proxy-toggle').addEventListener('click',()=>{state.proxy=!state.proxy;$('proxy-toggle').setAttribute('aria-pressed',String(state.proxy));hint(state.proxy?'外部网址通过本地代理加载':'直接加载：适合已允许嵌入的本地项目');if(state.url)load(state.url);});
new ResizeObserver(() => { if (!motion.busy) layout(); }).observe(stage);
theme();layout();updateClock();
setInterval(updateClock,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});

window.addEventListener('message',event=>{
  if(!state.url || !state.proxied)return;
  if(event.source!==preview.contentWindow)return;
  if(event.origin!==proxyMessageOrigin)return;
  const type=event.data?.type;
  if(type==='folden:preview-shortcut' && document.activeElement===preview)runShortcut(event.data.key);
  if(!['folden:proxy-ready','folden:proxy-error'].includes(type))return;
  let url;
  try { if(typeof event.data.url==='string')url=normalize(event.data.url); }catch{}
  if(type==='folden:proxy-ready' && !url)return;
  if(url){
    state.url=url;
    $('url').value=url;
  }
  clearTimeout(state.timer);
  state.proxyReported=true;
  if(type==='folden:proxy-ready'){
    hint('代理页面已响应 · 可切换设备姿态预览');
  }else{
    const {status,upstream}=event.data;
    const validStatus=Number.isInteger(status) && status>=400 && status<=599;
    hint(upstream===true && validStatus ? `目标网站返回 HTTP ${status}` : `代理连接失败${validStatus ? ` · HTTP ${status}` : ''}，请检查网址或网络`,true);
  }
});
