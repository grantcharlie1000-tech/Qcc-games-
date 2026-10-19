"""Original textbook vectors; no third-party art or runtime drawing dependency."""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parents[1] / 'src/study/diagrams'
OUT.mkdir(parents=True, exist_ok=True)
INK, GREEN, GOLD, BLUE, RED = '#263e38', '#28745e', '#c78a29', '#386e9e', '#ad4d46'

def text(x, y, label, size=20, colour=INK, anchor='middle'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{colour}" text-anchor="{anchor}">{escape(label)}</text>'

def box(x, y, w, h, label, fill='#e3eee5', size=19):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="#b6c8ba"/>' + text(x+w/2, y+h/2+7, label, size)

def line(x1,y1,x2,y2,colour=GREEN,arrow=False,dash=False):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{colour}" stroke-width="3"' + (' marker-end="url(#arrow)"' if arrow else '') + (' stroke-dasharray="7 7"' if dash else '') + '/>'

def save(name, title, desc, body, height=340):
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 {height}" role="img" aria-labelledby="{name}-title {name}-desc">
<title id="{name}-title">{escape(title)}</title><desc id="{name}-desc">{escape(desc)}</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="{GREEN}"/></marker></defs>
<g font-family="system-ui, sans-serif">{body}</g></svg>'''
    # Each SVG is independently usable; the article renderer prefixes definition IDs.
    (OUT / f'{name}.svg').write_text(svg, encoding='utf-8')

save('close-reading','From detail to interpretation','A short quotation leads to a language observation, a reader effect and an interpretation supported by evidence.',
     box(40,32,250,90,'“The gate swallowed her.”')+box(350,32,250,90,'Personification')+line(295,77,345,77,arrow=True)+line(475,126,475,197,arrow=True)+box(350,204,250,90,'Threat and isolation')+line(345,249,295,249,arrow=True)+box(40,204,250,90,'Belonging feels unsafe'))
save('essay-writing','Building an evidence-based paragraph','An argument rests on a claim, evidence, explanation of how the evidence works, and a link back to the thesis.',
     box(54,28,532,56,'THESIS · the argument you will prove','#d8e6dc')+box(90,104,460,48,'1  Claim: a focused reason')+box(90,166,460,48,'2  Evidence: a precise detail')+box(90,228,460,48,'3  Explain: how and why it matters')+text(320,316,'Link the reasoning back to the thesis',19))
save('poetry','Speaker, image and tonal shift','Three stages of an invented poem move from an open window and hopeful mood, through a hinge word, to a closed latch and confinement.',
     box(35,52,235,146,'Open window','#e3eee5',24)+text(152,166,'hopeful · airy',18)+box(370,52,235,146,'Closed latch','#f4e7d4',24)+text(487,166,'confined · tense',18)+line(278,122,360,122,arrow=True)+text(320,239,'“but” marks a possible turn',22)+text(320,283,'Test the shift against the whole poem',19))
save('film-language','How a frame positions an audience','A large foreground figure shot from a low position appears imposing. Framing, angle, light and sound work together rather than having fixed meanings.',
     '<rect x="72" y="30" width="496" height="242" rx="6" fill="#e0e6df" stroke="#263e38" stroke-width="4"/><path d="M72 208L320 85L568 208" fill="#c5d2c7"/><circle cx="320" cy="111" r="39" fill="#567562"/><path d="M240 255Q245 149 320 149Q395 149 400 255" fill="#567562"/>'+text(148,74,'low angle',19)+line(180,82,261,135,arrow=True)+text(320,312,'Analyse the effect in this specific scene',20))

grid=''.join(line(x,40,x,268,'#d8dfd8') for x in range(90,571,80))+''.join(line(90,y,570,y,'#d8dfd8') for y in range(68,269,40))
axes=grid+line(90,268,590,268)+line(90,268,90,30)+text(588,300,'x',20)+text(59,40,'y',20)
save('linear-relationships','The line y = 2x + 3','Points (0,3), (1,5) and (2,7) lie on y equals 2x plus 3. Moving one unit right moves two units up.',
     axes+line(90,208,410,48,BLUE)+''.join(f'<circle cx="{90+80*x}" cy="{268-20*(2*x+3)}" r="6" fill="{BLUE}"/>' for x in range(5))+text(178,230,'(0, 3)',18)+text(340,112,'rise 2 / run 1',18)+text(390,322,'Gradient = 2 · intercept = 3',20))
# Coordinates use x in [-1,5] and y in [-2,5], with the actual zeros at x=1 and x=3.
qx=lambda x:105+(x+1)*72
qy=lambda y:230-y*34
curve=' '.join(('M' if i==0 else 'L')+f'{qx(x):.2f} {qy((x-1)*(x-3)):.2f}' for i,x in enumerate([.0+i*.04 for i in range(101)]))
save('quadratics','Roots and vertex of a quadratic','The graph y equals (x minus 1)(x minus 3) crosses the x axis at 1 and 3 and has its vertex at (2, minus 1).',
     line(65,230,579,230)+line(qx(0),296,qx(0),32)+f'<path d="{curve}" fill="none" stroke="{BLUE}" stroke-width="4"/>'+''.join(text(qx(x),259,str(x),18) for x in range(5))+f'<circle cx="{qx(2)}" cy="{qy(-1)}" r="6" fill="{RED}"/>'+text(428,293,'vertex (2, −1)',19)+line(375,285,qx(2)+5,qy(-1)+5,RED)+text(422,62,'y = (x − 1)(x − 3)',21))
save('trigonometry','Labelling a right-angled triangle','A right triangle has angle theta at the bottom left, opposite side 3, adjacent side 4 and hypotenuse 5. Sine is opposite over hypotenuse.',
     '<path d="M100 280H420V40Z" fill="#e4ede4" stroke="#28745e" stroke-width="4"/><path d="M395 280V255H420" fill="none" stroke="#263e38" stroke-width="2"/><path d="M160 280A60 60 0 0 0 148 244" fill="none" stroke="#c78a29" stroke-width="3"/>'+text(178,266,'θ',24)+text(260,322,'adjacent = 4',21)+text(510,157,'opposite',20)+text(510,185,'= 3',20)+text(237,139,'hypotenuse = 5',20))
save('probability','Two draws without replacement','A bag contains 3 red and 2 blue counters. First red has probability 3/5, then red 2/4 or blue 2/4; first blue is 2/5, then red 3/4 or blue 1/4.',
     line(68,169,243,74)+line(68,169,243,262)+box(220,41,110,56,'R: 3/5')+box(220,233,110,56,'B: 2/5','#e5ecf5')+line(332,69,459,35)+line(332,69,459,119)+line(332,261,459,213)+line(332,261,459,305)+text(532,42,'R: 2/4',20)+text(532,125,'B: 2/4',20)+text(532,218,'R: 3/4',20)+text(532,311,'B: 1/4',20)+text(80,178,'Start',20))
save('forces','Balanced and unbalanced forces','A 4 kilogram trolley has a 12 newton push right and 4 newton friction left, leaving 8 newtons right. The normal reaction and weight balance vertically.',
     '<rect x="220" y="115" width="200" height="100" rx="14" fill="#dbe9de" stroke="#28745e" stroke-width="3"/><circle cx="257" cy="232" r="16" fill="#52665b"/><circle cx="383" cy="232" r="16" fill="#52665b"/>'+text(320,175,'4 kg trolley',23)+line(320,109,320,42,arrow=True)+line(320,218,320,296,arrow=True)+line(427,165,579,165,arrow=True)+line(212,165,147,165,arrow=True)+text(505,134,'push 12 N',18)+text(112,139,'friction 4 N',18)+text(418,43,'normal force',18)+text(397,309,'weight',18))
save('energy','Accounting for a 100 joule input','A device transfers 100 joules of energy: 60 joules usefully to motion, 30 joules to thermal energy and 10 joules to sound. The transfers sum to the input.',
     box(35,124,160,86,'100 J input')+line(200,165,285,165,arrow=True)+box(295,30,295,65,'Motion · 60 J')+box(295,135,295,65,'Thermal · 30 J','#f4e7d4')+box(295,240,295,65,'Sound · 10 J','#e5ecf5')+line(275,165,275,62)+line(275,62,288,62,arrow=True)+line(275,165,288,165,arrow=True)+line(275,165,275,272)+line(275,272,288,272,arrow=True))
save('acids-bases','Reading the pH scale','A simplified aqueous pH scale places acidic solutions below 7, neutral at 7 and alkaline solutions above 7, at 25 degrees Celsius. Each unit represents a tenfold change in hydrogen ion concentration.',
     ''.join(f'<rect x="{40+i*40}" y="110" width="40" height="62" fill="{["#b34f4c","#ba6250","#bd754f","#bf884e","#b09a55","#96a25c","#79a26d","#59957c","#508b8c","#4b8196","#47749c","#50679b","#645c91","#79548c","#874c7c"][i]}"/>'+text(60+i*40,207,str(i),18) for i in range(15))+text(145,75,'Acidic',24)+text(340,75,'Neutral',24)+text(525,75,'Alkaline',24)+line(340,84,340,102)+text(320,267,'1 pH step = 10× change in [H⁺]',22)+text(320,307,'Compare concentration, not just the numbers',18))
save('inheritance','A Mendelian monohybrid cross','For two heterozygous parents Aa and Aa, each contributes A or a with equal probability. The four equally likely combinations are AA, Aa, Aa and aa.',
     box(170,32,150,52,'A')+box(340,32,150,52,'a')+box(48,104,95,90,'A')+box(48,214,95,90,'a')+box(170,104,150,90,'AA','#d8e8da',28)+box(340,104,150,90,'Aa','#e5ecf5',28)+box(170,214,150,90,'Aa','#e5ecf5',28)+box(340,214,150,90,'aa','#f4e7d4',28)+text(560,162,'1 : 2 : 1',23)+text(560,190,'genotypes',16))
save('ecosystems','Energy moves through a food web','Arrows point from food to consumer: grass to wētā, grass to rabbit, wētā to bird, and rabbit and bird to hawk. The web is a simplified teaching model.',
     box(30,130,120,65,'Grass')+box(245,35,130,65,'Wētā')+box(245,238,130,65,'Rabbit')+box(450,35,130,65,'Bird')+box(450,238,130,65,'Hawk')+line(155,150,238,76,arrow=True)+line(155,180,238,264,arrow=True)+line(380,67,445,67,arrow=True)+line(515,105,515,230,arrow=True)+line(380,270,445,270,arrow=True)+text(320,181,'food → consumer',20))
save('historical-evidence','Testing a historical claim','Three source types: a contemporary diary, a photograph and later oral testimony. Compare their provenance, purpose and context before using them to support a qualified claim.',
     box(28,35,178,75,'Diary')+box(231,35,178,75,'Photograph')+box(434,35,178,75,'Oral testimony')+line(117,114,260,218,arrow=True)+line(320,114,320,218,arrow=True)+line(523,114,380,218,arrow=True)+box(165,226,310,75,'Corroborated, qualified claim')+text(320,328,'Who? When? Why? What is missing?',18))
save('te-tiriti','Reading two texts in context','The Māori and English texts of the Treaty are distinct. Article 1 uses kāwanatanga in te reo Māori and sovereignty in English. Article 2 affirms tino rangatiratanga in the Māori text. Compare texts alongside context and perspectives.',
     box(34,35,275,64,'Te Tiriti · te reo Māori')+box(331,35,275,64,'Treaty · English')+box(34,125,275,70,'kāwanatanga')+box(331,125,275,70,'sovereignty')+line(313,160,327,160,BLUE,dash=True)+box(34,222,275,70,'tino rangatiratanga')+box(331,222,275,70,'possession protections')+text(320,326,'Compare wording, context and understandings',18))
save('wwi-causes','Long-term pressures and immediate decisions','Militarism, alliances, imperial competition and nationalism form long-term pressures. The assassination at Sarajevo was a trigger; the July Crisis involved decisions that widened the conflict.',
     box(30,33,277,65,'Long-term pressures')+box(333,33,277,65,'Sarajevo assassination')+line(169,103,270,187,arrow=True)+line(472,103,373,187,arrow=True)+box(190,195,260,56,'July 1914 decisions')+line(320,255,320,279,arrow=True)+text(320,317,'A European war expands',24))
save('rivers-flooding','From rainfall to flood risk','Rainfall reaching a catchment can infiltrate soil or move as surface runoff. Impermeable ground sends water quickly to the river. Flood risk combines hazard, exposure and vulnerability.',
     '<path d="M20 170L150 95L265 200L388 110L620 255V330H20Z" fill="#dbe8d9"/><path d="M265 200Q300 240 360 220T500 270T620 300" fill="none" stroke="#5188a5" stroke-width="26"/><path d="M285 43l-10 33m45-33-10 33m45-33-10 33" stroke="#5188a5" stroke-width="4"/>'+box(430,120,140,65,'Town','#f4e7d4')+line(160,145,236,201,arrow=True)+line(421,174,433,226,arrow=True)+text(155,61,'Catchment',21)+text(174,267,'runoff',19)+text(335,315,'river → downstream',20))
save('supply-demand','A competitive market equilibrium','Demand slopes down, supply slopes up. Their intersection is the equilibrium. A higher price creates excess supply; a lower price creates excess demand, other things equal.',
     line(95,279,580,279)+line(95,279,95,30)+line(136,60,532,250,BLUE)+line(136,250,532,60,RED)+line(334,155,334,279,GREEN,dash=True)+line(95,155,334,155,GREEN,dash=True)+text(501,244,'D',22,BLUE)+text(510,62,'S',22,RED)+text(369,142,'E',22)+text(335,313,'Qₑ',21)+text(60,164,'Pₑ',21)+text(549,313,'Quantity',18)+text(66,32,'Price',18))
save('algorithms','Tracing a running total','An algorithm starts with total zero and a list of scores, repeatedly adds the next score to total until there are none left, and then outputs total.',
     box(200,20,240,55,'total ← 0')+line(320,79,320,111,arrow=True)+box(200,118,240,65,'Any scores left?','#f4e7d4')+line(195,150,103,150,arrow=True)+text(144,132,'yes',18)+box(25,205,250,65,'Add next score to total')+line(103,155,103,199,arrow=True)+line(103,275,103,311)+line(103,311,580,311)+line(580,311,580,150)+line(580,150,446,150,arrow=True)+line(320,188,320,214,arrow=True)+text(348,209,'no',18)+box(295,222,205,55,'Output total'),360)
save('hauora','Four connected dimensions of hauora','An original schematic of Te Whare Tapa Whā: taha tinana physical, taha hinengaro mental and emotional, taha whānau family and social, and taha wairua spiritual. The dimensions support one another; whenua is the foundation.',
     '<path d="M80 100L320 20L560 100Z" fill="#28745e"/><rect x="96" y="100" width="448" height="190" fill="#e0eade" stroke="#28745e" stroke-width="3"/>'+box(108,113,200,70,'Taha tinana')+box(332,113,200,70,'Taha hinengaro')+box(108,202,200,70,'Taha whānau')+box(332,202,200,70,'Taha wairua')+'<rect x="62" y="290" width="516" height="40" rx="5" fill="#e6d6b7"/>'+text(320,318,'Whenua · connection to land and roots',18))

print(f'Wrote {len(list(OUT.glob("*.svg")))} original study diagrams')
