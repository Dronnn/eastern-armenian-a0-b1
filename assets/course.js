/* Offline course practice and portable progress. No external services. */
(function () {
  'use strict';
  const KEYS = ['hy-progress-v1', 'hy-vocab-v1', 'hy-vocab-pick-v1', 'hy-practice-v1', 'hy-tracks-v1', 'hy-skills-v1', 'hy-exam-stats-v1'];
  const read = key => { try { const x=JSON.parse(localStorage.getItem(key)); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch (_) { return {}; } };
  const write = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch (_) { return false; } };
  const norm = s => s.normalize('NFC').toLowerCase().replace(/և/g,'եւ').replace(/[ՙ՚՛՜՝՞՟։.,!?;:«»“”"']/g,'').replace(/\s+/g,' ').trim();
  const page = document.querySelector('[data-course-id]');
  const id = page ? page.dataset.courseId : '';
  function status(message) { document.querySelectorAll('[data-save-status]').forEach(el=>el.textContent=message); }
  document.addEventListener('hy:score',e=>{
    if (!id) return;
    const all=read('hy-practice-v1');
    all[id]={ok:e.detail.ok,total:e.detail.total,possible:document.querySelectorAll('[data-quiz],[data-order]').length,at:Date.now()};
    if (!write('hy-practice-v1',all)) status('Браузер не разрешил сохранить результат. Он доступен только в этой сессии.');
  });
  document.querySelectorAll('[data-order]').forEach(box=>{
    const bank=box.querySelector('[data-bank]'), answer=box.querySelector('[data-built]'), fb=box.querySelector('[data-order-feedback]');
    let checked=false;
    box.querySelectorAll('[data-token]').forEach(btn=>btn.addEventListener('click',()=>{ if(!checked) (btn.parentNode===bank?answer:bank).appendChild(btn); }));
    box.querySelector('[data-order-reset]').addEventListener('click',()=>{ if(!checked) Array.from(answer.children).forEach(btn=>bank.appendChild(btn)); });
    box.querySelector('[data-order-check]').addEventListener('click',()=>{
      if(checked)return;
      if(bank.children.length){fb.textContent='Используй все слова. Нажми слово в ответе, чтобы вернуть его.';return;}
      checked=true;
      const ok=norm(Array.from(answer.children).map(b=>b.textContent).join(' '))===norm(box.dataset.answer);
      fb.textContent=(ok?'Верно. ':'Проверь порядок слов. Образец: ')+box.dataset.answer;
      fb.className=ok?'is-good':'is-bad';
      box.querySelectorAll('button').forEach(b=>b.disabled=true);
      document.dispatchEvent(new CustomEvent('hy:answer',{detail:{ok}}));
    });
  });
  function trackPaint(){
    const all=read('hy-tracks-v1');
    document.querySelectorAll('[data-track-complete]').forEach(b=>{
      const yes=!!all[b.dataset.trackComplete]; b.setAttribute('aria-pressed',String(yes));
      b.textContent=(yes?'✓ ':'')+b.dataset.label;
    });
  }
  document.querySelectorAll('[data-track-complete]').forEach(b=>b.addEventListener('click',()=>{
    const all=read('hy-tracks-v1'),k=b.dataset.trackComplete;
    if(all[k])delete all[k];else all[k]=Date.now();
    if(!write('hy-tracks-v1',all))status('Отметки не сохраняются: хранилище браузера недоступно.');
    trackPaint();
  }));
  trackPaint();
  document.querySelectorAll('[data-self]').forEach(field=>{
    const key=id+':'+field.dataset.self, saved=read('hy-skills-v1');
    if(saved[key]!==undefined)field.type==='checkbox'?field.checked=!!saved[key]:field.value=saved[key];
    const saveField=()=>{const all=read('hy-skills-v1');all[key]=field.type==='checkbox'?field.checked:field.value;if(!write('hy-skills-v1',all))status('Черновик не сохранён: хранилище недоступно.');};
    field.addEventListener('input',saveField);
    field.addEventListener('change',saveField);
  });
  const download=(name,data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.HYProgress={read,write,keys:KEYS};
  document.querySelectorAll('[data-export-all]').forEach(b=>b.addEventListener('click',()=>{
    const stores={};KEYS.forEach(k=>stores[k]=read(k));
    download('armenian-progress-'+new Date().toISOString().slice(0,10)+'.json',{app:'hy-course',version:2,exportedAt:new Date().toISOString(),stores});
    status('Сохранены уроки, слова, практика, самооценка и статистика экзамена.');
  }));
  document.querySelectorAll('[data-import-all]').forEach(field=>field.addEventListener('change',async()=>{
    const f=field.files[0];if(!f)return;
    try{
      if(f.size>5000000)throw Error('Файл слишком большой.');
      const data=JSON.parse(await f.text());
      if(data.app!=='hy-course'||![1,2].includes(data.version))throw Error('Это не файл прогресса курса.');
      const stores=data.version===2?data.stores:{'hy-progress-v1':data.lessons,'hy-vocab-v1':data.vocab,'hy-vocab-pick-v1':data.pick};
      if(!stores||typeof stores!=='object'||Array.isArray(stores))throw Error('Некорректные данные.');
      const pending=[];
      KEYS.forEach(k=>{const v=stores[k];if(v!==undefined){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Некорректный раздел прогресса.');pending.push([k,Object.assign({},read(k),v)]);}});
      // Validate the complete file before any writes; merge preserves unrelated progress.
      let saved=true;pending.forEach(([k,v])=>{if(!write(k,v))saved=false;});
      status(saved?'Прогресс объединён. Обнови страницу, чтобы увидеть все отметки.':'Не всё удалось сохранить: проверь свободное место в браузере.');
      trackPaint();renderProgress();
    }catch(e){status('Импорт не выполнен: '+e.message);}finally{field.value='';}
  }));
  function renderProgress(){
    const root=document.querySelector('[data-progress-details]');if(!root||!window.HY_ROUTES)return;
    root.replaceChildren();const done=read('hy-progress-v1'),practice=read('hy-practice-v1');
    for(const level of ['A1','A2','B1']){
      const routes=window.HY_ROUTES.filter(r=>r.level===level),card=document.createElement('section');card.className='card';
      const h=document.createElement('h2');h.textContent=level+' · '+routes.filter(r=>done[r.id]).length+' / '+routes.length+' занятий';card.appendChild(h);
      const list=document.createElement('ul');
      routes.forEach(r=>{const li=document.createElement('li'),a=document.createElement('a');a.href=r.url;a.textContent=(done[r.id]?'✓ ':'')+r.title;li.appendChild(a);const p=practice[r.id];if(p&&Number.isFinite(p.ok)&&Number.isFinite(p.total))li.append(' · последняя практика: '+p.ok+'/'+(p.possible||p.total)+' (проверено '+p.total+')');list.appendChild(li);});
      card.appendChild(list);root.appendChild(card);
    }
  }
  renderProgress();
  window.addEventListener('storage',()=>{trackPaint();renderProgress();});
})();
