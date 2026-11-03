(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
  const emit=(step,detail={})=>window.dispatchEvent(new CustomEvent('lesson:activity',{detail:{step,...detail}}));
  let mode='hero',findIndex=0,findSolved=false,modelReady=false,modelDirty=true,automatic=false;
  let renderer,scene,camera,raycaster,modelMesh=[],signalMesh,signalTrack;
  const canvas=$('#anatomy-canvas'),stage=$('#scene'),spots=$$('#model-spots button'),v3=()=>new THREE.Vector3();
  const controls={yaw:-.65,pitch:.12,radius:.39,center:[0,1.615,-.012],targetYaw:-.65,targetPitch:.12,targetRadius:.39,targetCenter:[0,1.615,-.012]};
  const views={hero:{center:[0,1.615,-.012],radius:.44,yaw:-.65,pitch:.13},body:{center:[0,1.22,0],radius:1.9,yaw:0,pitch:0},explore:{center:[0,.79,0],radius:3.9,yaw:0,pitch:0}};
  const palette={cerebrum:0xc4b8a7,cerebellum:0x9d8d75,brainstem:0xb8a78b,spine:0xc98e61,nerves:0xb9a47a};
  const partOf=name=>['cerebrum','cerebellum','brainstem'].includes(name)?'brain':name;
  const partNames={brain:'Encéfalo',spine:'Medula espinal',nerves:'Nervos periféricos'};
  const targets=[
    {part:'brain',name:'O encéfalo',explain:'Encontrou. Ele integra informações e inclui cérebro, cerebelo e tronco encefálico.'},
    {part:'spine',name:'A medula espinal',explain:'Encontrou. Ela leva sinais entre o encéfalo e o corpo e participa de reflexos.'},
    {part:'nerves',name:'Os nervos',explain:'Encontrou. Eles conectam o sistema nervoso central à pele, aos músculos e aos órgãos.'}
  ];
  function setCamera(view,instant=false){
    controls.targetCenter=view.center.slice();controls.targetRadius=view.radius;controls.targetYaw=view.yaw??controls.targetYaw;controls.targetPitch=view.pitch??0;
    if(instant||reduced){controls.center=controls.targetCenter.slice();controls.radius=controls.targetRadius;controls.yaw=controls.targetYaw;controls.pitch=controls.targetPitch;}
    modelDirty=true;
  }
  function highlight(part=null){
    modelMesh.forEach(mesh=>{const active=!part||partOf(mesh.name)===part;mesh.material.color.setHex(active?palette[mesh.name]:0x424739);mesh.material.emissive.setHex(active&&part?0x2c180b:0);mesh.material.emissiveIntensity=active&&part?.3:0;});
    modelDirty=true;
  }
  async function setupAnatomy(){
    try{
      renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,.002,30);raycaster=new THREE.Raycaster();
      scene.add(new THREE.AmbientLight(0xe4ddcd,.35));scene.add(new THREE.HemisphereLight(0xe5dfcf,0x2c3325,.7));
      const key=new THREE.DirectionalLight(0xffe9d0,2.4);key.position.set(-2,3,3);scene.add(key);
      const rim=new THREE.DirectionalLight(0xc2ccb3,1.7);rim.position.set(2,1,-2);scene.add(rim);
      const fill=new THREE.DirectionalLight(0xaca18e,.7);fill.position.set(1,0,3);scene.add(fill);
      const encoded=atob(window.ANATOMY_GZIP),bytes=new Uint8Array(encoded.length);for(let i=0;i<encoded.length;i++)bytes[i]=encoded.charCodeAt(i);
      const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();delete window.ANATOMY_GZIP;
      const headerSize=new DataView(decoded).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(decoded,4,headerSize))),base=4+headerSize;
      for(const [name,entry] of Object.entries(header.groups)){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(decoded,base+entry.positionOffset,entry.positionCount),3));geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(decoded,base+entry.normalOffset,entry.positionCount),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decoded,base+entry.indexOffset,entry.indexCount),1));geometry.computeBoundingSphere();
        const material=new THREE.MeshStandardMaterial({color:palette[name],roughness:.73,metalness:.03});
        const mesh=new THREE.Mesh(geometry,material);mesh.name=name;scene.add(mesh);modelMesh.push(mesh);
      }
      const route=[[-.29,.86,.035],[-.25,1.06,.025],[-.15,1.39,.018],[0,1.38,-.044],[-.15,1.39,.018],[-.25,1.06,.025],[-.29,.89,.035]].map(p=>new THREE.Vector3(...p));
      signalTrack=new THREE.CatmullRomCurve3(route);
      const routeMesh=new THREE.Mesh(new THREE.TubeGeometry(signalTrack,100,.0018,5,false),new THREE.MeshBasicMaterial({color:0xd58663,transparent:true,opacity:.28,depthTest:false}));routeMesh.name='reflex-route';routeMesh.visible=false;routeMesh.renderOrder=10;scene.add(routeMesh);
      signalMesh=new THREE.Mesh(new THREE.SphereGeometry(.008,16,12),new THREE.MeshBasicMaterial({color:0xffc095,depthTest:false}));signalMesh.renderOrder=11;signalMesh.visible=false;scene.add(signalMesh);
      new ResizeObserver(()=>{const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();modelDirty=true;}).observe(stage);
      modelReady=true;$('#model-loading').hidden=true;updateMode(mode,true);if(!(window.LessonShell&&mode==='explore'))setCamera(views[mode],true);
      window.__anatomyReady=true;window.__anatomyStats={triangles:Object.values(header.groups).reduce((a,e)=>a+e.indexCount/3,0),source:header.source};
    }catch(error){$('#model-loading').hidden=true;$('#model-fallback').hidden=false;$('#model-spots').hidden=mode!=='explore';stage.classList.add('fallback');console.warn('Anatomia 3D indisponível:',error.message);window.__anatomyError=error.message;}
  }
  function updateMode(next,force=false){
    if(next===mode&&!force)return;mode=next;setCamera(views[mode]);
    modelMesh.forEach(mesh=>mesh.visible=mode!=='hero'||['cerebrum','cerebellum','brainstem'].includes(mesh.name));
    $('#model-name').textContent=mode==='hero'?'Encéfalo humano':'Sistema nervoso humano';
    $('#scene-instruction').textContent=mode==='explore'?'TOQUE NO MODELO OU NOS PONTOS':'ARRASTE PARA GIRAR';
    $('#model-spots').hidden=mode!=='explore';highlight(null);
    if(window.LessonShell&&mode==='explore')applyAnatomyView(findIndex===0?'brain':findIndex===1?'spine':'body');
    if(mode!=='body')stopReflex();
  }
  window.addEventListener('lesson:stage',e=>updateMode(e.detail.index===0?'explore':e.detail.index===1?'body':'hero',true));
  function applyAnatomyView(key){
    modelMesh.forEach(mesh=>mesh.visible=key!=='brain'||['cerebrum','cerebellum','brainstem'].includes(mesh.name));
    setCamera(key==='brain'?views.hero:key==='spine'?{center:[0,1.3,-.04],radius:1.06,yaw:.12,pitch:0}:views.explore);highlight(null);
    $('#model-name').textContent=key==='brain'?'Encéfalo humano':key==='spine'?'Medula espinal':'Sistema nervoso humano';
    $('#model-fallback img').src='assets/'+(key==='brain'?'brain-poster.png':'system-poster.png');
    $$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)));
  }
  window.addEventListener('lesson:view',e=>applyAnatomyView(e.detail.view));
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,moved:0};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);controls.targetYaw-=dx*.008;controls.targetPitch=clamp(controls.targetPitch+dy*.003,-.55,.55);drag.x=e.clientX;drag.y=e.clientY;modelDirty=true;});
  canvas.addEventListener('pointerup',e=>{
    if(drag&&drag.moved<8&&mode==='explore'&&modelReady){
      const r=canvas.getBoundingClientRect(),pointer=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
      const hits=raycaster.intersectObjects(modelMesh.filter(m=>m.visible));if(hits.length)choosePart(partOf(hits[0].object.name));
    }drag=null;
  });canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();controls.targetYaw+=e.key==='ArrowLeft'?.2:-.2;modelDirty=true;}
    if(e.key==='+'||e.key==='='){e.preventDefault();controls.targetRadius=clamp(controls.targetRadius*.85,.17,5);modelDirty=true;}
    if(e.key==='-'){e.preventDefault();controls.targetRadius=clamp(controls.targetRadius*1.15,.17,5);modelDirty=true;}
  });
  $('#model-rotate').addEventListener('click',()=>{controls.targetYaw+=Math.PI/5;modelDirty=true;});
  $('#model-zoom-in').addEventListener('click',()=>{controls.targetRadius=clamp(controls.targetRadius*.82,.17,5);modelDirty=true;});
  $('#model-zoom-out').addEventListener('click',()=>{controls.targetRadius=clamp(controls.targetRadius*1.2,.17,5);modelDirty=true;});
  $('#model-reset').addEventListener('click',()=>{if(window.LessonShell&&mode==='explore')applyAnatomyView($('[data-view][aria-pressed="true"]')?.dataset.view||'body');else{setCamera(views[mode]);highlight(null);}});
  function updateSpots(){
    if(!camera||mode!=='explore')return;
    const w=stage.clientWidth,h=stage.clientHeight,positions={brain:[0,1.63,.025],spine:[0,1.29,-.04],nerves:[-.25,1.05,.025]};
    spots.forEach(button=>{const q=new THREE.Vector3(...positions[button.dataset.part]).project(camera);const x=(q.x+1)*w*.5,y=(1-q.y)*h*.5;button.style.left=x+'px';button.style.top=y+'px';button.style.visibility=x<15||x>w-15||y<70||y>h-70?'hidden':'visible';});
  }
  function choosePart(part){
    if(findSolved||findIndex>=targets.length)return;
    const target=targets[findIndex];
    if(part===target.part){
      findSolved=true;highlight(part);$('#model-name').textContent=partNames[part];$('#find-feedback').textContent=target.explain;$('#find-next').hidden=false;$('#find-hint').hidden=true;spots.find(s=>s.dataset.part===part).classList.add('found');
      $('#find-next').firstChild.textContent=findIndex===2?'Concluir exploração ':'Próxima estrutura ';emit(0,{phase:'correct',count:findIndex+1,done:findIndex===2,part:target.part});
    }else $('#find-feedback').textContent='Essa parte é '+partNames[part].toLowerCase()+'. Procure '+target.name.toLowerCase()+' ou use a pista.';
  }
  spots.forEach(b=>b.addEventListener('click',()=>choosePart(b.dataset.part)));
  $('#find-next').addEventListener('click',()=>{
    findIndex++;if(window.LessonShell)applyAnatomyView(findIndex===1?'spine':'body');else setCamera(views.explore);highlight(null);$('#find-next').hidden=true;
    if(findIndex===targets.length){$('#find-counter').textContent='3 / 3';$('#find-target').textContent='As três estruturas!';$('#find-feedback').textContent='Encéfalo e medula formam o sistema nervoso central. Nervos e gânglios integram o periférico.';$('#find-restart').hidden=false;return;}
    findSolved=false;$('#find-counter').textContent=(findIndex+1)+' / 3';$('#find-target').textContent=targets[findIndex].name;$('#find-feedback').textContent='Toque na estrutura ou em um dos pontos do modelo.';$('#find-hint').hidden=false;emit(0,{phase:'next',count:findIndex,part:targets[findIndex].part});
  });
  $('#find-hint').addEventListener('click',()=>{
    const p=targets[findIndex].part;highlight(p);
    const view=p==='brain'?{center:[0,1.615,0],radius:.48,yaw:-.35,pitch:.1}:p==='spine'?{center:[0,1.29,-.04],radius:1.03,yaw:.1,pitch:0}:views.explore;
    setCamera(view);$('#find-feedback').textContent=p==='brain'?'Procure a estrutura dentro do crânio.':p==='spine'?'Procure a estrutura longa no centro das costas.':'Procure as ramificações que chegam aos braços e às pernas.';
  });
  $('#find-restart').addEventListener('click',()=>{findIndex=0;findSolved=false;$('#find-counter').textContent='1 / 3';$('#find-target').textContent=targets[0].name;$('#find-feedback').textContent='Toque no modelo para começar.';$('#find-restart').hidden=true;$('#find-hint').hidden=false;spots.forEach(s=>s.classList.remove('found'));highlight(null);if(window.LessonShell)applyAnatomyView('brain');else setCamera(views.explore);emit(0,{phase:'reset',count:0,part:'brain'});});
  let reflexStart=0,reflexStep=-1;
  $$('[data-reflex-answer]').forEach(button=>button.addEventListener('click',()=>{
    $$('[data-reflex-answer]').forEach(b=>{b.disabled=true;b.classList.toggle('correct',b.dataset.reflexAnswer==='spine');if(b===button&&b.dataset.reflexAnswer!=='spine')b.classList.add('incorrect');});
    $('#reflex-feedback').textContent=button.dataset.reflexAnswer==='spine'?'Isso. A medula pode integrar esse reflexo. O encéfalo também recebe a informação.':'Nesse reflexo, é a medula. Ela pode integrar a retirada; o encéfalo também recebe a informação.';$('#reflex-play').hidden=false;$('#reflex-restart').hidden=false;emit(1,{phase:'answered'});
  }));
  function stopReflex(){reflexStart=0;reflexStep=-1;if(signalMesh){signalMesh.visible=false;scene.getObjectByName('reflex-route').visible=false;}$('#signal-label').hidden=true;$('#reflex-play').disabled=false;modelDirty=true;}
  $('#reflex-play').addEventListener('click',()=>{
    $('#reflex-play').disabled=true;reflexStart=performance.now();reflexStep=-1;setCamera({center:[-.03,1.23,0],radius:1.75,yaw:0,pitch:0});highlight(null);
    if(signalMesh){signalMesh.visible=true;scene.getObjectByName('reflex-route').visible=true;}
    $('#signal-label').hidden=false;$('#reflex-feedback').textContent='Acompanhe: pele → neurônio sensitivo → medula → neurônio motor → músculo.';
  });
  $('#reflex-restart').addEventListener('click',()=>{stopReflex();$$('[data-reflex-answer]').forEach(b=>{b.disabled=false;b.className='';});$('#reflex-feedback').textContent='';$('#reflex-play').hidden=true;$('#reflex-restart').hidden=true;setCamera(views.body);emit(1,{phase:'reset'});});
  function updateReflex(now){
    if(!reflexStart)return;const p=clamp((now-reflexStart)/(reduced?1600:4600),0,1),step=p<.42?0:p<.58?1:2;
    if(step!==reflexStep){reflexStep=step;$('#signal-label').textContent=['1. O estímulo chega à medula','2. A medula integra a resposta','3. O comando volta ao músculo'][step];emit(1,{phase:'pulse',index:step});}
    if(signalMesh)signalMesh.position.copy(signalTrack.getPoint(p));modelDirty=true;
    if(p===1){stopReflex();$('#reflex-play').firstChild.textContent='Ver novamente ';$('#reflex-feedback').textContent='O músculo contrai e a mão se afasta. Essa resposta pode começar antes da percepção consciente da dor.';emit(1,{phase:'done',done:true});}
  }
  class Drawing{
    constructor(element){this.element=element;this.ctx=element.getContext('2d');this.w=0;this.h=0;this.visible=false;new ResizeObserver(()=>{const r=element.getBoundingClientRect();if(!r.width||!r.height)return;const d=Math.min(devicePixelRatio||1,2);this.w=r.width;this.h=r.height;element.width=Math.round(r.width*d);element.height=Math.round(r.height*d);this.ctx.setTransform(d,0,0,d,0,0);if(element.id==='synapse-canvas')moleculeReady=false;}).observe(element);new IntersectionObserver(e=>this.visible=e[0].isIntersecting).observe(element);}
    clear(){this.ctx.clearRect(0,0,this.w,this.h);}
    text(text,x,y,color='#8f9b7d',size=9,align='center'){this.ctx.fillStyle=color;this.ctx.font=Math.max(size,this.w>650?11:this.w>420?9:7)+'px "DM Sans","Segoe UI",sans-serif';this.ctx.textAlign=align;this.ctx.fillText(text,x,y);}
    dot(x,y,r=6,color='#d58663'){this.ctx.fillStyle=color;this.ctx.beginPath();this.ctx.arc(x,y,r,0,Math.PI*2);this.ctx.fill();}
    arrow(x1,y1,x2,y2,color='#5a6550'){const c=this.ctx,a=Math.atan2(y2-y1,x2-x1);c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.lineTo(x2-Math.cos(a-.45)*7,y2-Math.sin(a-.45)*7);c.moveTo(x2,y2);c.lineTo(x2-Math.cos(a+.45)*7,y2-Math.sin(a+.45)*7);c.stroke();}
    cells(active=false){
      const c=this.ctx,w=this.w,h=this.h,l=w*.35,r=w*.72,cy=h*.5;
      c.lineWidth=1.2;c.strokeStyle='#8d967d';c.fillStyle='#b8bd9f08';
      c.beginPath();c.moveTo(-10,cy-45);c.lineTo(l-40,cy-45);c.bezierCurveTo(l+30,cy-45,l+30,cy+45,l-40,cy+45);c.lineTo(-10,cy+45);c.fill();c.stroke();
      c.fillStyle=active?'#c8d5b012':'#b8bd9f08';c.strokeStyle=active?'#becba5':'#8d967d';c.beginPath();c.moveTo(w+10,cy-78);c.lineTo(r,cy-78);c.lineTo(r,cy+78);c.lineTo(w+10,cy+78);c.fill();c.stroke();
      c.strokeStyle=active?'#d4d9c7':'#a2ac92';c.lineWidth=2;c.beginPath();c.moveTo(r+8,cy-13);c.lineTo(r-12,cy-13);c.lineTo(r-12,cy+13);c.lineTo(r+8,cy+13);c.stroke();
      for(let i=0;i<3;i++){const x=l-66-(i%2)*37,y=cy-18+Math.floor(i/2)*34;c.strokeStyle='#69755d';c.lineWidth=.8;c.beginPath();c.arc(x,y,14,0,Math.PI*2);c.stroke();for(let k=0;k<3;k++)this.dot(x+Math.cos(k*2.1)*5,y+Math.sin(k*2.1)*5,1.6,'#adb99a');}
      return {l,r,cy};
    }
  }
  const synapse=new Drawing($('#synapse-canvas'));let molecule={x:0,y:0,drag:false,sent:false,start:0,progress:0,reported:false},moleculeReady=false;
  const moleculeHome=()=>({x:synapse.w*.44,y:synapse.h*.5}),moleculeEnd=()=>({x:synapse.w*.72-8,y:synapse.h*.5});
  function sendMessage(){molecule.sent=true;molecule.start=performance.now();molecule.progress=0;molecule.reported=false;$('#send-message').firstChild.textContent='Enviar novamente ';$('#synapse-task').textContent='Veja a molécula se ligar ao receptor.';$('#synapse-feedback').textContent='Em muitas sinapses, o sinal elétrico leva à liberação de neurotransmissores. Eles atravessam a fenda e se ligam a receptores da outra célula.';emit(2,{phase:'sending'});}
  $('#send-message').addEventListener('click',sendMessage);synapse.element.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sendMessage();}});
  synapse.element.addEventListener('pointerdown',e=>{const r=synapse.element.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(Math.hypot(x-molecule.x,y-molecule.y)<40){molecule.drag=true;molecule.sent=false;synapse.element.setPointerCapture(e.pointerId);}});
  synapse.element.addEventListener('pointermove',e=>{if(!molecule.drag)return;const r=synapse.element.getBoundingClientRect();molecule.x=clamp(e.clientX-r.left,0,synapse.w);molecule.y=clamp(e.clientY-r.top,0,synapse.h);});
  synapse.element.addEventListener('pointerup',()=>{if(!molecule.drag)return;molecule.drag=false;const end=moleculeEnd();if(Math.hypot(molecule.x-end.x,molecule.y-end.y)<50)sendMessage();else{moleculeReady=false;$('#synapse-task').textContent='Tente levar a molécula até a abertura do receptor, à direita.';}});
  synapse.element.addEventListener('pointercancel',()=>{molecule.drag=false;moleculeReady=false;});
  function drawSynapse(now){
    if(!synapse.visible)return;synapse.clear();const c=synapse.ctx,w=synapse.w,h=synapse.h;
    if(!moleculeReady){Object.assign(molecule,moleculeHome());moleculeReady=true;}
    if(molecule.sent){molecule.progress=reduced?1:clamp((now-molecule.start)/1000,0,1);const a=moleculeHome(),b=moleculeEnd();molecule.x=mix(a.x,b.x,molecule.progress);molecule.y=a.y-Math.sin(molecule.progress*Math.PI)*20;}
    synapse.cells(molecule.sent&&molecule.progress===1);
    c.setLineDash([2,7]);c.strokeStyle='#87937555';c.lineWidth=1;c.beginPath();c.moveTo(w*.46,h*.5);c.lineTo(w*.68,h*.5);c.stroke();c.setLineDash([]);
    if(molecule.sent&&molecule.progress===1){synapse.arrow(w*.76,h*.5,w*.92,h*.5,'#c6cfb6');synapse.text('SINAL RECEBIDO',w*.82,h*.5+Math.min(115,h*.35),'#b7c5a0',8);if(!molecule.reported){molecule.reported=true;emit(2,{phase:'received',done:true});}}
    synapse.dot(molecule.x,molecule.y,w>500?12:8,'#eeb57d');c.strokeStyle='#eeb57d44';c.lineWidth=1;c.beginPath();c.arc(molecule.x,molecule.y,w>500?23:16,0,Math.PI*2);c.stroke();
    synapse.text('NEUROTRANSMISSOR',w*.44,h*.5-Math.min(72,h*.28),'#b89f83',8);synapse.text('RECEPTOR',w*.73,h*.5-Math.min(112,h*.38),'#9eaa8a',8);
    if(!molecule.sent){synapse.text('ARRASTE →',w*.46,h*.5+Math.min(70,h*.3),'#bd9c77',10);c.strokeStyle='#93bdb170';c.setLineDash([3,5]);c.beginPath();c.arc(w*.72-8,h*.5,w>500?25:19,0,Math.PI*2);c.stroke();c.setLineDash([]);}
  }
  const drugActivity={
    alcohol:{q:'O álcool deixa os reflexos mais rápidos ou mais lentos?',options:['Mais rápidos','Mais lentos'],answer:1,reveal:'Mais lentos. O álcool pode prejudicar a coordenação e o julgamento. A desinibição inicial não significa que o cérebro esteja funcionando melhor.',caption:'ALTERA O EQUILÍBRIO ENTRE INIBIÇÃO E EXCITAÇÃO'},
    nicotine:{q:'Vape com nicotina pode causar dependência?',options:['Sim','Não, é só vapor'],answer:0,reveal:'Sim. A nicotina pode causar dependência. E o aerossol de um vape não é apenas vapor de água.',caption:'A NICOTINA ATIVA RECEPTORES NICOTÍNICOS'},
    cannabis:{q:'O THC pode atrapalhar a memória e a coordenação?',options:['Sim','Não afeta essas funções'],answer:0,reveal:'Sim. O THC pode prejudicar a memória recente e a coordenação e alterar a percepção do tempo.',caption:'O THC MODIFICA A LIBERAÇÃO DE NEUROTRANSMISSORES'},
    cocaine:{q:'Com cocaína, a dopamina fica disponível por mais ou menos tempo?',options:['Mais tempo','Menos tempo'],answer:0,reveal:'Mais tempo. A cocaína bloqueia a recaptação, um mecanismo que recolhe a dopamina da sinapse. Esse é um dos efeitos da substância.',caption:'RECAPTAÇÃO BLOQUEADA → SINAL PROLONGADO'},
    opioids:{q:'Uma overdose de opioides pode fazer a respiração parar?',options:['Sim','Não, só causa sono'],answer:0,reveal:'Sim. Em uma overdose, opioides podem reduzir a respiração a níveis fatais. É uma emergência.',caption:'A RESPIRAÇÃO PODE SER DEPRIMIDA'}
  };
  let currentDrug='alcohol',drugAnswered=false,drugPaused=reduced,drugTime=0,drugBaseline=false;
  window.addEventListener('lesson:compare',e=>{drugBaseline=e.detail.normal;$('#drug-demo-label').textContent=drugBaseline?'COMUNICAÇÃO HABITUAL · ESQUEMA SIMPLIFICADO':drugActivity[currentDrug].caption;});
  const drugDrawing=new Drawing($('#drug-canvas'));
  function selectDrug(key){
    currentDrug=key;drugAnswered=false;drugTime=0;drugBaseline=false;const d=window.LESSON_DRUGS[key],a=drugActivity[key];
    $$('[data-drug]').forEach(b=>{const selected=b.dataset.drug===key;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    $('#drug-panel').setAttribute('aria-labelledby','tab-'+key);$('#drug-class').textContent=d.category;$('#drug-question').textContent=a.q;$('#drug-feedback').textContent='';$('#drug-reset').hidden=true;$('#drug-details').open=false;$('#drug-demo-label').textContent='FAÇA SUA PREVISÃO PARA REVELAR';$('#drug-pause').hidden=true;
    $('#drug-mechanism').textContent=d.mechanism;$('#drug-risk').textContent=d.risk;$('#drug-note').textContent=d.note;$('#drug-source').href=d.source;$('#drug-source').textContent=d.label+' ↗';$('#drug-options').replaceChildren();
    a.options.forEach((option,i)=>{const b=document.createElement('button');b.textContent=option;b.addEventListener('click',()=>answerDrug(i));$('#drug-options').append(b);});
    drugDrawing.element.setAttribute('aria-label','Demonstração esquemática: '+d.name+'. Faça a previsão para revelar o mecanismo.');emit(3,{phase:'selected',drug:key});
  }
  function answerDrug(answer){
    if(drugAnswered)return;drugAnswered=true;const a=drugActivity[currentDrug];
    $$('#drug-options button').forEach((b,i)=>{b.disabled=true;if(i===a.answer)b.classList.add('correct');else if(i===answer)b.classList.add('incorrect');});
    $('#drug-feedback').textContent=a.reveal;$('#drug-demo-label').textContent=a.caption;$('#drug-reset').hidden=false;$('#drug-pause').hidden=false;drugDrawing.element.setAttribute('aria-label',a.caption+'. '+a.reveal);emit(3,{phase:'answered',drug:currentDrug,done:true});
  }
  const drugTabs=$$('[data-drug]');
  drugTabs.forEach((b,i)=>{b.addEventListener('click',()=>selectDrug(b.dataset.drug));b.addEventListener('keydown',e=>{let n=i;if(e.key==='ArrowRight')n=(i+1)%drugTabs.length;else if(e.key==='ArrowLeft')n=(i+drugTabs.length-1)%drugTabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=drugTabs.length-1;else return;e.preventDefault();selectDrug(drugTabs[n].dataset.drug);drugTabs[n].focus();});});
  $('#drug-reset').addEventListener('click',()=>selectDrug(currentDrug));
  function pauseLabel(){$('#drug-pause').textContent=drugPaused?'Reproduzir':'Pausar';$('#drug-pause').setAttribute('aria-pressed',String(drugPaused));}
  $('#drug-pause').addEventListener('click',()=>{drugPaused=!drugPaused;pauseLabel();});pauseLabel();selectDrug('alcohol');
  function wave(d,x,y,width,height,frequency,time,color){
    const c=d.ctx;c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();for(let i=0;i<=150;i++){const p=i/150,q=Math.sin(p*Math.PI*2*frequency-time)*height;if(i===0)c.moveTo(x+p*width,y+q);else c.lineTo(x+p*width,y+q);}c.stroke();
  }
  function drawDrug(dt){
    if(!drugDrawing.visible)return;if(!drugPaused)drugTime+=dt;
    const d=drugDrawing,c=d.ctx,w=d.w,h=d.h,t=drugTime;d.clear();
    if(!drugAnswered){
      c.globalAlpha=.35;d.cells();for(let i=0;i<5;i++)d.dot(w*.42+i*w*.048,h*.5+((i%3)-1)*15,4,'#86a4ae');c.globalAlpha=1;d.text('FAÇA SUA PREVISÃO PARA INVESTIGAR',w*.5,h*.5+Math.min(135,h*.4),'#7f9ca8',11);return;
    }
    if(drugBaseline){
      if(currentDrug==='alcohol'){
        d.text('EXCITAÇÃO',w*.23,h*.22,'#a6bcb8',10);wave(d,w*.06,h*.36,w*.34,11,2.5,t*.001,'#93bdb1');d.text('INIBIÇÃO',w*.23,h*.75,'#a6bcb8',10);wave(d,w*.06,h*.63,w*.34,10,2,t*.001,'#789d99');d.arrow(w*.44,h*.5,w*.56,h*.5,'#93bdb1');wave(d,w*.63,h*.5,w*.3,12,2.3,t*.001,'#b6cfbd');d.text('ATUAÇÃO COORDENADA',w*.76,h*.8,'#a6bcb8',9);return;
      }
      if(currentDrug==='opioids'){
        d.text('CONTROLE DA RESPIRAÇÃO',w*.5,h*.25,'#a6bcb8',10);wave(d,w*.12,h*.5,w*.76,21,2.8,t*.001,'#93bdb1');d.text('SINALIZAÇÃO HABITUAL',w*.5,h*.78,'#a6bcb8',9);return;
      }
      const {l,r,cy}=d.cells(currentDrug==='nicotine');
      if(currentDrug==='nicotine'){d.dot(r-7,cy,7,'#93bdb1');d.text('ACETILCOLINA',w*.7,cy-55,'#93bdb1',10);d.arrow(r+20,cy,w*.96,cy,'#b6cfbd');d.text('RECEPTOR NICOTÍNICO',w*.72,h*.85,'#a6bcb8',9);return;}
      const tx=l+1,ty=cy+40;
      for(let i=0;i<12;i++){const p=(t*.0002+i*.083)%1;let x,y;if(p<.65){x=mix(l+15,r-22,p/.65);y=cy+((i%3)-1)*18;}else{x=mix(r-22,tx,(p-.65)/.35);y=mix(cy+((i%3)-1)*18,ty,(p-.65)/.35);}d.dot(x,y,3.5,'#b6cfbd');}
      if(currentDrug==='cocaine'){c.strokeStyle='#93bdb1';c.lineWidth=1.5;c.strokeRect(tx-9,ty-10,18,20);d.text('RECAPTAÇÃO',w*.36,h*.86,'#93bdb1',10);}else d.text('LIBERAÇÃO REGULADA',w*.5,h*.86,'#93bdb1',10);
      return;
    }
    if(currentDrug==='alcohol'){
      d.text('EXCITAÇÃO / GLUTAMATO',w*.23,h*.24,'#a1ac92',8);wave(d,w*.06,h*.39,w*.34,14,3,t*.002,'#aab29a');d.arrow(w*.44,h*.5,w*.57,h*.5,'#d58663');
      d.text('INIBIÇÃO / GABA',w*.23,h*.7,'#a1ac92',8);wave(d,w*.06,h*.62,w*.34,8,1.8,t*.001,'#7f8f6d');
      c.strokeStyle='#d5866390';c.lineWidth=1;c.beginPath();c.moveTo(w*.68,h*.29);c.lineTo(w*.68,h*.73);c.stroke();d.text('↑',w*.68,h*.24,'#d58663',20);d.text('EFEITO DEPRESSOR',w*.75,h*.84,'#ad9c83',8);wave(d,w*.62,h*.5,w*.32,7,1,t*.0007,'#c8b28f');
      d.text('ESQUEMA DE ALGUNS EFEITOS',w*.5,h*.95,'#59644d',7);return;
    }
    if(currentDrug==='opioids'){
      d.text('RECEPTORES OPIOIDES',w*.26,h*.24,'#a1ac92',8);for(let i=0;i<3;i++){c.strokeStyle='#99a486';c.lineWidth=1.5;c.strokeRect(w*.17+i*18,h*.42,12,29);}d.dot(w*.22,h*.35,7,'#d58663');d.arrow(w*.42,h*.49,w*.56,h*.49,'#d58663');
      wave(d,w*.62,h*.49,w*.33,9,1.1,t*.0006,'#c7b090');d.text('CONTROLE DA RESPIRAÇÃO',w*.72,h*.73,'#aa9c83',8);d.text('PODE DIMINUIR',w*.72,h*.82,'#d58663',8);return;
    }
    const {l,r,cy}=d.cells(currentDrug==='nicotine');
    if(currentDrug==='cocaine'){
      const tx=l+1,ty=cy+40;c.fillStyle='#10110e';c.fillRect(tx-10,ty-11,20,22);c.strokeStyle='#d58663';c.lineWidth=2;c.strokeRect(tx-10,ty-11,20,22);c.beginPath();c.moveTo(tx-5,ty-6);c.lineTo(tx+5,ty+6);c.moveTo(tx+5,ty-6);c.lineTo(tx-5,ty+6);c.stroke();
      for(let i=0;i<22;i++){const p=(t*.00014+i*.147)%1;d.dot(mix(l+13,r-22,p),cy-30+((i*17)%60)+Math.sin(p*6+i)*5,3,'#c5b48e');}d.text('TRANSPORTADOR BLOQUEADO',w*.34,h*.87,'#d58663',8);d.text('DOPAMINA',w*.53,h*.2,'#aaae99',8);
    }else if(currentDrug==='nicotine'){
      d.dot(r-7,cy,7,'#d58663');d.text('NICOTINA',r-5,cy-45,'#d58663',8);d.arrow(r+20,cy,w*.96,cy,'#c6cfb1');d.text('RECEPTOR ATIVADO',w*.73,h*.88,'#a4b48e',8);
    }else{
      const tx=l,ty=cy-33;c.strokeStyle='#d58663';c.lineWidth=1.3;c.beginPath();for(let i=0;i<=6;i++){const a=i/6*Math.PI*2,x=tx+Math.cos(a)*10,y=ty+Math.sin(a)*10;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();d.text('THC → CB1',w*.33,h*.2,'#d58663',8);
      for(let i=0;i<8;i++){const p=(t*.00012+i*.13)%1;d.dot(mix(l+20,r-20,p),cy+((i%3)-1)*20,3,'#aaae92');}d.text('LIBERAÇÃO MODIFICADA',w*.53,h*.88,'#a4b48e',8);
    }
  }
  const quiz=[
    {q:'No reflexo que simulamos, quem pode integrar a retirada da mão?',options:['A medula espinal.','O osso do braço.','Somente o cérebro.'],correct:0,explain:'A medula pode integrar o reflexo antes da percepção consciente da dor. O encéfalo também recebe a informação.'},
    {q:'O que passa pela fenda de uma sinapse química?',options:['Um fio elétrico.','Neurotransmissores.','Um neurônio inteiro.'],correct:1,explain:'Neurotransmissores atravessam o espaço e podem se ligar aos receptores de outra célula.'},
    {q:'Uma substância vendida legalmente pode alterar o sistema nervoso e causar dependência?',options:['Não. A venda legal elimina o risco.','Sim. Álcool e nicotina são exemplos.','Só se for misturada com outra.'],correct:1,explain:'Ser legal não significa ser inofensiva. Álcool e nicotina são drogas psicoativas e podem causar dependência.'}
  ];
  let qi=0,score=0,qa=false;
  function showQuiz(){
    const q=quiz[qi];qa=false;$('#quiz-progress').textContent=String(qi+1).padStart(2,'0')+' / 03';$('#quiz-question').textContent=q.q;$('#quiz-feedback').textContent='';$('#quiz-options').replaceChildren();$('#quiz-next').hidden=true;$('#quiz-restart').hidden=true;
    q.options.forEach((answer,i)=>{const b=document.createElement('button'),letter=document.createElement('span');letter.textContent=String.fromCharCode(65+i);b.append(letter,document.createTextNode(answer));b.addEventListener('click',()=>{if(qa)return;qa=true;if(i===q.correct)score++;$$('#quiz-options button').forEach((button,n)=>{button.disabled=true;if(n===q.correct)button.classList.add('correct');else if(n===i)button.classList.add('incorrect');});$('#quiz-feedback').textContent=q.explain;$('#quiz-next').hidden=false;$('#quiz-next').firstChild.textContent=qi===2?'Ver resultado ':'Próxima pergunta ';emit(4,{phase:'answered',question:qi+1,score});});$('#quiz-options').append(b);});
    emit(4,{phase:'question',question:qi,score});
  }
  $('#quiz-next').addEventListener('click',()=>{
    if(!qa)return;if(qi<2){qi++;showQuiz();$('#quiz-question').tabIndex=-1;$('#quiz-question').focus({preventScroll:true});}else{$('#quiz-progress').textContent='RESULTADO DA TURMA';$('#quiz-question').textContent=score===3?'A turma acertou as três.':'Vamos rever o que gerou dúvida?';$('#quiz-options').replaceChildren();const result=document.createElement('div');result.className='quiz-result';result.textContent=String(score);const small=document.createElement('small');small.textContent='/ 3';result.append(small);$('#quiz-options').append(result);$('#quiz-feedback').textContent='Agora escolham uma ideia da apresentação e expliquem com suas próprias palavras.';$('#quiz-next').hidden=true;$('#quiz-restart').hidden=false;emit(4,{phase:'done',question:3,score,done:true});}
  });$('#quiz-restart').addEventListener('click',()=>{qi=0;score=0;showQuiz();});showQuiz();
  const slides=$$('[data-slide]');let presenting=false,slideIndex=0,scrollQueued=false;
  function onScroll(){
    if(window.LessonShell){const index=window.LessonShell.active;updateMode(index===0?'explore':index===1?'body':'hero');if(presenting){slideIndex=index;updateSlideCount();}scrollQueued=false;return;}
    const threshold=innerWidth<=760?innerHeight*.72:innerHeight*.45;
    let next='hero';$$('[data-scene]').forEach(s=>{if(s.getBoundingClientRect().top<threshold)next=s.dataset.scene;});updateMode(next);
    const nav=$$('.site-header nav a');const ids=['#reflexo','#sinapse','#drogas'];nav.forEach((a,i)=>{const start=$(ids[i]).getBoundingClientRect().top,end=i<2?$(ids[i+1]).getBoundingClientRect().top:$('#desafio').getBoundingClientRect().top;a.classList.toggle('active',start<innerHeight*.5&&end>innerHeight*.3);});
    if(presenting){let best=0,dist=Infinity;slides.forEach((s,i)=>{const d=Math.abs(s.getBoundingClientRect().top-(innerWidth<=760?innerHeight*.59:120));if(d<dist){best=i;dist=d;}});slideIndex=best;updateSlideCount();}
    scrollQueued=false;
  }
  window.addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(onScroll);}},{passive:true});
  function updateSlideCount(){$('#slide-count').textContent=String(slideIndex+1).padStart(2,'0')+' / '+String(window.LessonShell?5:slides.length).padStart(2,'0');}
  function goSlide(index){if(window.LessonShell){window.LessonShell.navigate(index);return;}slideIndex=clamp(index,0,slides.length-1);slides[slideIndex].scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});updateSlideCount();}
  function setPresent(active){presenting=active;$('#presentation-dock').hidden=window.LessonShell?true:!active;$('#present').setAttribute('aria-pressed',String(active));document.body.classList.toggle('is-presenting',active);$('#present').querySelector('span').textContent=active?'Sair':'Apresentar';if(active){onScroll();document.documentElement.requestFullscreen?.().catch(()=>{});}else if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}
  $('#present').addEventListener('click',()=>setPresent(!presenting));$('#exit-present').addEventListener('click',()=>setPresent(false));$('#prev-slide').addEventListener('click',()=>goSlide(slideIndex-1));$('#next-slide').addEventListener('click',()=>goSlide(slideIndex+1));
  document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='Escape'&&presenting){setPresent(false);return;}if(!presenting||e.target.closest('canvas,input,textarea,[role="tablist"],#quiz-options'))return;if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();goSlide((window.LessonShell?window.LessonShell.active:slideIndex)+1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();goSlide((window.LessonShell?window.LessonShell.active:slideIndex)-1);}});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&presenting){presenting=false;document.body.classList.remove('is-presenting');$('#presentation-dock').hidden=true;$('#present').setAttribute('aria-pressed','false');$('#present').querySelector('span').textContent='Apresentar';}});
  let last=0,drawTime=0,stageVisible=true;
  new IntersectionObserver(e=>stageVisible=e[0].isIntersecting).observe(stage);
  function frame(t){
    requestAnimationFrame(frame);if(document.hidden){last=t;return;}if(t-drawTime<1000/30)return;const dt=last?Math.min(t-last,100):33;last=t;drawTime=t;updateReflex(t);
    if(modelReady&&stageVisible){
      let moving=false;const smooth=reduced?1:.12;
      for(let i=0;i<3;i++){if(Math.abs(controls.center[i]-controls.targetCenter[i])>.00001)moving=true;controls.center[i]=mix(controls.center[i],controls.targetCenter[i],smooth);}
      for(const [v,target] of [['radius','targetRadius'],['yaw','targetYaw'],['pitch','targetPitch']]){if(Math.abs(controls[v]-controls[target])>.00001)moving=true;controls[v]=mix(controls[v],controls[target],smooth);}
      if(modelDirty||moving){const {center,radius,yaw,pitch}=controls;camera.position.set(center[0]+Math.sin(yaw)*Math.cos(pitch)*radius,center[1]+Math.sin(pitch)*radius,center[2]+Math.cos(yaw)*Math.cos(pitch)*radius);camera.lookAt(...center);camera.updateMatrixWorld();renderer.render(scene,camera);updateSpots();modelDirty=false;}
    }
    drawSynapse(t);drawDrug(dt);
  }
  setupAnatomy();requestAnimationFrame(frame);onScroll();emit(0,{phase:'start',count:0,part:'brain'});
})();
