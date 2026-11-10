# Rebuilds design/assets/mark.svg and favicon.svg (logo C) from the old swoosh outline in design/assets/mark-v1.svg. Run: python3 design/tools/export-logo.py
import math, re, sys
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
O = open(ROOT+'/design/assets/mark-v1.svg').read()
O = re.findall(r'd="([^"]+)"', O)[0]
TABLE=[[-75,43.47,43.47],[-72.5,43.61,43.72],[-70,43.78,44.04],[-67.5,43.96,44.41],[-65,44.15,44.81],[-62.5,44.36,45.23],[-60,44.57,45.68],[-57.5,44.8,46.15],[-55,45.02,46.64],[-52.5,45.25,47.14],[-50,45.48,47.65],[-47.5,45.71,48.16],[-45,45.94,48.67],[-42.5,46.14,49.18],[-40,46.33,49.68],[-37.5,46.52,50.19],[-35,46.68,50.67],[-32.5,46.84,51.15],[-30,46.97,51.62],[-27.5,47.09,52.07],[-25,47.19,52.53],[-22.5,47.28,52.96],[-20,47.36,53.4],[-17.5,47.42,53.82],[-15,47.46,54.05]]
A0,A1,CX,CY=-75,-15,50,49.77
lerp=lambda a,b,t:a+(b-a)*t
def edge(a):
    for (a0,i0,o0),(a1,i1,o1) in zip(TABLE,TABLE[1:]):
        if a0<=a<=a1:
            t=(a-a0)/(a1-a0); return lerp(i0,i1,t),lerp(o0,o1,t)
    return TABLE[-1][1],TABLE[-1][2]
def oR(a):
    q=math.radians(a); return 1/math.hypot(math.cos(q)/42, math.sin(q)/37.72)
def P(a,r):
    q=math.radians(a); return CX+r*math.cos(q), CY+r*math.sin(q)

def build(s,k,sg,steps=16):
    def radii(a):
        ri,ro=edge(a); inner=s*oR(a)+(ri-oR(a)); return inner, inner+(ro-ri)*k
    maxR=max(radii(A0+i*0.5)[1] for i in range(121))
    fit=min(1,54.05/maxR)
    T=lambda x,y:(CX+(x-CX)*fit, CY+(y-CY)*fit)
    fmt=lambda p:f"{p[0]:.2f} {p[1]:.2f}"
    # O: scale every coordinate pair by s*fit about the center
    nums=[float(n) for n in re.findall(r'-?[\d.]+',O)]
    it=iter(nums); sc=s*fit
    def onum(m):
        return None
    out=[]; toks=re.findall(r'[MQLZ]|-?[\d.]+',O); buf=[]
    for t in toks:
        if t in 'MQLZ':
            out.append(t)
        else:
            buf.append(float(t))
            if len(buf)==2:
                x,y=buf; buf=[]
                out.append(f"{CX+(x-CX)*sc:.2f} {CY+(y-CY)*sc:.2f}")
    od=''
    for t in out:
        od += t if t in 'MQLZ' else (t if od[-1] in 'MQL' else ' '+t)
    W=[0.3,0.27,0.29]; total=1-2*sg; tot=sum(W); t=0; segs=[]
    for w in W:
        ln=w/tot*total
        inner=[];outer=[]
        for i in range(steps+1):
            a=lerp(A0,A1,lerp(t,t+ln,i/steps)); r0,r1=radii(a)
            inner.append(T(*P(a,r0))); outer.append(T(*P(a,r1)))
        pts=inner+outer[::-1]
        segs.append(pts); t+=ln+sg
    rot=lambda p:(100-p[0],99.98-p[1])
    d=''
    for pts in segs+[[rot(p) for p in s_] for s_ in segs]:
        d+='M'+'L'.join(fmt(p) for p in pts)+'Z'
    return od,d

od,sd=build(0.9,1.5,0.065)
open(ROOT+'/design/assets/mark.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 110 110" fill="#fff"><path fill-rule="evenodd" d="{od}"/><path d="{sd}"/></svg>\n')
# Favicon: same mark on a black tile; segments a little heavier and gaps a little wider so they hold at 16 px.
od2,sd2=build(0.9,1.75,0.09)
open(ROOT+'/design/assets/favicon.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110"><rect width="110" height="110" rx="24" fill="#000"/><g transform="translate(16 16) scale(.78)" fill="#fff"><path fill-rule="evenodd" d="{od2}"/><path d="{sd2}"/></g></svg>\n')
