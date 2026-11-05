"""Build ROOTED EPUB from chapters/*.md and books/*.md.

Chapter source format (see chapters/02-MRK-14.md):

    # Mark 14
    theme: <chapter theme>
    main: <main teaching, 2-3 sentences>

    ## Chapter Background and Story
    ### Optional subsection (14:1–2)
    paragraphs...

    ## Important Verses Explained
    ### Mark 14:38 — Title
    verse: Mark 14:38
    #### Simple Explanation
    #### Deeper Spiritual Meaning
    #### Applying This Teaching to Life Today

    ## How to Apply This Chapter to Life Today
    ## Chapter Prayer

Inline markup:
    [[Mark 14:36|phrase]]  verified partial quotation, shown with reference
    [[v36|phrase]]         same chapter, shown as (v. 36)
    [[14:36|phrase]]       same book
    [[...|phrase|-]]       verified quotation, reference hidden
    *text* italic, **text** bold
Bare references like "Romans 8:28" are validated and italicized automatically.
"""
import glob, html, os, re, shutil, sys, zipfile, datetime, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import refs  # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
CHAPTERS = os.path.join(ROOT, 'chapters')
BOOKS_DIR = os.path.join(ROOT, 'books')
CHAPTER_COUNTS = {code: len(refs.WEB[code]) for code, _ in refs.NT}

errors = []
warnings = []


def err(where, msg):
    errors.append('%s: %s' % (where, msg))


def esc(s):
    return html.escape(s, quote=False)


# ---------------------------------------------------------------- inline
# Full reference ("Romans 8:28", "Mark 11–12", "Exodus 12") or a bare follow-on "9:31" after "; " or ", ".
REF_ANY = re.compile(
    r'(?<![\w])(?P<book>' + refs.BOOK_RE + r') (?P<c1>\d+)(?:'
    r':(?P<v1>\d+)(?:[-–](?P<c2>\d+):(?P<v3>\d+)|[-–](?P<v2>\d+))?'
    r'|(?:[-–](?P<c2c>\d+))?(?![\d:]))'
    r'|(?<=[;,] )(?P<bc>\d+):(?P<bv>\d+)(?:[-–](?P<bv2>\d+))?'
)

SINGLE_CHAPTER = {'OBA', 'PHM', '2JN', '3JN', 'JUD'}


def smart(t):
    """Typographic quotes for editorial prose."""
    t = re.sub(r'(^|[\s(\[—\u0000])"', '\\1“', t)
    t = t.replace('"', '”')
    t = re.sub(r"(^|[\s(\[—“])'", '\\1‘', t)
    t = t.replace("'", '’')
    return t


