"""Parse ebible.org WEB USFM files into data/web.json: {BOOKCODE: {chapter: {verse: text}}}."""
import json, re, sys, glob, os
src, out = sys.argv[1], sys.argv[2]
bible = {}
for path in sorted(glob.glob(os.path.join(src, '*.usfm'))):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'\\id (\w+)', raw)
    if not m or m.group(1) in ('FRT', 'GLO'):
        continue
    code = m.group(1)
    t = re.sub(r'\\f .*?\\f\*', '', raw, flags=re.S)
    t = re.sub(r'\\x .*?\\x\*', '', t, flags=re.S)
    t = re.sub(r'\\wj\*?', '', t)
    t = re.sub(r'\\\+?w ([^|\\]*?)\|[^\\]*?\\\+?w\*', r'\1', t)
    t = re.sub(r'\\\+?w\*?', '', t)
    book = {}
    ch = None
    for tok in re.split(r'(\\c \d+|\\v \d+)', t):
        if tok.startswith('\\c '):
            ch = int(tok[3:]); book[ch] = {}; cur = None
        elif tok.startswith('\\v '):
            cur = int(tok[3:]); book[ch][cur] = ''
        elif ch and cur:
            s = re.sub(r'\\[a-z0-9]+\*?', ' ', tok)
            book[ch][cur] += ' ' + s
    for c in book:
        for v in book[c]:
            book[c][v] = re.sub(r'\s+', ' ', book[c][v]).strip()
            book[c][v] = re.sub(r'\s+([,.;:?!’”)])', r'\1', book[c][v])
    bible[code] = book
json.dump(bible, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(bible), 'books')
