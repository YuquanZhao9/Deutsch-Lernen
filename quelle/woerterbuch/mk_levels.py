import json,os
d=json.load(open('wortwurzel.json'))['entries']
os.makedirs('lv',exist_ok=True)
N=800
for i in range(0,len(d),N):
    with open(f'lv/{i//N:02d}.txt','w') as f:
        for e in d[i:i+N]:
            zh=(e.get('senses') or [{}])[0].get('zh','').replace('\t',' ')[:30]
            f.write(f"{e['w']}\t{e['pos']}\t{e.get('lvl','')}\t{zh}\n")
print(len(d), (len(d)+N-1)//N)
