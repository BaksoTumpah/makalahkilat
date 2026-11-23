#!/usr/bin/env python3
"""Buat logo dan ikon peluncur Makalah Kilat (neumorphism) -> PNG semua densitas.
Pakai: python3 tools/brand/make_icons.py   (butuh playwright + chromium)"""
import pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "app/src/main/res"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tools/brand/out"
OUT.mkdir(parents=True, exist_ok=True)

# Lambang dalam kotak 0..100: halaman bersudut lipat + petir.
PAGE = "M25 27Q25 14 38 14H56L76 34V73Q76 86 63 86H38Q25 86 25 73Z"
FOLD = "M56 14V27Q56 34 63 34H76Z"
BOLT = "M57 27L39 54H50L44 76L63 47H52Z"

BG1, BG2 = "#E9EFED", "#D6DEDB"   # permukaan lembut
LIGHT, DARK = "#FFFFFF", "#9AABA6"  # sumber cahaya kiri-atas
T1, T2 = "#1E8F7A", "#0A574A"      # hijau teal
A1, A2 = "#FFD166", "#F0A21F"      # kuning petir

def defs(k):
    return f'''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{BG1}"/><stop offset="1" stop-color="{BG2}"/></linearGradient>
<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{T1}"/><stop offset="1" stop-color="{T2}"/></linearGradient>
<linearGradient id="bt" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="{A1}"/><stop offset="1" stop-color="{A2}"/></linearGradient>
<filter id="raise" x="-40%" y="-40%" width="180%" height="180%">
 <feDropShadow dx="{-2.4*k}" dy="{-2.4*k}" stdDeviation="{2.2*k}" flood-color="{LIGHT}" flood-opacity="1" in="SourceGraphic" result="l"/>
 <feDropShadow dx="{2.6*k}" dy="{2.6*k}" stdDeviation="{2.6*k}" flood-color="{DARK}" flood-opacity=".75" in="SourceGraphic" result="d"/>
 <feMerge><feMergeNode in="l"/><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="small" x="-40%" y="-40%" width="180%" height="180%">
 <feDropShadow dx="{-1.2*k}" dy="{-1.2*k}" stdDeviation="{1.1*k}" flood-color="#fff" flood-opacity=".55" in="SourceGraphic" result="l"/>
 <feDropShadow dx="{1.6*k}" dy="{1.8*k}" stdDeviation="{1.4*k}" flood-color="#052E27" flood-opacity=".45" in="SourceGraphic" result="d"/>
 <feMerge><feMergeNode in="l"/><feMergeNode in="d"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''

def mark(scale=1.0, cx=50, cy=50):
    t = f'translate({cx},{cy}) scale({scale}) translate(-50,-50)'
    return (f'<g transform="{t}"><path d="{PAGE}" fill="url(#pg)" filter="url(#small)"/>'
            f'<path d="{FOLD}" fill="#0A574A" opacity=".55"/><path d="{FOLD}" fill="#BFE3DA" opacity=".35"/>'
            f'<path d="{BOLT}" fill="url(#bt)"/></g>')

def svg(body, size, k):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{size}" height="{size}">{defs(k)}{body}</svg>'

def legacy(round_=False):  # tile penuh
    r = 50 if round_ else 22
    inset = 9
    return (f'<rect x="{inset}" y="{inset}" width="{100-2*inset}" height="{100-2*inset}" rx="{r-inset if round_ else r}" fill="url(#bg)" filter="url(#raise)"/>' + mark(0.84))

def adaptive_bg():
    return '<rect width="100" height="100" fill="url(#bg)"/>'

def adaptive_fg():  # keping timbul 56% kanvas di zona aman
    return ('<rect x="19" y="19" width="62" height="62" rx="18" fill="url(#bg)" filter="url(#raise)"/>' + mark(0.5))

def mono():  # petir dilubangi, satu warna
    return (f'<g transform="translate(50,50) scale(0.56) translate(-50,-50)"><path fill-rule="evenodd" fill="#000" d="{PAGE} {BOLT}"/>'
            f'<path d="{FOLD}" fill="#000" opacity=".0"/></g>')

def write(name, svgtxt, px, page, dst, transparent=True):
    page.set_viewport_size({"width": px, "height": px})
    page.set_content(f'<html><body style="margin:0;background:transparent">{svgtxt}</body></html>')
    dst.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(dst), omit_background=transparent)

DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for d, m in DENS.items():
        a, l = round(48 * m), round(108 * m)
        write("l", svg(legacy(False), a, a / 48 * 0.42), a, pg, RES / f"mipmap-{d}/ic_launcher.png")
        write("r", svg(legacy(True), a, a / 48 * 0.42), a, pg, RES / f"mipmap-{d}/ic_launcher_round.png")
        write("bg", svg(adaptive_bg(), l, 1), l, pg, RES / f"mipmap-{d}/ic_launcher_background.png", False)
        write("fg", svg(adaptive_fg(), l, l / 108 * 0.8), l, pg, RES / f"mipmap-{d}/ic_launcher_foreground.png")
        write("mo", svg(mono(), l, 1), l, pg, RES / f"mipmap-{d}/ic_launcher_monochrome.png")
    write("m", svg(legacy(False), 512, 4.5), 512, pg, OUT / "logo-512.png")
    write("m", svg(legacy(False), 1024, 9), 1024, pg, OUT / "logo-1024.png")
    b.close()
print("ok")
