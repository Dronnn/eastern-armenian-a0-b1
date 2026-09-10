// Run the real exam controller with a small DOM/storage adapter and a controlled clock.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const L=require('../assets/exam.js'),bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/exam-bank.json'),'utf8'));
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.handlers={};this.textContent='';this.hidden=false;this.value='';}
 append(...nodes){this.children.push(...nodes);}appendChild(n){this.children.push(n);return n;}replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}addEventListener(k,v){this.handlers[k]=v;}focus(){}scrollIntoView(){}
 querySelectorAll(tag){return this.children.flatMap(c=>typeof c==='object'?[...(c.tagName===tag?[c]:[]),...c.querySelectorAll(tag)]:[]);}
}
let clock=1000000,storage=new Map(),nodes;
function run(){
 nodes={};const document={getElementById:id=>nodes[id]??=new Element('div'),createElement:tag=>new Element(tag)};
 class Clock extends Date{static now(){return clock;}}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/exam.js'),'utf8'),{window:{HY_EXAM:bank},document,Date:Clock,setInterval:()=>1,clearInterval(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
}
const unfinished=L.create(bank,'mock','',clock);
const first=unfinished.questions[0];unfinished.answers[first.id]=bank.questions.find(q=>q.id===first.id).answer;
storage.set('hy-exam-session-v1',JSON.stringify(unfinished));clock+=61*60000;run();
assert.match(nodes['exam-summary'].textContent,/Время истекло/);assert.match(nodes['exam-summary'].textContent,/1 из 33/);
assert.equal(JSON.parse(storage.get('hy-exam-session-v1')).finished,true);
assert.equal(JSON.parse(storage.get('hy-exam-stats-v1')).history.length,1);run();assert.equal(JSON.parse(storage.get('hy-exam-stats-v1')).history.length,1);
// Corrupted old data must not make the next attempt unusable.
storage.set('hy-exam-stats-v1',JSON.stringify({history:[null,{},'bad']}));storage.set('hy-exam-session-v1',JSON.stringify({questions:[null]}));run();
nodes['start-mock'].handlers.click();assert.equal(nodes['exam-questions'].children.length,33);
const firstBox=nodes['exam-questions'].children[0],input=firstBox.querySelectorAll('input')[0];clock+=61*60000;input.handlers.change();
assert.match(nodes['exam-summary'].textContent,/Время истекло/);assert.match(nodes['exam-summary'].textContent,/0 из 33/);
console.log('Exam controller: expired resume, idempotent history, corrupt storage and late answer checks passed.');
