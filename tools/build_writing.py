# coding: utf-8
from pathlib import Path
from html import escape
import re
root=Path(__file__).resolve().parents[1]
p=root/'assets/writing-texts.tsv'
s=p.read_text()
for line in s.splitlines():
    number, ru1, hy1, ru2, hy2=line.split('\t')
    n=int(number); page=next((root/'lessons').glob(f'{n:04}-*.html'))
    tip=''
    if n<=3:
        tip='<p>Первые шаги: пользуйся опорой. Пока запоминай эти выражения целиком; их грамматика будет дальше.</p><details data-writing-support><summary>Опора: слова и готовые фразы</summary><p lang="hy">'+escape(hy1+' '+hy2)+'</p></details>'
    parts=[]
    for step,(ru,hy) in enumerate([(ru1,hy1),(ru2,hy2)],1):
        ident=f'writing-{n:04}-{step}'
        parts.append(f'''<div class="writing-task" data-writing data-answer="{escape(hy,quote=True)}" data-writing-key="{ident}">
<h3>Этап {step}. {'Начало' if step==1 else 'Продолжение'}</h3>
<p>{escape(ru)}</p>
<label for="{ident}">Твой перевод на армянский</label>
<textarea id="{ident}" lang="hy" rows="{'3' if n<17 else '5'}" maxlength="5000" data-self="{ident}" data-writing-input spellcheck="false"></textarea>
<div class="writing-actions"><button type="button" class="btn btn--primary" data-writing-check>Проверить</button> <button type="button" class="btn btn--ghost" data-writing-show aria-expanded="false" aria-controls="{ident}-sample">Подглядеть ответ</button></div>
<p data-writing-feedback role="status" aria-live="polite"></p><div data-writing-words class="writing-words"></div>
<div id="{ident}-sample" data-writing-sample hidden><p>Один возможный перевод:</p><p class="reading-text" lang="hy">{escape(hy)}</p></div>
</div>''')
    block='''\n<!-- WRITING TRANSLATION START -->
<section class="card writing-practice" id="writing-translation"><p class="eyebrow">Письменный перевод</p><h2>Переведи текст по частям</h2>
<p>Сначала переведи начало, затем продолжение. Вместе они составляют один текст. После проверки исправь ошибки и прочитай весь перевод.</p>'''+tip+'''
<details><summary>Как считается процент</summary><p>Это совпадение слов с образцом, а не оценка уровня языка. Точное слово даёт 1 балл; слово длиной от четырёх букв с одной опечаткой даёт 0,5. Остальные слова дают 0. Сумма делится на большее из двух количеств слов: в образце или в твоём ответе. Лишние слова снижают результат. Регистр, пунктуация и варианты և / եւ не влияют на балл.</p><p>Порядок слов не оценивается. Правильные синонимы, пропуск необязательного местоимения и другие верные переводы могут снизить процент. Сравни смысл и грамматику с образцом самостоятельно. Просмотр ответа отмечается как работа с подсказкой.</p></details>
'''+ '\n'.join(parts)+ '\n</section>\n<!-- WRITING TRANSLATION END -->\n'
    html=page.read_text()
    if 'href="#writing-translation"' not in html:
        html=html.replace('Чтение и речь этого урока</a>', 'Чтение и речь этого урока</a> · <a href="#writing-translation">Письменный перевод</a>', 1)
    html=re.sub(r'\n<!-- WRITING TRANSLATION START -->.*?<!-- WRITING TRANSLATION END -->\n','',html,flags=re.S)
    html=html.replace('<!-- COURSE-PRACTICE END -->', '<!-- COURSE-PRACTICE END -->'+block, 1)
    if '../assets/writing.js' not in html:
        html=html.replace('</body>','<script src="../assets/writing.js?v=1" defer></script>\n</body>')
        html=html.replace('</head>','<link rel="stylesheet" href="../assets/writing.css?v=1">\n</head>')
    page.write_text(html)
