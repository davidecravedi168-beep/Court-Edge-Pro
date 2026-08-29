from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html'; s=p.read_text(encoding='utf-8')
links='''\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">\n<link rel="apple-touch-icon" sizes="192x192" href="assets/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Court Edge Pro">'''
if 'apple-touch-icon' not in s:s=s.replace('</title>','</title>'+links,1)
if 'court-brand-inline' not in s and '<header class="top"><div class="brand"><h1>' in s:
    s=s.replace('<header class="top"><div class="brand"><h1>','<header class="top"><div class="brand" style="display:flex;align-items:center;gap:9px"><img id="court-brand-inline" src="assets/icon-192.png" alt="" width="34" height="34" style="border-radius:10px"><div><h1>',1)
    s=s.replace('</small></div><div class="league">','</small></div></div><div class="league">',1)
p.write_text(s,encoding='utf-8')
print('Court branding wired')
