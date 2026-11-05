"""Bible reference parsing and WEB text lookup."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = json.load(open(os.path.join(HERE, '..', 'data', 'web.json'), encoding='utf-8'))

# (code, display name, aliases)
BOOKS = [
    ('GEN', 'Genesis'), ('EXO', 'Exodus'), ('LEV', 'Leviticus'), ('NUM', 'Numbers'),
    ('DEU', 'Deuteronomy'), ('JOS', 'Joshua'), ('JDG', 'Judges'), ('RUT', 'Ruth'),
    ('1SA', '1 Samuel'), ('2SA', '2 Samuel'), ('1KI', '1 Kings'), ('2KI', '2 Kings'),
    ('1CH', '1 Chronicles'), ('2CH', '2 Chronicles'), ('EZR', 'Ezra'), ('NEH', 'Nehemiah'),
    ('EST', 'Esther'), ('JOB', 'Job'), ('PSA', 'Psalm'), ('PRO', 'Proverbs'),
    ('ECC', 'Ecclesiastes'), ('SNG', 'Song of Songs'), ('ISA', 'Isaiah'), ('JER', 'Jeremiah'),
    ('LAM', 'Lamentations'), ('EZK', 'Ezekiel'), ('DAN', 'Daniel'), ('HOS', 'Hosea'),
    ('JOL', 'Joel'), ('AMO', 'Amos'), ('OBA', 'Obadiah'), ('JON', 'Jonah'), ('MIC', 'Micah'),
    ('NAM', 'Nahum'), ('HAB', 'Habakkuk'), ('ZEP', 'Zephaniah'), ('HAG', 'Haggai'),
    ('ZEC', 'Zechariah'), ('MAL', 'Malachi'),
    ('MAT', 'Matthew'), ('MRK', 'Mark'), ('LUK', 'Luke'), ('JHN', 'John'), ('ACT', 'Acts'),
    ('ROM', 'Romans'), ('1CO', '1 Corinthians'), ('2CO', '2 Corinthians'), ('GAL', 'Galatians'),
    ('EPH', 'Ephesians'), ('PHP', 'Philippians'), ('COL', 'Colossians'),
    ('1TH', '1 Thessalonians'), ('2TH', '2 Thessalonians'), ('1TI', '1 Timothy'),
    ('2TI', '2 Timothy'), ('TIT', 'Titus'), ('PHM', 'Philemon'), ('HEB', 'Hebrews'),
    ('JAS', 'James'), ('1PE', '1 Peter'), ('2PE', '2 Peter'), ('1JN', '1 John'),
    ('2JN', '2 John'), ('3JN', '3 John'), ('JUD', 'Jude'), ('REV', 'Revelation'),
]
NT = BOOKS[39:]
NAME_TO_CODE = {name: code for code, name in BOOKS}
NAME_TO_CODE['Psalms'] = 'PSA'
NAME_TO_CODE['Song of Solomon'] = 'SNG'
CODE_TO_NAME = {code: name for code, name in BOOKS}

_names = sorted(NAME_TO_CODE, key=len, reverse=True)
BOOK_RE = '(?:' + '|'.join(re.escape(n) for n in _names) + ')'
# e.g. "Mark 14:36", "Romans 8:28-30", "John 3:16, 18", "1 John 4:8–10"
REF_RE = re.compile(r'(?<![\w])(' + BOOK_RE + r') (\d+):(\d+)(?:[-–](\d+))?(?:[-–](\d+):(\d+))?')


def parse(ref, book=None, chapter=None):
    """Parse 'Mark 14:36-38', '14:36' (needs book), or 'v36' / 'vv36-38' (needs book+chapter).
    Returns (code, chapter, v1, v2)."""
    ref = ref.strip().replace('–', '-')
    m = re.fullmatch(r'v{1,2}\.? ?(\d+)(?:-(\d+))?', ref)
    if m:
        return book, chapter, int(m.group(1)), int(m.group(2) or m.group(1))
    m = re.fullmatch(r'(\d+):(\d+)(?:-(\d+))?', ref)
    if m:
        return book, int(m.group(1)), int(m.group(2)), int(m.group(3) or m.group(2))
    m = re.fullmatch('(' + BOOK_RE + r') (\d+):(\d+)(?:-(\d+))?', ref)
    if m:
        return NAME_TO_CODE[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4) or m.group(3))
    raise ValueError('Unparseable reference: %r' % ref)


def verses(code, ch, v1, v2):
    chap = WEB[code].get(str(ch))
    if chap is None:
        raise KeyError('No chapter %s %s' % (code, ch))
    out = []
    for v in range(v1, v2 + 1):
        if str(v) not in chap:
            raise KeyError('No verse %s %s:%s' % (code, ch, v))
        out.append(chap[str(v)])
    return out


def exists(code, ch, v1, v2=None):
    try:
        verses(code, ch, v1, v2 or v1)
        return True
    except KeyError:
        return False


def fmt(code, ch, v1, v2):
    s = '%s %d:%d' % (CODE_TO_NAME[code], ch, v1)
    if v2 != v1:
        s += '–%d' % v2
    return s


def norm(s):
    s = s.lower()
    s = re.sub(r'[“”‘’"\'`]', '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return s.strip()


def quote_ok(phrase, code, ch, v1, v2):
    text = ' '.join(verses(code, ch, max(1, v1 - 0), v2))
    return norm(phrase) in norm(text)


def _drop_unmatched_double(t):
    stack, bad = [], set()
    for i, c in enumerate(t):
        if c == '“':
            stack.append(i)
        elif c == '”':
            if stack:
                stack.pop()
            else:
                bad.add(i)
    bad.update(stack)
    return ''.join(c for i, c in enumerate(t) if i not in bad)


def _swap_nesting(t):
    out = list(t)
    stack = []
    for i, c in enumerate(t):
        prev = t[i - 1] if i else ' '
        nxt = t[i + 1] if i + 1 < len(t) else ' '
        if c == '“':
            out[i] = '‘'
        elif c == '”':
            out[i] = '’'
        elif c == '‘' and (prev in ' “—(' ) and (nxt.isalnum() or nxt in '“'):
            stack.append(i)
        elif c == '’' and stack and not nxt.isalnum():
            j = stack.pop()
            out[j] = '“'
            out[i] = '”'
    return ''.join(out)


def block_text(code, ch, v1, v2):
    """Verse text for a display block: wrapped in outer double quotes with inner
    quotation marks nested. Speech marks that open or close outside the quoted
    range are dropped (punctuation only; words are untouched)."""
    t = ' '.join(verses(code, ch, v1, v2))
    t = _drop_unmatched_double(t).strip()
    return '“' + _swap_nesting(t) + '”'
