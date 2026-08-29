from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
marker='<script src="quant-math-v5.js?v=5.0"></script>\n<script src="quant-desk-v5.js?v=5.0"></script>'
if marker not in s:
    if '</body>' not in s:
        raise SystemExit('index.html missing </body>')
    s=s.replace('</body>',marker+'\n</body>')
    p.write_text(s,encoding='utf-8')
    print('Court V5 quant UI scripts injected')
else:
    print('Court V5 quant UI already present')