def inline(text, ctx):
    """Convert one paragraph of source text to XHTML."""
    code, ch, where = ctx['code'], ctx['ch'], ctx['where']
    placeholders = []

    def keep(fragment):
        placeholders.append(fragment)
        return '\u0000%d\u0000' % (len(placeholders) - 1)

    def do_quote(m):
        ref, phrase = m.group(1).strip(), m.group(2).strip()
        hide = m.group(3) is not None
        try:
            c, cc, v1, v2 = refs.parse(ref, code, ch)
        except ValueError as e:
            err(where, str(e))
            return keep(esc(phrase))
        try:
            ok = refs.quote_ok(phrase, c, cc, v1, v2)
        except KeyError as e:
            err(where, 'bad reference %s (%s)' % (ref, e))
            ok = True
        if not ok:
            err(where, 'quotation not found in WEB %s: %r' % (refs.fmt(c, cc, v1, v2), phrase))
        q = '“<em class="sq">%s</em>”' % esc(phrase)
        if hide:
            return keep(q)
        if c == code and cc == ch:
            label = 'v. %d' % v1 if v1 == v2 else 'vv. %d–%d' % (v1, v2)
        else:
            label = refs.fmt(c, cc, v1, v2)
        return keep(q + ' (<em class="ref">%s</em>)' % label)

    text = re.sub(r'\[\[([^|\]]+)\|([^|\]]+)(\|-)?\]\]', do_quote, text)

    state = {'book': code}

    def do_ref(m):
        g = m.groupdict()
        if g['book']:
            c = refs.NAME_TO_CODE[g['book']]
            state['book'] = c
        else:
            c = state['book']
        if g['bc']:
            g = dict(g, c1=g['bc'], v1=g['bv'], v2=g['bv2'], c2=None)
        cc = int(g['c1'])
        if g['v1']:
            v1 = int(g['v1'])
            if g['c2']:
                ok = refs.exists(c, cc, v1) and refs.exists(c, int(g['c2']), int(g['v3']))
            else:
                ok = refs.exists(c, cc, v1, int(g['v2'] or v1))
        elif c in SINGLE_CHAPTER:  # "Philemon 24" means verse 24
            ok = refs.exists(c, 1, cc, int(g['c2c'] or cc))
        else:  # chapter or chapter range
            last = int(g['c2c'] or cc)
            ok = all(str(x) in refs.WEB[c] for x in range(cc, last + 1))
        if not ok:
            err(where, 'reference does not exist: %s' % m.group(0))
        return keep('<em class="ref">%s</em>' % esc(m.group(0).replace('-', '–')))

    text = REF_ANY.sub(do_ref, text)
    text = smart(text)
    text = esc(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', text)
    text = re.sub(r'\u0000(\d+)\u0000', lambda m: placeholders[int(m.group(1))], text)
    if '*' in text:
        warnings.append('%s: stray asterisk: %s' % (where, text[:80]))
    if '[[' in text or ']]' in text:
        err(where, 'unparsed quote markup: %s' % text[:100])
    return text


def paragraphs(lines, ctx):
    out, buf = [], []

    def flush():
        if buf:
            out.append('<p>%s</p>' % inline(' '.join(buf), ctx))
            buf.clear()
    for line in lines:
        if not line.strip():
            flush()
        else:
            buf.append(line.strip())
    flush()
    return out


# ---------------------------------------------------------------- chapter
SECTIONS = ['Chapter Background and Story', 'Important Verses Explained',
            'How to Apply This Chapter to Life Today', 'Chapter Prayer']
VERSE_SUBS = ['Simple Explanation', 'Deeper Spiritual Meaning', 'Applying This Teaching to Life Today']


def parse_chapter(path):
    src = open(path, encoding='utf-8').read().replace('\r', '')
    lines = src.split('\n')
    m = re.fullmatch(r'# (.+) (\d+)', lines[0].strip())
    if not m:
        raise SystemExit('%s: first line must be "# Book N"' % path)
    name, ch = m.group(1), int(m.group(2))
    code = refs.NAME_TO_CODE[name]
    where = '%s %d' % (name, ch)
    meta = {}
    i = 1
    while i < len(lines) and not lines[i].startswith('## '):
        mm = re.match(r'(theme|main):\s*(.*)', lines[i])
        if mm:
            meta[mm.group(1)] = mm.group(2).strip()
        elif lines[i].strip():
            meta[last] = meta[last] + ' ' + lines[i].strip()  # continuation
        if mm:
            last = mm.group(1)
        i += 1
    sections = {}
    order = []
    cur = None
    for line in lines[i:]:
        if line.startswith('## '):
            cur = line[3:].strip()
            order.append(cur)
            sections[cur] = []
        else:
            sections[cur].append(line)
    return dict(name=name, ch=ch, code=code, where=where, meta=meta, sections=sections,
                order=order, path=path)


def split_heads(lines, level):
    """Split lines on headings of the given level. Returns [(heading or None, lines)]."""
    mark = '#' * level + ' '
    out = [(None, [])]
    for line in lines:
        if line.startswith(mark):
            out.append((line[len(mark):].strip(), []))
        else:
            out[-1][1].append(line)
    if not any(l.strip() for l in out[0][1]):
        out = out[1:]
    return out


def words(lines):
    return len(re.findall(r"[A-Za-z’']+", ' '.join(lines)))


def render_chapter(c, num, prev_href, next_href, book_href):
    ctx = {'code': c['code'], 'ch': c['ch'], 'where': c['where']}
    meta, S = c['meta'], c['sections']
    stats = {'verses': 0, 'words': 0}
    if c['order'] != SECTIONS:
        err(c['where'], 'sections are %s' % c['order'])
    for k in ('theme', 'main'):
        if not meta.get(k):
            err(c['where'], 'missing %s' % k)
    body = []
    title = '%s — Chapter %d' % (c['name'], c['ch'])
    web_url = 'https://ebible.org/engwebp/%s%02d.htm' % (c['code'], c['ch'])
    if c['code'] == 'PSA':
        web_url = 'https://ebible.org/engwebp/PSA%03d.htm' % c['ch']
    body.append('<header class="chapter-header">')
    body.append('<p class="eyebrow">%s · Chapter %d of %d</p>' % (esc(c['name']), c['ch'], CHAPTER_COUNTS[c['code']]))
    body.append('<h1 id="top">%s</h1>' % esc(title))
    body.append('<p class="theme"><span class="label">Chapter Theme:</span> %s</p>' % inline(meta.get('theme', ''), ctx))
    body.append('<p class="readlink"><a href="%s">Read %s %d in the World English Bible</a></p>' % (web_url, esc(c['name']), c['ch']))
    body.append('</header>')
    body.append('<div class="main-teaching"><p class="label-block">Main Teaching</p><p>%s</p></div>' % inline(meta.get('main', ''), ctx))

    # Section 1
    sec = S.get(SECTIONS[0], [])
    stats['background_words'] = words(sec)
    body.append('<section class="background"><h2>Chapter Background and Story</h2>')
    for head, ls in split_heads(sec, 3):
        if head:
            body.append('<h3 class="sub">%s</h3>' % inline(head, ctx))
        body.extend(paragraphs(ls, ctx))
    body.append('</section>')

    # Section 2
    body.append('<section class="verses"><h2>Important Verses Explained</h2>')
    studies = split_heads(S.get(SECTIONS[1], []), 3)
    seen = set()
    for head, ls in studies:
        if not head:
            err(c['where'], 'text before first verse study')
            continue
        stats['verses'] += 1
        sctx = dict(ctx, where='%s [%s]' % (c['where'], head[:30]))
        vline = [l for l in ls if l.startswith('verse:')]
        if len(vline) != 1:
            err(sctx['where'], 'needs exactly one "verse:" line')
            continue
        vref = vline[0][6:].strip()
        try:
            vc, vch, v1, v2 = refs.parse(vref, c['code'], c['ch'])
            if (vc, vch) != (c['code'], c['ch']):
                err(sctx['where'], 'key verse outside chapter: %s' % vref)
            text = refs.block_text(vc, vch, v1, v2)
        except (ValueError, KeyError) as e:
            err(sctx['where'], str(e))
            continue
        key = (v1, v2)
        if key in seen:
            err(sctx['where'], 'duplicate verse study')
        seen.add(key)
        hm = re.match(r'(.+?) — (.+)', head)
        if not hm:
            err(sctx['where'], 'heading must be "Ref — Title"')
            continue
        if hm.group(1).replace('-', '–') != refs.fmt(vc, vch, v1, v2):
            err(sctx['where'], 'heading ref %s != verse %s' % (hm.group(1), refs.fmt(vc, vch, v1, v2)))
        anchor = 'v%d' % v1
        body.append('<section class="verse-study" id="%s">' % anchor)
        body.append('<h3><em class="ref">%s</em> — %s</h3>' % (esc(refs.fmt(vc, vch, v1, v2)), inline(hm.group(2), sctx)))
        body.append('<blockquote class="verse"><p><em>%s</em></p><p class="versetag">— <em>%s</em> (WEB)</p></blockquote>'
                    % (esc(text), esc(refs.fmt(vc, vch, v1, v2))))
        rest = [l for l in ls if not l.startswith('verse:')]
        subs = split_heads(rest, 4)
        names = [h for h, _ in subs]
        if names != VERSE_SUBS:
            err(sctx['where'], 'verse subsections are %s' % names)
        for h, sl in subs:
            stats['v_' + str(h)] = stats.get('v_' + str(h), 0) + words(sl)
            body.append('<h4>%s</h4>' % esc(h or ''))
            body.extend(paragraphs(sl, sctx))
        body.append('</section>')
    body.append('</section>')

    # Section 3
    body.append('<section class="apply"><h2>How to Apply This Chapter to Life Today</h2>')
    body.extend(paragraphs(S.get(SECTIONS[2], []), ctx))
    stats['apply_words'] = words(S.get(SECTIONS[2], []))
    body.append('</section>')

    # Section 4
    pr = S.get(SECTIONS[3], [])
    ptext = ' '.join(l.strip() for l in pr if l.strip())
    if not ptext.endswith('In Jesus’ name, Amen.'):
        err(c['where'], 'prayer must end with "In Jesus’ name, Amen."')
    if ptext.count('Amen') != 1:
        err(c['where'], 'prayer must contain exactly one Amen')
    body.append('<section class="prayer"><h2>Chapter Prayer</h2>')
    body.extend(paragraphs(pr, ctx))
    body.append('</section>')

    nav = ['<nav class="bottomnav" aria-label="Chapter navigation"><p>']
    if prev_href:
        nav.append('<a href="%s">← Previous</a> · ' % prev_href)
    nav.append('<a href="%s">%s contents</a>' % (book_href, esc(c['name'])))
    if next_href:
        nav.append(' · <a href="%s">Next →</a>' % next_href)
    nav.append('</p></nav>')
    body.extend(nav)

    allsrc = '\n'.join('\n'.join(v) for v in S.values())
    stats['words'] = words(allsrc.split('\n')) + words([meta.get('main', '')])
    for bad in BANNED:
        if re.search(bad, allsrc, re.I):
            err(c['where'], 'banned phrase: %s' % bad)
    return page(title, '\n'.join(body), 'chapter'), stats


BANNED = [r'5x5x5', r'\bquiz\b', r'answer key', r'write down', r'ask yourself',
          r'read the nearby', r'memory challenge', r'spaced repetition', r'highlight(?:ing)? (?:each|every|key) (?:verse|word|phrase)',
          r'\bTODO\b', r'\bTBD\b', r'lorem', r'imagine (?:a|someone)', r'for example, (?:a|someone) (?:woman|man|person) named']


def page(title, body, cls=''):
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n'
            '<head><meta charset="utf-8"/><title>%s</title>'
            '<link rel="stylesheet" type="text/css" href="css/style.css"/></head>\n'
            '<body class="%s">\n%s\n</body></html>\n') % (esc(title), cls, body)


