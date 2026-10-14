import sys
from psd_tools import PSDImage
import numpy as np
f=sys.argv[1]
p=PSDImage.open(f)
print('size',p.size,'channels',p.channels,'depth',p.depth,'color_mode',p.color_mode)
ok=True
def chk(n,c):
    global ok
    print(('PASS ' if c else 'FAIL ').ljust(5)+n); ok = ok and c
chk('2 layers', len(list(p))==2)
L=list(p)
chk('names Background,Ink', [l.name for l in L]==['Background','Ink'])
chk('blend multiply on Ink', L[1].blend_mode.name=='MULTIPLY')
chk('opacity ~50% on Ink (128/255)', abs(L[1].opacity-128)<=1)
chk('visible flags', all(l.visible for l in L))
# layer pixels incl. alpha
ink=L[1].numpy()   # float 0..1 RGBA
chk('Ink left half purple opaque', np.allclose(ink[:, :32, :3]*255, [168,85,247], atol=1.5) and np.allclose(ink[:, :32, 3], 1, atol=0.01))
chk('Ink right half transparent', np.allclose(ink[:, 32:, 3], 0, atol=0.01))
bg=L[0].numpy()
chk('Background white opaque', np.allclose(bg, 1, atol=0.01))
comp=p.composite()  # psd-tools' own composite from layers
chk('composite() size', comp.size==(64,48))
# the stored flattened image (what Finder/previews show)
try:
    flat=np.array(p.topil().convert('RGBA'))
    chk('flattened left half ~ (212,170,251)', np.allclose(flat[:, :32, :3].astype(int), [212,170,251], atol=2))
    chk('flattened right half white', np.allclose(flat[:, 32:, :3].astype(int), 255, atol=2))
except Exception as e:
    chk('flattened image readable: '+str(e)[:80], False)
print('RESULT','ALL PASS' if ok else 'FAILURES')
