import cv2,numpy as np,sys
from metrics import lum
def blob(f):
    g=lum(f); paper=np.percentile(g,92); d=(g<paper-40).astype(np.uint8)
    dt=cv2.distanceTransform(d,cv2.DIST_L2,3)
    # fraction of ink pixels that sit >=3.5px from any paper pixel => solid fill / blob, not a line
    ink=d>0
    solid=(dt>=3.5).sum()/max(1,ink.sum())
    # white-gap check: median distance of paper pixels to ink (spacing proxy)
    dp=cv2.distanceTransform(1-d,cv2.DIST_L2,3)
    return round(float(solid),3), round(float(np.percentile(dp[d==0],90)),1)
for f in sys.argv[1:]: print(f.split('/')[-1][:28].ljust(28),'solid_blob_frac,p90_gap=',blob(f))
