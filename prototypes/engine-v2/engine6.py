from engine5 import *

def xdog_local(L, sigma=1.2, k=1.6, p=18.0, eps=0.0, phi=10.0, amount=0.6, win=25):
    """XDoG with the response normalised by local contrast energy (blend 'amount' 0..1).
    Faint edges in flat regions get boosted; edges already strong are left alone."""
    D=(1+p)*gauss(L,sigma)-p*gauss(L,sigma*k)
    energy=np.sqrt(gauss(D*D,win/3))+1e-3
    ref=np.percentile(energy,75)                 # 'normal' edge energy in this image
    gain=np.clip(ref/energy,1.0,4.0)             # only boost quiet areas, never damp busy ones
    Dn=D*(1+(gain-1)*amount)
    T=np.where(Dn>=eps,1.0,1.0+np.tanh(phi*(Dn-eps)))
    return 1.0-np.clip(T,0,1)

def render6(g, prep_kw=None, dark_boost=0.5, local_amount=0.6, xd=None, **kw):
    L=prep2(g,**(prep_kw or {}))
    th,_=flow(L,sg=2.0,st=10.0*max(g.shape)/1024)
    xp={**dict(sigma=1.2,k=1.6,p=18.0,eps=0.0,phi=10.0),**(xd or {})}
    lines=clean(xdog_local(L,amount=local_amount,**xp),min_px=20,thr=0.4)
    h=clean(hatch2(L,th,spacing=kw.get('spacing',(6,13)),width=kw.get('width',1.7),levels=kw.get('hatch_levels',(0.55,0.36,0.2)),dark_boost=dark_boost),min_px=30,thr=0.3)
    return np.clip(np.maximum(lines,h),0,1),lines,h

if __name__=='__main__':
    gb=load('baby'); Hh,Ww=gb.shape
    nose=(slice(int(Hh*.45),int(Hh*.68)),slice(int(Ww*.35),int(Ww*.65)))
    for amt in (0.0,0.4,0.7,1.0):
        ink,l,h=render6(gb,prep_kw=dict(clip=1.4,mix=0.5),local_amount=amt,hatch_levels=(0.5,0.33,0.18))
        cv2.imwrite(f'v8_baby_{amt}.png',to_purple(ink))
        print(f'amt {amt}: nose ink {ink[nose].mean():.3f} lines {l[nose].mean():.3f} | whole lines {l.mean():.3f} ink {ink.mean():.3f}')
