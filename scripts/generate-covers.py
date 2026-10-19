from pathlib import Path
from math import sin,cos,pi
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'public/game-art'
INK='#30283b'
def lin(i,a,b,x1='0%',y1='0%',x2='80%',y2='100%'):
 return f'<linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
def rad(i,a,b,c=None):
 return f'<radialGradient id="{i}" cx="32%" cy="22%" r="82%"><stop stop-color="{a}"/>'+ (f'<stop offset=".6" stop-color="{c}"/>' if c else '')+f'<stop offset="1" stop-color="{b}"/></radialGradient>'
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=0):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def circle(x,y,r,fill,stroke=None,sw=0):
 return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def path(d,fill='none',stroke=None,sw=0,extra=''):
 return f'<path d="{d}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"' if stroke else '')+f' {extra}/>'
def star(x,y,s,c='#fff0b8'):
 return path(f'M{x} {y-s}q0 {s} {s} {s}q-{s} 0-{s} {s}q0-{s}-{s}-{s}q{s} 0 {s}-{s}Z',c)
def face(x,y,s=1,ink='#285336',smile=True):
 return f'<g transform="translate({x} {y}) scale({s})">'+''.join(f'<ellipse cx="{a}" cy="0" rx="5.5" ry="7.5" fill="{ink}"/>'+circle(a-1.5,-3,1.7,'#fff9de') for a in [-19,19])+'<g fill="#f59e76" opacity=".65"><ellipse cx="-30" cy="16" rx="8" ry="4"/><ellipse cx="30" cy="16" rx="8" ry="4"/></g>'+path('M-10 18q10 15 20 0',ink,ink,3)+path('M-5 26q5-3 10 0',stroke='#ffb0a3',sw=3)+'</g>'
def cover(slug,title,body,defs=''):
 shadow='<filter id="shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="3" dy="7" stdDeviation="3" flood-color="#0d0c20" flood-opacity=".25"/></filter>'
 svg=f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 410" role="img" aria-labelledby="title desc"><title id="title">{title}</title><desc id="desc">Original illustrated game cover for Pocket Arcade.</desc><defs>{shadow}{defs}</defs>{body}</svg>\n'
 (P/slug/'cover.svg').write_text(svg)
# COLOR BLOCKS: chunky toy blocks with individually lit bevels.
def block(x,y,c1,c2,n=65):
 return f'<g transform="translate({x} {y})">'+rect(3,5,n,n,'#1c152b',7)+rect(0,0,n,n,c2,6, '#31213d',2)+path(f'M5 5h{n-10}l-8 9H13Z',c1)+rect(10,12,n-22,n-23,c1,2)+path(f'M5 {n-5}h{n-10}l-8-9H13Z','#000',extra='opacity=".12"')+path(f'M{n-5} 5v{n-10}l-9-8V13Z','#000',extra='opacity=".15"')+path(f'M8 6h{n-17}',stroke='#fff6bc',sw=2,extra='opacity=".35"')+'</g>'
