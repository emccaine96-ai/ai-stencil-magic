import cv2, numpy as np, glob
import os
P=os.environ.get('STENCIL_PHOTOS','./photos/')
SRC={'tiger':P+'2658536c9_54da6bdb889f0aaea31883df748865f6.jpg','hib':P+'6d83afa9c_2e60fd25d3a1661690fe5c39d8f93f96.jpg',
     'elder':P+'4378d0699_aef313eac1a538c1534ff3a85a344550webp.jpg','baby':P+'29d903858_Picsart_26-04-03_22-15-22-317.jpg'}
def load(k,maxe=1024):
    im=cv2.imread(SRC[k]); g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype(np.float32)
    s=min(1,maxe/max(g.shape)); 
    if s<1: g=cv2.resize(g,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
    return g
PURPLE=np.array([247,85,168],np.float32) # BGR
def to_purple(ink):  # ink 0..1 float -> BGR image on white
    a=ink[...,None]; return (255*(1-a)+PURPLE*a).astype(np.uint8)
