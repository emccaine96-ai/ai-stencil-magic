from engine7 import *
CFG={ # one shared engine; only the tone ladder differs per subject
 'tiger':dict(hatch_levels=(0.42,0.26,0.14),spacing=(6,13)),
 'hib':  dict(hatch_levels=(0.55,0.36,0.2),spacing=(6,13)),
 'elder':dict(hatch_levels=(0.5,0.32,0.18),spacing=(6,13)),
 'baby': dict(hatch_levels=(0.7,0.52,0.34,0.18),spacing=(6,15)),
}
if __name__=='__main__':
    for k in SRC:
        g=load(k)
        ink,l,h=render7(g,prep_kw=dict(clip=1.4,mix=0.5),dark_boost=0.5,cw=0.0,xd=None,**CFG[k])
        cv2.imwrite(f'v10_{k}.png',to_purple(ink))
        src=cv2.cvtColor(g.astype(np.uint8),cv2.COLOR_GRAY2BGR); out=cv2.imread(f'v10_{k}.png'); out=cv2.resize(out,(src.shape[1],src.shape[0]))
        cv2.imwrite(f'sheet10_{k}.png',np.hstack([src,out]))
