from engine4 import *

def hatch2(L, th, ss=2, spacing=(6,13), width=1.7, levels=(0.42,0.26,0.14), dark_boost=1.0):
    """Same screen as hatch(), but stroke width grows continuously with darkness (up to dark_boost extra)."""
    H,W=L.shape
    Ls=cv2.resize(L,(W*ss,H*ss),interpolation=cv2.INTER_CUBIC)
    c=cv2.resize(np.cos(2*th),(W*ss,H*ss)); s=cv2.resize(np.sin(2*th),(W*ss,H*ss))
    ths=0.5*np.arctan2(s,c)
    yy,xx=np.mgrid[0:H*ss,0:W*ss].astype(np.float32)
    ink=np.zeros_like(Ls)
    for li,thr in enumerate(levels):
        sp=(spacing[1]-(spacing[1]-spacing[0])*li/(len(levels)-1))*ss
        ang=ths+li*np.pi/3*(1 if li>0 else 0)
        proj=(-np.sin(ang)*xx+np.cos(ang)*yy)/sp
        d=np.abs(proj-np.round(proj))*sp
        dark=np.clip((thr-Ls)/max(thr,1e-3),0,1)
        w=(width*ss)*(np.clip(dark*2.0+0.35,0,1.4)+dark_boost*dark**1.5)
        a=np.clip(w/2-d+0.5,0,1)*(Ls<thr)
        ink=np.maximum(ink,a)
    return cv2.resize(ink,(W,H),interpolation=cv2.INTER_AREA)

def render5(g, prep_kw=None, dark_boost=0.0, xd=None, **kw):
    L=prep2(g,**(prep_kw or {}))
    th,_=flow(L,sg=2.0,st=10.0*max(g.shape)/1024)
    xp={**dict(sigma=1.2,k=1.6,p=18.0,eps=0.0,phi=10.0),**(xd or {})}
    lines=clean(xdog(L,**xp),min_px=20,thr=0.4)
    h=clean(hatch2(L,th,spacing=kw.get('spacing',(6,13)),width=kw.get('width',1.7),levels=kw.get('hatch_levels',(0.55,0.36,0.2)),dark_boost=dark_boost),min_px=30,thr=0.3)
    return np.clip(np.maximum(lines,h),0,1),lines,h

if __name__=='__main__':
    g=load('tiger'); H=g.shape[0]; a=int(H*7/8)
    for db in (0.0,0.5,1.0):
        ink,l,h=render5(g,prep_kw=dict(clip=1.4,mix=0.5),dark_boost=db,hatch_levels=(0.42,0.26,0.14),xd=dict(eps=0.02))
        blk=lambda x: cv2.resize(x,(x.shape[1]//16,x.shape[0]//16),interpolation=cv2.INTER_AREA).ravel()
        r=np.corrcoef(blk(ink),blk(1-prep2(g,clip=1.4,mix=0.5)))[0,1]
        from blobcheck import blob
        cv2.imwrite(f'v7_tiger_{db}.png',to_purple(ink))
        print(f'boost {db}: chin ink {ink[a:].mean():.3f} overall {ink.mean():.3f} darkness-corr {r:.3f} blob/gap {blob(f"v7_tiger_{db}.png")}')
