"""Convert plain quotes of the form "phrase" (Book C:V) into checked [[Book C:V|phrase]] markup.

Only converts when the phrase is found in the WEB text of that single verse.
Reports quotes it could not convert. Usage: python3 tools/mark.py FILE...
"""
import re, sys
from refs import REF_RE, NAME_TO_CODE, quote_ok

PAT = re.compile(r'"([^"]+?)[,.]?" \((' + REF_RE.pattern[len(r'(?<![\w])('):].split(') (')[0] + r') (\d+):(\d+)\)')

PAT2 = re.compile(r'(?<!\|)(' + PAT.pattern.split(r'" \((')[1].split(r') (\d+)')[0] + r') (\d+):(\d+)([^"\[\]\n(]{1,40}?)"([^"]+?)([,.]?)"')


def run(path):
    text = open(path, encoding='utf-8').read()
    misses = []

    def rep(m):
        phrase, book, ch, v = m.group(1).rstrip(',.'), m.group(2), int(m.group(3)), int(m.group(4))
        code = NAME_TO_CODE.get(book)
        if code and quote_ok(phrase, code, ch, v, v):
            return '[[%s %d:%d|%s]]' % (book, ch, v, phrase)
        misses.append(m.group(0))
        return m.group(0)

    new = PAT.sub(rep, text)

    def rep2(m):
        book, ch, v, mid, phrase, punct = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5), m.group(6)
        code = NAME_TO_CODE.get(book)
        if code and quote_ok(phrase.rstrip(',.'), code, ch, v, v):
            return '%s %d:%d%s[[%s %d:%d|%s]]%s' % (book, ch, v, mid, book, ch, v, phrase.rstrip(',.'), punct)
        return m.group(0)

    new = PAT2.sub(rep2, new)
    if new != text:
        open(path, 'w', encoding='utf-8').write(new)
    for x in misses:
        print('UNMATCHED', path, x)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        run(p)
