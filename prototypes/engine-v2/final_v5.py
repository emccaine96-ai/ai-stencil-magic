from engine7 import *
import final_v4
def prep_kw_for(g):
    # image-level key: median tone. Dark-keyed photos (tiger) get the shadow-protecting blend;
    # light-keyed line art (hibiscus) keeps the original full-strength CLAHE that already worked.
    med=float(np.median(g))
    return dict(clip=1.4,mix=0.5) if med<110 else dict(clip=2.0,mix=1.0,shadow_lift=False)
if __name__=='__main__':
    for k in SRC:
        g=load(k); kw=prep_kw_for(g)
        ink,l,h=render7(g,prep_kw=kw,dark_boost=0.5 if np.median(g)<110 else 0.0,cw=0.0,**final_v4.CFG[k])
        cv2.imwrite(f'v11_{k}.png',to_purple(ink))
        src=cv2.cvtColor(g.astype(np.uint8),cv2.COLOR_GRAY2BGR); out=cv2.resize(cv2.imread(f'v11_{k}.png'),(src.shape[1],src.shape[0]))
        cv2.imwrite(f'sheet11_{k}.png',np.hstack([src,out])); print(k,'median tone',int(np.median(g)),kw)
