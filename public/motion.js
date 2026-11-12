const $ = id => document.getElementById(id);
const INNER = {width:880,height:624};
const OUTER = {width:432,height:624};
const innerFrame = {width:954.576271,height:699.237378,screenLeft:37.288136,screenTop:37.618689};
const outerFrame = {width:487.218045,height:673.735793,screenLeft:27.609023,screenTop:24.867897};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => (1-Math.cos(t*Math.PI))/2;
const angle = mode => mode.inner ? (mode.portrait?90:0) : (mode.portrait?0:90);
function tween(duration, update) {
  return new Promise((resolve,reject)=>{
    let previous,elapsed=0;
    const tick=now=>{
      try {
        // Start on the first painted frame. Expensive target-page reflows must
        // not consume the entire transition before intermediate poses appear.
        if(previous!==undefined)elapsed+=Math.max(0,Math.min(50,now-previous));
        previous=now;
        const t=Math.min(1,elapsed/duration);
        update(ease(t),t);
        if(t<1)requestAnimationFrame(tick);else resolve();
      } catch(error){reject(error);}
    };
    requestAnimationFrame(tick);
  });
}
export function createMotion({state,modes,layout,save}) {
  let busy=false,rendererPromise;
  const layer=$('motion-layer');
  const outerLeft=-(8/1050*outerFrame.width+3);
  const outerTop=(innerFrame.height-outerFrame.height)/2;
  function getRenderer(){
    if(!rendererPromise)rendererPromise=import('./vendor/optics.js').then(async({createOptics})=>{
      const rotor=document.createElement('div');rotor.className='optical-rotor';rotor.hidden=true;layer.appendChild(rotor);
      try{
        const optics=await createOptics(rotor,{device:innerFrame,innerFrame,outerFrame,innerScreen:INNER,outerScreen:OUTER,outerLeft,outerTop,innerFrameUrl:'/assets/frame-inner.png',outerFrameUrl:'/assets/frame-outer.png'});
        return {rotor,optics};
      }catch(error){rotor.remove();throw error;}
    }).catch(error=>{rendererPromise=null;throw error;});
    return rendererPromise;
  }
  function fit(mode){
    const area=$('stage').getBoundingClientRect(),shell=mode.inner?innerFrame:outerFrame;
    const turned=angle(mode)%180!==0;
    return Math.min(1,area.width/(turned?shell.height:shell.width),area.height/(turned?shell.width:shell.height));
  }
  async function hingeFold(from,to){
    // Only the frame is drawn by WebGL. The original iframe remains live below
    // its projected aperture, including when cross-origin DOM access is denied.
    const {rotor,optics}=await getRenderer();
    const device=$('device'),wrap=$('device-wrap'),screen=$('screen'),frame=$('frame');
    const content=[$('preview'),$('empty'),$('device-status'),$('reserved')],styles=content.map(e=>e.style.cssText);
    const shade=document.createElement('div');shade.setAttribute('aria-hidden','true');screen.appendChild(shade);
    const first=from.inner?180:0,last=to.inner?180:0;
    try{
      state.mode=Object.keys(modes).find(key=>modes[key]===to);layout();
      layer.hidden=false;rotor.hidden=false;
      function render(t,raw){
        const opening=lerp(first,last,t),degree=lerp(angle(from),angle(to),t);
        optics.render(opening);
        const surface=optics.getLiveSurface();
        const scale=lerp(fit(from),fit(to),t)*(1-(angle(from)!==angle(to)?.08:0)*Math.sin(raw*Math.PI));
        const offset=(-outerFrame.width/2-outerLeft)*(1-opening/180);
        const transform=`translate(-50%,-50%) rotate(${degree}deg) scale(${scale}) translateX(${offset}px)`;
        rotor.style.transform=transform;
        wrap.style.cssText=`position:absolute;left:50%;top:50%;width:${innerFrame.width}px;height:${innerFrame.height}px;transform:${transform}`;
        device.style.cssText=`width:${innerFrame.width}px;height:${innerFrame.height}px;zoom:1`;
        frame.style.opacity='0';
        screen.style.cssText=`left:${surface.left}px;top:${surface.top}px;width:${surface.width}px;height:${surface.height}px;border-radius:0;clip-path:${surface.clipPath}`;
        const radians=degree*Math.PI/180,cosine=Math.abs(Math.cos(radians)),sine=Math.abs(Math.sin(radians));
        const w=surface.width*cosine+surface.height*sine,h=surface.width*sine+surface.height*cosine;
        for(const element of content)element.style.cssText=`position:absolute;left:${(surface.width-w)/2}px;top:${(surface.height-h)/2}px;width:${w}px;height:${h}px;transform:rotate(${-degree}deg);transform-origin:center`;
        $('preview').style.pointerEvents='none';
        shade.style.cssText=`position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,${.28*Math.sin(opening*Math.PI/180)}),transparent 65%)`;
      }
      render(0,0);
      await tween(900,render);
    }finally{
      shade.remove();rotor.hidden=true;layer.hidden=true;
      content.forEach((element,index)=>element.style.cssText=styles[index]);layout();
    }
  }
  const lerp=(a,b,t)=>a+(b-a)*t;
  function busyState(value) {
    busy=value;
    $('stage').setAttribute('aria-busy',String(value));
    document.querySelectorAll('[data-mode],#theme,#refresh,#safe-toggle,#proxy-toggle,#clear,.submit').forEach(button=>button.disabled=value);
  }
  async function transition(from,to) {
    const device=$('device'),screen=$('screen'),frame=$('frame'),wrap=$('device-wrap');
    const content=[$('preview'),$('empty'),$('device-status'),$('reserved')];
    const originalStyles=content.map(element=>element.style.cssText);
    const startClass=device.className;
    const folding=from.inner!==to.inner;
    const startScreen=from.inner?INNER:OUTER,endScreen=to.inner?INNER:OUTER;
    const startShell=from.inner?innerFrame:outerFrame,endShell=to.inner?innerFrame:outerFrame;
    const startAngle=angle(from),endAngle=angle(to);
    // Only duplicate the frame artwork. Never detach, clone or hide the iframe.
    const previousFrame=folding?frame.cloneNode(false):null;
    if(previousFrame){previousFrame.removeAttribute('id');previousFrame.setAttribute('aria-hidden','true');device.appendChild(previousFrame);}
    const preview=$('preview');
    preview.style.pointerEvents='none';
    try {
      state.mode=Object.keys(modes).find(key=>modes[key]===to);layout();
      const endClass=device.className;
      function render(t,raw) {
        const degree=lerp(startAngle,endAngle,t),radians=degree*Math.PI/180;
        const cosine=Math.abs(Math.cos(radians)),sine=Math.abs(Math.sin(radians));
        const shellW=lerp(startShell.width,endShell.width,t),shellH=lerp(startShell.height,endShell.height,t);
        const physicalW=lerp(startScreen.width,endScreen.width,t),physicalH=lerp(startScreen.height,endScreen.height,t);
        const width=shellW*cosine+shellH*sine,height=shellW*sine+shellH*cosine;
        const viewportW=physicalW*cosine+physicalH*sine,viewportH=physicalW*sine+physicalH*cosine;
        const stage=$('stage').getBoundingClientRect();
        const depth=Math.sin(raw*Math.PI);
        const scale=Math.max(.05,Math.min(1,stage.width/width,stage.height/height))*(1-(folding?.12:.08)*depth);
        wrap.style.cssText=`width:${width*scale}px;height:${height*scale}px`;
        const tilt=folding?(to.inner?-1:1)*54*depth:0;
        device.style.cssText=`width:${width}px;height:${height}px;zoom:${scale};transform-origin:center;transform:perspective(1400px) rotateY(${tilt}deg)`;
        device.className=t<.5?startClass:endClass;
        const artwork=`width:${shellW}px;height:${shellH}px;left:${(width-shellW)/2}px;top:${(height-shellH)/2}px;transform:rotate(${degree}deg)`;
        frame.style.cssText=artwork+`;opacity:${folding?t:1}`;
        if(previousFrame)previousFrame.style.cssText=artwork+`;opacity:${1-t}`;
        const startCorners=from.inner?[40,40,40,40]:[4,55,55,4];
        const endCorners=to.inner?[40,40,40,40]:[4,55,55,4];
        const radius=startCorners.map((value,index)=>`${lerp(value,endCorners[index],t)}px`).join(' ');
        screen.style.cssText=`left:${(width-physicalW)/2}px;top:${(height-physicalH)/2}px;width:${physicalW}px;height:${physicalH}px;border-radius:${radius};transform:rotate(${degree}deg);transform-origin:center`;
        for(const element of content){
          element.style.cssText=`position:absolute;left:${(physicalW-viewportW)/2}px;top:${(physicalH-viewportH)/2}px;width:${viewportW}px;height:${viewportH}px;transform:rotate(${-degree}deg);transform-origin:center`;
        }
        preview.style.pointerEvents='none';
      }
      render(0,0);
      await tween(folding?900:520,render);
    } finally {
      previousFrame?.remove();
      content.forEach((element,index)=>element.style.cssText=originalStyles[index]);
      layout();
    }
  }
  async function change(next) {
    if(busy||!modes[next]||next===state.mode)return;
    if(reduced()){state.mode=next;layout();save();return;}
    const from=modes[state.mode],to=modes[next];
    // Block overlapping transitions while keeping the real page mounted.
    busyState(true);
    try {
      if(from.inner!==to.inner){
        try{await hingeFold(from,to);}
        catch(error){console.warn('Hinged renderer unavailable; using live viewport animation.',error);state.mode=Object.keys(modes).find(key=>modes[key]===from);layout();await transition(from,to);}
      }else await transition(from,to);
    } catch(error) {
      console.warn('Device transition unavailable; showing the live target viewport.',error);
      state.mode=next;layout();
      feedback($('device-wrap'),'reveal');
    } finally {
      state.mode=next;busyState(false);layout();save();
    }
  }
  function feedback(element,type) {
    if(reduced()||!element)return;
    const keyframes=type==='spin'?[{transform:'rotate(0)'},{transform:'rotate(360deg)'}]:type==='theme'?[{transform:'rotate(-70deg) scale(.65)',opacity:.4},{transform:'rotate(0) scale(1)',opacity:1}]:[{opacity:0},{opacity:1}];
    element.animate(keyframes,{duration:type==='spin'?520:250,easing:'ease-in-out'});
  }
  setTimeout(()=>{if(!reduced())getRenderer().catch(()=>{});},250);
  return {change,feedback,get busy(){return busy}};
}
