"""Read-only static course inventory; Python standard library only."""
import json, re, subprocess
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.ids=[]; self.links=[]; self.headings=[]; self.text=[]; self.attrs=[]
        self.heading=None; self.feed(source)
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); self.attrs.append((tag,a))
        if 'id' in a:self.ids.append(a['id'])
        for name in ['href','src']:
            if a.get(name):self.links.append(a[name])
        if tag in ['h1','h2','h3']:self.heading=[tag, '']
    def handle_endtag(self,tag):
        if self.heading and tag==self.heading[0]:
            self.headings.append(self.heading);self.heading=None
    def handle_data(self,s):
        self.text.append(s)
        if self.heading:self.heading[1]+=s

def inventory():
    pages={p:Page(p.read_text()) for p in SITE.rglob('*.html')}
    broken=[];dups=[];lessons=[]
    for path,p in pages.items():
        rel=path.relative_to(SITE).as_posix()
        for id_ in set(p.ids):
            if p.ids.count(id_)>1:dups.append([rel,id_])
        for link in p.links:
            u=urlsplit(link)
            if u.scheme or u.netloc:continue
            target=(path.parent / unquote(u.path)).resolve() if u.path else path
            if target.is_dir():target=target/'index.html'
            if not target.exists():broken.append([rel,link,'missing file'])
            elif u.fragment and target in pages and unquote(u.fragment) not in pages[target].ids:
                broken.append([rel,link,'missing anchor'])
        if path.parent.name=='lessons':
            source=path.read_text();txt=' '.join(p.text)
            lessons.append(dict(file=rel,title=next((x[1] for x in p.headings if x[0]=='h1'),''),headings=[x[1] for x in p.headings if x[0]=='h2'],quizzes=sum('data-quiz' in a for t,a in p.attrs),typed=sum(a.get('data-quiz')=='type' for t,a in p.attrs),cards=sum('data-flip' in a for t,a in p.attrs),aloud=txt.lower().count('вслух'),completion=[a['data-complete'] for t,a in p.attrs if 'data-complete' in a],size=len(source)))
    js="const fs=require('fs'),vm=require('vm');const c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c);console.log(JSON.stringify(c.window.VOCAB));"
    vocab=json.loads(subprocess.check_output(['node','-e',js,str(SITE/'assets/vocab-data.js')],text=True))
    data=dict(html_pages=len(pages),lessons=sorted(lessons,key=lambda x:x['file']),broken_links=broken,duplicate_ids=dups,vocabulary=dict(count=len(vocab),transcriptions=sum(bool(w.get('tr')) for w in vocab),examples=sum(bool(w.get('ex')) for w in vocab),duplicate_ids=[i for i in set(w['id'] for w in vocab) if sum(w['id']==i for w in vocab)>1]))
    out=ROOT/'docs/inventory.json';out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in data.items() if k not in ['lessons']},ensure_ascii=False))
    print('Lessons:',len(lessons),'Lesson quizzes:',sum(l['quizzes'] for l in lessons))
    if broken or dups or data['vocabulary']['duplicate_ids']:raise SystemExit(1)

if __name__=='__main__':inventory()
