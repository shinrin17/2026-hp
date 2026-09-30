"""Build static portfolio pages from the saved Instagram export (no login required)."""
import argparse
from datetime import datetime, timezone, timedelta
from html import escape
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
LABELS = {'photo': 'PHOTO', 'movie': 'MOVIE', 'production-staff': 'PRODUCTION STAFF'}

def clean_display_text(text):
    text = re.sub(r'[@＠][\w.]+', '', text)
    text = re.sub(r'[#＃][\w]+', '', text)
    text = re.sub(r'[0-9#*]\ufe0f?\u20e3', '', text)
    text = re.sub(r'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2300-\u23FF\u200d\ufe0e\ufe0f\u20e3]', '', text)
    text = '\n'.join(re.sub(r'[ \t\u3000]+', ' ', line).strip() for line in text.splitlines())
    return re.sub(r'\n{3,}', '\n\n', text).strip()

def assign_folders(entries):
    used = set()
    for p in entries:
        name = p['title'].replace('/', '／')
        folder = name
        number = 2
        while folder in used:
            folder = f'{name}（{number}）'
            number += 1
        used.add(folder)
        p['folder'] = folder

def dimensions(path):
    with path.open('rb') as f:
        if f.read(2) != b'\xff\xd8':
            raise ValueError(f'Expected JPEG: {path}')
        while True:
            c = f.read(1)
            if not c: raise ValueError(f'No image dimensions: {path}')
            if c != b'\xff': continue
            while c == b'\xff': c = f.read(1)
            marker = c[0]
            if marker in (0xd8, 0xd9): continue
            length = struct.unpack('>H', f.read(2))[0]
            if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                _, height, width = struct.unpack('>BHH', f.read(5))
                return width, height
            f.seek(length - 2, 1)

def categories(caption):
    header = re.search(r'[【\[［]([^】\]］]*\bworks?)[】\]］]', caption, re.I)
    role = header[1].lower() if header else ''
    result = []
    if 'still' in role: result.append('photo')
    if any(r in role for r in ('making', 'director', 'movie', 'documentary', 'live')): result.append('movie')
    if re.search(r'\b(fd|ad|pm|pa|ca|lighting)\b', role): result.append('production-staff')
    if not result:
        if re.search('メイキング|ムービー|映像|サウナ撮影', caption): result.append('movie')
        if re.search('現場制作|撮影補佐|撮影助手|照明|制作進行', caption): result.append('production-staff')
        if re.search('写真|スチール|ビジュアル|ジャケット|オフショット|リアルサウンド' , caption): result.append('photo')
    if not result: raise ValueError(f'Unclassified: {caption[:100]}')
    return result

TITLE_OVERRIDES = {
 'C_QJO0fJ_Z3': 'ミステリーピューロランド — 大鶴肥満 緋色のウェディング',
 'DU_4aA3E9Ra': '中島健人「IDOL1ST」— XTC / Self Liner Notes',
 'DVQhGNKCSMw': "中島健人「IDOL1ST」— Gods' Play / 特典映像",
 'DMKngJKpDTN': '中島健人「N / bias」— THE CODE / 迷夢 MAKING SCENE',
 'DWdeLC0iXSF': '中京テレビ「ネコになりたい。」',
 'DVZg7A0k3Zp': '中京テレビ「せいや&猪俣の3行キッチン」',
 'DR6s_DTie4a': 'ReFLiA — Artist Photo / Debut Live「1st contact」',
 'DAvY_OHvmhy': '大橋ちっぽけ「誰かのとなり」— ジャケット写真 / MV照明',
 'C8PFcxLJJwn': 'IROHANI — Look Shoot / SARAIN',
 'C8PDYIYpW9l': 'IROHANI — Look Shoot / ERI',
 'C3PsqIOvIC8': 'ドラマ「アイのない恋人たち」— 場面写真',
 'C2RrjXUvxfM': 'ドラマ「SHUT UP」— 場面写真',
 'CxsQah8vy_R': 'ドラマ「紅さすライフ」— 劇中写真 / 場面写真',
 'Cxc_jkPvhXF': 'ドラマ「ダ・カーポしませんか？」— 場面写真',
 'CcrFPBfPjy4': '「今日、好きになりました」× WEGO × ZOZOTOWN',
}

def title(caption):
    lines = [re.sub(r'\s*@\S+', '', s).strip() for s in caption.splitlines()]
    lines = [s for s in lines if s and s != '.' and not re.search(r'[【\[［].*\bworks?', s, re.I)]
    first = lines[0]
    if len(first) < 22 and len(lines)>1 and not lines[1].startswith(('#','撮影','制作','キービジュアル','MVスチール','メイキング')):
        first += ' '+lines[1]
    return first

def header(prefix):
    return f'''  <a class="skip-link" href="#main">本文へスキップ</a>
  <header class="header">
    <a class="brand" href="{prefix}index.html"><img src="{prefix}assets/svg/logo-horizontal.svg" width="280" height="52" alt="森川亮太 MORIKAWA RYOTA"></a>
    <nav aria-label="メインナビゲーション"><a href="{prefix}works.html" aria-current="page">WORKS</a><a href="{prefix}about.html">ABOUT</a></nav>
  </header>'''

