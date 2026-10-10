from engine import *

def clean(ink, min_px=14, thr=0.35):
    b=(ink>thr).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(b,connectivity=8)
    keep=np.zeros(n,bool); keep[1:]=st[1:,4]>=min_px
    return ink*keep[lab]

def render2(g, hatch_levels=(0.55,0.36,0.2), spacing=(6,13), width=1.7, xd=None, tone_gain=1.0, flow_st=10.0):
    xd=xd or {}
    L=prep(g)
    # large-scale flow so strokes stay long & parallel (form, not pore noise)
    th,coh=flow(L,sg=2.0,st=flow_st*max(g.shape)/1024)
    lines=xdog(L,**{**dict(sigma=1.2,k=1.6,p=18.0,eps=0.0,phi=10.0),**xd})
    # keep only the confident part of the contours (thin but continuous)
    lines=clean(lines,min_px=20,thr=0.4)
    h=hatch(L,th,spacing=spacing,width=width,levels=hatch_levels)
    h=clean(h,min_px=30,thr=0.3)
    ink=np.clip(np.maximum(lines,h*tone_gain),0,1)
    return ink,lines,h

if __name__=='__main__':
    cfg={'tiger':dict(hatch_levels=(0.42,0.26,0.14),xd=dict(eps=0.02)),
         'hib':dict(), 'elder':dict(hatch_levels=(0.5,0.32,0.18)), 'baby':dict(hatch_levels=(0.5,0.33,0.18))}
    for k in SRC:
        g=load(k); ink,l,h=render2(g,**cfg[k]); cv2.imwrite(f'v3_{k}.png',to_purple(ink))
