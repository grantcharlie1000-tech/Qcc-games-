import json,urllib.request,urllib.parse,re,time
cat=json.load(open('public/movies/catalog.json'))
PD_COLL={'feature_films','prelinger','classic_tv','silent_films','moviesandfilms','classic_cartoons','sci-fi_horror','film_noir','comedy_films'}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'qcc-archive-match/1.0'}),timeout=30) as r: return json.load(r)
out=[]
for t in cat['titles']:
    q=f'title:("{t["name"]}") AND mediatype:movies'
    u='https://archive.org/advancedsearch.php?'+urllib.parse.urlencode([('q',q),('fl[]','identifier'),('fl[]','title'),('fl[]','year'),('fl[]','date'),('fl[]','licenseurl'),('fl[]','collection'),('fl[]','downloads'),('rows','25'),('sort[]','downloads desc'),('output','json')])
    docs=get(u)['response']['docs']
    cands=[]
    for d in docs:
        title=str(d.get('title','')); year=str(d.get('year') or d.get('date','')[:4])
        lic=d.get('licenseurl') or ''
        coll=d.get('collection') or []; coll=[coll] if isinstance(coll,str) else coll
        title_ok=re.sub(r'\W','',title.lower())==re.sub(r'\W','',t['name'].lower())
        year_ok=year==str(t['year'])
        lic_ok=bool(re.search(r'creativecommons\.org/(licenses|publicdomain)',lic))
        pd_coll=bool(PD_COLL & set(coll))
        pd_plausible=t['year']<1930
        accept=title_ok and year_ok and (lic_ok or (pd_coll and pd_plausible))
        meta=None
        if accept:
            m=get('https://archive.org/metadata/'+d['identifier'])
            vids=[f['name'] for f in m.get('files',[]) if f['name'].lower().endswith(('.mp4','.ogv','.webm'))]
            meta={'videos':vids[:5]}; accept=accept and bool(vids)
        cands.append({'identifier':d['identifier'],'title':title,'year':year,'licenseurl':lic,'collection':coll,'title_ok':title_ok,'year_ok':year_ok,'lic_ok':lic_ok,'pd_collection':pd_coll,'accepted':accept,'meta':meta})
    acc=[c for c in cands if c['accepted']]
    if acc: dec={'decision':'swap','identifier':acc[0]['identifier'],'confidence':'review','reason':'title+year+licence match'}
    else:
        dec={'decision':'keep','identifier':None,'confidence':'high','reason':f'{t["year"]} commercial release, in copyright; no CC/PD-licensed archive.org item with matching title+year'+(' (TV: no per-episode PD items)' if t['kind']=='tv' else '')}
    out.append({'id':t['id'],'kind':t['kind'],'name':t['name'],'year':t['year'],**dec,'search_query':q,'candidates':cands})
    time.sleep(1)
json.dump(out,open('raw-results.json','w'),indent=1)
for o in out: print(o['id'],o['name'],o['year'],o['decision'],len(o['candidates']),'cands; near:',[(c['identifier'],c['year'],c['licenseurl'][:40],c['collection'][:3]) for c in o['candidates'] if c['title_ok']][:3])