# ---------------------------------------------------------------- books
def render_book(code, name, idx, chapters_meta):
    path = os.path.join(BOOKS_DIR, '%02d-%s.md' % (idx, code))
    ctx = {'code': code, 'ch': 0, 'where': name + ' intro'}
    body = ['<header class="book-header"><p class="eyebrow">Book %d of 27</p><h1>%s</h1></header>' % (idx, esc(name))]
    if os.path.exists(path):
        lines = open(path, encoding='utf-8').read().split('\n')
        for head, ls in split_heads(lines[1:] if lines[0].startswith('# ') else lines, 2):
            if head:
                body.append('<h2>%s</h2>' % esc(head))
            body.extend(paragraphs(ls, ctx))
    else:
        warnings.append('missing book intro %s' % path)
    body.append('<h2>Chapters</h2><ol class="chapter-list">')
    for ch, href, theme in chapters_meta:
        body.append('<li><a href="%s">%s %d</a> — %s</li>' % (href, esc(name), ch, inline(theme, ctx)))
    body.append('</ol>')
    return page(name, '\n'.join(body), 'book')


# ---------------------------------------------------------------- main
def main(out_path, allow_partial=False):
    build = os.path.join(ROOT, 'build', 'epub')
    if os.path.exists(build):
        shutil.rmtree(build)
    os.makedirs(os.path.join(build, 'META-INF'))
    oebps = os.path.join(build, 'OEBPS')
    os.makedirs(os.path.join(oebps, 'css'))
    os.makedirs(os.path.join(oebps, 'images'))
    shutil.copy(os.path.join(ASSETS, 'cover.jpg'), os.path.join(oebps, 'images', 'cover.jpg'))
    shutil.copy(os.path.join(ASSETS, 'style.css'), os.path.join(oebps, 'css', 'style.css'))

    files = {os.path.basename(p): p for p in glob.glob(os.path.join(CHAPTERS, '*.md'))}
    spine = []   # (id, href)
    toc = []     # (book name, book href, [(label, href)])
    all_stats = []
    chap_list = []
    for idx, (code, name) in enumerate(refs.NT, 1):
        for ch in range(1, CHAPTER_COUNTS[code] + 1):
            fn = '%02d-%s-%02d.md' % (idx, code, ch)
            if fn in files:
                chap_list.append((idx, code, name, ch, files[fn]))
            elif not allow_partial:
                err(name, 'missing chapter %d (%s)' % (ch, fn))
    hrefs = ['c%02d_%s_%03d.xhtml' % (i, code, ch) for i, code, name, ch, _ in chap_list]
    parsed = [parse_chapter(p) for *_, p in chap_list]
    for k, c in enumerate(parsed):
        i, code, name, ch, _ = chap_list[k]
        if (c['code'], c['ch']) != (code, ch):
            err(c['where'], 'file name / heading mismatch')

    # front matter
    front = os.path.join(ROOT, 'front', 'introduction.md')
    intro_body = ['<h1>About This Book</h1>']
    if os.path.exists(front):
        for head, ls in split_heads(open(front, encoding='utf-8').read().split('\n'), 2):
            if head:
                intro_body.append('<h2>%s</h2>' % esc(head))
            intro_body.extend(paragraphs(ls, {'code': 'MAT', 'ch': 0, 'where': 'intro'}))
    write(oebps, 'cover.xhtml', page('Cover', '<section class="cover" epub:type="cover"><img src="images/cover.jpg" alt="ROOTED: Complete New Testament Study — Matthew to Revelation"/></section>', 'coverpage'))
    write(oebps, 'introduction.xhtml', page('About This Book', '\n'.join(intro_body), 'front'))
    spine += [('cover', 'cover.xhtml'), ('introduction', 'introduction.xhtml'), ('nav', 'nav.xhtml')]

    by_book = {}
    for k, c in enumerate(parsed):
        by_book.setdefault(chap_list[k][0], []).append(k)
    for idx, (code, name) in enumerate(refs.NT, 1):
        if idx not in by_book:
            continue
        bhref = 'b%02d_%s.xhtml' % (idx, code)
        items = by_book[idx]
        write(oebps, bhref, render_book(code, name, idx, [(parsed[k]['ch'], hrefs[k], parsed[k]['meta'].get('theme', '')) for k in items]))
        spine.append(('b%02d' % idx, bhref))
        entries = []
        for k in items:
            c = parsed[k]
            prev_href = hrefs[k - 1] if k > 0 else None
            next_href = hrefs[k + 1] if k + 1 < len(hrefs) else None
            xhtml, st = render_chapter(c, k + 1, prev_href, next_href, bhref)
            st['where'] = c['where']
            all_stats.append(st)
            write(oebps, hrefs[k], xhtml)
            spine.append(('c%03d' % (k + 1), hrefs[k]))
            entries.append(('%s %d' % (name, c['ch']), hrefs[k]))
        toc.append((name, bhref, entries))

    # nav.xhtml
    nav = ['<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>',
           '<li><a href="introduction.xhtml">About This Book</a></li>']
    for name, bhref, entries in toc:
        nav.append('<li><a href="%s">%s</a><ol>' % (bhref, esc(name)))
        for label, href in entries:
            nav.append('<li><a href="%s">%s</a></li>' % (href, esc(label)))
        nav.append('</ol></li>')
    nav.append('</ol></nav>')
    first = toc[0][1] if toc else 'introduction.xhtml'
    nav.append('<nav epub:type="landmarks" id="landmarks" hidden="hidden"><h2>Landmarks</h2><ol>'
               '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>'
               '<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>'
               '<li><a epub:type="bodymatter" href="%s">Matthew</a></li></ol></nav>' % first)
    write(oebps, 'nav.xhtml', page('Contents', '\n'.join(nav), 'toc'))

    # toc.ncx
    ncx = ['<?xml version="1.0" encoding="utf-8"?>',
           '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head>',
           '<meta name="dtb:uid" content="%s"/><meta name="dtb:depth" content="2"/>' % BOOK_ID,
           '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>',
           '<docTitle><text>%s</text></docTitle><navMap>' % esc(TITLE)]
    n = 0

    def np(label, href, inner=''):
        nonlocal n
        n += 1
        return '<navPoint id="np%d" playOrder="%d"><navLabel><text>%s</text></navLabel><content src="%s"/>%s' % (n, n, esc(label), href, inner)
    ncx.append(np('About This Book', 'introduction.xhtml') + '</navPoint>')
    for name, bhref, entries in toc:
        ncx.append(np(name, bhref))
        for label, href in entries:
            ncx.append(np(label, href) + '</navPoint>')
        ncx.append('</navPoint>')
    ncx.append('</navMap></ncx>')
    write(oebps, 'toc.ncx', '\n'.join(ncx))

    # content.opf
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    man = ['<item id="style" href="css/style.css" media-type="text/css"/>',
           '<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
           '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
           '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>']
    for sid, href in spine:
        if sid == 'nav':
            continue
        man.append('<item id="%s" href="%s" media-type="application/xhtml+xml"/>' % (sid, href))
    sp = []
    for sid, href in spine:
        sp.append('<itemref idref="%s"%s/>' % (sid, ' linear="yes"'))
    opf = '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">%s</dc:identifier>
