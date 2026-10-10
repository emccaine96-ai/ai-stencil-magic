import cv2, numpy as np, sys
def lum(f):
    im=cv2.imread(f,cv2.IMREAD_UNCHANGED)
    if im.ndim==3 and im.shape[2]==4:
        a=im[...,3:4]/255.0; im=(im[...,:3]*a+255*(1-a)).astype(np.uint8)
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY) if im.ndim==3 else im
    return g
def m(f,crop=None):
    g=lum(f)
    if crop: g=g[crop[0]:crop[1],crop[2]:crop[3]]
    paper=np.percentile(g,92); d=(g<paper-40).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(d,connectivity=8); a=st[1:,4]
    ink_px=d.sum()
    in_speck=a[a<12].sum()/max(1,ink_px)       # share of ink living in tiny fragments
    in_long=a[a>=150].sum()/max(1,ink_px)      # share of ink in long connected strokes
    # dominant stroke thickness via distance transform on skeleton-ish maxima
    dt=cv2.distanceTransform(d,cv2.DIST_L2,3); 
    mid=((g>paper-215)&(g<paper-40)).mean()    # anti-aliased tonal fraction
    return dict(cov=round(d.mean(),3),comps=n-1,speck_ink=round(in_speck,3),long_ink=round(in_long,3),aa_mid=round(mid,3))
if __name__=='__main__':
    for f in sys.argv[1:]: print(f.split('/')[-1][:30].ljust(30),m(f))
