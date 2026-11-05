"""Print a chapter of the WEB: python3 tools/show.py MAT 1"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs
code = sys.argv[1]
for ch in sys.argv[2:]:
    print('==', refs.CODE_TO_NAME[code], ch)
    for v, t in refs.WEB[code][ch].items():
        print(v, t)
