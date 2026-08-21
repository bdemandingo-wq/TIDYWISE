#!/usr/bin/env python3
"""Extract one mockup section's markup from the source-of-truth HTML.

Usage: extract.py <id> [--text|--raw]
The HTML is the authority on measurements; the PNGs are for eyeballing only.
"""
import re, sys, html

SRC = __file__.rsplit('/',1)[0] + '/TidyWise-Mockups.html'

def section(sid):
    s = open(SRC, encoding='utf-8', errors='replace').read()
    i = s.find('id="%s"' % sid)
    if i < 0: raise SystemExit('no section %s' % sid)
    # back up to the start of that element's tag
    start = s.rfind('<', 0, i)
    nxt = re.search(r'id="\d+[a-z]"', s[i+10:])
    end = i + 10 + nxt.start() if nxt else len(s)
    end = s.rfind('<', 0, end)
    return s[start:end]

def text(m):
    m = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', m, flags=re.S)
    m = re.sub(r'<br\s*/?>', '\n', m)
    m = re.sub(r'</(div|p|li|tr|h\d)>', '\n', m)
    m = re.sub(r'<[^>]+>', ' ', m)
    m = html.unescape(m)
    m = re.sub(r'[ \t]+', ' ', m)
    return '\n'.join(l.strip() for l in m.split('\n') if l.strip())

if __name__ == '__main__':
    sid = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else '--text'
    m = section(sid)
    print(text(m) if mode == '--text' else m)
