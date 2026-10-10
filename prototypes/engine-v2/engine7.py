from engine6 import *

def multi_xdog(L, base=None, coarse_sigma=2.6, coarse_weight=1.0, gap_win=18):
    """Fine XDoG everywhere + a coarse-scale XDoG that is only admitted where the fine pass left a gap."""
    fine=clean(xdog_local(L,amount=0.5,**{**dict(sigma=1.2,k=1.6,p=18.0,eps=0.0,phi=10.0),**(base or {})}),min_px=20,thr=0.4)
    coarse=xdog_local(L,amount=0.5,sigma=coarse_sigma,k=1.6,p=18.0,eps=0.0,phi=10.0)
    coarse=clean(coarse,min_px=60,thr=0.4)               # coarse strokes must be long & deliberate
    near_fine=cv2.dilate((fine>0.4).astype(np.uint8),np.ones((gap_win,gap_win),np.uint8))
    gap=(1-near_fine).astype(np.float32)
    return np.clip(np.maximum(fine,coarse*gap*coarse_weight),0,1),fine,coarse*gap

def render7(g, prep_kw=None, dark_boost=0.5, cw=1.0, cs=2.6, **kw):
    L=prep2(g,**(prep_kw or {}))
    th,_=flow(L,sg=2.0,st=10.0*max(g.shape)/1024)
    lines,fine,cgap=multi_xdog(L,coarse_sigma=cs,coarse_weight=cw)
    h=clean(hatch2(L,th,spacing=kw.get('spacing',(6,13)),width=kw.get('width',1.7),levels=kw.get('hatch_levels',(0.55,0.36,0.2)),dark_boost=dark_boost),min_px=30,thr=0.3)
    return np.clip(np.maximum(lines,h),0,1),lines,h

if __name__=='__main__':
    gb=load('baby'); Hh,Ww=gb.shape
    nose=(slice(int(Hh*.45),int(Hh*.68)),slice(int(Ww*.35),int(Ww*.65)))
    for cw,cs in [(0.0,2.6),(1.0,2.6),(1.0,3.2)]:
        ink,l,h=render7(gb,prep_kw=dict(clip=1.4,mix=0.5),cw=cw,cs=cs,hatch_levels=(0.5,0.33,0.18))
        cv2.imwrite(f'v9_baby_cw{cw}_s{cs}.png',to_purple(ink))
        print(f'coarse w={cw} sigma={cs}: nose lines {l[nose].mean():.3f} nose ink {ink[nose].mean():.3f} | whole lines {l.mean():.3f} ink {ink.mean():.3f}')
