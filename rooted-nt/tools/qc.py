"""Quality-control summary for the ROOTED manuscript.

Prints counts used in the QC report and flags anything that looks like
workbook material, hypothetical characters, or placeholders.
"""
import collections, glob, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
files = sorted(glob.glob(os.path.join(ROOT, 'chapters', '*.md')))

SECTIONS = ['## Chapter Background and Story', '## Important Verses Explained',
            '## How to Apply This Chapter to Life Today', '## Chapter Prayer']
SUSPECT = [r'\bask yourself\b', r'\bwrite (?:down|out|in your)\b', r'\bjournal\b', r'\bfill in\b',
           r'\bquiz\b', r'\banswer key\b', r'\bdiscussion questions?\b', r'\breflection questions?\b',
           r'\bimagine (?:a|someone|that you)\b', r'\bpicture (?:a|someone)\b', r'\bsuppose (?:a|someone)\b',
           r'\bnamed (?:Sarah|John|Maria|David|Michael|Anna|James|Grace)\b', r'\bTODO\b', r'\bTBD\b',
           r'\[insert', r'\bplaceholder\b', r'\blorem\b', r'\bparaphras', r'\btracker\b', r'\bcheckbox\b']

problems = []
studies_per = []
quotes = 0
prayers = 0
book_studies = collections.Counter()
for f in files:
    name = os.path.basename(f)
    s = open(f, encoding='utf-8').read()
    heads = [l for l in s.split('\n') if l.startswith('## ')]
    if heads != SECTIONS:
        problems.append('%s: sections %s' % (name, heads))
    n = len(re.findall(r'^### .+ — ', s.split('## Important Verses Explained')[1].split('## How to Apply')[0], re.M))
    studies_per.append(n)
    book_studies[name[3:6]] += n
    if not 2 <= n <= 4:
        problems.append('%s: %d verse studies' % (name, n))
    pr = s.split('## Chapter Prayer')[1].strip()
    prayers += 1
    if pr.count('Amen') != 1 or not pr.endswith('In Jesus’ name, Amen.') or s.count('## Chapter Prayer') != 1:
        problems.append('%s: prayer format' % name)
    if not re.search(r'^theme: \S', s, re.M) or not re.search(r'^main: \S', s, re.M):
        problems.append('%s: missing theme/main' % name)
    quotes += len(re.findall(r'\[\[[^\]|]+\|', s))
    for pat in SUSPECT:
        for m in re.finditer(pat, s, re.I):
            problems.append('%s: suspect "%s"' % (name, s[max(0, m.start() - 40):m.end() + 40].replace('\n', ' ')))

print('chapter files:', len(files))
print('verse studies:', sum(studies_per), ' per chapter min/max:', min(studies_per), max(studies_per),
      ' distribution:', dict(sorted(collections.Counter(studies_per).items())))
print('chapter prayers:', prayers)
print('verified inline quotations (markup):', quotes)
print('problems:', len(problems))
for p in problems:
    print('  ', p)
