// Device optical renderer adapted from https://duo.noctrue.com/simulator (local preview).
import{W as ka,S as At,P as xa,M as ct,a as Sa,V as qt,T as $a,b as $t,D as Ra,c as tt,g as ht,G as Rt,d as Pa,e as Pt,f as It,h as Ta,C as Ma,L as Ea,B as Ca,F as zt}from"./shaders.js";
const We=.249,Wt=.4,Mt=.011,He=40,Ht=96;function jt({x:e,y:u,width:s,height:l,z:o,back:i=!1,yCuts:f=[]}){const g=[];for(let R=0;R<=96;R++)g.push(e+s*R/96);if(!i)for(let R=0;R<=48;R++){const k=-.35+.7*R/48;k>e&&k<e+s&&g.push(k)}g.sort((R,k)=>R-k);const b=[],S=[],p=[],v=[u,...f.filter(R=>R>u&&R<u+l),u+l].sort((R,k)=>R-k);for(const R of v)for(const k of g)b.push(k,R,o),S.push((k-e)/s,(R-u)/l);for(let R=0;R<v.length-1;R++)for(let k=0;k<g.length-1;k++){const B=R*g.length+k,I=B+1,se=B+g.length,Z=se+1;p.push(...i?[B,se,I,I,se,Z]:[B,I,se,I,Z,se])}const M=new Ca;return M.setAttribute("position",new zt(b,3)),M.setAttribute("uv",new zt(S,2)),M.setIndex(p),M}function Va(e,u=!1){const l=document.createElement("canvas");l.width=e.width+256*2,l.height=e.height+256*2;const o=l.getContext("2d");if(u){const f=e.width,g=e.height;o.drawImage(e,0,0,f,1,256,0,f,256),o.drawImage(e,0,g-1,f,1,256,256+g,f,256),o.drawImage(e,0,0,1,g,0,256,256,g),o.drawImage(e,f-1,0,1,g,256+f,256,256,g);for(const[b,S]of[[0,0],[f-1,256+f]])for(const[p,v]of[[0,0],[g-1,256+g]])o.drawImage(e,b,p,1,1,S,v,256,256)}o.drawImage(e,256,256);const i=new Ma(l);return i.colorSpace=At,i.premultiplyAlpha=!0,i.minFilter=Ea,{texture:i,resolution:new tt(e.width,e.height),rect:new It(256/l.width,256/l.height,e.width/l.width,e.height/l.height),maxMip:Math.floor(Math.log2(Math.max(l.width,l.height)))}}async function Ba(e,u){const{device:s,innerFrame:l,outerFrame:o,innerScreen:i,outerScreen:f,outerLeft:g,outerTop:b,innerFrameUrl:S,outerFrameUrl:p}=u,v=i.width/12.4,M=s.width+Ht*2,R=s.height+Ht*2,k=new ka({alpha:!0,antialias:!0,powerPreference:"high-performance"});k.outputColorSpace=At,k.setPixelRatio(Math.min(devicePixelRatio||1,1.75)),k.setSize(M,R),k.setClearColor(0,0),Object.assign(k.domElement.style,{position:"absolute",left:"-96px",top:"-96px",pointerEvents:"none"}),k.domElement.setAttribute("aria-hidden","true"),e.appendChild(k.domElement);const B=new xa(ct.radToDeg(2*Math.atan(R/v/(2*He))),M/R,.5,100);B.position.set(0,0,He+We),B.lookAt(0,0,We);const I=new Sa,se={uFoldAngle:{value:0},uHingeHalfWidth:{value:.35},uHingeAxisZ:{value:Wt},uOpticalEye:{value:new qt(0,0,He)},uUiPlaneZ:{value:We},uMaxBlurRadius:{value:72},uGamma:{value:1.35},uDarkenStrength:{value:2},uDarkenStart:{value:.2},uOuterWakeAngle:{value:ct.degToRad(5)}},Z=ht.replace("vOpticalPosition = deform(position);","vOpticalPosition = rotateLeaf(position);"),te=ht.replace("out vec3 vOpticalPosition;",`uniform vec3 uRimProfile;
out vec3 vOpticalPosition;`).replace("vOpticalPosition = deform(position);",`
      vOpticalPosition = position;
      if (position.y < uRimProfile.x)
        vOpticalPosition.y = uRimProfile.x + (position.y - uRimProfile.x) * uRimProfile.z;
      if (position.y > uRimProfile.y)
        vOpticalPosition.y = uRimProfile.y + (position.y - uRimProfile.y) * uRimProfile.z;`),de=Ta.replace("if (outerScreen) filtered *= smoothstep(0.0, uOuterWakeAngle, PI - uFoldAngle);","").replace("uniform float uCornerRadius;",`uniform float uCornerRadius;
uniform float uHingeCornerRadius;`).replace("uCornerRadius) > 0.0","(uSurfaceKind == 1 && vSurfaceUv.x > 0.5 ? uHingeCornerRadius : uCornerRadius)) > 0.0").replace("vec2 textureUv = uTextureRect.xy + sampleUv * uTextureRect.zw;",`
      if (outerScreen) sampleUv = clamp(sampleUv, 0.5 / uUiResolution, 1.0 - 0.5 / uUiResolution);
      vec2 textureUv = uTextureRect.xy + sampleUv * uTextureRect.zw;`),W={x:(l.screenLeft-s.width/2)/v,y:(s.height/2-l.screenTop-i.height)/v,width:i.width/v,height:i.height/v,z:We},ue=2*Wt-Mt,ce=He/(He+We-ue),J=(He-We)/(He-ue);function H(y,q,z,V){return{x:-(y+z)/v/ce,y:(s.height/2-q-V)/v/ce,width:z/v/ce,height:V/v/ce,z:Mt,back:!0}}const Q=H(g+o.screenLeft,b+o.screenTop,f.width,f.height),Ce=[-(Q.x+Q.width)*J,Q.y*J,Q.width*J,Q.height*J],X=[];function K(y,q,z){const V=new $t({glslVersion:Rt,vertexShader:q?Z:ht,fragmentShader:de,uniforms:{...se,uUiTexture:{value:null},uUiResolution:{value:new tt(1,1)},uTextureRect:{value:new It(0,0,1,1)},uMaxMipLevel:{value:0},uSourceRect:{value:new It(...z)},uSurfaceKind:{value:q},uSurfaceBounds:{value:new tt(y.width,y.height)},uCornerRadius:{value:q?55/v/ce:40/v},uHingeCornerRadius:{value:4/v/ce}},toneMapped:!1}),ve=new Pt(jt(y),V);return ve.frustumCulled=!1,I.add(ve),X.push(V),ve}const pe=K(W,0,[W.x,W.y,W.width,W.height]),ie=K(Q,1,Ce);let ae;try{ae=await Promise.all([S,p].map(y=>new $a().loadAsync(y)))}catch(y){throw I.traverse(q=>{var z,V;(z=q.geometry)==null||z.dispose(),(V=q.material)==null||V.dispose()}),k.dispose(),k.domElement.remove(),y}const Y=`
    uniform sampler2D uFrame;
    uniform vec2 uFrameUvRange;
    in vec2 vSurfaceUv;
    out vec4 outputColor;
    void main() {
      vec4 color = texture(uFrame, vec2(uFrameUvRange.x + vSurfaceUv.x * uFrameUvRange.y, vSurfaceUv.y));
      if (color.a < 0.01) discard;
      outputColor = linearToOutputTexel(color);
    }
  `,N={value:new qt(W.y,W.y+W.height,1)};function re(y,q,z,V=[0,1]){q.colorSpace=At;const ve=new $t({glslVersion:Rt,vertexShader:z?Z:te,fragmentShader:Y,uniforms:{...se,uFrame:{value:q},uFrameUvRange:{value:new tt(...V)},uRimProfile:N},transparent:!0,depthWrite:!0,toneMapped:!1}),be=new Pt(jt(y),ve);return be.frustumCulled=!1,be.renderOrder=2,I.add(be),be}const ee={y:-s.height/2/v,width:s.width/2/v,height:s.height/v,z:We+.002},ne=re({...ee,x:0,yCuts:[W.y,W.y+W.height]},ae[0],!1,[.5,.5]),he=re({...ee,x:-ee.width},ae[0],!0,[0,.5]);re({...H(g,b,o.width,o.height),z:Mt-.002},ae[1],!0);const ye=I.children.at(-1).geometry.attributes.uv;for(let y=0;y<ye.count;y++)ye.setX(y,1-ye.getX(y));const Le=ht.replace("out vec3 vOpticalPosition;",`uniform vec3 uRimProfile;
uniform float uFrameHeight;
out vec3 vOpticalPosition;`).replace("vSurfaceUv = uv;","vSurfaceUv = vec2(uv.x, position.y / uFrameHeight + 0.5);").replace("vOpticalPosition = deform(position);",`
      vec3 anchor = vec3(0.0, position.y, position.z);
      vec3 fixedAnchor = anchor;
      if (anchor.y < uRimProfile.x)
        fixedAnchor.y = uRimProfile.x + (anchor.y - uRimProfile.x) * uRimProfile.z;
      if (anchor.y > uRimProfile.y)
        fixedAnchor.y = uRimProfile.y + (anchor.y - uRimProfile.y) * uRimProfile.z;
      // The hidden inner rim has the same closed-cover margin at both ends;
      // retaining its full-height moving end would leave a thin exposed fin.
      vOpticalPosition = mix(fixedAnchor, rotateLeaf(fixedAnchor), uv.x);`),Oe=new $t({glslVersion:Rt,vertexShader:Le,fragmentShader:Y,uniforms:{...se,uRimProfile:N,uFrameHeight:{value:ee.height},uFrame:{value:ae[0]},uFrameUvRange:{value:new tt(1e3/2048,0)}},side:Ra,transparent:!0,depthWrite:!0,toneMapped:!1}),we=[[ee.y,W.y],[W.y+W.height,ee.y+ee.height]].map(([y,q])=>{const z=new Pa(1,q-y);z.translate(0,(y+q)/2,ee.z);const V=new Pt(z,Oe);return V.frustumCulled=!1,V.renderOrder=2,I.add(V),V});await k.compileAsync(I,B),ae.forEach(y=>k.initTexture(y));let r=!1,m=180;const D=[null,null];function E(y){if(r)return;m=y,se.uFoldAngle.value=Math.PI*(1-y/180);const q=(o.height-i.height)/(s.height-i.height);N.value.z=ct.lerp(q,1,ct.smoothstep(y,0,30)),pe.visible=!!D[0]&&y>.01,ie.visible=!!D[1]&&y<179.99,ne.visible=y>.01,he.visible=y>.01,we.forEach(z=>z.visible=y>.01),k.render(I,B)}return{setSnapshot(y,q){var be;const z=y==="inner"?0:1;(be=D[z])==null||be.texture.dispose();const V=Va(q,z===1);D[z]=V;const ve=X[z].uniforms;ve.uUiTexture.value=V.texture,ve.uUiResolution.value.copy(V.resolution),ve.uTextureRect.value.copy(V.rect),ve.uMaxMipLevel.value=V.maxMip,k.initTexture(V.texture)},render:E,
// Project the same shader surface into CSS coordinates for a live iframe.
// The frame keeps its original hinged WebGL deformation; no page texture is needed.
getLiveSurface(){
  const kind=m<90?'outer':'inner',surface=kind==='inner'?W:Q;
  const radians=Math.PI*(1-m/180),cosine=Math.cos(radians),sine=Math.sin(radians),half=.35;
  const rotate=(x,y,z)=>[cosine*x+sine*(z-Wt),y,Wt-sine*x+cosine*(z-Wt)];
  function point(x,y){
    const z=surface.z;let value;
    if(kind==='outer'||x<=-half)value=rotate(x,y,z);
    else if(x>=half)value=[x,y,z];
    else{
      const t=(x+half)/(2*half),t2=t*t,t3=t2*t;
      const h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
      const left=rotate(-half,y,z),right=[half,y,z];
      const tangentLeft=[2*half*cosine,0,-2*half*sine],tangentRight=[2*half,0,0];
      value=left.map((v,index)=>h00*v+h10*tangentLeft[index]+h01*right[index]+h11*tangentRight[index]);
    }
    const projected=new qt(...value).project(B);
    return [(projected.x+1)*M/2-Ht,(1-projected.y)*R/2-Ht];
  }
  const xs=Array.from({length:25},(_,index)=>surface.x+surface.width*index/24);
  if(kind==='inner')for(let index=0;index<=8;index++)xs.push(-half+2*half*index/8);
  xs.sort((a,b)=>a-b);
  const radiusLeft=kind==='inner'?40/v:55/v/ce,radiusRight=kind==='inner'?40/v:4/v/ce;
  const topY=surface.y+surface.height,rightX=surface.x+surface.width;
  const points=[];
  function arc(cx,cy,radius,start,end){for(let index=0;index<=8;index++){const a=start+(end-start)*index/8;points.push(point(cx+radius*Math.cos(a),cy+radius*Math.sin(a)));}}
  arc(surface.x+radiusLeft,topY-radiusLeft,radiusLeft,Math.PI,Math.PI/2);
  for(const x of xs)if(x>surface.x+radiusLeft&&x<rightX-radiusRight)points.push(point(x,topY));
  arc(rightX-radiusRight,topY-radiusRight,radiusRight,Math.PI/2,0);
  arc(rightX-radiusRight,surface.y+radiusRight,radiusRight,0,-Math.PI/2);
  for(const x of xs.slice().reverse())if(x>surface.x+radiusLeft&&x<rightX-radiusRight)points.push(point(x,surface.y));
  arc(surface.x+radiusLeft,surface.y+radiusLeft,radiusLeft,-Math.PI/2,-Math.PI);
  const left=Math.min(...points.map(p=>p[0])),top=Math.min(...points.map(p=>p[1]));
  const width=Math.max(1,Math.max(...points.map(p=>p[0]))-left),height=Math.max(1,Math.max(...points.map(p=>p[1]))-top);
  // Project optical strips through the same surface as the frame. These apply
  // the original shader's spatial blur to the live page without capturing it.
  const progress=(kind==='outer'?m:180-m)/90;
  const darkenAt=u=>{
    const edge=Math.max(0,Math.min(1,kind==='outer'?1-u:1-2*u));
    return Math.min(1,2*progress*Math.pow(Math.max(0,(edge-.2)/.8),1.35));
  };
  const opticalBands=Array.from({length:24},(_,index)=>{
    const u0=index/24,u1=(index+1)/24,u=(u0+u1)/2;
    const edge=Math.max(0,Math.min(1,kind==='outer'?1-u:1-2*u));
    const radius=72*progress*Math.pow(edge,1.35);
    const x0=point(surface.x+surface.width*u0,topY)[0],x1=point(surface.x+surface.width*u1,topY)[0];
    const dark0=darkenAt(u0),dark1=darkenAt(u1),forward=x0<=x1;
    return {left:Math.min(x0,x1)-left,width:Math.max(.01,Math.abs(x1-x0)),
      blur:radius*.5,darkLeft:forward?dark0:dark1,darkRight:forward?dark1:dark0};
  });
  return {kind,left,top,width,height,opticalBands,clipPath:'polygon('+points.map(p=>(p[0]-left)+'px '+(p[1]-top)+'px').join(',')+')'};
},getSnapshot:()=>({opening:m,snapshots:D.map(y=>y?y.resolution.toArray():null),pixelRatio:k.getPixelRatio()}),dispose(){r=!0,D.forEach(y=>y==null?void 0:y.texture.dispose()),ae.forEach(y=>y.dispose()),I.traverse(y=>{var q,z;(q=y.geometry)==null||q.dispose(),(z=y.material)==null||z.dispose()}),k.dispose(),k.domElement.remove()}}}
export { Ba as createOptics };