<dc:title id="t1">%s</dc:title>
<meta refines="#t1" property="title-type">main</meta>
<dc:title id="t2">%s</dc:title>
<meta refines="#t2" property="title-type">subtitle</meta>
<dc:creator>ROOTED Bible Study Companion</dc:creator>
<dc:language>en-US</dc:language>
<dc:subject>Bible — New Testament — Commentaries</dc:subject>
<dc:subject>Bible study</dc:subject>
<dc:description>%s</dc:description>
<dc:rights>Scripture quotations are from the World English Bible (WEB), which is in the public domain.</dc:rights>
<meta property="dcterms:modified">%s</meta>
<meta name="cover" content="cover-img"/>
</metadata>
<manifest>
%s
</manifest>
<spine toc="ncx">
%s
</spine>
<guide><reference type="cover" title="Cover" href="cover.xhtml"/><reference type="toc" title="Contents" href="nav.xhtml"/></guide>
</package>
''' % (BOOK_ID, esc(TITLE), esc(SUBTITLE), esc(DESCRIPTION), now, '\n'.join(man), '\n'.join(sp))
    write(oebps, 'content.opf', opf)
    write(build, 'META-INF/container.xml', '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n')

    # zip
    with zipfile.ZipFile(out_path, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        for dirpath, _, fns in os.walk(build):
            for fn in sorted(fns):
                full = os.path.join(dirpath, fn)
                arc = os.path.relpath(full, build)
                z.write(full, arc, compress_type=zipfile.ZIP_DEFLATED)
    return parsed, all_stats


def write(base, rel, text):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(text)


BOOK_ID = 'urn:uuid:7c1f6a52-3d8e-4b8a-9f0e-5a1d0c9e2b77'
TITLE = 'ROOTED — Complete New Testament Study'
SUBTITLE = 'An Expanded Chapter-by-Chapter Commentary, Matthew to Revelation'
DESCRIPTION = ('A chapter-by-chapter commentary on all 260 chapters of the New Testament. Each chapter '
               'explains the background and story, studies key verses in depth (quoted from the World '
               'English Bible), shows how the teaching applies to life today, and closes with a prayer.')

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'ROOTED_Complete_Expanded_New_Testament_Study.epub'))
    ap.add_argument('--partial', action='store_true')
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    parsed, stats = main(a.out, a.partial)
    for w in warnings:
        print('WARN', w)
    for e in errors:
        print('ERROR', e)
    tot = sum(s['words'] for s in stats)
    print('chapters: %d  verse studies: %d  words: %d' % (len(stats), sum(s['verses'] for s in stats), tot))
    if stats:
        low = sorted(stats, key=lambda s: s['words'])[:5]
        print('shortest:', ', '.join('%s (%d)' % (s['where'], s['words']) for s in low))
    print('ERRORS: %d' % len(errors))
    sys.exit(1 if errors else 0)
