// DOM-to-canvas snapshot helpers adapted from the reference simulator.
const pt="http://www.w3.org/1999/xhtml",Fa=800,Lt=["vite-plugin-vue-devtools","vite-plugin-vue-inspector","#vue-inspector-container","#vue-devtools__anchor","#vue-devtools__panel","#vue-devtools__container","#__vue-devtools-container__",".vue-devtools__anchor",".vue-devtools__panel",".vue-devtools__container",".n-loading-bar-container",'[data-vite-dev-id="vue-devtools"]',"[data-html2canvas-ignore]"].join(","),La=`
  display position top right bottom left width height min-width min-height max-width max-height box-sizing
  margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left
  border-top-width border-right-width border-bottom-width border-left-width
  border-top-style border-right-style border-bottom-style border-left-style
  border-top-color border-right-color border-bottom-color border-left-color
  border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius
  background-color background-image background-size background-position background-repeat background-clip
  color font-family font-size font-weight font-style font-stretch font-kerning font-feature-settings
  font-variation-settings font-variant font-synthesis line-height letter-spacing
  text-align text-indent text-transform text-decoration text-overflow text-shadow
  white-space word-break overflow-wrap vertical-align direction writing-mode -webkit-locale -webkit-text-size-adjust
  opacity visibility overflow-x overflow-y box-shadow transform transform-origin z-index
  flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self align-content
  justify-content justify-items justify-self order row-gap column-gap
  grid-template-columns grid-template-rows grid-auto-flow grid-auto-columns grid-auto-rows
  grid-column-start grid-column-end grid-row-start grid-row-end
  list-style-type list-style-position object-fit object-position
  mask-image mask-size mask-repeat mask-position mask-mode clip-path filter
  appearance -webkit-appearance accent-color fill stroke stroke-width stroke-linecap stroke-linejoin
`.trim().split(/\s+/),ft=new Map;async function ea(e,u,s){let l;try{return await Promise.race([e,new Promise(o=>l=setTimeout(()=>o(s),u))])}finally{clearTimeout(l)}}async function Da(e){var s,l;const u=[];((s=e.fonts)==null?void 0:s.status)!=="loaded"&&((l=e.fonts)!=null&&l.ready)&&u.push(e.fonts.ready);for(const o of e.images)!o.complete&&typeof o.decode=="function"&&u.push(o.decode().catch(()=>{}));u.length&&await ea(Promise.allSettled(u),Fa,void 0)}async function Ua(e){const u=performance.now()+750;for(let s=0;s<3;s++){const l=e.getAnimations().filter(i=>{var g,b,S;const f=(g=i.effect)==null?void 0:g.target;return i.playState==="running"&&Number.isFinite((b=i.effect)==null?void 0:b.getComputedTiming().endTime)&&!((S=f==null?void 0:f.closest)!=null&&S.call(f,Lt))&&Array.from((f==null?void 0:f.classList)||[]).some(p=>/^fade-slide-(?:enter|leave)-/.test(p))});if(!l.length)return;const o=u-performance.now();if(o<=0)return;await ea(Promise.allSettled(l.map(i=>i.finished)),o,void 0),await new Promise(i=>e.defaultView.requestAnimationFrame(i))}}function ta(e,u){if(!e||e.startsWith("data:")||e.startsWith("#"))return Promise.resolve(e);const s=new URL(e,u).href;if(!ft.has(s)){const l=fetch(s).then(async o=>{if(!o.ok)throw new Error(`Unable to capture page asset: ${o.status} ${s}`);const i=await o.blob();return new Promise((f,g)=>{const b=new FileReader;b.onload=()=>f(b.result),b.onerror=g,b.readAsDataURL(i)})}).catch(o=>{throw ft.delete(s),o});ft.set(s,l)}return ft.get(s)}function aa(e,u,s,l){const o=e.ownerDocument.defaultView.getComputedStyle(e,l);u.setAttribute("style",La.map(i=>`${i}:${o.getPropertyValue(i)};`).join(""));for(const i of["background-image","mask-image"]){const f=o.getPropertyValue(i),g=Array.from(f.matchAll(/url\((['"]?)(.*?)\1\)/g));g.some(b=>!b[2].startsWith("data:")&&!b[2].startsWith("#"))&&s.push(Promise.all(g.map(async b=>[b[0],await ta(b[2],e.baseURI)])).then(b=>{let S=f;for(const[p,v]of b)S=S.replace(p,`url("${v}")`);u.style.setProperty(i,S)}))}return o}function Bt(e,u,s){var i;const l=e.ownerDocument.defaultView.getComputedStyle(e,u);if(l.content==="none"||l.content==="normal"||l.display==="none")return null;const o=document.createElementNS(pt,"span");return aa(e,o,s,u),o.textContent=((i=/^(['"])(.*)\1$/.exec(l.content))==null?void 0:i[2])||"",o}function _t(e,u){if(e.nodeType===Node.TEXT_NODE)return document.createTextNode(e.textContent);if(e.nodeType!==Node.ELEMENT_NODE||e.matches(`script,style,link,meta,${Lt}`))return null;let s=e.cloneNode(!1);const l=aa(e,s,u);if(l.display==="none")return null;for(const g of["overflow-x","overflow-y"])["auto","scroll"].includes(l.getPropertyValue(g))&&s.style.setProperty(g,"hidden");for(const g of Array.from(s.attributes))/^on/i.test(g.name)&&s.removeAttribute(g.name);const o=e.localName;if(o==="img")s.removeAttribute("srcset"),s.removeAttribute("loading"),u.push(ta(e.currentSrc||e.src,e.baseURI).then(g=>s.setAttribute("src",g)));else if(o==="canvas"){const g=document.createElementNS(pt,"img");g.setAttribute("style",s.getAttribute("style")),g.src=e.toDataURL(),s=g}else o==="input"?(s.setAttribute("value",e.value),s.toggleAttribute("checked",e.checked)):o==="option"&&s.toggleAttribute("selected",e.selected);const i=Bt(e,"::before",u);if(i&&s.appendChild(i),o==="textarea")s.textContent=e.value;else if(o!=="canvas")for(const g of e.childNodes){const b=_t(g,u);if(b){if((e.scrollLeft||e.scrollTop)&&b.nodeType===Node.ELEMENT_NODE){const S=b.style.transform;b.style.transform=`translate(${-e.scrollLeft}px, ${-e.scrollTop}px) ${S==="none"?"":S}`}s.appendChild(b)}}const f=Bt(e,"::after",u);return f&&s.appendChild(f),s}async function Na(e,{width:u,height:s,background:l,systemElement:o,scale:i}){const f=[],g=document.createElementNS(pt,"div");g.setAttribute("xmlns",pt),g.lang=e.documentElement.lang||"en",g.style.cssText=`position:relative;width:${u}px;height:${s}px;overflow:hidden;background:${l};`;const b=_t(e.body,f);if(b.style.width=`${u}px`,b.style.height=`${s}px`,b.style.margin="0",g.appendChild(b),o){const k=_t(o,f);if(k){k.style.visibility="visible";for(const B of k.querySelectorAll("*"))B.style.visibility="visible";g.appendChild(k)}}await Promise.all(f);const S=new XMLSerializer().serializeToString(g),p=`<svg xmlns="http://www.w3.org/2000/svg" width="${u}" height="${s}"><foreignObject width="100%" height="100%">${S}</foreignObject></svg>`,v=new Image;v.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p)}`,await v.decode();const M=document.createElement("canvas");M.width=Math.round(u*i),M.height=Math.round(s*i);const R=M.getContext("2d");if(!R)throw new Error("Unable to draw the folding screenshot.");return R.drawImage(v,0,0,M.width,M.height),M}
export async function captureElement(element, width, height, background) {
  const pending = [];
  const holder = document.createElementNS(pt, 'div');
  holder.setAttribute('xmlns', pt);
  holder.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background};`;
  const cloned = _t(element, pending);
  if (!cloned) throw Error('No visible content');
  cloned.style.width = `${width}px`;
  cloned.style.height = `${height}px`;
  if (element === element.ownerDocument.body) {
    cloned.style.transform = `translate(${-element.ownerDocument.defaultView.scrollX}px,${-element.ownerDocument.defaultView.scrollY}px)`;
  }
  holder.appendChild(cloned);
  await Promise.all(pending);
  const xml = new XMLSerializer().serializeToString(holder);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  // Test tainted canvases now so callers can safely fall back.
  canvas.getContext('2d').getImageData(0, 0, 1, 1);
  return canvas;
}
