"""Rasterize authored SVG for review using installed system librsvg/Cairo, no browser slot."""
import ctypes as c
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
rsvg=c.CDLL('librsvg-2.so.2');cairo=c.CDLL('libcairo.so.2');gobject=c.CDLL('libgobject-2.0.so.0')
rsvg.rsvg_handle_new_from_file.argtypes=[c.c_char_p,c.c_void_p];rsvg.rsvg_handle_new_from_file.restype=c.c_void_p
rsvg.rsvg_handle_render_cairo.argtypes=[c.c_void_p,c.c_void_p];rsvg.rsvg_handle_render_cairo.restype=c.c_int
cairo.cairo_image_surface_create.argtypes=[c.c_int,c.c_int,c.c_int];cairo.cairo_image_surface_create.restype=c.c_void_p
cairo.cairo_create.argtypes=[c.c_void_p];cairo.cairo_create.restype=c.c_void_p
cairo.cairo_scale.argtypes=[c.c_void_p,c.c_double,c.c_double]
cairo.cairo_surface_write_to_png.argtypes=[c.c_void_p,c.c_char_p];cairo.cairo_surface_write_to_png.restype=c.c_int
cairo.cairo_destroy.argtypes=[c.c_void_p];cairo.cairo_surface_destroy.argtypes=[c.c_void_p];gobject.g_object_unref.argtypes=[c.c_void_p]
source=Path(sys.argv[1] if len(sys.argv)>1 else 'public/game-art/animal-stack/three-sprite-preview.svg');target=Path(sys.argv[2] if len(sys.argv)>2 else 'tests/games/animal-stack/evidence/three-sprite-preview-refined.png')
box=list(map(float,ET.parse(source).getroot().attrib['viewBox'].split()));width,height=round(box[2]*2),round(box[3]*2)
handle=rsvg.rsvg_handle_new_from_file(str(source).encode(),None)
if not handle:raise RuntimeError('Unable to load authored SVG')
surface=cairo.cairo_image_surface_create(0,width,height);context=cairo.cairo_create(surface);cairo.cairo_scale(context,2,2)
if not rsvg.rsvg_handle_render_cairo(handle,context):raise RuntimeError('SVG render failed')
if cairo.cairo_surface_write_to_png(surface,str(target).encode()):raise RuntimeError('PNG export failed')
cairo.cairo_destroy(context);cairo.cairo_surface_destroy(surface);gobject.g_object_unref(handle)
print(target)
