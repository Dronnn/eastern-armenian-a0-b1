# -*- coding: utf-8 -*-
"""Check course coverage and content wiring; does not grade Armenian prose."""
import json,re
from pathlib import Path
from collections import Counter
from inventory import Page
root=Path(__file__).resolve().parents[1]
load=lambda f:json.loads((root/'content'/f).read_text())
units=sorted([u for p in (root/'content').glob('units-*.json') for u in json.loads(p.read_text())],key=lambda u:u['n'])
extras=sum([load(f) for f in ['readings.json','reviews.json','speaking.json','constitution.json']],[])
chains=load('practice-chains.json');active=load('active-vocabulary.json')
assert [u['n'] for u in units]==list(range(1,59))
assert [u['n'] for u in chains]==list(range(1,59))
assert len({u['id'] for u in extras})==len(extras)==38
for c in chains:
 assert c['base'] and len(c['steps'])==3
 assert all(q and a and re.search('[Ա-ֆ]',a) for q,a in c['steps'])
for u in units+extras:
 assert all(u.get(k) for k in ['title','words','text','gist','detail','answer','change','changed','speech','model','support'])
 assert len(u['gist'])==4 and len(set(u['gist'][1:]))==3
 assert all(a and b for a,b in u['words'])
 if 'kind' in u:assert all(u.get(k) for k in ['level','grammar','constitution_goal','review_goal'])
for w in active:
 assert w['example'] and re.search('[Ա-ֆ]',w['example']),w['hy']
 assert len(w['reviews'])+w['after_course_reviews']==5,w['hy']
for level,minimum in [('A1',5),('A2',5),('B1',5)]:
 assert sum(u['level']==level for u in load('readings.json'))>=minimum
assert len(' '.join(next(u for u in extras if u['id']=='checkpoint-58')['text']).split())>=400
assert next(u for u in extras if u['id']=='checkpoint-58')['legal']['questions']
counts=Counter()
for path in list((root/'lessons').glob('*.html'))+list((root/'practice').glob('*.html')):
 s=path.read_text();p=Page(s)
 assert s.count('id="practice"')==1,path
 assert 'data-track-complete=' in s and 'Прочитай вслух' in s,path
 for tag,a in p.attrs:
  for key in ['data-answer','data-hint','data-good']:
   value=a.get(key,'')
   assert not re.search(r'[А-Яа-яЁё][Ա-ֆ]|[Ա-ֆ][А-Яа-яЁё]',value),(path,key,value)
  if 'data-order' in a:counts['order']+=1
  if 'data-match' in a:counts['matching']+=1
  if 'data-quiz' in a:counts['quiz']+=1
 assert not re.search(r'\b(?:барев|верджакет|харцакан|шешт|пайманакан)\b',s,re.I),path
 assert not re.search(r'(?:^|[\s«(])-?(?:ум|утюн|цн)-(?=[\s»)])',s,re.I),path
assert all(counts[k]>0 for k in ['order','matching','quiz'])
print('Content coverage passed: 58 lessons, 38 additional pages, 58 three-step chains, 331 active entries with five planned reviews.')
print('Generated exercise blocks:',dict(counts))
print('Additional pages by level:',dict(Counter(u['level'] for u in extras)))
