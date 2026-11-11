function proxyRuntime(config) {
  'use strict';
  const prefix='/__proxy/';
  const token=origin=>btoa(origin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  // Hash routers can copy the proxy pathname into their client-side route.
  // Strip only this document's transport prefix, preserving the real fragment.
  const hashPrefix=new RegExp(`^#(!?)/__proxy/${token(new URL(config.target).origin)}(?=/|$)`);
  const cleanHash=value=>value.replace(hashPrefix,'#$1');
  const unproxy = value=>{
    const url=new URL(value,location.href);const match=url.pathname.match(/^\/__proxy\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if(!match)return config.base;
    try{return atob(match[1].replace(/-/g,'+').replace(/_/g,'/'))+(match[2]||'/')+url.search+cleanHash(url.hash)}catch{return config.base}
  };
  const route = value=>{
    if(typeof value!=='string'||!value||/^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(value))return value;
    try {
      if(value.startsWith(prefix))return value;
      const url=new URL(value,unproxy(location.href));
      if(!['http:','https:'].includes(url.protocol))return value;
      if(url.origin===location.origin && url.pathname.startsWith(prefix))return url.href;
      return location.origin+prefix+token(url.origin)+url.pathname+url.search+url.hash;
    }catch{return value}
  };
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=function(input,init){
    if(input instanceof Request)return fetchOriginal(new Request(route(input.url),input),init);
    return fetchOriginal(route(String(input)),init);
  };
  const xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...rest){return xhrOpen.call(this,method,route(String(url)),...rest)};
  const setAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){
    if(/^(src|href|action|poster|formaction)$/i.test(name))value=route(String(value));
    return setAttribute.call(this,name,value);
  };
  for(const [Ctor,props] of [[HTMLImageElement,['src']],[HTMLScriptElement,['src']],[HTMLLinkElement,['href']],[HTMLAnchorElement,['href']],[HTMLIFrameElement,['src']],[HTMLFormElement,['action']],[HTMLSourceElement,['src']]])for(const prop of props){
    const descriptor=Object.getOwnPropertyDescriptor(Ctor.prototype,prop);
    if(descriptor?.set&&descriptor.configurable)Object.defineProperty(Ctor.prototype,prop,{...descriptor,set(value){descriptor.set.call(this,route(String(value)))}});
  }
  const submitOriginal=HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit=function(){setAttribute.call(this,'action',route(this.getAttribute('action')||unproxy(location.href)));return submitOriginal.call(this)};
  const replaceStateOriginal=history.replaceState;
  function repairHash() {
    const hash=cleanHash(location.hash);
    if(hash!==location.hash){const url=new URL(location.href);url.hash=hash;replaceStateOriginal.call(history,history.state,'',url.href);}
  }
  for(const method of ['pushState','replaceState']){
    const original=history[method];history[method]=function(state,title,url){
      let next=url;
      if(url!=null){next=new URL(route(String(url)),location.href);next.hash=cleanHash(next.hash);next=next.href;}
      const result=original.call(this,state,title,next);
      queueMicrotask(()=>parent.postMessage({type:'folden:proxy-ready',url:unproxy(location.href)},config.shellOrigin));return result;
    };
  }
  // Baidu's current search box navigates via location.href rather than a native form.
  // Handle this adapter before its inline handlers so the result remains inside the proxy.
  if(/(^|\.)baidu\.com$/.test(new URL(config.target).hostname)) {
    const search=event=>{
      const input=document.querySelector('#chat-textarea, #kw');
      const keyword=input?.value?.trim();if(!keyword)return false;
      event.preventDefault();event.stopImmediatePropagation();
      const destination=new URL('/s',config.target);
      destination.searchParams.set('wd',keyword);destination.searchParams.set('ie','utf-8');
      location.href=route(destination.href);return true;
    };
    document.addEventListener('click',event=>{if(event.target.closest?.('#chat-submit-button, #su'))search(event)},true);
    document.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.target.matches?.('#chat-textarea, #kw'))search(event)},true);
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    const value=link.getAttribute('href');if(value&&!value.startsWith('#'))setAttribute.call(link,'href',route(value));
    if(link.target==='_top'||link.target==='_parent')link.target='_self';
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target;if(form instanceof HTMLFormElement){setAttribute.call(form,'action',route(form.getAttribute('action')||unproxy(location.href)));if(form.target==='_top'||form.target==='_parent')form.target='_self'}
  },true);
  // Snapshot requests are handled within this isolated origin, never by reading an external iframe from the UI.
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.origin!==config.shellOrigin||event.data?.type!=='folden:capture')return;
    const id=event.data.id;
    try {
      const {captureElement}=await import(location.origin+'/vendor/snapshot.js');
      const canvas=await captureElement(document.body,innerWidth,innerHeight,getComputedStyle(document.body).backgroundColor||'#fff');
      const bitmap=await createImageBitmap(canvas);
      parent.postMessage({type:'folden:captured',id,bitmap},config.shellOrigin,[bitmap]);
    }catch{parent.postMessage({type:'folden:captured',id,error:true},config.shellOrigin)}
  });
  const report=()=>{repairHash();parent.postMessage({type:'folden:proxy-ready',url:unproxy(location.href)},config.shellOrigin);};
  repairHash();
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',report,{once:true});else report();
  addEventListener('popstate',report);
  addEventListener('hashchange',report);
}
