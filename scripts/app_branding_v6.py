from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]; AS=ROOT/'assets'; AS.mkdir(exist_ok=True)
BG=(5,11,19); ORANGE=(242,145,45); GOLD=(229,189,111); INK=(235,239,244)
def icon(size):
    im=Image.new('RGB',(size,size),BG); d=ImageDraw.Draw(im); pad=int(size*.08); o=max(2,int(size*.012))
    d.rounded_rectangle((pad,pad,size-pad,size-pad),radius=int(size*.18),outline=(95,61,28),width=o)
    w=max(4,int(size*.028)); box=(size*.26,size*.18,size*.74,size*.66)
    d.arc(box,205,520,fill=GOLD,width=w)
    # basketball arcs
    d.arc((size*.32,size*.24,size*.68,size*.60),0,360,fill=ORANGE,width=w)
    d.arc((size*.32,size*.34,size*.68,size*.54),180,360,fill=ORANGE,width=max(3,int(size*.018)))
    d.arc((size*.39,size*.24,size*.61,size*.60),80,280,fill=ORANGE,width=max(3,int(size*.018)))
    d.line([(size*.31,size*.69),(size*.69,size*.69)],fill=INK,width=max(3,int(size*.018)))
    d.line([(size*.36,size*.69),(size*.43,size*.83),(size*.50,size*.69),(size*.57,size*.83),(size*.64,size*.69)],fill=(130,138,148),width=max(2,int(size*.012)))
    return im
for s in (180,192,512): icon(s).save(AS/f'icon-{s}.png',optimize=True)
(ROOT/'manifest.webmanifest').write_text('''{"name":"Court Edge Pro — Basketball Intelligence","short_name":"CourtEdge","start_url":"./","scope":"./","display":"standalone","background_color":"#050b13","theme_color":"#050b13","icons":[{"src":"assets/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"assets/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}''',encoding='utf-8')
p=ROOT/'index.html'; s=p.read_text(encoding='utf-8')
links='''\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">\n<link rel="apple-touch-icon" sizes="180x180" href="assets/icon-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Court Edge Pro">'''
if 'apple-touch-icon' not in s:s=s.replace('</title>','</title>'+links,1)
if 'court-brand-inline' not in s and '<header class="top"><div class="brand"><h1>' in s:
    s=s.replace('<header class="top"><div class="brand"><h1>','<header class="top"><div class="brand" style="display:flex;align-items:center;gap:9px"><img id="court-brand-inline" src="assets/icon-192.png" alt="" width="34" height="34" style="border-radius:10px"><div><h1>',1)
    s=s.replace('</small></div><div class="league">','</small></div></div><div class="league">',1)
p.write_text(s,encoding='utf-8'); print('Court premium branding ready')