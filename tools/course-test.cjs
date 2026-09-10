'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),bank=JSON.parse(fs.readFileSync(path.join(root,'content/exam-bank.json'),'utf8')),L=require('../assets/exam.js');
let checks=0;function ok(value,message){assert.ok(value,message);checks++;}
const clone=x=>JSON.parse(JSON.stringify(x));
for(let i=0;i<120;i++){
 const s=L.create(bank,'mock','',1000000);ok(L.valid(s,bank),'new mock valid');ok(s.questions.length===33&&new Set(s.questions.map(q=>q.id)).size===33,'33 unique');
 ok(s.deadline-s.started===3600000,'60 minutes');ok(L.score(s,bank).wrong===33,'unanswered count as errors');
 for(const item of s.questions.slice(0,17))s.answers[item.id]=bank.questions.find(q=>q.id===item.id).answer;
 const r=L.score(s,bank);ok(r.passed&&r.correct===17&&r.wrong===16,'threshold 17');delete s.answers[s.questions[0].id];ok(!L.score(s,bank).passed,'16 fails');
 ok(Object.values(r.topics).reduce((n,t)=>n+t.total,0)===33,'topic denominator');
}
for(const topic of Object.keys(bank.topics)){const s=L.create(bank,'practice',topic);ok(L.valid(s,bank)&&s.questions.length===8,'topic practice');ok(L.score(s,bank).passed===null,'practice has no exam pass');ok(s.questions.every(x=>String(bank.questions.find(q=>q.id===x.id).topic)===topic),'topic filter');}
const s=L.create(bank,'mock','');
for(const corrupt of [null,{},[],{...s,questions:[null]},{...s,checked:[]},{...s,started:'bad'},{...s,deadline:0},{...s,answers:{foreign:0}},{...s,questions:[s.questions[0],...s.questions.slice(0,32)]},{...s,version:'old'}])ok(!L.valid(corrupt,bank),'malformed state rejected');
const bad=clone(s);bad.questions[0].order=[0,0,2];ok(!L.valid(bad,bank),'invalid option permutation');
// Exercise backup event handlers with an isolated storage and minimal DOM.
const memory=new Map(),field={handlers:{},files:[],value:'',addEventListener(k,f){this.handlers[k]=f;}},status={textContent:''};
const document={querySelector(){return null;},querySelectorAll(s){return s==='[data-import-all]'?[field]:s==='[data-save-status]'?[status]:[];},addEventListener(){}};
const context={document,window:{addEventListener(){}},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},URL:{},Blob,Date,setTimeout};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/course.js'),'utf8'),context);
async function importData(data){field.files=[{size:100,text:async()=>JSON.stringify(data)}];await field.handlers.change();}
(async()=>{
 memory.set('hy-progress-v1',JSON.stringify({'0001':123}));
 await importData({app:'hy-course',version:1,vocab:{'77':true},lessons:{'0002':456},pick:{'88':true}});
 ok(JSON.parse(memory.get('hy-vocab-v1'))['77'],'legacy vocabulary preserved');ok(Object.keys(JSON.parse(memory.get('hy-progress-v1'))).length===2,'legacy merges lessons');
 await importData({app:'hy-course',version:2,stores:{'hy-exam-stats-v1':{history:[{id:'test'}]},'hy-skills-v1':{draft:'Հայերեն'}}});
 ok(JSON.parse(memory.get('hy-skills-v1')).draft==='Հայերեն','draft imported');ok(JSON.parse(memory.get('hy-exam-stats-v1')).history.length===1,'exam imported');
 const before=JSON.stringify([...memory]);await importData({app:'hy-course',version:2,stores:{'hy-progress-v1':{'0003':true},'hy-vocab-v1':[]}});
 ok(JSON.stringify([...memory])===before,'invalid file does not partially write');ok(status.textContent.includes('Импорт не выполнен'),'error visible');
 await importData({app:'other',version:2,stores:{}});ok(JSON.stringify([...memory])===before,'foreign file rejected');
 console.log('Course checks passed:',checks);
})().catch(e=>{console.error(e);process.exitCode=1;});