b=rect(0,0,320,410,'url(#bg)')+path('M0 365 320 210v200H0Z','#2a2038')
b+='<g opacity=".13" stroke="#b19ac8" stroke-width="1">'+''.join(path(f'M{x} 110v300',stroke='#b19ac8',sw=1)+path(f'M0 {x+110}h320',stroke='#b19ac8',sw=1) for x in range(0,350,67))+'</g>'
for x,y,c,d in [(0,216,'#bf69fa','#8f3fce'),(0,283,'#b566f5','#873bc7'),(0,350,'#b666f0','#873bc7'),(67,283,'#92da50','#67b632'),(67,350,'#95d855','#63b037'),(134,350,'#95d855','#63b037'),(201,283,'#ff795a','#e94f3e'),(201,350,'#ff795a','#e94f3e'),(268,350,'#ff795a','#e94f3e')]:b+=block(x,y,c,d)
b+='<g filter="url(#shadow)" transform="translate(42 153) rotate(-4 65 65)">'+block(0,0,'#ffdb56','#edb42a')+block(67,0,'#ffdb56','#edb42a')+block(67,67,'#ffdb56','#edb42a')+'</g>'+star(223,174,9,'#ffdc63')+star(203,146,4,'#ffdc63')
cover('color-blocks','Chunky jewel blocks snapping into a colourful grid',b,lin('bg','#49304f','#292135'))
# WATER SORT: translucent glass, believable liquid menisci, active pour.
d=lin('bg','#60446e','#43304f')+lin('glass','#f5ddff','#b598c5')+lin('shine','#ffffff99','#ffffff00')
for i,a,z in [('yellow','#ffdc58','#f8b321'),('red','#ff7158','#e7463d'),('blue','#34c8ed','#078bcc'),('green','#51ed83','#0db752')]:d+=lin(i,a,z)
b=rect(0,0,320,410,'url(#bg)')
for x,y,r in [(35,167,58),(254,367,91)]:b+=circle(x,y,r,'#74547f')
def tube(x,y,layers):
 h=205;out=f'<g transform="translate({x} {y})" filter="url(#shadow)">'
 out+=path('M-8 0H58Q66 0 63 8L57 18V174Q57 204 28 205Q0 204 0 174V18L-6 8Q-10 4-8 0Z','#2e263c','#d9c6e4',4)
 out+='<clipPath id="clip'+str(x)+'">'+path('M5 18h47v156q0 25-24 25T5 174Z','#fff')+'</clipPath>'
 out+='<g clip-path="url(#clip'+str(x)+')">'
 for j,col in enumerate(layers):
  yy=199-(j+1)*43;out+=rect(4,yy,50,45,'url(#'+col+')')+f'<ellipse cx="29" cy="{yy}" rx="25" ry="3" fill="#fff" opacity=".16"/>'
 out+='</g>'+path('M7 23v143q0 25 14 29',stroke='#fff',sw=4,extra='opacity=".26"')+path('M50 23v142',stroke='#fff',sw=2,extra='opacity=".17"')+'</g>';return out
b+=tube(139,185,['blue','red','yellow'])+tube(235,185,['green','yellow','red','green'])
b+='<g transform="translate(31 117) rotate(42 29 95)" filter="url(#shadow)">'+path('M-8 0H62Q70 0 66 9L59 18V150Q59 181 29 181T0 150V18L-7 9Q-11 5-8 0Z','#4a3659','#e2d3ec',4)+path('M5 67H54V150q0 25-25 25T5 150Z','url(#yellow)')+path('M5 135h49v15q0 25-25 25T5 150Z','url(#green)')+path('M9 24v119',stroke='#fff',sw=4,extra='opacity=".4"')+'</g>'+path('M117 163q43-16 49 27',stroke='#ffce42',sw=10)+circle(134,139,7,'#ffd954')+circle(162,156,4,'#ffd954')+star(101,239,6,'#e1b2f3')
cover('water-sort','A bright stream pouring between glass colour tubes',b,d)
# FRUIT: use independently illustrated specialist fruit, polished further with richer background.
source=ROOT/'scripts/art-sources/fruit-merge.svg'
if source.exists():
 s=source.read_text().replace('<path fill="url(#fm-cloth)" d="M0 96h320v314H0z"/>','<path fill="url(#fm-cloth)" d="M0 0h320v410H0z"/>')
 (P/'fruit-merge/cover.svg').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'+s)
# TOWER: proper isometric planes, sky atmosphere, stacked height.
d=lin('sky','#ef93b9','#9f6ec6',x2='0%',y2='100%')+rad('light','#ffe8eb','#ffe8eb00')
b=rect(0,0,320,410,'url(#sky)')+circle(83,225,180,'url(#light)')
for x,y,s in [(45,113,3),(280,151,4),(217,104,2),(47,273,2),(283,309,3),(121,115,2)]:b+=star(x,y,s,'#fff3eb')
def cuboid(x,y,w,dep,h,top,left,right):
 return path(f'M{x} {y}l{w*.54}-{dep} {w*.46} {dep} -{w*.54} {dep}Z',top)+path(f'M{x} {y}l{w*.46} {dep}v{h}l-{w*.46}-{dep}Z',left)+path(f'M{x+w*.46} {y+dep}l{w*.54}-{dep}v{h}l-{w*.54} {dep}Z',right)+path(f'M{x+2} {y}l{w*.46-2} {dep-1}',stroke='#ffffff',sw=1.2,extra='opacity=".25"')
