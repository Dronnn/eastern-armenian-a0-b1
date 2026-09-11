/* Rules and the authored bank live in content/exam-bank.json; build emits exam-data.js. */
const ExamLogic = (function () {
  'use strict';
  function shuffle(items,rng=Math.random){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  // Generic parser drafted with Grok CLI; reviewed locally. Course content was not shared.
  function parseTopicIds(value, allowedIds) {
    if (typeof value !== 'string' || !value.length) return [];
    const allowed = new Set(allowedIds), seen = new Set(), ids = [];
    for (const part of value.split(',')) {
      const id = part.trim();
      if (!/^[1-9]\d*$/.test(id) || !allowed.has(id) || seen.has(id)) continue;
      seen.add(id); ids.push(id);
    }
    return ids;
  }
  function create(bank,mode,topic,now=Date.now(),rng=Math.random){
    const selected=parseTopicIds(topic,Object.keys(bank.topics));
    const pool=bank.questions.filter(q=>mode==='mock'||!topic||selected.includes(String(q.topic)));
    const count=mode==='mock'?bank.rules.questionCount:Math.min(10,pool.length);
    if(!count||pool.length<count)throw Error('Недостаточно вопросов для этого режима.');
    const questions=shuffle(pool,rng).slice(0,count).map(q=>({id:q.id,order:shuffle(q.options.map((_,i)=>i),rng)}));
    return {id:String(now)+'-'+Math.floor(rng()*1e9),version:bank.version,mode,started:now,deadline:mode==='mock'?now+bank.rules.durationMinutes*60000:null,questions,answers:{},checked:{},finished:false};
  }
  function valid(s,bank){
    if(!s||typeof s.id!=='string'||!Number.isFinite(s.started)||typeof s.finished!=='boolean'||s.version!==bank.version||!['mock','practice'].includes(s.mode)||!Array.isArray(s.questions)||!s.questions.length||!s.answers||Array.isArray(s.answers)||typeof s.answers!=='object'||!s.checked||typeof s.checked!=='object'||Array.isArray(s.checked))return false;
    if(s.mode==='mock'&&(s.questions.length!==bank.rules.questionCount||!Number.isFinite(s.deadline)||s.deadline!==s.started+bank.rules.durationMinutes*60000))return false;
    if(s.questions.some(q=>!q||typeof q!=='object'))return false;
    if(s.mode==='practice'&&s.questions.length>10)return false;
    if(Object.keys(s.answers).some(id=>!s.questions.some(q=>q.id===id)))return false;
    if(s.questions.length>bank.questions.length||new Set(s.questions.map(q=>q.id)).size!==s.questions.length)return false;
    return s.questions.every(x=>{const q=bank.questions.find(q=>q.id===x.id);return q&&Array.isArray(x.order)&&x.order.length===q.options.length&&new Set(x.order).size===q.options.length&&x.order.every(i=>Number.isInteger(i)&&i>=0&&i<q.options.length)&&(s.answers[x.id]===undefined||(Number.isInteger(s.answers[x.id])&&s.answers[x.id]>=0&&s.answers[x.id]<q.options.length));});
  }
  function score(session,bank){
    const topics={};let correct=0,answered=0;
    const rows=session.questions.map(item=>{
      const q=bank.questions.find(q=>q.id===item.id),answer=session.answers[q.id];
      const ok=answer===q.answer;if(ok)correct++;if(answer!==undefined)answered++;
      topics[q.topic]??={ok:0,total:0};topics[q.topic].total++;if(ok)topics[q.topic].ok++;
      return {q,answer,ok};
    });
    const total=rows.length;
    return {correct,total,answered,wrong:total-correct,percent:Math.round(correct*100/total),passed:session.mode==='mock'?correct>=bank.rules.passCount:null,topics,rows};
  }
  return {shuffle,create,valid,score,parseTopicIds};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ExamLogic;
if(typeof document!=='undefined') (function(){
  'use strict';
  const bank=window.HY_EXAM, SESSION='hy-exam-session-v1', STATS='hy-exam-stats-v1';
  if(!bank)return;
  const el=id=>document.getElementById(id);
  const read=k=>{try{return JSON.parse(localStorage.getItem(k));}catch(_){return null;}};
  const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){el('exam-save').textContent='Сохранение недоступно. Результат останется на экране до закрытия страницы.';}};
  const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
  let session=read(SESSION),timer;
  if(!ExamLogic.valid(session,bank))session=null;
  for(const [k,v] of Object.entries(bank.topics)){const o=text('option',v);o.value=k;el('exam-topic').appendChild(o);}
  const requested=ExamLogic.parseTopicIds(new URLSearchParams(window.location?.search||'').get('topics'),Object.keys(bank.topics));
  if(requested.length){
    const o=text('option','Изученные темы: '+requested.map(k=>bank.topics[k]).join(', '));
    o.value=requested.join(',');el('exam-topic').appendChild(o);el('exam-topic').value=o.value;
  }
  function store(){save(SESSION,session);}
  function showFeedback(item,host){
    const q=bank.questions.find(q=>q.id===item.id),ok=session.answers[q.id]===q.answer;
    host.replaceChildren(text('p',ok?'Верно.':'Неверно.',ok?'is-good':'is-bad'),text('p','Правильный ответ: '+q.options[q.answer],'hy'),text('p',q.explanation));
    const a=text('a','Конституция, статья '+q.article);a.href=q.source;a.target='_blank';a.rel='noopener';host.appendChild(a);
  }
  function updateStatus(){
    if(!session||session.finished)return;
    el('exam-count').textContent='Отвечено '+Object.keys(session.answers).length+' из '+session.questions.length;
    if(session.deadline){const seconds=Math.max(0,Math.ceil((session.deadline-Date.now())/1000));el('exam-time').textContent='Осталось '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');if(seconds===0)finish(true);}
    else el('exam-time').textContent='Без ограничения времени';
  }
  function active(){
    el('exam-setup').hidden=true;el('exam-active').hidden=false;el('exam-result').hidden=true;
    const host=el('exam-questions');host.replaceChildren();
    session.questions.forEach((item,index)=>{
      const q=bank.questions.find(q=>q.id===item.id),box=document.createElement('fieldset');box.className='exam-question';box.dataset.question=q.id;
      const legend=text('legend',(index+1)+'. '+q.q,'hy');legend.lang='hy';box.appendChild(legend);
      item.order.forEach(originalIndex=>{
        const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=q.id;input.value=String(originalIndex);input.checked=session.answers[q.id]===originalIndex;input.disabled=session.mode==='practice'&&!!session.checked[q.id];
        const content=text('span',q.options[originalIndex],'hy');content.lang='hy';label.append(input,content);box.appendChild(label);
        input.addEventListener('change',()=>{
          if(session.finished||(session.deadline&&Date.now()>=session.deadline)){finish(true);return;}
          session.answers[q.id]=originalIndex;store();updateStatus();
        });
      });
      if(session.mode==='practice'){
        const check=text('button','Проверить','btn btn--primary');check.type='button';const fb=document.createElement('div');fb.setAttribute('aria-live','polite');
        check.disabled=!!session.checked[q.id];box.append(check,fb);
        if(session.checked[q.id])showFeedback(item,fb);
        check.addEventListener('click',()=>{
          if(session.answers[q.id]===undefined){fb.textContent='Сначала выбери ответ.';return;}
          session.checked[q.id]=true;check.disabled=true;box.querySelectorAll('input').forEach(i=>i.disabled=true);store();showFeedback(item,fb);
        });
      }
      host.appendChild(box);
    });
    el('exam-mode').textContent=session.mode==='mock'?'Пробный экзамен: ответы появятся после завершения':'Тренировка: можно проверять каждый ответ';
    updateStatus();clearInterval(timer);if(!session.finished)timer=setInterval(updateStatus,1000);
  }
  function finish(expired=false){
    if(!session)return;
    clearInterval(timer);
    if(!session.finished){session.finished=true;session.ended=Date.now();session.expired=expired;store();}
    const result=ExamLogic.score(session,bank);let stats=read(STATS);
    if(!stats||typeof stats!=='object'||Array.isArray(stats))stats={};
    stats.history=cleanHistory(stats.history);
    if(!stats.history.some(x=>x.id===session.id)){
      stats.history.push({id:session.id,mode:session.mode,at:session.ended,correct:result.correct,total:result.total,passed:result.passed,topics:result.topics});
      stats.history=stats.history.slice(-100); // Bounded history; topic totals are derived from these attempts.
      save(STATS,stats);
    }
    el('exam-setup').hidden=false;el('exam-active').hidden=true;el('exam-result').hidden=false;
    el('exam-summary').textContent=(session.expired?'Время истекло. ':'')+result.correct+' из '+result.total+' · '+result.percent+'% · ошибок: '+result.wrong+'. '+(result.passed===null?'Тренировка завершена.':result.passed?'Порог пробного экзамена пройден.':'Порог пробного экзамена пока не пройден.');
    el('exam-answers').replaceChildren();
    result.rows.forEach((row,index)=>{const d=document.createElement('details');d.className='exam-review '+(row.ok?'is-good':'is-bad');d.appendChild(text('summary',(index+1)+'. '+row.q.q+' '+(row.ok?'✓':'· повторить')));d.appendChild(text('p','Твой ответ: '+(row.answer===undefined?'нет ответа':row.q.options[row.answer])));const fb=document.createElement('div');showFeedback({id:row.q.id},fb);d.appendChild(fb);el('exam-answers').appendChild(d);});
    renderStats();el('exam-summary').focus();
  }
  function cleanHistory(value){return Array.isArray(value)?value.filter(h=>h&&typeof h.id==='string'&&Number.isFinite(h.at)&&Number.isFinite(h.correct)&&Number.isFinite(h.total)&&h.total>0&&h.correct>=0&&h.correct<=h.total).slice(-100):[];}
  function renderStats(){
    const stats=read(STATS),history=cleanHistory(stats&&stats.history),root=el('exam-statistics');root.replaceChildren();
    if(!history.length){root.append(text('p','Завершённых попыток пока нет.'));return;}
    root.append(text('p','Сохранено попыток: '+history.length+'. Статистика по последним 100 завершённым попыткам.'));
    const topics={};for(const h of history)for(const [k,v] of Object.entries(h.topics||{})){if(!v||!Number.isFinite(v.ok)||!Number.isFinite(v.total)||v.total<=0||v.ok<0||v.ok>v.total)continue;topics[k]??={ok:0,total:0};topics[k].ok+=v.ok;topics[k].total+=v.total;}
    const list=document.createElement('ul');Object.entries(topics).sort((a,b)=>(b[1].total-b[1].ok)-(a[1].total-a[1].ok)).forEach(([k,v])=>{list.append(text('li',(bank.topics[k]||k)+': верно '+v.ok+', неверно '+(v.total-v.ok)+' · '+Math.round(v.ok*100/v.total)+'%'));});root.appendChild(list);
    const last=history.at(-1);root.append(text('p','Последняя попытка: '+new Date(last.at).toLocaleString('ru-RU')+' · '+last.correct+'/'+last.total));
  }
  el('start-practice').addEventListener('click',()=>{session=ExamLogic.create(bank,'practice',el('exam-topic').value);store();active();el('exam-active').scrollIntoView({block:'start'});});
  el('start-mock').addEventListener('click',()=>{session=ExamLogic.create(bank,'mock','');store();active();el('exam-active').scrollIntoView({block:'start'});});
  el('finish-exam').addEventListener('click',()=>finish(!!session.deadline&&Date.now()>=session.deadline));
  if(session){if(session.finished)finish(session.expired);else active();}
  renderStats();
})();
