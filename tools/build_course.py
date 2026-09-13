# -*- coding: utf-8 -*-
"""Compile authored course data into offline HTML; preserves all original lesson URLs."""
import csv, json, re, html, os, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SITE=ROOT; CONTENT=SITE/'content'
def load(name):return json.loads((CONTENT/name).read_text())
def dump(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def e(s):return html.escape(str(s),quote=True)
def hy(s):return '<span lang="hy" class="hy">'+e(s)+'</span>'
def prose(s):
 return re.sub(r'([\u0531-\u058f]+(?:[ \u00a0][\u0531-\u058f]+)*)',lambda m:'<span lang="hy" class="hy">'+m[1]+'</span>',e(s))
units=sorted([u for p in CONTENT.glob('units-*.json') for u in json.loads(p.read_text())],key=lambda u:u['n'])
extra=sum([load(f) for f in ['reviews.json','readings.json','speaking.json','constitution.json']],[])
plan={int(r['номер']):r for r in csv.DictReader((ROOT/'docs/curriculum.tsv').open(),delimiter='\t')}
word_examples=load('word-examples.json')
chains={x['n']:x for x in load('practice-chains.json')}
bank=load('exam-bank.json'); source=bank['source']; rules=bank['rules']
files={int(p.name[:4]):p for p in (SITE/'lessons').glob('*.html')}
for u in units:u.update(id=f'{u["n"]:04}',after=u['n'],kind='lesson',level=plan[u['n']]['уровень'],url=files[u['n']].relative_to(SITE).as_posix())
for u in extra:u['url']='practice/'+u['id']+'.html'
priority={'constitution':1,'reading':2,'speaking':3,'review':4,'checkpoint':5}
routes=[]
for u in units:routes.append(u);routes+=sorted([x for x in extra if x['after']==u['n']],key=lambda x:priority[x['kind']])
route_by={u['id']:i for i,u in enumerate(routes)}
review_schedule={u['id']:[] for u in routes}
active_first={}
for i,u in enumerate(routes):
 for a,b in u['words']:
  key=a.lower().replace('և','եւ')
  if key in active_first:continue
  targets=[i+gap for gap in (1,3,7,14,28)]
  active_first[key]={'first':u,'targets':[routes[j]['id'] for j in targets if j<len(routes)],'later':sum(j>=len(routes) for j in targets)}
  for stage,j in enumerate(targets):
   if j<len(routes):review_schedule[routes[j]['id']].append((a,b,u,stage))
worddata=json.loads(subprocess.check_output(['node','-e',"const fs=require('fs'),vm=require('vm');const c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c);process.stdout.write(JSON.stringify(c.window.VOCAB));",str(SITE/'assets/vocab-data.js')],text=True))
# Existing word ids are authoritative. New practice vocabulary is tracked independently when not in this dictionary.
def normalize(s):return re.sub('[՞՛՜։]','',s.lower()).replace('և','եւ')
byhy={}
for w in worddata:byhy.setdefault(normalize(w['hy']),w)

def rel(target,page):return os.path.relpath(SITE/target,(SITE/page).parent)
def nav(page):
 return '<nav class="course-nav" aria-label="Разделы курса">'+''.join(f'<a href="{rel(p,page)}">{label}</a>' for p,label in [('reference/curriculum.html','Программа'),('tracks.html#reading','Чтение'),('tracks.html#constitution','Конституция'),('tracks.html#speaking','Речь'),('active-vocabulary.html','Активные слова'),('progress.html','Прогресс')])+'</nav>'
def route_title(u):return str(u['n'])+'. '+plan[u['n']]['практическая тема'] if u['kind']=='lesson' else u['title']
def route_nav(u):
 idx=route_by[u['id']]; parts=[]
 if idx:parts.append(f'<a class="btn btn--ghost" href="{rel(routes[idx-1]["url"],u["url"])}">Назад: {e(route_title(routes[idx-1]))}</a>')
 parts.append(f'<a class="btn btn--ghost" href="{rel("reference/curriculum.html",u["url"])}">Программа</a>')
 if idx+1<len(routes):parts.append(f'<a class="btn btn--primary" href="{rel(routes[idx+1]["url"],u["url"])}">Далее: {e(route_title(routes[idx+1]))}</a>')
 return '<nav class="lnav lnav--bar" aria-label="Порядок занятий">'+''.join(parts)+'</nav>'
def page(title,body,path,id_='',wide=False,more=''):
 return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{e(title)} · Հայերեն</title><link rel="stylesheet" href="{rel('assets/style.css',path)}"><link rel="stylesheet" href="{rel('assets/course.css',path)}"></head><body>
<header class="topbar"><div class="topbar__in"><a class="brand" href="{rel('index.html',path)}"><span class="brand__mark" lang="hy">Հ</span> Հայերեն</a><div class="topbar__spacer"></div><a href="{rel('reference/curriculum.html',path)}">A1 · A2 · B1</a></div></header>
<main class="wrap {'wrap--wide' if wide else ''}" data-course-id="{e(id_)}">{nav(path)}<h1>{e(title)}</h1>{body}<p class="muted" data-save-status role="status"></p></main>
<script src="{rel('assets/app.js',path)}" defer></script><script src="{rel('assets/course.js',path)}" defer></script>{more}</body></html>'''
def choice(prompt,opts,correct=0):
 # Deterministic rotation avoids always placing the correct choice first.
 offset=sum(map(ord,prompt))%len(opts); order=list(range(len(opts)));order=order[offset:]+order[:offset]
 return '<div class="quiz" data-quiz><p class="quiz__q">'+prose(prompt)+'</p><div class="quiz__opts">'+''.join(f'<button type="button" class="opt" data-correct="{str(i==correct).lower()}">{prose(opts[i])}</button>' for i in order)+'</div><p class="quiz__fb" data-fb role="status"></p></div>'
def typed(prompt,answer,hint='Сверь задание и форму ответа. Если нужна помощь, открой «Посмотреть ответ» ниже.'):
 language='ru' if re.search('[А-Яа-яЁё]',answer) else 'hy'
 first=answer.split('|')[0]
 if re.fullmatch(r'[0-9:]+',first):form='Введи ответ цифрами.'
 elif ('...' in prompt or '…' in prompt) and len(first.split())<=2:form='Введи только пропущенную часть.'
 elif all(len(a.split())==1 for a in answer.split('|')):form='Введи только ответ, без пояснений.'
 else:form='Введи ответ целиком, без пояснений.'
 return f'<div class="quiz" data-quiz="type" data-answer="{e(answer)}" data-hint="{e(hint)}"><label><span class="quiz__q">{prose(prompt)}</span><input class="inp hy" lang="{language}" data-input autocomplete="off" aria-label="{e(prompt)}"></label><p class="muted quiz-format">{form} {"Язык ответа: русский." if language=="ru" else "Язык ответа: армянский." if re.search("[Ա-ֆ]",answer) else ""} Регистр и пунктуация не влияют на проверку.</p><button class="btn btn--primary" data-check>Проверить</button><p class="quiz__fb" data-fb role="status"></p><details class="answer-help"><summary>Посмотреть ответ</summary><p lang="{language}" class="reading-text">{e(answer.split("|")[0])}</p><p>Это образец для данного задания. Проверка сравнивает с записанными вариантами; другие верные формулировки могут не распознаться.</p></details></div>'
def words(u):
 rows=[]
 for a,b in u['words']:
  w=byhy.get(normalize(a));button=f'<button class="flearn" type="button" data-learn="{w["id"]}" aria-pressed="false">выучил</button>' if w else f'<button class="flearn" data-track-complete="word:{e(a)}" data-label="Помню" aria-pressed="false">Помню</button>'
  rows.append(f'<tr><td lang="hy" class="hy">{e(a)}</td><td>{e(b)}</td><td>{button}</td></tr>')
 return '<div class="course-table-scroll"><table class="tbl course-words"><thead><tr><th>Опора</th><th>Смысл здесь</th><th>Память</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table></div>'
def order(sentence,tokens=None,prompt=None):
 separator=' '
 if tokens is None:
  tokens=sentence.split()
  if len(tokens)==1:tokens=re.findall('ու|.',sentence);separator=''
 prompt=prompt or ('Собери слово из букв.' if not separator else 'Восстанови фразу образца.')
 return f'<div class="quiz" data-order data-separator="{separator}" data-answer="{e(sentence)}"><p>{prose(prompt)} Нажимай элементы по порядку; повторный клик возвращает элемент.</p><div class="word-bank" data-bank>'+''.join(f'<button type="button" class="btn btn--ghost" data-token="{i}">{e(tokens[i])}</button>' for i in reversed(range(len(tokens))))+'</div><div class="built-answer" data-built aria-label="Собранный ответ"></div><button class="btn btn--primary" data-order-check>Проверить порядок</button> <button class="btn btn--ghost" data-order-reset>Очистить</button><p data-order-feedback role="status"></p></div>'
def reading_html(u):return '<div class="reading-text" lang="hy">'+''.join('<p>'+e(p)+'</p>' for p in u['text'])+'</div>'
def marked(label,key):return f'<button class="btn btn--ghost" data-track-complete="{e(key)}" data-label="{e(label)}" aria-pressed="false">{e(label)}</button>'
def matching(pairs):
 return '<div class="quiz" data-match><p>Сопоставь армянские опоры с русскими значениями. Каждое значение используется один раз.</p>'+''.join('<label class="match-row">'+str(i+1)+'. '+hy(a)+f'<select data-expected="{i}" aria-label="Значение {e(a)}"><option value="">Выбери значение</option>'+''.join(f'<option value="{j}">{e(pairs[j][1])}</option>' for j in reversed(range(len(pairs))))+'</select></label>' for i,(a,b) in enumerate(pairs))+'<button class="btn btn--primary" data-match-check>Проверить пары</button><p data-match-feedback role="status"></p></div>'
def activities(u):
 s=choice(u['gist'][0],u['gist'][1:])+typed(u['detail'],u['answer'])+typed(u['change'],u['changed'])
 if u['kind']=='lesson':
  c=chains[u['n']]
  title='Прочитай и вспомни' if u['n']<=3 else 'Вспомни готовые реплики' if u['n']==4 else 'Измени фразу шаг за шагом'
  instruction='Выполни три коротких задания. После проверки закрой ответ и произнеси его ещё раз.' if u['n']<=4 else 'Каждый следующий шаг меняет предыдущий ответ. После проверки скажи результат без текста.'
  s+='<h3>'+title+'</h3><p>'+instruction+'</p><p class="reading-text" lang="hy">'+e(c['base'])+'</p>'
  s+=''.join(typed(str(i+1)+'. '+q,a) for i,(q,a) in enumerate(c['steps']))
 else:
  for a,b in u['words'][:2]:s+=typed('Вспомни опорное слово: '+b+'.',a)
 sentence=u['changed'].split('|')[0]
 s+=order(sentence)
 if u['kind']!='lesson' or u['n']%4==0:s+=matching(u['words'][:3])
 for t in u.get('tasks',[]):
  if t['kind']=='choice':s+=choice(t['q'],t['options'])
  elif t['kind']=='order':s+=order(' '.join(t['items']),t['items'],t['q'])
  else:s+=typed(t['q'],t['answer'])
 return s

def spaced(u):
 rows=review_schedule[u['id']]
 if not rows:return ''
 s=f'<details class="card" id="spaced"><summary>Повторение слов: {len(rows)} опор из прошлых занятий</summary><p>В каждом задании выбери перевод кнопкой или введи армянское слово по русскому значению. Если слов больше 12, можно выполнить только первые 12 и вернуться к остальным позже. Под заданием открой «Слово и пример из прошлого урока», чтобы проверить себя. Повторы назначены через 1, 3, 7, 14 и 28 занятий; номер занятия не равен календарному дню.</p>'
 for a,b,origin,stage in rows:
  context=next((s for s in re.split(r'(?<=։)\s*',' '.join(origin['text'])) if a.lower() in s.lower()),word_examples.get(a,a))
  if stage%2==0:s+=typed('Вспомни по смыслу «'+b+'» слово или сочетание из занятия «'+origin['title']+'».',a)
  else:
   alternatives=[x[1] for x in origin['words'] if x[1]!=b][:2]
   s+=choice('Сопоставь с русским смыслом: '+a+'.',[b]+alternatives)
  s+='<details><summary>Слово и пример из прошлого урока</summary><p>'+hy(a)+' — '+e(b)+'</p><p lang="hy" class="reading-text">'+e(context)+'</p><p>Прочитай слово и пример вслух. Закрой подсказку и назови перевод ещё раз. Если уже умеешь, составь с этим словом свою фразу устно.</p><a href="'+rel(origin['url'],u['url'])+'#practice">Первое введение</a></details>'
 return s+'</details>'

def cumulative(u):
 n=u['after'];nums=sorted(set(k for k in [n-1,n-4,n-10,5 if n>16 else 0,15 if n>34 else 0] if k>0))
 if not nums:return ''
 blocks=[]
 for k in nums:
  c=chains[k];q,a=c['steps'][-1]
  if k==1:q='Напиши по памяти слово «луна», которое разбирали в уроке 1.'
  elif k==2:q='Напиши по памяти слово «хлеб» из урока 2.'
  elif k==4:q='Напиши готовую реплику «Я не понял» из урока 4.'
  context='' if k<=4 else '<p>Исходная фраза для этого задания: '+hy(c['base'] if k==52 else c['steps'][-2][1].split('|')[0])+'</p>'
  help_='<details><summary>Вспомнить материал урока '+str(k)+'</summary><p>Образец из урока: '+hy(c['base'])+'</p><a href="'+rel(files[k].relative_to(SITE).as_posix(),u['url'])+'#practice">Открыть практику урока '+str(k)+'</a></details>'
  blocks.append('<div class="review-task">'+context+typed('Урок '+str(k)+': '+q,a)+help_+'</div>')
 return '<section class="card"><h2>Повторение прошлых уроков</h2><p>Это отдельные задания. В каждом прочитай условие и введи ответ на армянском. Если дана исходная фраза, измени её по условию; остальные слова сохрани. Если забыл материал, открой подсказку под заданием или перейди в указанный урок.</p>'+''.join(blocks)+'<p>После проверки прочитай ответы вслух. Через два дня выполни эти задания снова без подсказок.</p></section>'

# Mechanical reference validation drafted with Grok CLI; reviewed locally.
def resolve_review_questions(question_ids, questions, allowed_topics):
    seen = set()
    by_id = {q["id"]: q for q in questions}
    resolved = []
    for qid in question_ids:
        if qid in seen:
            raise ValueError(qid)
        seen.add(qid)
        question = by_id.get(qid)
        if question is None:
            raise ValueError(qid)
        if question["topic"] not in allowed_topics:
            raise ValueError(question["topic"])
        resolved.append(question)
    return resolved

def constitution_review(u):
 block=u.get('constitution_review')
 if not block:
  if u['kind']=='review' and u['after']>=6:raise ValueError('Missing Constitution review: '+u['id'])
  return ''
 studied={x['topic']:x for x in extra if x['kind']=='constitution' and x['after']<=u['after']}
 questions=resolve_review_questions(block['question_ids'],bank['questions'],studied)
 s='<section class="card" id="constitution-review"><h2>Конституция: вспомни изученное</h2><p>Сначала ответь по памяти. После ответа открой разбор, прочитай трудную фразу вслух и объясни смысл своими словами.</p>'
 for prompt,answer in block.get('recall',[]):s+=typed(prompt,answer,'Вернись к блоку государственных слов в указанном уроке.')
 for q in questions:
  lesson=studied[q['topic']]
  s+=f'<div data-review-question="{q["id"]}" data-review-topic="{q["topic"]}">'+choice(q['q'],q['options'],q['answer'])
  s+='<details><summary>Разбор и источник</summary><p>'+prose(q['explanation'])+'</p><p><a href="'+e(q['source'])+'">Статья '+e(q['article'])+'</a> · <a href="'+rel(lesson['url'],u['url'])+'">Вернуться к изученной теме</a></p></details></div>'
 s+='<h3>Ответь без готового текста</h3><p>'+prose(block['speech'])+'</p><label>Своя короткая реплика<textarea lang="hy" data-self="constitution-reply"></textarea></label><details><summary>Образец для самопроверки</summary><p lang="hy" class="reading-text">'+e(block['model'])+'</p><p>Сохрани смысл. Дословное совпадение с образцом не требуется.</p></details>'
 return s+'</section>'

# Mechanical selection drafted with Grok CLI; reviewed locally.
def last_studied_topic(topics, lesson_number):
    chosen = None
    for topic in topics:
        if topic["kind"] != "constitution":
            continue
        after = topic["after"]
        if after >= lesson_number:
            continue
        if chosen is None or after > chosen["after"]:
            chosen = topic
    return chosen


def constitution_bridge(u):
 if u['n']<6:return ''
 # Only a few early terms; later reuse the actual study pages.
 early={6:('Հայաստան','Армения'),7:('Հանրապետություն','республика'),8:('Հայաստանի Հանրապետություն','Республика Армения'),9:('քաղաքացի','гражданин'),10:('պետություն','государство'),11:('Սահմանադրություն','Конституция'),12:('օրենք','закон'),13:('քաղաքացու','гражданина')}
 if u['n'] in early:
  a,b=early[u['n']];return f'<section class="card card--soft"><h2>Государственные слова понемногу</h2><p>{hy(a)} — {e(b)}. Прочитай, закрой строку и назови значение по памяти.</p>'+f'<p>После урока 12: <a href="{rel("practice/constitution-01.html",u["url"])}">Конституция 1</a>.</p></section>'
 latest=last_studied_topic(extra,u['n'])
 if latest is None:return ''
 return f'<section class="card card--soft" data-constitution-return="{latest["id"]}"><h2>Вернись к Конституции</h2><p>Прочитай название последней темы, вспомни два слова и объясни одно положение своими словами: <a href="{rel(latest["url"],u["url"])}">{e(latest["title"])}</a>.</p></section>'

def checkpoint(u):
 lv=u['level'];writing={'A1':'Напиши 5–7 предложений: имя, город, занятие сегодня, что есть дома, один план. Затем добавь короткий заказ напитка.','A2':'Напиши сообщение на 60–90 слов: не можешь прийти, объясни причину, предложи два времени и попроси подтвердить.','B1':'Напиши 120–160 слов: опиши проблему с документом, объясни предпринятые действия, запроси уточнение и предложи следующий шаг. Отдельно сформулируй мнение и обоснуй его.'}[lv]
 notices={'A1':('Սուրճ՝ 700 դրամ։ Թեյ՝ 500 դրամ։ Ջուր՝ 300 դրամ։','Сколько стоят чай и вода вместе?','800|ութ հարյուր'), 'A2':('Ընդունելություն՝ երկուշաբթի և ուրբաթ։ Ժամեր՝ 09:00–17:00։ Ընդմիջում՝ 13:00–14:00։','Можно ли рассчитывать на приём в пятницу в 13:30? Напиши այո или ոչ.','ոչ'), 'B1':('Խնդրում ենք ուղարկել փաստաթղթի պատճենը և այցելության ժամանակ ներկայացնել բնօրինակը։','Что нужно предъявить при визите? Напиши словарную форму.','բնօրինակ')}
 notice,q,a=notices[lv]
 samples={'A1':'Ի՞նչ է քո անունը։ Որտե՞ղ ես ապրում։ Ի՞նչ ես անում այսօր։ Ի՞նչ կխմես։','A2':'Ինչո՞ւ երեկ չեկար։ Ե՞րբ կարող ես գալ։ Եթե ուշանաս, ի՞նչ կանես։','B1':'Ի՞նչ էր պատահել։ Ինչպե՞ս լուծեցիր խնդիրը։ Ո՞ր տարբերակն ես նախընտրում և ինչո՞ւ։'}
 s=f'<section class="card"><h2>Ещё одна ситуация без подготовки</h2><p lang="hy" class="reading-text">{e(notice)}</p>{typed(q,a)}<p>Это отдельная учебная вывеска/сообщение. Перескажи её смысл по-русски.</p><h3>Ответь собеседнику</h3><p lang="hy" class="reading-text">{e(samples[lv])}</p><p>Закрой письменные вопросы после первого прочтения и ответь вслух.</p></section>'
 s+=f'<section class="card"><h2>Письмо</h2><p>{writing}</p><label>Твой текст<textarea lang="hy" data-self="writing" placeholder="Пиши здесь. Сохраняется при вводе."></textarea></label></section>'
 checks=['Понял общий смысл без перевода каждого слова','Нашёл кто, что, где и когда; не пропустил отрицание','Ответил на вопросы по тексту без подсматривания','Прочитал вслух связно и сохранил окончания','Ответил о себе без готового текста','В письме понятны ситуация и просьба','Объяснил, что не понял, и попросил уточнить']
 s+='<section class="card self-list"><h2>Самооценка по навыкам</h2>'+''.join(f'<label><input type="checkbox" data-self="skill-{i}">{v}</label>' for i,v in enumerate(checks))+'<p><strong>Как принять решение:</strong> в проверяемой части цель — не менее 80% в новой попытке без подсказок. В письме и речи должны быть понятны все запрошенные пункты. Если один навык пока не получается, повтори связанные уроки и вернись через 2–3 дня. Это ориентир курса, не официальный порог CEFR.</p><p>Понимание живой речи оценивается отдельно: попроси собеседника или голосовую модель прочитать неизвестный тебе текст этого уровня, ответь на вопросы без письменной версии. Чтение вслух само по себе не подтверждает аудирование.</p></section>'
 if u.get('legal'):
  law=u['legal'];s+='<section class="card"><h2>'+e(law['title'])+'</h2><p>'+prose(law['support'])+'</p><blockquote lang="hy" class="reading-text">'+e(law['text'])+'</blockquote><p><a href="'+e(law['source'])+'">Официальный текст Конституции</a></p>'+''.join(choice(q['q'],q['options']) for q in law['questions'])+'</section>'
 if lv=='B1':s+='<section class="card"><h2>Самостоятельный пересказ и мнение</h2><p>За 3 минуты перескажи большой текст без подсказок: события, причина проблемы, действия и итог. Затем за 2 минуты сравни два способа решения и обоснуй свой выбор двумя доводами. Запиши себя и проверь, понятны ли эти пункты слушателю.</p></section>'
 if lv!='A1':s+=f'<section class="card"><h2>Конституция</h2><p>Пройди {"до 10 вопросов по изученным темам" if lv=="A2" else "полный пробный экзамен"} в <a href="{rel("exam.html",u["url"])+("?topics=1,2,3,4,5" if lv=="A2" else "")}">тренажёре</a>. После каждого неверного ответа найди правило в статье. Результат сохраняется отдельно от языковой контрольной.</p></section>'
 return s

def news(u):
 if not u.get('news'):return ''
 n=u['news'];return '<section class="card"><h2>'+e(n['title'])+'</h2><p>'+e(n['support'])+'</p><blockquote lang="hy" class="reading-text">'+e(n['quote'])+'</blockquote><p><a href="'+n['source']+'">МВД Армении, '+n['date']+'</a></p><h3>Учебная адаптация</h3>'+''.join('<p lang="hy" class="reading-text">'+e(t)+'</p>' for t in n['text'])+typed(n['question'],n['answer'])+choice('Какой вывод подтверждён сообщением?',n.get('conclusion',['Условия зависят в том числе от вида выборов','Временная защита автоматически равна гражданству','Возраст не упоминается']))+'</section>'
def supplement(u):
 label='Чтение и практика' if u['kind']=='lesson' else 'Практика текста'
 s=f'<div class="course-practice" id="practice" data-unit="{u["id"]}"><section class="card"><p class="eyebrow">{e(label)} · {u["level"]}</p><h2>{e(u["title"])}</h2><p>Первый проход: пойми ситуацию. Второй: найди нужную деталь. Затем закрой текст и скажи своё.</p>{words(u)}<div class="note note--tip"><p>{prose(u["support"])}</p></div>{reading_html(u)}{marked("Чтение выполнено",u["id"]+":reading")}</section>'
 if u.get('source_url'):s+='<p><a href="'+e(u['source_url'])+'">'+e(u['source_note'])+'</a></p>'
 s+='<section class="card"><h2>Понять и использовать</h2>'+activities(u)+'</section>'
 aloud_part='слова и короткие фразы' if u['kind']=='lesson' and u['n']<=3 else 'реплики' if u['kind']=='lesson' and u['n']==4 else 'первый абзац'
 s+=f'<section class="card"><h2>Прочитай вслух и скажи сам</h2><ol><li>Прочитай {aloud_part} медленно, затем в обычном темпе, затем без остановок.</li><li>Закрой текст. Воспроизведи смысл знакомыми словами.</li><li>{prose(u["speech"])}</li></ol><details><summary>Один возможный ответ</summary><p class="reading-text" lang="hy">{e(u["model"])}</p><p>Другие грамматически верные ответы тоже подходят. Здесь оценивается смысл, а не совпадение с образцом.</p></details><label>Своя короткая реплика<textarea lang="hy" data-self="reply"></textarea></label>{marked("Речь выполнена",u["id"]+":speaking")}<details><summary>Практика с голосовой моделью</summary><p>Проведи со мной пятиминутный диалог по этому тексту на восточноармянском. Задавай по одному вопросу. Используй лексику текущего и предыдущих уроков. Дай мне ответить без подсказки, затем поправь одну-две существенные ошибки. Армянские слова записывай только армянским алфавитом. Если доступна моя аудиозапись, помоги заметить неясные звуки; если доступна только расшифровка, не оценивай произношение по ней.</p></details></section>'
 if u['kind']=='lesson':
  s+=constitution_bridge(u)
  if u['n']>4:s+=cumulative(u)
 s+=spaced(u)
 if u['kind'] in ['review','checkpoint']:s+=cumulative(u)
 if u['kind']=='review':s+=constitution_review(u)
 if u['kind']=='checkpoint':s+=checkpoint(u)
 if u['kind']=='constitution':
  s+=f'<section class="card"><h2>Подлинная формулировка</h2><p>Статья {e(u["article"])}. В цитате унифицирован конечный знак препинания.</p><blockquote lang="hy" class="reading-text">{e(u["original"])}</blockquote><details{" open" if u["level"]=="A1" else ""}><summary>Русский смысл</summary><p>{e(u["meaning"])}</p></details><p><a href="{source}">Полный текст Конституции с изменениями 2020 года</a>. Объяснения и упрощённые предложения выше — учебная адаптация.</p></section>'
  qs=[q for q in bank['questions'] if q['topic']==u['topic']]
  # Rules before questions, with explicit source references; broader facts are supported, not presumed known.
  s+='<details class="card"><summary>Дополнительный разбор экзаменационных формулировок</summary><p>На A1 достаточно простого текста и заданий выше. Этот разбор сложнее; можно вернуться к нему на A2. Термины разбирай по русским пояснениям перед вопросами.</p><h2>Опоры для экзаменационных формулировок</h2><p>Сначала изучи пояснения. Длинные формулировки можно разбирать в отдельной сессии.</p><ul>'+''.join(f'<li>{prose(q["explanation"])} <a href="{source}">Статья {q["article"]}</a></li>' for q in qs)+'</ul><h3>Вопросы по теме</h3><p>Авторская тренировка по Конституции. Это не подтверждённый официальный банк билетов.</p>'+''.join(choice(q['q'],q['options'],q['answer']) for q in qs)+f'<a href="{rel("exam.html",u["url"])}">Экзаменационная тренировка со статистикой</a></details>'
 if u['id']=='reading-05':
  original='Ազգային ժողովի ընտրության կամ հանրաքվեի օրը տասնութ տարին լրացած Հայաստանի Հանրապետության քաղաքացիներն ունեն ընտրելու և հանրաքվեին մասնակցելու իրավունք։'
  s+=f'<section class="card"><h2>Подлинный государственный текст</h2><p>Конституция, статья 48.1. Сначала прочитай без словаря.</p><blockquote class="reading-text" lang="hy">{original}</blockquote>{choice("Какие два условия прямо названы в этом фрагменте?",["Гражданство РА и 18 лет на день выборов/референдума","Проживание в Ереване и работа","Любое гражданство и 21 год"])}<details><summary>Проверка понимания</summary><p>Право принадлежит гражданам РА, достигшим 18 лет на день выборов или референдума. Ограничения перечислены в части 4 той же статьи. Տարին լրացած — достигший возраста. Не подменяй гражданство местом проживания.</p></details><p><a href="{source}">Прочитай статью полностью</a>.</p></section>'
 if u['id']=='reading-06':
  original='Յուրաքանչյուր ոք ունի վարչական մարմինների կողմից իրեն առնչվող գործերի անաչառ, արդարացի և ողջամիտ ժամկետում քննության իրավունք։'
  s+=f'<section class="card"><h2>Оригинал после длинного чтения</h2><blockquote class="reading-text" lang="hy">{original}</blockquote><p>Статья 50.1 Конституции. Найди три требования к рассмотрению дела и перескажи их. Затем открой <a href="{source}">статьи 50 и 53 полностью</a> и найди право обращения.</p><details><summary>Ключ к смыслу</summary><p>Беспристрастно, справедливо и в разумный срок. Конкретное число дней в этом предложении не названо.</p></details></section>'
 return s+news(u)+'</div>'

# Public additions.
(SITE/'practice').mkdir(exist_ok=True)
for u in extra:
 body=f'<p class="lead">{u["level"]} · после урока {u["after"]}. Это отдельное занятие; его можно пройти за несколько сессий.</p>'+supplement(u)+f'<p>Счёт проверяемых заданий: <b data-score>0 / 0</b>. Письмо и речь оцениваются отдельно.</p><button class="btn btn--primary" data-complete="{u["id"]}">Отметить занятие пройденным</button>'+route_nav(u)
 (SITE/u['url']).write_text(page(u['title'],body,u['url'],u['id']))

# Add content without regenerating existing lessons.
for u in units:
 path=files[u['n']];s=path.read_text();s=re.sub(r'\n?<!-- COURSE-PRACTICE START -->.*?<!-- COURSE-PRACTICE END -->\n?', '\n',s,flags=re.S)
 block='\n<!-- COURSE-PRACTICE START -->\n'+supplement(u)+'\n<p class="muted" data-save-status role="status"></p>\n<!-- COURSE-PRACTICE END -->\n'
 matches=list(re.finditer(r'<button\b[^>]*data-complete=',s));assert matches,path
 pos=matches[-1].start()
 # Insert before the containing paragraph, so block sections are never nested in a p.
 prefix=s[:pos]; opening=re.search(r'<p(?: [^>]*)?>\s*$',prefix)
 if opening:pos=opening.start()
 s=s[:pos].rstrip()+block+s[pos:]
 s=re.sub(r'<main([^>]*?)(?: data-course-id="[^"]*")?>',lambda m:'<main'+re.sub(r' data-course-id="[^"]*"','',m[1])+f' data-course-id="{u["id"]}">',s,count=1)
 s=re.sub(r'<!-- COURSE-NAV START -->.*?<!-- COURSE-NAV END -->','',s,flags=re.S)
 s=re.sub(r'(<main[^>]*>)',r'\1'+'<!-- COURSE-NAV START -->'+nav(u['url'])+'<p><a href="#practice">Чтение и речь этого урока</a></p><!-- COURSE-NAV END -->',s,count=1)
 s=re.sub(r'<nav class="lnav\b[^\"]*"[^>]*>.*?</nav>',lambda _:route_nav(u),s,flags=re.S)
 if '../assets/course.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="../assets/course.css">\n</head>')
 if '../assets/course.js' not in s:s=s.replace('</body>','<script src="../assets/course.js" defer></script>\n</body>')
 path.write_text("\n".join(line.rstrip() for line in s.splitlines())+"\n")

# Course table, in the actual traversal order.
body=f'<p class="lead">58 основных уроков и {len(extra)} дополнительных занятий. Чтение, речь и Конституция развиваются параллельно. Отметки о прохождении не являются подтверждением уровня B1.</p><p><a href="#A1">A1</a> · <a href="#A2">A2</a> · <a href="#B1">B1</a> · <a href="../tracks.html">Дополнительные занятия по направлениям</a></p>'
for lv in ['A1','A2','B1']:
 items=[r for r in routes if r['level']==lv];body+=f'<section id="{lv}"><h2>{lv} · {len(items)} занятий</h2><div class="course-table-scroll" tabindex="0" aria-label="Таблица программы {lv}"><table class="tbl course-table"><thead><tr>'+''.join('<th>'+x+'</th>' for x in ['№','Тема','Грамматика','Опорная лексика','Чтение','Чтение вслух / речь','Конституция','Повторение'])+'</tr></thead><tbody>'
 for r in items:
  p=plan[r['n']];ordinary=r['kind']=='lesson'
  cells=[str(r['n']) if ordinary else 'После '+str(r['n']), f'<a href="{rel(r["url"],"reference/curriculum.html")}">{e(p["практическая тема"] if ordinary else r["title"])}</a>',e(p['грамматика'] if ordinary else r['grammar']),', '.join(hy(w[0]) for w in r['words']),e(r['title']),e(p['речь'] if ordinary else r['speech']),e(p['Конституция'] if ordinary else r['constitution_goal']),e(p['повторение'] if ordinary else r['review_goal'])]
  body+=f'<tr class="{"" if ordinary else "route-extra"}" data-lesson="{r["id"]}">'+''.join('<td>'+c+'</td>' for c in cells)+'</tr>'
 body+='</tbody></table></div></section>'
body+='<section class="card"><h2>Учебный день: выбирай блоки</h2><p>Ориентир — 2–3 часа, около пяти дней в неделю. Основной урок 30–50 минут, упражнения и повторение 20–30, словарь 15–25, чтение 30–60, речь 15–30. Конституция 20–40 минут заменяет часть чтения или практики; не нужно складывать максимумы всех блоков.</p><p>Минимальная сессия: один небольшой блок и его воспроизведение по памяти. Номер урока не равен дню; длинный урок можно растянуть на два дня. После контрольной точки возвращайся к слабому навыку.</p></section>'
(SITE/'reference/curriculum.html').write_text(page('Программа курса: читать, говорить, понимать',body,'reference/curriculum.html',wide=True))

body='<p class="lead">Выбирай уровень и продолжай после указанного основного урока. Все материалы доступны офлайн, кроме переходов к внешним источникам и аудио.</p>'
for kind,label in [('reading','Большое чтение'),('speaking','Речевые мастерские'),('constitution','Конституция'),('review','Повторения'),('checkpoint','Контрольные точки')]:
 body+=f'<section id="{kind}"><h2>{label}</h2><div class="grid grid--auto">'+''.join(f'<a class="tile" href="{r["url"]}" data-lesson="{r["id"]}"><span class="tile__title">{e(r["title"])}</span><span class="tile__meta">{r["level"]} · после урока {r["after"]}</span><span data-check-slot></span></a>' for r in routes if r['kind']==kind)+'</div></section>'
body+='<p><a class="btn btn--primary" href="exam.html">Экзаменационная тренировка</a></p>'
(SITE/'tracks.html').write_text(page('Чтение, речь и Конституция',body,'tracks.html',wide=True))

# Active vocabulary is a deliberate short set, not a target to learn all 2,869 entries.
active={}
for u in routes:
 for a,b in u['words']:
  k=normalize(a)
  if k not in active:active[k]=dict(hy=a,ru=b,level=u['level'],url=u['url'],units=[],example='')
  active[k]['units'].append(u['id'])
  if not active[k]['example']:
   for sentence in re.split(r'(?<=։)\s*',' '.join(u['text'])):
    if normalize(a) in normalize(sentence) and len(sentence)<260:active[k]['example']=sentence;break
for w in active.values():
 if not w['example']:w['example']=word_examples.get(w['hy'],'')
body=f'<p class="lead">{len(active)} опорных слов и сочетаний для активного повторения. Большой словарь остаётся справочником. Здесь видны первое введение и возвращение к слову в занятиях.</p><p>Начни с 8–12 слов за сессию. Скажи свою фразу и повтори через два дня, затем через неделю. Слова с одинаковым написанием могут иметь разные значения; перевод ниже относится к первому контексту.</p>'
for lv in ['A1','A2','B1']:
 items=[v for v in active.values() if v['level']==lv];body+=f'<section><h2>{lv}: {len(items)} новых опор</h2><div class="course-table-scroll"><table class="tbl"><thead><tr><th>Слово</th><th>Смысл</th><th>Контекст и повторение</th><th>Память</th></tr></thead><tbody>'
 for w in items:
  old=byhy.get(normalize(w['hy']));button=f'<button class="flearn" data-learn="{old["id"]}" aria-pressed="false">выучил</button>' if old else marked('Помню','word:'+w['hy'])
  refs=[]
  schedule=active_first[w['hy'].lower().replace('և','եւ')]
  w['reviews']=schedule['targets'];w['after_course_reviews']=schedule['later']
  for id_ in dict.fromkeys(w['units']+w['reviews']):
   r=next(r for r in routes if r['id']==id_);refs.append(f'<a href="{r["url"]}#practice">{e(route_title(r))}</a>')
  if schedule['later']:refs.append('После курса: ещё '+str(schedule['later'])+' повторения через 2, 7, 14, 28 и 60 дней, выбирая первые нужные интервалы.')
  body+=f'<tr><td>{hy(w["hy"])}</td><td>{e(w["ru"])}</td><td>{hy(w["example"])}<br>'+', '.join(refs)+f'</td><td>{button}</td></tr>'
 body+='</tbody></table></div></section>'
body+='<section class="card"><h2>Повторение после курса</h2><p>У последних слов часть пяти повторений выходит за конец маршрута. В отмеченные выше дни закрой столбец смысла, назови его по памяти, прочитай пример и ответь о себе одной новой фразой. Затем скрой армянское слово и восстанови его письменно. Отложи выученные; трудные верни на следующий день. Повторяй по 8–12 слов, пока для каждой опоры не пройдены все пять возвращений.</p></section><p><a href="vocabulary.html">Полный словарь и карточки с транскрипцией</a></p>'
(SITE/'active-vocabulary.html').write_text(page('Активный словарь',body,'active-vocabulary.html',wide=True))
dump(CONTENT/'active-vocabulary.json',list(active.values()))

body='<p class="lead">Уроки, дополнительные занятия и результаты практики хранятся в этом браузере. Отметка означает выполненное занятие, а не подтверждённый языковой уровень.</p><section class="card"><h2>Резервная копия</h2><p>Сохраняет слова, уроки, чтение, речь, черновики, самооценку и результаты экзамена. Импорт объединяет данные. Текущая незавершённая экзаменационная сессия не переносится.</p><button class="btn btn--primary" data-export-all>Скачать весь прогресс</button><label class="btn btn--ghost">Загрузить копию<input type="file" accept="application/json,.json" data-import-all></label><p data-save-status role="status"></p><p>Для проверки в браузере можно открыть папку через локальный сервер. При открытии файлов напрямую сохранение зависит от браузера; перед переносом сделай резервную копию.</p></section><div data-progress-details></div><p><a href="exam.html#statistics">Статистика экзамена</a></p>'
route_data=[dict(id=r['id'],url=r['url'],title=(str(r['n'])+'. '+plan[r['n']]['практическая тема']) if r['kind']=='lesson' else r['title'],level=r['level'],kind=r['kind'],after=r['after']) for r in routes]
(SITE/'assets/routes.js').write_text('window.HY_ROUTES='+json.dumps(route_data,ensure_ascii=False)+';\n')
(SITE/'progress.html').write_text(page('Мой прогресс',body,'progress.html',wide=True,more='<script src="assets/routes.js"></script>'))

body=f'''<p class="lead">{len(bank['questions'])} авторских вопросов по действующей Конституции. Тренировка помогает читать формулировки; этот банк не является подтверждённым официальным набором билетов.</p>
<section class="card"><h2>Правила пробного экзамена</h2><p><strong>{rules['questionCount']} случайных вопроса · {rules['durationMinutes']} минут · минимум {rules['passCount']} верных.</strong> У каждого вопроса три варианта, один правильный. В пробнике ответы и пояснения появятся после завершения. Неотвеченные вопросы считаются ошибками.</p><p>Проверено {rules['verified']}: <a href="{rules['source']}">{e(rules['provision'])}</a>. Банк службы обновляется каждые шесть месяцев. Старое постановление N 1040-Н отменено. По пункту 61 действующего порядка способность объясняться по-армянски подтверждается прохождением теста; это не означает оценку всего уровня B1.</p><details><summary>Источники и статус вопросов</summary><p><a href="{source}">Конституция с изменениями 2020 года</a> · <a href="https://migration.mia.gov.am/">Миграционная служба</a>. Актуальный полный открытый банк не найден в доступных официальных материалах. В каждом ответе дана статья. Перед реальной подачей проверь действующий порядок и материалы службы; условия курса датированы и обновляются отдельно.</p></details></section>
<section class="card" id="exam-setup"><h2>Начать попытку</h2><div class="exam-toolbar"><label>Тема тренировки <select id="exam-topic"><option value="">Все темы</option></select></label><button class="btn btn--primary" id="start-practice">Тренировка до 10 вопросов</button><button class="btn btn--ghost" id="start-mock">Полный пробный экзамен</button></div><p>Начатая попытка восстанавливается после перезагрузки. Таймер пробника продолжает идти, даже когда вкладка закрыта.</p></section>
<section id="exam-active" hidden><h2 id="exam-mode"></h2><div class="exam-status"><span id="exam-count"></span><span id="exam-time" role="timer"></span></div><div id="exam-questions"></div><button class="btn btn--primary" id="finish-exam">Завершить и показать результат</button><p>Можно завершить раньше; оставшиеся вопросы будут засчитаны как ошибки.</p></section>
<section class="card" id="exam-result" hidden><h2 id="exam-summary" tabindex="-1"></h2><p>Разбери ошибки по источнику и повтори темы с наименьшим процентом. Проходной результат здесь относится только к авторскому пробнику.</p><div id="exam-answers"></div></section><p id="exam-save" role="status"></p><section class="card" id="statistics"><h2>Статистика</h2><div id="exam-statistics"></div></section>'''
(SITE/'assets/exam-data.js').write_text('/* Author bank and dated official rules: content/exam-bank.json. */\nwindow.HY_EXAM='+json.dumps(bank,ensure_ascii=False)+';\n')
(SITE/'exam.html').write_text(page('Подготовка к экзамену по Конституции',body,'exam.html',wide=True,more='<script src="assets/exam-data.js" defer></script><script src="assets/exam.js" defer></script>'))
print('Built',len(routes),'learning pages;',len(extra),'new pages;',len(active),'active words/phrases.')

# Keep tables inside the viewport and invalidate browser caches when assets change.
import hashlib
for path in SITE.rglob('*.html'):
 s=path.read_text()
 if not re.search(r'<link\b[^>]*rel=[\"\']icon[\"\']',s):
  icon=rel('favicon.svg',path.relative_to(SITE).as_posix())
  s=s.replace('</head>',f'<link rel="icon" type="image/svg+xml" href="{icon}"></head>',1)
 def wrap_table(m):
  before=s[max(0,m.start()-160):m.start()]
  if re.search(r'<div[^>]*class="course-table-scroll"[^>]*>$',before):return m[0]
  return '<div class="course-table-scroll">'+m[0]+'</div>'
 s=re.sub(r'<table class="tbl[^\"]*"[^>]*>.*?</table>',wrap_table,s,flags=re.S)
 def version_asset(m):
  asset=SITE/'assets'/m['file'];digest=hashlib.sha256(asset.read_bytes()).hexdigest()[:10]
  return m['prefix']+'assets/'+m['file']+'?v='+digest
 s=re.sub(r'(?P<prefix>(?:\.\./)*)assets/(?P<file>[^"?]+\.(?:js|css))(?:\?v=[a-f0-9]+)?',version_asset,s)
 path.write_text("\n".join(line.rstrip() for line in s.splitlines())+"\n")

# Restore authored translation practice after generating the course sections.
import runpy
runpy.run_path(str(SITE / "tools/build_writing.py"), run_name="__main__")