for x,y,w,h,t,l,r in [(60,377,174,59,'#6963e4','#5144c7','#383698'),(74,334,158,58,'#697bea','#5064d0','#3e489d'),(88,291,141,58,'#5e8adf','#417bc6','#37639f'),(98,247,125,58,'#57a0e0','#3e88c7','#326e9f'),(110,202,109,58,'#52b4df','#3a9ccc','#277c9f')]:b+=cuboid(x,y,w,w*.32,h,t,l,r)
b+='<g filter="url(#shadow)">'+cuboid(197,134,91,29,48,'#67d3ec','#46afd2','#2788ae')+'</g>'+path('M222 192v14m26-9v14',stroke='#f3d6ed',sw=2,extra='opacity=".4"')
cover('tower','An ascending blue tower under a rose coloured sky',b,d)
# SNAKE: individual round segments, continuous rounded path, a lively head.
d=lin('bg','#ffecc2','#f4d59a')+rad('body','#bcf56c','#4b9e36','#83ca4a')+rad('head','#c6f177','#519e39','#8ccf4e')+rad('apple','#ffb15b','#d94b33','#f5753c')
b=rect(0,0,320,410,'url(#bg)')+'<g opacity=".23">'+''.join(rect(x,y,25,25,'#e9bd75') for y in range(110,435,25) for x in range(0,350,25) if ((x+y)//25)%2==0)+'</g>'
coords=[]
for x in range(123,267,22):coords.append((x,148))
for y in range(170,369,22):coords.append((267,y))
for x in range(245,50,-22):coords.append((x,368))
for y in range(346,206,-22):coords.append((53,y))
b+=path('M123 148h144v220H53V220',stroke='#447f30',sw=32)
for x,y in coords:b+=circle(x+2,y+3,16,'#4d8031')+circle(x,y,15,'url(#body)')+path(f'M{x-6} {y-8}q6-3 11 0',stroke='#e8ffac',sw=2.2,extra='opacity=".65"')
b+='<g transform="translate(100 148) rotate(-7)" filter="url(#shadow)">'+path('M19-20q-44-19-58 4-12 24 14 33 21 8 44-7Z','url(#head)','#396e2c',3)+path('M-36 10l-20 6m12-4-10-2',stroke='#db604b',sw=3)+circle(-15,-15,11,'#fff9df','#528731',2)+circle(3,-13,10,'#fff9df','#528731',2)+circle(-17,-14,5,'#233e29')+circle(1,-12,5,'#233e29')+circle(-18,-16,1.5,'#fff')+circle(0,-14,1.5,'#fff')+path('M-21 12q10 5 18 1',stroke='#3c722e',sw=2)+'</g>'
b+='<g transform="translate(130 264) rotate(-10)">'+path('M0-30C-34-57-61-21-37 17-10 56 21 43 37 10 55-24 27-51 0-30Z','url(#apple)','#cc5834',3)+path('M0-30q-3-22 7-31',stroke='#8c6330',sw=6)+path('M6-47q13-23 32-13-6 24-32 13Z','#76aa36','#4f8a2e',2)+path('M-28-18q-8 13-2 24',stroke='#ffdf8a',sw=6,extra='opacity=".7"')+'</g>'
cover('snake','A bright green snake curls around a juicy apple',b,d)
# MINESWEEPER: proper molded field and oversized comic flags.
d=lin('bg','#405967','#25343e')+lin('cell','#f4fbf6','#b7cece')+lin('closed','#7f9aa5','#4d6978')+rad('mine','#5d6b70','#17252e','#25323c')
b=rect(0,0,320,410,'url(#bg)')
b+='<g transform="translate(14 176) rotate(12 145 120)" filter="url(#shadow)">'+rect(-4,-4,318,277,'#142a35',9)
nums={(0,1):('1','#3994d1'),(0,3):('2','#319b71'),(1,0):('1','#3994d1'),(1,2):('3','#db6251'),(1,3):('2','#319b71'),(2,1):('1','#3994d1'),(2,2):('2','#319b71'),(3,2):('1','#3994d1')}
for r in range(5):
 for c in range(6):
  x,y=c*52,r*52;closed=(r+c)%3==0 and r<3
  b+=rect(x,y,50,50,'url(#closed)' if closed else 'url(#cell)',3,'#294451',2)
  if closed:b+=path(f'M{x+4} {y+4}h42l-6 6H{x+10}v28l-6 7Z','#a4b7bd')
  if (r,c) in nums:
   v,col=nums[r,c];b+=f'<text x="{x+25}" y="{y+37}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="35" fill="{col}">{v}</text>'
  if (r,c) in [(0,0),(1,4)]:
   b+=path(f'M{x+15} {y+41}h24m-12 0V{y+6}',stroke='#303c44',sw=4)+path(f'M{x+26} {y+7}l21 10-21 11Z','#ff6253','#c43d39',1.5)
b+='</g>'
b+='<g transform="translate(239 143) rotate(12)" filter="url(#shadow)">'+path('M0 0v96M-21 96h45',stroke='#dce6dc',sw=7)+path('M4 0q35-10 65 3L58 42Q31 28 4 41Z','#ff635d','#7a3840',3)+path('M11 6q27-7 48 0',stroke='#ffb9a0',sw=3)+'</g>'+star(64,144,6,'#aacbd1')
cover('minesweeper','A tilted minefield with bright red flags',b,d)
# SUIT PATHS and paper cards for solitaire.
def suit(kind,x,y,s,col):
 ds={'heart':'M0 7C-28-15-22-34-7-30Q0-29 0-20Q0-29 7-30C22-34 28-15 0 7Z','spade':'M0-34C-9-20-29-10-20 4Q-11 14-2 3L-7 17H7L2 3Q11 14 20 4C29-10 9-20 0-34Z','diamond':'M0-34 20-8 0 18-20-8Z','club':'M-5-12C-25-32 0-45 9-30Q17-17 5-12C28-21 30 11 9 9L3 4 8 20H-8L-3 4C-20 23-37-10-16-16Z'}
 return f'<g transform="translate({x} {y}) scale({s})">'+path(ds[kind],col)+'</g>'
def card(x,y,ang,rank,k,col,w=85,h=124,court=False):
 b=f'<g transform="translate({x} {y}) rotate({ang})" filter="url(#shadow)">'+rect(0,0,w,h,'url(#paper)',8,'#173e37',2.5)+rect(5,5,w-10,h-10,'none',5,'#e8ddbb',.8)+f'<text x="10" y="26" font-family="Georgia,serif" font-weight="bold" font-size="25" fill="{col}">{rank}</text>'+suit(k,16,43,.35,col)
 if not court:b+=suit(k,w*.55,h*.68,1.16,col)
 else:
  b+=rect(27,19,48,94,'#f3cc6d',2,'#c3a659',1)+path('M31 81 46 57 70 79v27H31Z','#327e9e')+path('M45 37h20v25L53 71 43 57Z','#ffe9bd','#5e5346',1.5)+path('M40 37l-5-16 12 6 6-14 8 13 12-7-6 18Z','#e4b643','#8d6e36',1.5)+path('M44 57q9-6 19 0l-3 12-9 7-8-12Z','#553d35')+circle(48,47,1.5,'#372f2b')+circle(59,47,1.5,'#372f2b')+path('M36 89l28 11M54 77v29',stroke='#f7df92',sw=4)
 b+=f'<g transform="translate({w} {h}) rotate(180)"><text x="8" y="25" font-family="Georgia,serif" font-weight="bold" font-size="23" fill="{col}">{rank}</text></g></g>';return b
d=lin('felt','#169956','#08733e')+lin('paper','#fffdf3','#e9e4cf',x2='100%',y2='100%')+'<pattern id="feltPattern" width="22" height="22" patternUnits="userSpaceOnUse"><path d="m11 3 6 8-6 8-6-8Z" stroke="#004d2e" stroke-width="1" opacity=".12"/></pattern>'
b=rect(0,0,320,410,'url(#felt)')+rect(0,0,320,410,'url(#feltPattern)')
for x,y in [(121,137),(204,115),(286,93)]:b+='<g transform="rotate(-13 '+str(x)+' '+str(y)+')">'+rect(x,y,73,105,'#096b3e',8,'#065b34',3)+suit('spade',x+36,y+58,.68,'#095d37')+'</g>'
b+=card(21,172,-15,'A','heart','#cc3941')+card(89,299,-17,'4','heart','#c3323c')+card(151,274,-10,'3','club','#183849')+card(214,248,-3,'K','spade','#173b49',court=True)
cover('solitaire','Cream playing cards fanned across rich green felt',b,d)
# BLOCK FILL: tactile path made from raised gold tiles.
d=lin('bg','#3e464a','#252c31')+lin('gold','#ffdf61','#efac24')+lin('path','#f9b62c','#e89112')+lin('steel','#76848b','#505e69')
b=rect(0,0,320,410,'url(#bg)')+'<g transform="translate(-11 122) rotate(12 160 150)" filter="url(#shadow)">'+rect(-7,-7,350,350,'#1d252b',18)
for r in range(5):
 for c in range(5):
  x,y=c*69,r*69;active=not ((r,c) in [(0,4),(1,4),(2,0),(3,0),(4,0),(4,1)])
  b+=rect(x,y,64,64,'url(#gold)' if active else 'url(#steel)',8)+path(f'M{x+9} {y+5}h46',stroke='#fff3a0' if active else '#91a1a6',sw=2,extra='opacity=".55"')
b+=path('M32 32h207v69H101v69h207v69H101v69h207',stroke='#b96b0b',sw=32)+path('M32 28h207v69H101v69h207v69H101v69h207',stroke='url(#path)',sw=29)+circle(32,32,19,'#9d6011')+circle(32,29,15,'#a16a15')+path('M108 303h192',stroke='#ffdd6c',sw=3,extra='opacity=".5"')+'</g>'
cover('block-fill','One continuous golden trail fills a tilted puzzle grid',b,d)
# COLOR CONNECT: raised board, uninterrupted coloured tubular paths.
d=lin('bg','#654d74','#45334f')+lin('board','#31273e','#1b1c2e')
colors=[('#a1ef5a','#60ad30'),('#ffda57','#eea824'),('#ff8b82','#f04e61'),('#58e9e0','#13b9c5')]
for j,(a,z) in enumerate(colors):d+=lin('flow'+str(j),a,z)
b=rect(0,0,320,410,'url(#bg)')+'<g transform="translate(-12 152) rotate(14 160 140)" filter="url(#shadow)">'+rect(-8,-8,362,362,'#30263c',16)
for r in range(5):
 for c in range(5):b+=rect(c*73,r*73,68,68,'url(#board)',7)
for j,points in enumerate(['M34 34v219','M107 180V34h73','M107 253h73V107h146','M253 180v146H34']):
 b+=path(points,stroke='#0f1526',sw=32)+path(points,stroke='url(#flow'+str(j)+')',sw=25)
 ends=[((34,34),(34,253)),((107,180),(180,34)),((107,253),(326,107)),((253,180),(34,326))][j]
 for x,y in ends:b+=circle(x,y,27,colors[j][1],'#211a32',2)+circle(x,y-3,24,'url(#flow'+str(j)+')')+path(f'M{x-11} {y-17}q11-5 20 0',stroke='#fff',sw=3,extra='opacity=".35"')
b+='</g>'
cover('color-connect','Colourful rounded paths link matching pegs on a purple board',b,d)
# BALL RUN: deep neon corridor, luminous glassy sphere and track.
d=lin('bg','#0d102b','#050510',x2='0%',y2='100%')+rad('orb','#f45aff','#520d8e','#c60ccd')+rad('halo','#b62fe64d','#7c1aa900')+lin('track','#152048','#171238')+'<clipPath id="ballclip"><circle cx="187" cy="291" r="86"/></clipPath>'
b=rect(0,0,320,410,'url(#bg)')+circle(190,300,150,'url(#halo)')+path('M134 155 15 410h299L183 155Z','url(#track)')
# Corridor walls and perspective lines.
b+=path('M0 95h39l95 60L15 410H0Z','#0d1330')+path('M284 95h36v315h-6L183 155Z','#111634')
for x in range(-450,901,92):b+=path(f'M158 150 {x} 410',stroke='#3941a4',sw=1.5)
for y in [174,191,215,247,291,351,409]:
 factor=(y-150)/260;lx=134-(119*factor);rx=183+131*factor;b+=path(f'M{lx} {y}H{rx}',stroke='#4d4ab9',sw=1.5)
for x in [3,24,47,293,312]:b+=path(f'M{x} 97v313',stroke='#293775',sw=2)
b+=path('M134 155 15 410M183 155l131 255',stroke='#9955fc',sw=3)+path('M134 155 15 410',stroke='#a079ff',sw=1)
b+=path('M55 243h19v21H55Z','#c731ff','#f26dff',1.5)+path('m55 243 5-6h19l-5 6Z','#f45aff')+path('m74 243 5-6v21l-5 6Z','#73239e')
b+='<ellipse cx="188" cy="384" rx="82" ry="16" fill="#b337e2" opacity=".23"/><circle cx="187" cy="291" r="87" fill="#5e0c82"/><circle cx="187" cy="288" r="85" fill="url(#orb)"/>'
b+='<g clip-path="url(#ballclip)" opacity=".3" stroke="#490664" stroke-width="15">'+path('M90 285q92-82 191-41M98 326q94-77 181-39M120 361q69-57 130-32',stroke='#490664',sw=15)+'</g><ellipse cx="166" cy="236" rx="41" ry="14" transform="rotate(-12 166 236)" fill="#ffb1ff" opacity=".26"/>'+path('M128 250q-18 18-18 43',stroke='#ff7dff',sw=3,extra='opacity=".4"')+circle(177,170,2,'#c7b4ff')
cover('ball-run','A glossy magenta ball races down a deep neon corridor',b,d)
# POOL: individually numbered lacquered billiard balls, cue and felt.
d=lin('bg','#0a9256','#00673e')+rad('feltLight','#3ac37650','#00673e00')
ballcolors=[('#fff5a0','#deac16'),('#88c7ef','#1b70b1'),('#ffa294','#ce4337'),('#c9a1e4','#7242a2'),('#ffc270','#e78125'),('#a1dda8','#2e975a'),('#d48775','#983e37'),('#657078','#151e25')]
for j,(a,z) in enumerate(ballcolors):d+=rad('ball'+str(j),a,z)
d+=rad('ivory','#fffef2','#c2d2c1')+lin('cue','#f6d4a0','#b98047')
b=rect(0,0,320,410,'url(#bg)')+circle(156,255,210,'url(#feltLight)')+'<g opacity=".09" stroke="#fff" stroke-width=".6">'+''.join(path(f'M0 {y}h320',stroke='#fff',sw=.6) for y in range(0,410,5))+'</g>'
b+=path('M18 420 99 174',stroke='#144f39',sw=12)+path('M11 418 92 171',stroke='#694e30',sw=9)+path('M11 418 92 171',stroke='url(#cue)',sw=5)+path('M88 182l5-14',stroke='#f0e7ca',sw=5)+path('M92 171l2-6',stroke='#66b7b8',sw=4)
b+='<ellipse cx="101" cy="164" rx="22" ry="20" fill="#005136"/>'+circle(98,159,20,'url(#ivory)')+circle(90,151,4,'#fff',None)
# Rack base upper row five, point lower. Exact solid/stripe colours and numbers.
numbers=[[1,10,3,12,5],[14,7,8,9],[2,11,4],[13,6],[15]]
for r,row in enumerate(numbers):
 for c,num in enumerate(row):
  x=160+(c-(len(row)-1)/2)*45;y=209+r*40;idx=(num-1)%8
  b+=f'<ellipse cx="{x+3}" cy="{y+8}" rx="23" ry="21" fill="#003c2b" opacity=".6"/>'
  if num>8:
   b+=circle(x,y,22,'url(#ivory)','#065039',1.5)+f'<clipPath id="p{num}">'+circle(x,y,22,'#fff')+'</clipPath>'+f'<g clip-path="url(#p{num})">'+rect(x-24,y-13,48,26,'url(#ball'+str(idx)+')',8)+'</g>'
  else:b+=circle(x,y,22,'url(#ball'+str(idx)+')','#065039',1.5)
  b+=circle(x,y,9,'#fff7df')+f'<text x="{x}" y="{y+4}" font-family="Arial,sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="#273a37">{num}</text>'+f'<ellipse cx="{x-7}" cy="{y-12}" rx="7" ry="3" transform="rotate(-30 {x-7} {y-12})" fill="#fff" opacity=".5"/>'
cover('pool','A rack of glossy numbered billiard balls with a wooden cue',b,d)
# ANIMAL STACK: sculpted original animals with distinct, organic silhouettes.
d=lin('sky','#04bbd6','#67d8e4',x2='0%',y2='100%')+lin('hippo','#b4b3ef','#7d7cb8')+lin('fox','#ffa960','#e9793d')+lin('turtle','#acd976','#5da36c')+lin('sheep','#fff8d8','#e8d7b6')
b=rect(0,0,320,410,'url(#sky)')+'<g fill="#c1f4ed" opacity=".35"><ellipse cx="22" cy="139" rx="50" ry="14"/><ellipse cx="300" cy="243" rx="47" ry="14"/></g><ellipse cx="163" cy="405" rx="141" ry="11" fill="#168ea5" opacity=".4"/>'+rect(18,384,285,15,'#80c633',6,'#275d48',3)+rect(23,384,275,5,'#bbef5e',2)
# Bottom hippo, squat broad curve, four chunky legs, long muzzle.
b+='<g transform="translate(153 339) rotate(-3)" stroke="#334355" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">'+path('M-92-8Q-105-47-49-46H35Q74-43 71-6L65 37H39L35 18H-47L-51 37H-78Z','url(#hippo)')+path('M-81-27Q-48-42 4-34',stroke='#d5d1fa',sw=7)+path('M36-22Q40-56 66-43L82-19Q111-16 112 7Q113 25 80 27L46 17Z','url(#hippo)')+circle(58,-40,10,'#aaa8df','#334355',3)+circle(58,-40,4,'#ddbdcf')+circle(68,-14,5,'#293b48')+circle(67,-16,1.5,'#fff')+path('M92 4v3M104 3v3',stroke='#71688d',sw=4)+path('M76 19q14 4 25-2',stroke='#625b83',sw=2)+path('M-91-8q-25-3-18 13',stroke='#334355',sw=4)+path('M-72 34v-5m10 5v-5m106 5v-5m10 5v-5',stroke='#665d8a',sw=2)+'</g>'
# Fox above, left tail counterbalances right-facing head.
b+='<g transform="translate(159 265) rotate(5)" stroke="#59443f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">'+path('M-55-2Q-113 7-107-42L-81-23Q-76-48-45-24Z','url(#fox)')+path('M-108-42-81-23-94-7q-14-5-14-35Z','#fff0cf')+path('M-62-17Q-62-40-15-34H33Q56-33 55-11L45 24H29L26 11H-23L-30 29H-48Z','url(#fox)')+path('M25-22 30-57 49-43 69-52 74-15 55 6 34-1Z','url(#fox)')+path('M33-43 36-30 43-36M62-41 55-29 66-29','#b06948')+path('M30-21 51-12 73-23 67-5 55 6 38-1Z','#fff0d1')+circle(43,-26,3,'#3d3936')+circle(61,-26,3,'#3d3936')+path('M47-11h10l-5 5Z','#383531')+path('M-33-22h35',stroke='#ffc98a',sw=6)+path('M-45 26h14M31 22h12',stroke='#65463e',sw=4)+'</g>'
# Tortoise, rounded shell and funny reaching neck.
b+='<g transform="translate(135 202) rotate(-8)" stroke="#365747" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">'+path('M-62 9q-2-57 52-58 56 0 61 53Z','url(#turtle)')+path('M-60 8Q-5 26 50 6l-1 11q-55 16-110-1Z','#c9e59b')+path('M-43-25-19-12-22 6m3-18 25-12 23 14m-23-14-4-18M6-24 8 6M29-10l16-11',stroke='#49865b',sw=3)+path('M40 0Q62-20 76-11 94 7 76 20L43 15Z','#b9d98b')+circle(76,0,4,'#2a4740')+circle(75,-1,1,'#fff')+path('M81 12h-8',stroke='#51805c',sw=2)+path('M-47 16l-8 13h17l5-11M19 18l-1 12h17l5-15','#7ca767')+'</g>'
# Woolly sheep top, balancing diagonally.
b+='<g transform="translate(174 131) rotate(12)" stroke="#3a4c51" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">'+path('M-33 13-30 28h13l1-13m34-2 1 15h13l3-20','#626f74')+path('M-45-12q-15-17 4-23 3-19 21-13 13-16 27-3 20-9 27 8 21 0 19 18 20 15 4 28-4 18-22 14-17 16-34 3-23 9-30-10-23 0-16-22Z','url(#sheep)')+path('M26-12q14-12 28 2l5 22q-11 17-25 5Z','#829092')+path('M28-8q-24-15-16 3l17 7M52-8q17-15 16-1l-12 10','#829092')+circle(42,1,3,'#273e44')+circle(53,3,3,'#273e44')+path('M47 12h6',stroke='#364f52',sw=2)+path('M-25-29q-11 9-1 15M-9-35q-12 9-1 15M8-29q-11 9 0 15',stroke='#d8cba9',sw=3)+'</g>'+star(51,218,8,'#fff1a3')+star(274,133,7,'#fff1a3')+star(269,303,4,'#fff1a3')
cover('animal-stack','Expressive hippo fox tortoise and sheep balance in a playful animal tower',b,d)
print('Redrew twelve locally bundled SVG covers.')
