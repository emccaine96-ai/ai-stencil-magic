from engine2 import *

def prep2(g, clip=1.4, mix=0.5, shadow_lift=True):
    """Gentler CLAHE blended with the original so darks keep their value."""
    g8=np.clip(g,0,255).astype(np.uint8)
    b=cv2.bilateralFilter(g8,9,28,5)
    c=cv2.createCLAHE(clipLimit=clip,tileGridSize=(8,8)).apply(b).astype(np.float32)
    b=b.astype(np.float32)
    # in shadows (<~70) lean on the un-equalised value so CLAHE can't wash them out
    w=np.full_like(b,mix)
    if shadow_lift: w=np.where(b<70, mix*0.35, w)
    w=cv2.GaussianBlur(w,(0,0),6)
    out=b*(1-w)+c*w
    return out/255.0

def render3(g, prep_kw=None, **kw):
    import engine2, engine
    orig=engine.prep
    engine.prep=lambda x: prep2(x,**(prep_kw or {}))
    engine2.prep=engine.prep
    try: return render2(g,**kw)
    finally: engine.prep=orig; engine2.prep=orig

if __name__=='__main__':
    g=load('tiger'); H=g.shape[0]
    for name,kw in [('before',None),('gentle',dict(clip=1.4,mix=0.5))]:
        ink,l,h=render3(g,prep_kw=kw,hatch_levels=(0.42,0.26,0.14),xd=dict(eps=0.02)) if kw else render2(g,hatch_levels=(0.42,0.26,0.14),xd=dict(eps=0.02))
        a=int(H*7/8)
        print(name,'chin band ink',ink[a:].mean().round(3),'lines',l[a:].mean().round(3),'| overall',ink.mean().round(3))
        if kw: cv2.imwrite('v4_tiger.png',to_purple(ink))
