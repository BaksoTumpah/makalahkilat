#!/usr/bin/env python3
"""Gabungkan assets/ jadi satu halaman HTML untuk pratinjau. Kode sama persis dengan isi APK.
Pakai: python3 tools/build_sim.py <keluaran.html>"""
import json, pathlib, sys

base = pathlib.Path(__file__).resolve().parent
root = base.parent / "app/src/main/assets"
css = (root / "style.css").read_text(encoding="utf-8")
docx = (root / "docx.js").read_text(encoding="utf-8")
app = (root / "app.js").read_text(encoding="utf-8")
html = (root / "index.html").read_text(encoding="utf-8")

body = html.split("<body>")[1].split("</body>")[0]
body = body.replace('<script src="docx.js"></script>', "").replace('<script src="app.js"></script>', "")

pre = "window.__SIM__ = true;"


out = (
    '<title>Makalah Kilat</title>\n'
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    "<style>\n" + css + "\n</style>\n"
    + body +
    "\n<script>" + pre + "</script>\n"
    "<script>\n" + docx + "\n</script>\n"
    "<script>\n" + app + "\n</script>\n"
)
pathlib.Path(sys.argv[1]).write_text(out, encoding="utf-8")
print("ok", len(out))
