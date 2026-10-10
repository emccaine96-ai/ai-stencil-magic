from common import *

def gauss(a,s): return cv2.GaussianBlur(a,(0,0),s)

def prep(g, clahe_clip=2.0):
    g8=np.clip(g,0,255).astype(np.uint8)
    # edge-preserving smooth (range sigma meaningful, unlike the old 5x5)
    b=cv2.bilateralFilter(g8,9,28,5)
    c=cv2.createCLAHE(clipLimit=clahe_clip,tileGridSize=(8,8)).apply(b)
    return c.astype(np.float32)/255.0

def xdog(L, sigma=1.0, k=1.6, p=20.0, eps=0.0, phi=12.0):
    """Winnemoeller XDoG. returns ink 0..1 (soft)."""
    g1=gauss(L,sigma); g2=gauss(L,sigma*k)
    D=(1+p)*g1 - p*g2
    T=np.where(D>=eps,1.0,1.0+np.tanh(phi*(D-eps)))
    return 1.0-np.clip(T,0,1)   # ink=1 where dark edge

def flow(L, sg=1.2, st=7.0):
    gx=cv2.Sobel(gauss(L,sg),cv2.CV_32F,1,0,ksize=3); gy=cv2.Sobel(gauss(L,sg),cv2.CV_32F,0,1,ksize=3)
    Jxx=gauss(gx*gx,st); Jyy=gauss(gy*gy,st); Jxy=gauss(gx*gy,st)
    # dominant gradient angle; strokes run perpendicular (along the form)
    th=0.5*np.arctan2(2*Jxy,Jxx-Jyy)+np.pi/2
    coh=np.sqrt((Jxx-Jyy)**2+4*Jxy**2)/(Jxx+Jyy+1e-6)
    return th,coh

def hatch(L, th, ss=2, spacing=(5,11), width=1.5, levels=(0.62,0.42,0.25)):
    """Line-screen hatching: stripes projected on a locally-rotating coordinate,
    density by darkness. Drawn at ss x resolution for anti-aliasing."""
    H,W=L.shape
    Ls=cv2.resize(L,(W*ss,H*ss),interpolation=cv2.INTER_CUBIC)
    ths=cv2.resize(th,(W*ss,H*ss),interpolation=cv2.INTER_LINEAR)
    # smooth angle as vector field to avoid wrap seams
    c=cv2.resize(np.cos(2*th),(W*ss,H*ss)); s=cv2.resize(np.sin(2*th),(W*ss,H*ss))
    ths=0.5*np.arctan2(s,c)
    # phase field: integrate coordinate along the normal direction (approx by local projection with large-scale smoothing)
    yy,xx=np.mgrid[0:H*ss,0:W*ss].astype(np.float32)
    ink=np.zeros_like(Ls)
    # tone -> spacing/width; multiple screens for darker tones
    for li,thr in enumerate(levels):
        sp=(spacing[1]-(spacing[1]-spacing[0])*li/(len(levels)-1))*ss
        ang=ths+li*np.pi/3*(1 if li>0 else 0)   # extra layers cross at 60deg
        proj=(-np.sin(ang)*xx+np.cos(ang)*yy)/sp
        d=np.abs(proj-np.round(proj))*sp          # px distance to stripe centre
        w=(width*ss)*np.clip((thr-Ls)/max(thr,1e-3)*2.0+0.35,0,1.4)   # taper: darker=thicker
        a=np.clip(w/2-d+0.5,0,1)                  # anti-aliased coverage
        a*=(Ls<thr)
        ink=np.maximum(ink,a)
    return cv2.resize(ink,(W,H),interpolation=cv2.INTER_AREA)

def render(g, mode='hatching', params=None):
    p=dict(sigma=1.0,k=1.6,p=20.0,eps=0.0,phi=12.0,line_gain=1.0,hatch_gain=1.0)
    if params: p.update(params)
    L=prep(g)
    lines=xdog(L,p['sigma'],p['k'],p['p'],p['eps'],p['phi'])*p['line_gain']
    th,coh=flow(L)
    h=hatch(L,th)*p['hatch_gain']
    ink=np.clip(np.maximum(lines,h),0,1)
    return ink,lines,h

if __name__=='__main__':
    import sys
    for k in SRC:
        g=load(k); ink,l,h=render(g)
        cv2.imwrite(f'v2_{k}.png',to_purple(ink)); print(k,'cov',round(float(ink.mean()),3),'lines',round(float(l.mean()),3),'hatch',round(float(h.mean()),3))
