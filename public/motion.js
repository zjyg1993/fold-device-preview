import { captureElement } from './vendor/snapshot.js';
import { proxyMessageOrigin } from './preview-origin.js';

const $ = id => document.getElementById(id);
const INNER = {width:880,height:624};
const OUTER = {width:432,height:624};
const innerFrame = {width:954.576271,height:699.237378,screenLeft:37.288136,screenTop:37.618689};
const outerFrame = {width:487.218045,height:673.735793,screenLeft:27.609023,screenTop:24.867897};
const outerLeft=-(8/1050*outerFrame.width+3);
const outerTop=(innerFrame.height-outerFrame.height)/2;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (1-Math.cos(t*Math.PI))/2;
const angle = mode => mode.inner ? (mode.portrait?90:0) : (mode.portrait?0:90);
function tween(duration, update) {
  return new Promise(resolve=>{
    const start=performance.now();
    const tick=now=>{const t=Math.min(1,(now-start)/duration);update(ease(t),t);if(t<1)requestAnimationFrame(tick);else resolve();};
    requestAnimationFrame(tick);
  });
}
function within(promise, ms, fallback) {
  let timer;
  return Promise.race([promise,new Promise(resolve=>timer=setTimeout(()=>resolve(fallback()),ms))]).finally(()=>clearTimeout(timer));
}
function canvas(w,h) {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function rotateSnapshot(image,mode) {
  if(!angle(mode))return image;
  const c=canvas(image.height,image.width),ctx=c.getContext('2d');
  ctx.translate(0,c.height);ctx.rotate(-Math.PI/2);ctx.drawImage(image,0,0);return c;
}
export function createMotion({state,modes,layout,save}) {
  const layer=$('motion-layer');
  let busy=false, rendererPromise, renderer, captureID=0;
  const requests=new Map();
  window.addEventListener('message',event=>{
    if(event.source!==$('preview').contentWindow||event.origin!==proxyMessageOrigin||event.data?.type!=='folden:captured')return;
    const resolve=requests.get(event.data.id);requests.delete(event.data.id);
    if(resolve)resolve(event.data.bitmap||null);else event.data.bitmap?.close();
  });
  function fallback() {
    const m=modes[state.mode],c=canvas(m.w,m.h),ctx=c.getContext('2d');
    ctx.fillStyle=state.theme==='dark'?'#202126':'#fff';ctx.fillRect(0,0,m.w,m.h);
    ctx.textAlign='center';ctx.fillStyle=state.theme==='dark'?'#b0b6c4':'#8590a3';
    ctx.font='17px system-ui';ctx.fillText(state.url?new URL(state.url).hostname:'在下方输入网址，开始设备预览',m.w/2,m.h/2);
    return c;
  }
  async function snapshot() {
    const m=modes[state.mode];
    try {
      if(!state.url)return await within(captureElement($('empty'),m.w,m.h,getComputedStyle($('screen')).backgroundColor),700,fallback);
      const preview=$('preview');
      if(preview.contentDocument?.body)return await within(captureElement(preview.contentDocument.body,m.w,m.h,'#fff'),700,fallback);
      if(state.proxy) {
        const id=++captureID;
        const image=await new Promise(resolve=>{
          const timer=setTimeout(()=>{requests.delete(id);resolve(null)},700);
          requests.set(id,value=>{clearTimeout(timer);resolve(value)});
          preview.contentWindow.postMessage({type:'folden:capture',id},proxyMessageOrigin === 'null' ? '*' : proxyMessageOrigin);
        });
        if(image){const c=canvas(m.w,m.h);c.getContext('2d').drawImage(image,0,0);image.close();return c;}
      }
    } catch {}
    return fallback();
  }
  function getRenderer() {
    if(!rendererPromise)rendererPromise=import('./vendor/optics.js').then(async ({createOptics})=>{
      const rotor=document.createElement('div');rotor.className='optical-rotor';rotor.hidden=true;layer.appendChild(rotor);
      const optics=await createOptics(rotor,{device:innerFrame,innerFrame,outerFrame,innerScreen:INNER,outerScreen:OUTER,outerLeft,outerTop,innerFrameUrl:'/assets/frame-inner.png',outerFrameUrl:'/assets/frame-outer.png'});
      return renderer={optics,rotor};
    }).catch(error=>{rendererPromise=null;layer.replaceChildren();throw error});
    return rendererPromise;
  }
  function busyState(value, cover = true) {
    busy=value;
    $('stage').setAttribute('aria-busy',String(value));
    document.querySelectorAll('[data-mode],#theme,#refresh,#safe-toggle,#proxy-toggle,#clear,.submit').forEach(button=>button.disabled=value);
    $('device-wrap').classList.toggle('motion-covered',value && cover);
  }
  function fit(mode) {
    const box=$('stage').getBoundingClientRect();
    const w=mode.inner?innerFrame.width:outerFrame.width;
    const h=mode.inner?innerFrame.height:outerFrame.height;
    const a=angle(mode)%180;
    return Math.min(1,box.width/(a?h:w),box.height/(a?w:h));
  }
  function rotorTransform(rotor,degree,scale,opening) {
    const offset=(-outerFrame.width/2-outerLeft)*(1-opening/180);
    rotor.style.transform=`translate(-50%,-50%) rotate(${degree}deg) scale(${scale}) translateX(${offset}px)`;
  }
  async function fold(from,to,start) {
    const {optics,rotor}=await getRenderer();rotor.hidden=false;
    const first=from.inner?180:0,last=to.inner?180:0;
    optics.setSnapshot(from.inner?'inner':'outer',rotateSnapshot(start,from));
    optics.render(first);rotorTransform(rotor,angle(from),fit(from),first);
    state.mode=Object.keys(modes).find(key=>modes[key]===to);layout();
    const target=await snapshot();optics.setSnapshot(to.inner?'inner':'outer',rotateSnapshot(target,to));
    await tween(900,(t,raw)=>{
      const opening=first+(last-first)*t;
      optics.render(opening);
      rotorTransform(rotor,angle(from)+(angle(to)-angle(from))*t,(fit(from)+(fit(to)-fit(from))*t)*(1-(angle(from)!==angle(to)?.08:0)*Math.sin(raw*Math.PI)),opening);
    });
  }
  async function rotate(from,to) {
    // Keep the existing iframe live. A single animation clock drives the frame,
    // screen aperture, viewport reflow, and the content's counter-rotation.
    // No capture is needed, including for cross-origin pages.
    const device=$('device'), screen=$('screen'), frame=$('frame');
    const content=[$('preview'),$('empty'),$('reserved')];
    const originalStyles=content.map(element=>element.style.cssText);
    const physical=from.inner?INNER:OUTER;
    const shell=from.inner?innerFrame:outerFrame;
    const startAngle=angle(from),endAngle=angle(to);
    state.mode=Object.keys(modes).find(key=>modes[key]===to);layout();
    const width=parseFloat(device.style.width),height=parseFloat(device.style.height);
    function render(t,raw) {
      const degree=startAngle+(endAngle-startAngle)*t;
      const radians=degree*Math.PI/180;
      const cosine=Math.abs(Math.cos(radians)),sine=Math.abs(Math.sin(radians));
      // The upright viewport covers the entire rotating aperture, including its diagonal corners.
      const viewportWidth=physical.width*cosine+physical.height*sine;
      const viewportHeight=physical.width*sine+physical.height*cosine;
      const stage=$('stage').getBoundingClientRect();
      const scale=Math.min(
        (fit(from)+(fit(to)-fit(from))*t)*(1-.08*Math.sin(raw*Math.PI)),
        stage.width/(shell.width*cosine+shell.height*sine),
        stage.height/(shell.width*sine+shell.height*cosine)
      );
      const wrap=$('device-wrap');
      // Both physical screens are centered inside their original frame artwork.
      // Center independently of scale so changing the fitted size does not move the device.
      device.style.left=`${(parseFloat(wrap.style.width)-width*scale)/2}px`;
      device.style.top=`${(parseFloat(wrap.style.height)-height*scale)/2}px`;
      device.style.transform=`scale(${scale})`;
      frame.style.cssText=`width:${shell.width}px;height:${shell.height}px;left:${(width-shell.width)/2}px;top:${(height-shell.height)/2}px;transform:rotate(${degree}deg)`;
      screen.style.cssText=`left:${(width-physical.width)/2}px;top:${(height-physical.height)/2}px;width:${physical.width}px;height:${physical.height}px;border-radius:${from.inner?'40px':'4px 55px 55px 4px'};transform:rotate(${degree}deg);transform-origin:center`;
      for(const element of content) {
        element.style.cssText=`position:absolute;left:${(physical.width-viewportWidth)/2}px;top:${(physical.height-viewportHeight)/2}px;width:${viewportWidth}px;height:${viewportHeight}px;transform:rotate(${-degree}deg);transform-origin:center`;
      }
    }
    try {
      // Prepare the starting pose before the next paint: no target-layout flash.
      render(0,0);
      await tween(520,render);
    } finally {
      content.forEach((element,index)=>element.style.cssText=originalStyles[index]);
      layout();
    }
  }
  async function change(next) {
    if(busy||!modes[next]||next===state.mode)return;
    if(reduced()){state.mode=next;layout();save();return;}
    const from=modes[state.mode],to=modes[next];
    // Mark busy before taking a snapshot so rapid clicks cannot start overlapping transitions.
    busy=true;$('stage').setAttribute('aria-busy','true');
    document.querySelectorAll('[data-mode],#theme,#refresh,#safe-toggle,#proxy-toggle,#clear,.submit').forEach(button=>button.disabled=true);
    try {
      if(from.inner===to.inner) {
        busyState(true,false);
        await rotate(from,to);
      } else {
        const start=await snapshot();
        await getRenderer();
        layer.hidden=false;layer.style.opacity='1';busyState(true);
        await fold(from,to,start);
      }
    } catch(error) {
      console.warn('Device optical transition unavailable; using a live view transition.',error);
      state.mode=next;layout();
      $('device-wrap').classList.remove('motion-covered');
      feedback($('device-wrap'),'reveal');
    } finally {
      layer.hidden=true;if(renderer)renderer.rotor.hidden=true;
      state.mode=next;busyState(false);layout();save();
    }
  }
  function feedback(element,type) {
    if(reduced()||!element)return;
    const keyframes=type==='spin'?[{transform:'rotate(0)'},{transform:'rotate(360deg)'}]:type==='theme'?[{transform:'rotate(-70deg) scale(.65)',opacity:.4},{transform:'rotate(0) scale(1)',opacity:1}]:[{opacity:0},{opacity:1}];
    element.animate(keyframes,{duration:type==='spin'?520:250,easing:'ease-in-out'});
  }
  // Warm the renderer while idle; failures leave the static, usable device intact.
  setTimeout(()=>{if(!reduced())getRenderer().catch(()=>{})},250);
  return {change,feedback,get busy(){return busy}};
}