def document(title_text, body, prefix='', script=''):
    return f'''<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title_text)} | MORIKAWA RYOTA</title>
  <meta name="description" content="{escape(title_text, quote=True)} — 森川亮太の作品紹介。">
  <link rel="stylesheet" href="{prefix}css/main.css">
{script}</head>
<body id="top">
{header(prefix)}
  <main id="main">
{body}
  </main>
  <footer class="footer"><small>&copy; RYOHTA MORIKAWA</small></footer>
</body>
</html>
'''

def import_export(path):
    rows = {p['url']:p for p in json.loads(path.read_text())}
    entries = []
    for p in rows.values():
        shortcode = p['url'].rstrip('/').split('/')[-1]
        slug = 'instagram-'+shortcode
        caption = p.get('detailCaption') or p['caption']
        entry = {'title': TITLE_OVERRIDES.get(shortcode, title(caption))}
        assign_folders([*entries, entry])
        folder = ROOT/'works'/entry['folder']/'img'
        folder.mkdir(parents=True, exist_ok=True)
        media = []
        seen = set()
        for f in p['files']:
            key = Path(urlparse(f['source']).path).name
            if key in seen: continue
            seen.add(key)
            name = f'{len(media)+1:02}.jpg'
            dest = folder/name
            shutil.copyfile(f['path'], dest)
            if dest.read_bytes()[:2] != b"\xff\xd8":
                subprocess.run(["sips", "-s", "format", "jpeg", str(dest), "--out", str(dest)], check=True, capture_output=True)
            width, height = dimensions(dest)
            media.append({'file':f'img/{name}', 'width':width, 'height':height, 'cover':f.get('cover',False)})
        if not media: raise ValueError(f'No image: {p["url"]}')
        date = datetime.fromisoformat(p['date'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=9))).isoformat()
        entries.append({'id':slug, 'folder':entry['folder'], 'title':entry['title'], 'categories':categories(caption), 'publishedAt':date, 'source':p['url'], 'caption':caption, 'images':media})
    entries.sort(key=lambda p:p['publishedAt'],reverse=True)
    (ROOT/'data'/'instagram-works.json').write_text(json.dumps({'account':'m_ichirinka','retrievedOn':'2026-09-30','posts':entries},ensure_ascii=False,indent=2)+'\n')
    return entries

def build(entries):
    for p in entries:
        display_title = clean_display_text(p['title'])
        e = escape(display_title)
        gallery = '\n'.join(f'<img src="{i["file"]}" width="{i["width"]}" height="{i["height"]}" alt="{e} — {n+1}" loading="{"eager" if n==0 else "lazy"}">' for n,i in enumerate(p['images']))
        labels = ' / '.join(LABELS[c] for c in p['categories'])
        date = p['publishedAt'][:10]
        body = f'''    <p class="back-link"><a href="../../works.html#{p['id']}">← 作品一覧へ戻る</a></p>
    <article class="project">
      <header class="project-heading"><p class="eyebrow">{labels}</p><h1>{e}</h1><p class="client"><time datetime="{p['publishedAt']}">{date.replace('-','.')}</time></p></header>
      <div class="project-detail">
        <div class="gallery" aria-label="作品の写真">{gallery}</div>
        <div class="description"><div class="instagram-caption">{escape(clean_display_text(p['caption']))}</div><p class="source-link"><a href="{p['source']}" target="_blank" rel="noopener noreferrer">Instagramで元の投稿を見る ↗</a></p></div>
      </div>
    </article>'''
        (ROOT/'works'/p['folder']/'index.html').write_text(document(display_title,body,'../../'))
    cards=[]
    for p in entries:
        i = p['images'][0]
        cards.append(f'''      <article class="work" id="{p['id']}" data-category="{' '.join(p['categories'])}" data-date="{p['publishedAt'][:10]}">
        <a href="works/{quote(p['folder'], safe='')}/index.html"><img class="work-image" src="works/{quote(p['folder'], safe='')}/{i['file']}" alt="{escape(p['title'])}" width="{i['width']}" height="{i['height']}" loading="lazy"></a>
      </article>''')
    buttons = '\n'.join(f'      <button type="button" data-filter="{c}" aria-pressed="{"true" if c=="all" else "false"}" aria-controls="works-results">{label}</button>' for c,label in [('all','ALL'),*LABELS.items()])
    body = f'''    <div class="role-nav works-filters" role="group" aria-label="作品のカテゴリで絞り込み">
{buttons}
    </div>
    <p class="filter-status" role="status" aria-live="polite" aria-atomic="true"></p>
    <div id="works-results" class="works-grid">
{chr(10).join(cards)}
    </div>'''
    (ROOT/'works.html').write_text(document('WORKS',body,script='  <script src="js/works-filter.js" defer></script>\n'))
    print(f'Built {len(entries)} pages, {sum(len(p["images"]) for p in entries)} photos')
    print({c:sum(c in p['categories'] for p in entries) for c in LABELS})

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export',type=Path,help='Browser export with downloaded local image paths')
    args=parser.parse_args()
    build(import_export(args.export) if args.export else json.loads((ROOT/'data'/'instagram-works.json').read_text())['posts'])
