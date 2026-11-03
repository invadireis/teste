(() => {
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stages=[
    {hash:'explorar',label:'Anatomia',kicker:'01 / CONHEÇA O CORPO',visual:'anatomy',title:'ANATOMIA HUMANA',type:'MODELO 3D',context:'Encontre as três estruturas para completar esta atividade.'},
    {hash:'reflexo',label:'Reflexo',kicker:'02 / A RESPOSTA DO CORPO',visual:'anatomy',title:'O PERCURSO DO REFLEXO',type:'SIMULAÇÃO 3D',context:'Faça sua previsão e acompanhe o caminho do sinal.'},
    {hash:'sinapse',label:'Sinapse',kicker:'03 / DE UMA CÉLULA À OUTRA',visual:'synapse',title:'COMUNICAÇÃO ENTRE NEURÔNIOS',type:'ARRASTE E EXPERIMENTE',context:'Leve a molécula até o receptor para transmitir o sinal.'},
    {hash:'drogas',label:'Drogas',kicker:'04 / INVESTIGUE UMA SUBSTÂNCIA',visual:'drug',title:'ALTERAÇÕES NA COMUNICAÇÃO',type:'PREVEJA E COMPARE',context:'Escolha uma substância, responda e compare os mecanismos.'},
    {hash:'desafio',label:'Desafio',kicker:'05 / A TURMA DECIDE',visual:'quiz',title:'DESAFIO DA TURMA',type:'TRÊS PERGUNTAS',context:'Conversem, escolham uma resposta e expliquem por quê.'}
  ];
  const completed=new Set(),testedDrugs=new Set(),drugNames={alcohol:'álcool',nicotine:'nicotina',cannabis:'cannabis',cocaine:'cocaína',opioids:'opioides'};
  let active=-1,scrollLockUntil=0,scrollFrame=false,currentDrug='alcohol';
  function paintProgress(){
    $('#completed-count').textContent=completed.size+' de 5 atividades';
    $$('.completion-dots i').forEach((d,i)=>d.classList.toggle('complete',completed.has(i)));
    $$('[data-stage]').forEach(b=>{const i=Number(b.dataset.stage);b.classList.toggle('complete',completed.has(i));b.querySelector('.step-symbol').textContent=completed.has(i)?'✓':String(i+1).padStart(2,'0');b.setAttribute('aria-label',stages[i].label+(completed.has(i)?', atividade concluída':''));});
    $('#activity-state').textContent=completed.has(active)?'Explorada':'Em exploração';$('#activity-state').classList.toggle('complete',completed.has(active));
    $('#journey-context').textContent=completed.has(active)?'Atividade explorada. Você pode repetir ou continuar.':stages[active].context;
    $('#finish-progress').textContent='Vocês exploraram '+completed.size+' de 5 atividades. As respostas continuam disponíveis para revisar.';
  }
  function render(index,focus=false){
    index=Math.max(0,Math.min(stages.length-1,index));if(index===active)return;active=index;const s=stages[index];window.LessonShell.active=index;
    $('#simulation').className='simulation stage-'+(index===4?'quiz':s.visual);
    $$('[data-panel]').forEach(p=>p.hidden=Number(p.dataset.panel)!==index);
    $$('[data-visual]').forEach(p=>p.hidden=p.dataset.visual!==s.visual);
    $$('.view-switch').forEach(v=>v.hidden=index!==0);$('#reflex-timeline').hidden=index!==1;
    $('#stage-kicker').textContent=s.kicker;$('#visual-title').textContent=s.title;$('#visual-type').textContent=s.type;
    $$('[data-stage]').forEach(b=>{if(Number(b.dataset.stage)===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    $('#journey-prev').disabled=index===0;$('#journey-next>span').textContent=index===4?'Concluir exploração':'Próximo: '+stages[index+1].label;$('#journey-next').setAttribute('aria-label',index===4?'Concluir exploração':'Próxima atividade: '+stages[index+1].label);
    $$('.activity-panel')[0].scrollTop=0;paintProgress();
    $$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='body')));
    history.replaceState(null,'','#'+s.hash);window.dispatchEvent(new CustomEvent('lesson:stage',{detail:{index}}));
    if(focus){const heading=$('[data-panel="'+index+'"] h1, [data-panel="'+index+'"] h2');heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  function navigate(index,focus=true){
    index=Math.max(0,Math.min(stages.length-1,index));scrollLockUntil=performance.now()+(reduced?50:1000);render(index,focus);window.scrollTo({top:index*innerHeight,behavior:reduced?'instant':'smooth'});
  }
  window.LessonShell={active:0,navigate,stageCount:5,get completed(){return Array.from(completed);}};
  $$('[data-stage]').forEach(b=>b.addEventListener('click',()=>navigate(Number(b.dataset.stage))));
  $('#journey-prev').addEventListener('click',()=>navigate(active-1));
  $('#journey-next').addEventListener('click',()=>{if(active===4)$('#finish-dialog').showModal();else navigate(active+1);});
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const hash=a.getAttribute('href').slice(1),i=stages.findIndex(s=>s.hash===hash);if(i>=0){e.preventDefault();navigate(i);}}));
  window.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=true;requestAnimationFrame(()=>{scrollFrame=false;if(performance.now()<scrollLockUntil)return;render(Math.round(scrollY/innerHeight));});},{passive:true});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{scrollLockUntil=performance.now()+300;window.scrollTo({top:active*innerHeight,behavior:'instant'});},180);});
  window.addEventListener('lesson:activity',e=>{
    const d=e.detail;if(d.done)completed.add(d.step);
    if(d.step===0){
      if(d.count!==undefined)$$('#find-progress i').forEach((p,i)=>{p.classList.toggle('complete',i<d.count);p.classList.toggle('current',i===d.count);});
      if(d.part)$$('[data-part]').forEach(b=>b.classList.toggle('target',b.dataset.part===d.part));
      $('#find-feedback').classList.toggle('answered',d.phase==='correct');
    }
    if(d.step===1){
      $('#reflex-feedback').classList.toggle('answered',d.phase!=='reset');
      if(d.phase==='reset')$$('[data-reflex-phase]').forEach(p=>p.classList.remove('active'));
      if(d.phase==='pulse')$$('[data-reflex-phase]').forEach(p=>p.classList.toggle('active',Number(p.dataset.reflexPhase)===d.index));
      if(d.done)$$('[data-reflex-phase]').forEach(p=>p.classList.add('active'));
    }
    if(d.step===2){
      $('#message-step').classList.toggle('complete',!!d.done);$('#message-state').textContent=d.done?'Mensagem recebida pela outra célula.':'A molécula está a caminho.';$('#synapse-visual-state').textContent=d.done?'Sinal recebido':'Transmitindo a mensagem…';$('#synapse-feedback').classList.add('answered');
    }
    if(d.step===3){
      if(d.drug)currentDrug=d.drug;
      if(d.phase==='selected'){$('#compare-controls').hidden=true;$('#drug-feedback').classList.remove('answered');$('#drug-investigated').textContent='Faça uma previsão ao lado';}
      if(d.done){testedDrugs.add(currentDrug);$('#compare-controls').hidden=false;$('#drug-feedback').classList.add('answered');$('#drug-investigated').textContent=testedDrugs.size+(testedDrugs.size===1?' substância explorada':' substâncias exploradas');}
      $$('[data-compare]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.compare==='affected'));if(b.dataset.compare==='affected')b.textContent='Com '+drugNames[currentDrug];});
    }
    if(d.step===4){
      if(d.score!==undefined)$('#quiz-score-badge').textContent=d.score+(d.score===1?' acerto':' acertos');
      if(d.question!==undefined)$$('.quiz-progress-dots i').forEach((p,i)=>{p.classList.toggle('complete',i<d.question);p.classList.toggle('current',i===d.question);});
      $('#quiz-feedback').classList.toggle('answered',d.phase==='answered'||!!d.done);
    }
    paintProgress();
  });
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{$$('[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.dispatchEvent(new CustomEvent('lesson:view',{detail:{view:b.dataset.view}}));}));
  $$('[data-compare]').forEach(b=>b.addEventListener('click',()=>{$$('[data-compare]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.dispatchEvent(new CustomEvent('lesson:compare',{detail:{normal:b.dataset.compare==='normal'}}));}));
  $('#help-open').addEventListener('click',()=>$('#help-dialog').showModal());$('#sources-open').addEventListener('click',()=>$('#sources-dialog').showModal());
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
  const hash=location.hash.slice(1),initial=stages.findIndex(s=>s.hash===hash);render(initial>=0?initial:0);window.scrollTo({top:(initial>=0?initial:0)*innerHeight,behavior:'instant'});
  window.addEventListener('load',()=>{scrollLockUntil=performance.now()+250;window.scrollTo({top:active*innerHeight,behavior:'instant'});requestAnimationFrame(()=>{$('.activity-panel').scrollTop=0;});},{once:true});
})();
