/* Pembuat file .docx tanpa library. Berjalan di WebView Android, browser, dan Node.
   Model: { lang, title, jenis, subjudul, layout, opts, id, logo, kata, chapters, pustaka }
   chapters: [{ title, subs: [{ title, text }] }]
   text memakai format sederhana: paragraf dipisah baris kosong, "- " butir, "1. " nomor,
   baris berisi " = " rumus, baris berisi "|" tabel, "## " sub-subjudul. */
(function (root) {
  'use strict';

  var enc = new TextEncoder();
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  var LABELS = {
    id: {
      bab: 'BAB', chapters: ['PENDAHULUAN', 'PEMBAHASAN', 'PENUTUP'],
      latar: 'Latar Belakang', rumusan: 'Rumusan Masalah', tujuan: 'Tujuan',
      kesimpulan: 'Kesimpulan', saran: 'Saran', pustaka: 'DAFTAR PUSTAKA', lampiran: 'LAMPIRAN', gambar: 'Gambar',
      kata: 'KATA PENGANTAR', isi: 'DAFTAR ISI',
      rumusanIntro: 'Berdasarkan latar belakang tersebut, rumusan masalah dalam makalah ini adalah sebagai berikut.',
      tujuanIntro: 'Tujuan penulisan makalah ini adalah sebagai berikut.',
      disusun: 'Disusun oleh', kelas: 'Kelas', nim: 'NIM', nisn: 'NISN', dosen: 'Dosen Pengampu', guru: 'Guru Pengampu',
      penulis: 'Penulis', penyusun: 'Penyusun', ketua: 'Ketua Kelompok', mengetahui: 'Mengetahui',
      mk: 'Mata Kuliah', mp: 'Mata Pelajaran'
    },
    en: {
      bab: 'CHAPTER', chapters: ['INTRODUCTION', 'DISCUSSION', 'CONCLUSION'],
      latar: 'Background', rumusan: 'Problem Statement', tujuan: 'Objectives',
      kesimpulan: 'Conclusion', saran: 'Recommendations', pustaka: 'REFERENCES', lampiran: 'APPENDIX', gambar: 'Figure',
      kata: 'PREFACE', isi: 'TABLE OF CONTENTS',
      rumusanIntro: 'Based on the background above, the problems addressed in this paper are as follows.',
      tujuanIntro: 'The objectives of this paper are as follows.',
      disusun: 'Written by', kelas: 'Class', nim: 'Student ID', nisn: 'Student ID', dosen: 'Lecturer', guru: 'Teacher',
      penulis: 'The Author', penyusun: 'The Authors', ketua: 'Group Leader', mengetahui: 'Acknowledged by',
      mk: 'Course', mp: 'Subject'
    }
  };
  var MONTHS = {
    id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };

  /* ---------- util ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cm(x) { return Math.round(x * 566.929); }
  function roman(n) {
    var m = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']], o = '';
    m.forEach(function (p) { while (n >= p[0]) { o += p[1]; n -= p[0]; } });
    return o;
  }
  function romanUp(n) { return roman(n).toUpperCase(); }
  function letter(i) { return String.fromCharCode(65 + i); }
  function wc(t) { var m = String(t || '').trim().match(/\S+/g); return m ? m.length : 0; }

  /* ---------- zip (tanpa kompresi) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    var now = new Date();
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(8, 0, true); v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true); h.set(name, 30);
      parts.push(h, data);
      var c = new Uint8Array(46 + name.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true);
      w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true); w.setUint16(12, dosTime, true);
      w.setUint16(14, dosDate, true); w.setUint32(16, crc, true); w.setUint32(20, data.length, true);
      w.setUint32(24, data.length, true); w.setUint16(28, name.length, true);
      w.setUint32(42, offset, true); c.set(name, 46);
      central.push(c);
      offset += h.length + data.length;
    });
    var cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    var all = parts.concat(central, [end]), total = 0;
    all.forEach(function (a) { total += a.length; });
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---------- elemen WordprocessingML ---------- */
  function R(text, o) {
    o = o || {};
    var pr = '';
    if (o.bold) pr += '<w:b/><w:bCs/>';
    if (o.italic) pr += '<w:i/><w:iCs/>';
    if (o.size) pr += '<w:sz w:val="' + Math.round(o.size * 2) + '"/><w:szCs w:val="' + Math.round(o.size * 2) + '"/>';
    var xml = '';
    String(text == null ? '' : text).split(/(\n|\t)/).forEach(function (tok) {
      if (tok === '\n') xml += '<w:br/>';
      else if (tok === '\t') xml += '<w:tab/>';
      else if (tok !== '') xml += '<w:t xml:space="preserve">' + esc(tok) + '</w:t>';
    });
    return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + xml + '</w:r>';
  }
  function P(content, o) {
    o = o || {};
    var pr = '';
    if (o.style) pr += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) pr += '<w:keepNext/>';
    if (o.sp) {
      pr += '<w:spacing' + (o.sp.before != null ? ' w:before="' + o.sp.before + '"' : '') +
        (o.sp.after != null ? ' w:after="' + o.sp.after + '"' : '') +
        (o.sp.line != null ? ' w:line="' + o.sp.line + '" w:lineRule="auto"' : '') + '/>';
    }
    if (o.jc) pr += '<w:jc w:val="' + o.jc + '"/>';
    if (o.sect) pr += o.sect;
    return '<w:p>' + (pr ? '<w:pPr>' + pr + '</w:pPr>' : '') + content + '</w:p>';
  }
  function fld(instr, shown) {
    return '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' + R(shown) +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  }
  function drawing(rid, cx, cy, did, nm) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + (did || 1) + '" name="' + (nm || 'Logo') + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="' + (nm || 'logo') + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  function sect(L, o) {
    return '<w:sectPr>' + (o.footer ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : '') +
      '<w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="' + cm(L.top) + '" w:right="' + cm(L.right) + '" w:bottom="' + cm(L.bottom) +
      '" w:left="' + cm(L.left) + '" w:header="709" w:footer="709" w:gutter="0"/>' +
      (o.fmt ? '<w:pgNumType w:fmt="' + o.fmt + '" w:start="' + o.start + '"/>' : '') + '</w:sectPr>';
  }

  /* ---------- parser blok teks ---------- */
  var RE_UL = /^\s*[-•*]\s+/, RE_OL = /^\s*\d+[.)]\s+/, RE_H3 = /^##\s+/;
  function isTableLine(l) { return l.split('|').length >= 3; }
  function cells(l) { return l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); }); }

  function parseBlocks(text) {
    var out = [];
    String(text || '').replace(/\r/g, '').split(/\n\s*\n/).forEach(function (g) {
      var ls = g.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
      var i = 0;
      while (i < ls.length) {
        var l = ls[i], run = [];
        if (RE_H3.test(l)) { out.push({ t: 'h3', text: l.replace(RE_H3, '').trim() }); i++; continue; }
        if (isTableLine(l)) {
          while (i < ls.length && isTableLine(ls[i])) run.push(cells(ls[i++]));
          run = run.filter(function (r) { return !r.every(function (c) { return /^[-: ]*$/.test(c); }); });
          if (run.length) {
            var n = 0; run.forEach(function (r) { if (r.length > n) n = r.length; });
            run.forEach(function (r) { while (r.length < n) r.push(''); });
            out.push({ t: 'table', head: run[0], rows: run.slice(1) });
          }
        } else if (RE_UL.test(l)) {
          while (i < ls.length && RE_UL.test(ls[i])) run.push(ls[i++].replace(RE_UL, '').trim());
          out.push({ t: 'ul', items: run });
        } else if (RE_OL.test(l)) {
          while (i < ls.length && RE_OL.test(ls[i])) run.push(ls[i++].replace(RE_OL, '').trim());
          out.push({ t: 'ol', items: run });
        } else {
          while (i < ls.length && !RE_H3.test(ls[i]) && !isTableLine(ls[i]) && !RE_UL.test(ls[i]) && !RE_OL.test(ls[i])) run.push(ls[i++].trim());
          var eq = run.every(function (r) { return r.indexOf(' = ') >= 0 && r.length <= 160; });
          out.push(eq ? { t: 'eq', lines: run } : { t: 'p', text: run.join(' ') });
        }
      }
    });
    return out;
  }

  /* ---------- perkiraan halaman ---------- */
  function estimator(L) {
    var tw = 21 - L.left - L.right, th = 29.7 - L.top - L.bottom;
    var f = ({ 'Times New Roman': 1, 'Arial': 0.86, 'Calibri': 0.95 })[L.font] || 1;
    var cpl = Math.max(20, tw * 5.3 * (12 / L.size) * f * 0.95);
    var lpp = Math.max(5, th / (L.size * L.spacing * 0.03528));
    var cur = 1, used = 0;
    function lines(n) {
      while (n > 0) {
        var room = lpp - used;
        if (n <= room) { used += n; n = 0; } else { n -= room; cur++; used = 0; }
      }
    }
    return {
      page: function () { return cur; },
      brk: function () { if (used > 0) { cur++; used = 0; } },
      lines: lines, cpl: cpl,
      add: function (chars, extra) { lines(Math.max(1, Math.ceil(chars / cpl)) + (extra || 0)); }
    };
  }

  /* ---------- styles ---------- */
  function stylesXml(L, tw) {
    var sz = Math.round(L.size * 2), line = Math.round(L.spacing * 240);
    var jc = L.justify ? 'both' : 'left';
    var after = L.indent > 0 ? 0 : 120;
    var font = esc(L.font);
    var rf = '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:cs="' + font + '" w:eastAsia="' + font + '"/>';
    function st(id, name, based, ppr, rpr, extra) {
      return '<w:style w:type="paragraph"' + (extra || '') + ' w:styleId="' + id + '"><w:name w:val="' + name + '"/>' +
        (based ? '<w:basedOn w:val="' + based + '"/>' : '') + '<w:qFormat/>' +
        (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '</w:style>';
    }
    var bold = '<w:b/><w:bCs/>', big = '<w:sz w:val="' + (sz + 4) + '"/><w:szCs w:val="' + (sz + 4) + '"/>';
    var dot = '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="' + tw + '"/></w:tabs>';
    var custom = ' w:customStyle="1"';
    return XMLH + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' + rf +
      '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:val="id-ID" w:eastAsia="en-US" w:bidi="ar-SA"/>' +
      '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      st('Isi', 'Isi Dokumen', 'Normal', '<w:spacing w:after="' + after + '" w:line="' + line + '" w:lineRule="auto"/><w:ind w:firstLine="' + cm(L.indent) + '"/><w:jc w:val="' + jc + '"/>', '', custom) +
      st('Kata', 'Kata Pengantar Isi', 'Normal', '<w:spacing w:after="120" w:line="' + line + '" w:lineRule="auto"/><w:ind w:firstLine="' + cm(1.25) + '"/><w:jc w:val="both"/>', '', custom) +
      st('Butir', 'Butir Dokumen', 'Normal', '<w:spacing w:after="40" w:line="' + line + '" w:lineRule="auto"/><w:ind w:left="567" w:hanging="284"/><w:jc w:val="' + jc + '"/>', '', custom) +
      st('Daftar', 'Daftar Bernomor', 'Normal', '<w:spacing w:after="40" w:line="' + line + '" w:lineRule="auto"/><w:ind w:left="567" w:hanging="397"/><w:jc w:val="' + jc + '"/>', '', custom) +
      st('Rumus', 'Rumus Hitungan', 'Normal', '<w:spacing w:after="20" w:line="' + line + '" w:lineRule="auto"/><w:jc w:val="left"/>', '', custom) +
      st('Pustaka', 'Pustaka Dokumen', 'Normal', '<w:spacing w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="709" w:hanging="709"/><w:jc w:val="left"/>', '', custom) +
      st('Heading1', 'heading 1', 'Normal', '<w:keepNext/><w:pageBreakBefore/><w:spacing w:after="300" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', bold + big) +
      st('Heading2', 'heading 2', 'Normal', '<w:keepNext/><w:spacing w:before="160" w:after="60" w:line="' + line + '" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/>', bold) +
      st('Heading3', 'heading 3', 'Normal', '<w:keepNext/><w:spacing w:before="100" w:after="40" w:line="' + line + '" w:lineRule="auto"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/>', bold) +
      st('TOC1', 'toc 1', 'Normal', dot + '<w:spacing w:before="60" w:after="40" w:line="276" w:lineRule="auto"/>', bold) +
      st('TOC2', 'toc 2', 'Normal', dot + '<w:spacing w:after="30" w:line="276" w:lineRule="auto"/><w:ind w:left="340"/>', '') +
      st('Footer', 'footer', 'Normal', '<w:jc w:val="center"/>', '') +
      '</w:styles>';
  }

  /* ---------- tabel ---------- */
  var NUMLIKE = /^(Rp\s?[\d.,]+(\s*\/\s*\S+)?|[\d.,]+\s*(%|x|pcs|porsi|cup|orang)?|[±≈]\s*[\d.,]+.*)$/i;
  function tableXml(b, tw, size) {
    var n = b.head.length, w;
    if (n >= 3) { var first = 0.34; w = [first]; for (var i = 1; i < n; i++) w.push((1 - first) / (n - 1)); }
    else { w = []; for (var j = 0; j < n; j++) w.push(1 / n); }
    var gw = w.map(function (x) { return Math.round(tw * x); });
    var bd = function (k) { return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; };
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + tw + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bd).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + gw.map(function (g) { return '<w:gridCol w:w="' + g + '"/>'; }).join('') + '</w:tblGrid>';
    function cell(text, width, o) {
      o = o || {};
      return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (o.span ? '<w:gridSpan w:val="' + o.span + '"/>' : '') +
        (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' +
        P(R(text, { bold: o.bold, size: size }), { jc: o.jc || 'left', sp: { before: 0, after: 0, line: 240 } }) + '</w:tc>';
    }
    xml += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + b.head.map(function (h, i) { return cell(h, gw[i], { bold: true, jc: 'center', shade: 'D9D9D9' }); }).join('') + '</w:tr>';
    b.rows.forEach(function (r) {
      var total = /^TOTAL/i.test(r[0]);
      var mid = r.slice(1, -1).every(function (c) { return c === ''; });
      xml += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
      if (total && n >= 3 && mid) {
        var span = n - 1, wsum = 0; for (var k = 0; k < span; k++) wsum += gw[k];
        xml += cell(r[0], wsum, { bold: true, span: span, shade: 'F2F2F2' }) + cell(r[n - 1], gw[n - 1], { bold: true, jc: 'right', shade: 'F2F2F2' });
      } else {
        r.forEach(function (c, i) {
          xml += cell(c, gw[i], { bold: total, jc: (i > 0 && NUMLIKE.test(c.trim())) ? 'right' : 'left', shade: total ? 'F2F2F2' : '' });
        });
      }
      xml += '</w:tr>';
    });
    return xml + '</w:tbl>' + P('', { sp: { before: 0, after: 100, line: 240 } });
  }
  function tableLines(b, est, tw) {
    var n = b.head.length, total = 1.2, charsPerCm = est.cpl / (tw / 566.929);
    [b.head].concat(b.rows).forEach(function (r) {
      var mx = 1;
      r.forEach(function (c, i) {
        var colCm = (tw / 566.929) * (n >= 3 ? (i === 0 ? 0.34 : 0.66 / (n - 1)) : 1 / n) - 0.3;
        mx = Math.max(mx, Math.ceil(c.length / Math.max(4, colCm * charsPerCm * 1.15)));
      });
      total += mx * 0.8;
    });
    return total;
  }

  /* ---------- kata pengantar bawaan ---------- */
  function today(lang) {
    var d = new Date();
    return MONTHS[lang === 'en' ? 'en' : 'id'][d.getMonth()] + ' ' + d.getFullYear();
  }
  function kataBawaan(m, T) {
    var id = m.id, en = m.lang === 'en', t = m.title, jn = String(m.jenis || 'Makalah').toLowerCase();
    var grup = /^kel/.test(id.tipe || ''), siswa = /siswa/.test(id.tipe || '');
    var mk = id.mk || '', dosen = id.dosen || '', inst = id.instansi || '';
    var subs = [];
    var low = function (s) { return String(s).replace(/\b([A-Z][a-z]+)\b/g, function (w) { return w.toLowerCase(); }); };
    (m.chapters || []).forEach(function (c) { c.subs.forEach(function (s) { if (s.title) subs.push(low(s.title)); }); });
    var list = subs.slice(0, 7);
    var last = list.length > 1 ? list.pop() : '';
    var listTxt = last ? list.join(', ') + (m.lang === 'en' ? ', and ' : ', dan ') + last : list.join('');
    if (en) {
      var we = grup ? 'we' : 'the author', Wwe = grup ? 'We' : 'The author';
      return [
        'First of all, ' + we + ' would like to express gratitude to God Almighty for the blessings that made it possible to complete this ' + jn + ' entitled "' + t + '"' +
          (mk ? ', written as an assignment for ' + mk : '') + (inst ? ' at ' + inst : '') + '.',
        'This ' + jn + (listTxt ? ' covers ' + listTxt + '.' : ' was written to explain the topic in a structured way.') +
          ' ' + Wwe + ' thank' + (grup ? '' : 's') + ' ' + (dosen || 'the supervisor') + ' for the guidance, and everyone who helped in preparing this ' + jn + '.',
        Wwe + ' realise' + (grup ? '' : 's') + ' that this ' + jn + ' is still far from perfect. Constructive criticism and suggestions are welcome for future improvement. Hopefully this ' + jn + ' is useful for its readers.'
      ];
    }
    var pr = grup ? 'kami' : 'penulis', Pr = grup ? 'Kami' : 'Penulis';
    var mkw = siswa ? 'mata pelajaran ' : 'mata kuliah ';
    return [
      'Puji syukur ' + pr + ' panjatkan ke hadapan Tuhan Yang Maha Esa karena atas rahmat-Nya, ' + pr + ' dapat menyelesaikan ' + jn + ' "' + t + '"' +
        (mk ? ' sebagai tugas ' + mkw + mk : '') + (inst ? ' di ' + inst : '') + '.',
      (listTxt ? Pr + ' memaparkan ' + listTxt + ' di dalam ' + jn + ' ini. ' : '') +
        Pr + ' mengucapkan terima kasih kepada ' + (dosen ? dosen + ' selaku ' + (siswa ? 'guru' : 'dosen') + ' pengampu' : 'pembimbing') +
        ' yang telah membimbing' + (grup ? ' kami, serta kepada seluruh anggota kelompok yang telah bekerja sama dengan baik' : ' penulis') +
        ', dan kepada semua pihak yang telah membantu.',
      Pr + ' menyadari bahwa ' + jn + ' ini masih jauh dari sempurna. Oleh karena itu, kritik dan saran yang membangun sangat ' + pr + ' harapkan demi perbaikan di masa mendatang. Semoga ' + jn + ' ini bermanfaat bagi pembaca.'
    ];
  }

  /* ---------- susun dokumen ---------- */
  function compose(m) {
    var L = m.layout, O = m.opts, id = m.id, T = LABELS[m.lang === 'en' ? 'en' : 'id'];
    var twTw = cm(21 - L.left - L.right);
    var siswa = /siswa/.test(id.tipe || ''), grup = /^kel/.test(id.tipe || '');
    var size = L.size;
    var entries = [], body = '', words = 0;
    var est = estimator(L);

    function para(text) { body += P(R(text), { style: 'Isi' }); est.add(text.length + L.indent * 3, L.indent > 0 ? 0 : 0.35); words += wc(text); }

    function renderBlock(b, ctx) {
      if (b.t === 'p') para(b.text);
      else if (b.t === 'eq') {
        b.lines.forEach(function (l, i) { body += P(R(l), { style: 'Rumus', sp: i === b.lines.length - 1 ? { after: 120 } : undefined }); est.add(l.length, 0.1); words += wc(l); });
      } else if (b.t === 'ul') {
        b.items.forEach(function (it) {
          var m1 = it.match(/^([^:]{2,46}):\s+(.*)$/), runs;
          if (m1) runs = R('•\t') + R(m1[1] + ':', { bold: true }) + R(' ' + m1[2]);
          else runs = R('•\t' + it);
          body += P(runs, { style: 'Butir' }); est.add(it.length + 4, 0.2); words += wc(it);
        });
      } else if (b.t === 'ol') {
        b.items.forEach(function (it, i) { body += P(R((i + 1) + '.\t' + it), { style: 'Daftar' }); est.add(it.length + 4, 0.2); words += wc(it); });
      } else if (b.t === 'h3') {
        ctx.h3++;
        var lab = L.numbering === 'huruf' ? ctx.h3 + '. ' : ctx.num + '.' + ctx.sub + '.' + ctx.h3 + ' ';
        body += P(R(lab + b.text), { style: 'Heading3' }); est.add(lab.length + b.text.length, 0.5);
      } else if (b.t === 'table') {
        body += tableXml(b, twTw, Math.max(8, size - 2));
        est.lines(tableLines(b, est, twTw) + 0.5);
        words += wc(b.head.join(' ')) + b.rows.reduce(function (a, r) { return a + wc(r.join(' ')); }, 0);
      }
    }

    /* --- bab --- */
    (m.chapters || []).forEach(function (ch, ci) {
      var num = ci + 1;
      est.brk();
      var title = String(ch.title || '').toUpperCase();
      body += P(R(T.bab + ' ' + romanUp(num) + '\n' + title), { style: 'Heading1' });
      entries.push({ lvl: 1, text: T.bab + ' ' + romanUp(num) + '  ' + title, page: est.page(), front: false });
      est.add(10, 2);
      var onlyOne = (ch.subs || []).length === 1;
      (ch.subs || []).forEach(function (sb, si) {
        var label = L.numbering === 'huruf' ? letter(si) + '. ' : num + '.' + (si + 1) + ' ';
        var stitle = String(sb.title || '').trim();
        var noHead = !stitle || (onlyOne && stitle.toLowerCase() === String(ch.title || '').trim().toLowerCase());
        if (!noHead) {
          body += P(R(label + stitle), { style: 'Heading2' });
          entries.push({ lvl: 2, text: label + stitle, page: est.page(), front: false });
          est.add(label.length + stitle.length, 0.6);
        }
        var ctx = { h3: 0, num: num, sub: si + 1 };
        parseBlocks(sb.text).forEach(function (b) { renderBlock(b, ctx); });
      });
    });

    /* --- blok tanda tangan --- */
    if (O.ttd && (m.chapters || []).length) {
      var ketua = grup ? ((id.anggota || [])[0] || '') : (id.penulis || '');
      ketua = String(ketua).replace(/\s*[-–]\s*(ketua|\d+).*$/i, '').replace(/\s*\(\d+\)\s*(–.*)?$/, '').replace(/\s*[-–]\s*\d{3,}.*$/, '').trim();
      var teacher = id.dosen || '';
      var cw = Math.round(twTw / 2);
      var side = function (title, name) {
        return '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/></w:tcPr>' +
          P(R(title), { jc: 'center', sp: { before: 0, after: 0, line: 240 } }) +
          P('', { sp: { before: 0, after: 0 } }) + P('', { sp: { before: 0, after: 0 } }) + P('', { sp: { before: 0, after: 0 } }) +
          P(R('( ' + (name || '..................................') + ' )'), { jc: 'center', sp: { before: 0, after: 0, line: 240 } }) + '</w:tc>';
      };
      body += P('', { sp: { before: 240, after: 0 } }) +
        '<w:tbl><w:tblPr><w:tblW w:w="' + twTw + '" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="' + cw + '"/><w:gridCol w:w="' + cw + '"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>' +
        side((grup ? T.ketua : T.penulis) + ',\n', ketua) +
        side(T.mengetahui + ',\n' + (siswa ? T.guru : T.dosen), teacher) + '</w:tr></w:tbl>' + P('', {});
      est.lines(7);
    }

    /* --- pustaka --- */
    var pus = (m.pustaka || []).filter(Boolean);
    if (O.pustaka && pus.length) {
      est.brk();
      body += P(R(T.pustaka), { style: 'Heading1' });
      entries.push({ lvl: 1, text: T.pustaka, page: est.page(), front: false });
      est.add(10, 2);
      pus.slice().sort(function (a, b) { return a.localeCompare(b, m.lang === 'en' ? 'en' : 'id'); })
        .forEach(function (r) { body += P(R(r), { style: 'Pustaka' }); est.add(r.length + 8, 0.4); });
    }
    /* --- lampiran gambar (opsional) --- */
    var lamp = (m.lampiran || []).filter(function (x) { return x && x.bytes && x.w > 0 && x.h > 0; });
    if (lamp.length) {
      est.brk();
      body += P(R(T.lampiran), { style: 'Heading1' });
      entries.push({ lvl: 1, text: T.lampiran, page: est.page(), front: false });
      est.add(10, 2);
      var lh = size * L.spacing * 0.03528, maxW = twTw * 635, maxH = 10.5 * 360000;
      lamp.forEach(function (im, k) {
        var cx = Math.min(maxW, im.w * 9525 * 3), cy = Math.round(cx * im.h / im.w);
        if (cy > maxH) { cy = maxH; cx = Math.round(cy * im.w / im.h); }
        cx = Math.round(cx); cy = Math.round(cy);
        body += P(drawing('rIdImg' + (k + 1), cx, cy, 10 + k, 'Lampiran ' + (k + 1)), { jc: 'center', keepNext: true, sp: { before: 120, after: 60, line: 240 } });
        var cap = T.gambar + ' ' + (k + 1) + (im.caption ? '. ' + im.caption : '');
        body += P(R(cap, { size: Math.max(9, size - 1) }), { jc: 'center', sp: { before: 0, after: 240, line: 240 } });
        est.lines(Math.ceil(cy / 360000 / lh) + 2);
      });
    }
    var bodyPages = est.page();

    /* --- sampul --- */
    var cover = '', hasLogo = !!(m.logo && m.logo.bytes);
    function cp(text, o) {
      o = o || {};
      cover += P(R(text, { bold: o.bold, italic: o.italic, size: o.size }), { jc: 'center', sp: { before: o.before || 0, after: o.after || 0, line: 276 } });
    }
    var jenis = String(m.jenis || '').trim(), title = String(m.title || '').trim();
    var parts = title.split(/\s*:\s+/);
    var needJenis = jenis && title.toLowerCase().indexOf(jenis.toLowerCase()) !== 0;
    if (parts.length > 1) {
      cp(parts[0].toUpperCase(), { bold: true, size: 18, before: 200 });
      cp(parts.slice(1).join(': ').toUpperCase(), { bold: true, size: 24, after: 120 });
    } else {
      if (needJenis) cp(jenis.toUpperCase(), { bold: true, size: 18, before: 200 });
      cp(title.toUpperCase(), { bold: true, size: needJenis ? 20 : 22, before: needJenis ? 0 : 200, after: 120 });
    }
    var sub = String(m.subjudul || '').trim();
    if (!sub && id.mk) sub = (siswa ? T.mp : T.mk) + ' ' + id.mk;
    if (sub) cp(sub, { italic: true, size: 13, after: 200 });
    if (hasLogo) {
      var cy = 2340000, cx = Math.round(cy * m.logo.w / m.logo.h);
      if (cx > 2700000) { cx = 2700000; cy = Math.round(cx * m.logo.h / m.logo.w); }
      cover += P(drawing('rIdLogo', cx, cy), { jc: 'center', sp: { before: 200, after: 300 } });
    }
    if (grup && (id.kelompok || (id.anggota || []).length || id.kelas)) {
      var kel = id.kelompok ? (/^kelompok/i.test(id.kelompok) ? id.kelompok : 'Kelompok ' + id.kelompok) : 'Kelompok';
      cp(T.disusun + ' ' + kel + ':', { bold: true, before: hasLogo ? 0 : 360, after: 20 });
      if (id.kelas) cp(T.kelas + ' ' + id.kelas, { bold: true, after: 40 });
      (id.anggota || []).forEach(function (a) { cp(a, { size: 11, after: 10 }); });
    } else if (!grup && id.penulis) {
      cp(T.disusun + ':', { bold: true, before: hasLogo ? 0 : 360, after: 20 });
      cp(id.penulis, { bold: true, after: 20 });
      if (id.nim) cp((siswa ? T.nisn : T.nim) + ' ' + id.nim, { size: 11, after: 10 });
      if (id.kelas) cp(T.kelas + ' ' + id.kelas, { size: 11, after: 10 });
    }
    if (id.dosen) cp((siswa ? T.guru : T.dosen) + ': ' + id.dosen, { size: 11, before: 100 });
    var foot = [];
    if (id.fakultas) foot.push([id.fakultas, { size: 12 }]);
    if (id.instansi) foot.push([String(id.instansi).toUpperCase(), { bold: true, size: 14 }]);
    if (id.alamat) foot.push([id.alamat, { size: 12 }]);
    if (id.tahun) foot.push([id.tahun, { bold: true, size: 12 }]);
    foot.forEach(function (f, i) { var o = f[1]; o.before = i === 0 ? 500 : 0; o.after = 20; cp(f[0], o); });
    var useFooter = !!O.nomor;
    cover += P('', { sect: sect(L, { footer: false }) });

    /* --- bagian depan --- */
    var front = '', kataParas = null;
    var fe = estimator(L), kataPages = 1;
    if (O.kata) {
      kataParas = (m.kata && m.kata.length) ? m.kata : kataBawaan(m, T);
      front += P(R(T.kata), { style: 'Heading1' });
      kataParas.forEach(function (t) { front += P(R(t), { style: 'Kata' }); fe.add(t.length + 6, 0.35); });
      var sign = [id.kota, today(m.lang)].filter(Boolean).join(', ');
      front += P(R(sign), { jc: 'right', sp: { before: 480 } });
      front += P(R(grup ? T.penyusun : T.penulis), { jc: 'right', sp: { before: 40 } });
      kataPages = fe.page();
      entries.unshift({ lvl: 1, text: T.kata, page: 1, front: true });
    }
    if (O.isi) {
      var isiPage = (O.kata ? kataPages : 0) + 1;
      entries.splice(O.kata ? 1 : 0, 0, { lvl: 1, text: T.isi, page: isiPage, front: true });
      front += P(R(T.isi), { style: 'Heading1' });
      entries.forEach(function (e, i) {
        var pg = e.front ? roman(e.page) : String(e.page), runs = '';
        if (i === 0) {
          runs += '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
            '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
        }
        runs += R(e.text + '\t' + pg);
        if (i === entries.length - 1) runs += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
        front += P(runs, { style: e.lvl === 1 ? 'TOC1' : 'TOC2' });
      });
    }
    var hasFront = !!(O.kata || O.isi);
    if (hasFront) front += P('', { sect: sect(L, { footer: useFooter, fmt: 'lowerRoman', start: 1 }) });

    var bodySect = sect(L, { footer: useFooter, fmt: 'decimal', start: 1 });
    var doc = XMLH + '<w:document ' + NS + '><w:body>' + cover + front + body + bodySect + '</w:body></w:document>';
    return {
      xml: doc, pages: bodyPages, words: words, useFooter: useFooter, tw: twTw, kata: kataParas,
      toc: entries.map(function (e) { return { lvl: e.lvl, text: e.text, page: e.front ? roman(e.page) : String(e.page) }; }),
      sign: [id.kota, today(m.lang)].filter(Boolean).join(', '), who: grup ? T.penyusun : T.penulis
    };
  }

  function outline(m) { var c = compose(m); return { kata: c.kata || [], toc: c.toc, sign: c.sign, who: c.who, pages: c.pages }; }
  function estimate(m) { var c = compose(m); return { pages: c.pages, words: c.words }; }

  function build(m) {
    var c = compose(m), L = m.layout;
    var hasLogo = !!(m.logo && m.logo.bytes);
    var lamp = (m.lampiran || []).filter(function (x) { return x && x.bytes && x.w > 0 && x.h > 0; });
    var ct = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      (c.useFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    var rels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    var RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    var docRels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="' + RT + 'styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSettings" Type="' + RT + 'settings" Target="settings.xml"/>' +
      (c.useFooter ? '<Relationship Id="rIdFooter" Type="' + RT + 'footer" Target="footer1.xml"/>' : '') +
      (hasLogo ? '<Relationship Id="rIdLogo" Type="' + RT + 'image" Target="media/logo.png"/>' : '') +
      lamp.map(function (im, k) { return '<Relationship Id="rIdImg' + (k + 1) + '" Type="' + RT + 'image" Target="media/lamp' + (k + 1) + '.' + (im.ext === 'png' ? 'png' : 'jpg') + '"/>'; }).join('') +
      '</Relationships>';
    var settings = XMLH + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    var footer = XMLH + '<w:ftr ' + NS + '>' + P(fld('PAGE', '1'), { style: 'Footer', jc: 'center' }) + '</w:ftr>';
    var who = m.id.penulis || m.id.kelompok || 'Makalah Kilat';
    var core = XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(m.title) + '</dc:title><dc:creator>' +
      esc(who) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' +
      new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>';

    var files = [
      { name: '[Content_Types].xml', data: enc.encode(ct) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'word/document.xml', data: enc.encode(c.xml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml(L, c.tw)) },
      { name: 'word/settings.xml', data: enc.encode(settings) },
      { name: 'docProps/core.xml', data: enc.encode(core) }
    ];
    if (c.useFooter) files.push({ name: 'word/footer1.xml', data: enc.encode(footer) });
    if (hasLogo) files.push({ name: 'word/media/logo.png', data: m.logo.bytes });
    lamp.forEach(function (im, k) { files.push({ name: 'word/media/lamp' + (k + 1) + '.' + (im.ext === 'png' ? 'png' : 'jpg'), data: im.bytes }); });
    return zip(files);
  }

  /* ---------- baca teks dari .docx ---------- */
  function dec(u8) { return new TextDecoder('utf-8').decode(u8); }
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Perangkat ini belum bisa membuka DOCX. Simpan berkasnya sebagai PDF atau TXT.');
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function readText(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('Berkas DOCX rusak atau bukan DOCX.');
    var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), xml = null;
    for (var k = 0; k < n && p + 46 <= u8.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      if (dec(u8.subarray(p + 46, p + 46 + nl)) === 'word/document.xml') {
        var start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        var data = u8.subarray(start, start + csize);
        xml = dec(method === 0 ? data : await inflateRaw(data));
        break;
      }
      p += 46 + nl + el + cl;
    }
    if (xml == null) throw new Error('Isi DOCX tidak ditemukan.');
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, ' | ')
      .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  var api = { build: build, estimate: estimate, outline: outline, readText: readText, parseBlocks: parseBlocks, LABELS: LABELS, wordCount: wc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Docx = api;
})(typeof window !== 'undefined' ? window : globalThis);
