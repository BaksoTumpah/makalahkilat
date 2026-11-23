/* Makalah Kilat: dari judul atau berkas data ke dokumen .docx lengkap (sampul, kata pengantar, daftar isi, bab). */
(function () {
  'use strict';

  var NATIVE = window.AndroidBridge || null;      // jembatan ke MainActivity (hanya di APK)
  var SIM = !!window.__SIM__;                     // pratinjau: AI dan unduhan dimatikan
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- penyimpanan ---------- */
  var mem = {};
  function sGet(k) { try { var v = localStorage.getItem(k); return v == null ? mem[k] : v; } catch (e) { return mem[k]; } }
  function sSet(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  function loadJSON(k, fallback) { try { var v = sGet(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }

  var DEFAULTS = {
    apiKey: '', model: 'gemini-2.5-flash',
    tipe: 'mahasiswa', jenis: 'Otomatis', subjudul: '', alamat: '',
    instansi: '', fakultas: '', mataKuliah: '', dosen: '', penulis: '', nim: '', kelas: '', kota: '',
    kelompok: '', anggota: '', tahun: String(new Date().getFullYear()),
    logoOn: true, logo: '', logoW: 300, logoH: 300,
    marginTop: 3, marginLeft: 4, marginBottom: 3, marginRight: 3,
    font: 'Times New Roman', fontSize: 12, spacing: 1.5, justify: true, indent: 0, numbering: 'desimal',
    kataPengantar: true, daftarIsi: true, daftarPustaka: true, nomorHalaman: true, ttd: true,
    sumberMode: 'judul', ukuranMode: 'auto', halaman: 10, subbab: 5, bahasa: 'id'
  };
  var CLAMP = {
    marginTop: [0, 6], marginLeft: [0, 6], marginBottom: [0, 6], marginRight: [0, 6],
    fontSize: [8, 16], spacing: [1, 3], indent: [0, 3], halaman: [3, 40], subbab: [2, 8]
  };
  var EXAMPLES = [
    'Dampak Media Sosial terhadap Kesehatan Mental Remaja',
    'Peran Energi Terbarukan dalam Pembangunan Berkelanjutan',
    'Pengaruh Kecerdasan Buatan terhadap Dunia Pendidikan'
  ];
  var JENIS_LIST = ['Makalah', 'Proposal', 'Laporan', 'Karya Tulis'];

  var state = {
    tab: 'buat', view: 'form',
    settings: Object.assign({}, DEFAULTS, loadJSON('mk.settings', {})),
    draft: null, title: sGet('mk.title') || '',
    run: null, cancel: false, error: '', savedAs: '',
    pred: null, predBusy: false,
    source: null, srcBusy: false, srcErr: '', arahan: '',
    lampiran: [], lampBusy: false, lampErr: ''
  };
  function saveSettings() { sSet('mk.settings', JSON.stringify(state.settings)); }
  function isDemo() { return SIM || !String(state.settings.apiKey).trim(); }
  function LBL() { return Docx.LABELS[state.settings.bahasa === 'en' ? 'en' : 'id']; }

  /* ---------- teks ---------- */
  function clean(t) {
    return String(t == null ? '' : t)
      .replace(/[*`#]+/g, '').replace(/^\s*[-•]\s+/, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  function cleanText(t) {
    return String(t == null ? '' : t).replace(/\r/g, '').replace(/^[ \t]*\*[ \t]+/gm, '- ').replace(/[*`]+/g, '')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function strs(v) {
    if (typeof v === 'string') v = v.split(/\n\s*\n/);
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return clean(typeof x === 'string' ? x : (x && (x.teks || x.text)) || ''); }).filter(Boolean);
  }
  function teksOf(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(teksOf).join('\n\n');
    return teksOf(v.teks || v.text || v.isi || '');
  }
  function stripNum(t) { return t.replace(/^\(?\d+[.)]\s*/, ''); }
  function toLines(v) { return String(v).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function words(t) { var m = String(t || '').trim().match(/\S+/g); return m ? m.length : 0; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function B64(bytes) {
    var s = '', n = 0x8000;
    for (var i = 0; i < bytes.length; i += n) s += String.fromCharCode.apply(null, bytes.subarray(i, i + n));
    return btoa(s);
  }
  function fromB64Text(b64) {
    var bin = atob(b64), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(a);
  }
  function wpp() { var S = state.settings; return Math.round(380 * (1.5 / S.spacing) * (12 / S.fontSize)); }
  function jenisLow() { return String((state.draft && state.draft.jenis) || 'Makalah').toLowerCase(); }

  /* ---------- panggilan AI (Gemini) ---------- */
  var pending = {}, seq = 0;
  window.__native = {
    onAi: function (id, status, b64) {
      var cb = pending[id]; if (!cb) return; delete pending[id];
      cb({ status: status, text: fromB64Text(b64) });
    }
  };
  function post(url, key, bodyObj) {
    var body = JSON.stringify(bodyObj);
    if (NATIVE) {
      return new Promise(function (res) {
        var id = 'r' + (++seq); pending[id] = res;
        NATIVE.aiRequest(id, url, key, body);
      });
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .catch(function (e) { return { status: 0, text: String(e) }; });
  }
  function apiError(r) {
    var msg = '';
    try { msg = JSON.parse(r.text).error.message || ''; } catch (e) { msg = ''; }
    if (r.status === 400 && /api key/i.test(msg)) return 'API key tidak valid. Periksa lagi di Pengaturan.';
    if (r.status === 401 || r.status === 403) return 'API key ditolak (' + r.status + '). Periksa key dan izin akunnya di Pengaturan.';
    if (r.status === 404) return 'Model "' + state.settings.model + '" tidak ditemukan. Ganti nama model di Pengaturan.';
    return 'AI mengembalikan galat ' + r.status + (msg ? ': ' + msg.slice(0, 140) : '.');
  }
  async function gemini(prompt, wantJson, inline) {
    var S = state.settings;
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(S.model.trim()) + ':generateContent';
    var parts = [{ text: prompt }];
    if (inline) parts.unshift({ inline_data: { mime_type: inline.mime, data: inline.data } });
    var body = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.7 } };
    if (wantJson) body.generationConfig.responseMimeType = 'application/json';
    for (var attempt = 0; attempt < 4; attempt++) {
      if (state.cancel) throw new Error('CANCEL');
      var r = await post(url, S.apiKey.trim(), body);
      if (r.status === 200) {
        var text = '';
        try {
          var j = JSON.parse(r.text);
          text = (j.candidates[0].content.parts || []).map(function (p) { return p.text || ''; }).join('');
        } catch (e) { text = ''; }
        if (!text) throw new Error('AI tidak mengembalikan teks. Isi mungkin ditolak, coba ubah judul atau berkasnya.');
        return text;
      }
      if (r.status === 429 || r.status === 500 || r.status === 503 || r.status === 0) {
        var wait = (attempt + 1) * 6;
        if (attempt === 3) throw new Error(r.status === 0 ? 'Tidak bisa terhubung ke internet.' : 'Server AI sibuk atau kuota habis. Coba lagi beberapa menit lagi.');
        setNote('Server AI sibuk, mencoba lagi dalam ' + wait + ' detik');
        await sleep(wait * 1000);
        setNote('');
        continue;
      }
      throw new Error(apiError(r));
    }
    throw new Error('Gagal menghubungi AI.');
  }
  function parseJSON(t) {
    t = String(t).replace(/```json|```/gi, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('bukan JSON');
    return JSON.parse(t.slice(a, b + 1));
  }
  async function askJson(prompt) {
    for (var i = 0; i < 2; i++) {
      var t = await gemini(prompt, true);
      try { return parseJSON(t); } catch (e) { /* ulangi sekali */ }
    }
    throw new Error('Jawaban AI tidak bisa dibaca. Coba lagi.');
  }

  /* ---------- prompt ---------- */
  function langName(l) { return l === 'en' ? 'English' : 'Bahasa Indonesia baku'; }
  var FORMAT = 'Format teks tiap subbab (pakai baris baru): paragraf dipisah satu baris kosong; butir diawali "- " satu per baris, dan bila berupa label tulis "Label: penjelasan"; ' +
    'daftar bernomor diawali "1. "; rumus atau hitungan ditulis satu per baris dengan tanda "="; tabel ditulis satu baris per baris dengan pemisah "|", baris pertama berisi judul kolom, dan baris jumlah diawali TOTAL; ' +
    'sub-subjudul diawali "## ". Pakai tabel bila sumber memuat data berbaris seperti anggaran atau daftar bahan. Jangan memakai tanda bintang atau markdown lain. Tulis rupiah seperti Rp45.000. Periksa ulang semua hitungan.';
  function pre(ctx) {
    return 'Kamu penulis dokumen akademik. Tulis dalam ' + langName(ctx.lang) + ' dengan gaya ilmiah formal. ' +
      'Jangan memakai markdown, tanda bintang, tanda pagar, atau poin berformat kecuali format yang diminta. ' +
      'Jangan mengarang angka statistik, nama peneliti, atau kutipan yang tidak pasti. ' +
      'Balas hanya dengan JSON valid sesuai skema.\n' +
      (ctx.title ? 'Judul: "' + ctx.title + '".\n' : 'Judul: tentukan sendiri dari isi sumber.\n') + srcBlock(ctx);
  }
  function srcBlock(ctx) {
    if (!ctx.src) return '';
    return '\nSUMBER DATA DARI PENGGUNA (bahan utama):\n"""\n' + ctx.src + '\n"""\n' +
      'Aturan sumber: (1) Pakai semua fakta, angka, nama, tanggal, lokasi, dan istilah dari sumber persis seperti aslinya, jangan diubah atau diganti. ' +
      '(2) Kembangkan dengan penjelasan, konteks, landasan teori umum, analisis, dan hubungan antardata supaya hasilnya lebih lengkap dan lebih baik dari sumber. ' +
      '(3) Jangan menciptakan angka, nama, atau data baru yang seolah berasal dari sumber. Jika sumber berisi kolom kosong atau rumus tanpa angka, jelaskan rumusnya dan beri contoh hitungan dengan angka rekaan yang diberi label "contoh ilustrasi". ' +
      '(4) Jika sumber berupa templat berisi petunjuk, anggap petunjuk itu pedoman isi tiap bagian, tulis isinya, dan jangan menyalin kalimat petunjuk. ' +
      (ctx.arahan ? '(5) Arahan tambahan dari pengguna: ' + ctx.arahan + '\n' : '\n');
  }
  var P = {
    baca: function () {
      return 'Salin seluruh isi dokumen terlampir menjadi teks polos. Pertahankan urutan, judul bagian, petunjuk, angka, isi tabel (tulis tiap baris tabel dalam satu baris dengan pemisah |), nama, tanggal, dan anggaran persis seperti aslinya. Jangan meringkas, jangan menafsirkan, jangan menambah. Balas hanya dengan teks salinan.';
    },
    size: function (c) {
      return 'Kamu pembimbing penulisan dokumen akademik. Perkirakan ukuran yang cocok untuk ' + (c.title ? 'judul: "' + c.title + '". ' : 'isi sumber di bawah. ') +
        (c.src ? 'Sumber data dari pengguna (potongan awal):\n"""\n' + c.src.slice(0, 6000) + '\n"""\nSesuaikan dengan banyaknya materi sumber. ' : '') +
        (c.kid ? 'Penulisnya siswa sekolah, jadi sebaiknya lebih ringkas. ' : 'Penulisnya mahasiswa atau umum. ') +
        'Yang dihitung hanya halaman isi (semua bab) pada kertas A4 spasi 1,5 huruf 12 pt, tanpa sampul, kata pengantar, daftar isi, dan daftar pustaka. ' +
        'Halaman antara 3 dan 40, subbab pembahasan antara 2 dan 8. Rekomendasi harus berada di dalam rentang minimal dan maksimal. ' +
        'Balas hanya JSON valid: {"halaman_min":angka,"halaman_maks":angka,"halaman_rekomendasi":angka,"subbab_min":angka,"subbab_maks":angka,"subbab_rekomendasi":angka,"alasan":"satu kalimat bahasa Indonesia"}';
    },
    outline: function (c) {
      return pre(c) + 'Susun kerangka makalah. Skema: {"rumusan":[3 kalimat tanya],"tujuan":[3 kalimat tujuan, sejajar dengan rumusan],' +
        '"subbab":[tepat ' + c.N + ' judul subbab pembahasan, urut logis, tiap judul 2 sampai 7 kata, tanpa nomor]}';
    },
    bab1: function (c) {
      return pre(c) + 'Tulis Latar Belakang (Bab I). Alurkan dari isu umum ke masalah khusus, lalu arahkan ke rumusan masalah berikut:\n- ' +
        c.o.rumusan.join('\n- ') + '\nSkema: {"latar":[3 paragraf, total sekitar ' + c.w.latar + ' kata]}';
    },
    sub: function (c) {
      return pre(c) + 'Tulis isi subbab pembahasan "' + c.judul + '" (subbab ' + (c.i + 1) + ' dari ' + c.N + '). Subbab lain: ' +
        c.o.subbab.filter(function (x, k) { return k !== c.i; }).join('; ') + '. Fokus hanya pada subbab ini dan jangan mengulang subbab lain. ' +
        'Jangan menulis judul subbab di dalam paragraf. Skema: {"paragraf":[3 sampai 4 paragraf, total sekitar ' + c.w.sub + ' kata]}';
    },
    bab3: function (c) {
      return pre(c) + 'Tulis Penutup (Bab III). Rumusan masalah:\n- ' + c.o.rumusan.join('\n- ') + '\nPokok pembahasan: ' + c.o.subbab.join('; ') +
        '\nSkema: {"kesimpulan":[1 sampai 2 paragraf yang menjawab tiap rumusan masalah],"saran":[1 paragraf saran praktis]}. Total sekitar ' + c.w.tutup + ' kata.';
    },
    outlineSrc: function (c) {
      return pre(c) + 'Susun struktur dokumen dari sumber. Ikuti urutan dan isi sumber. Bagi menjadi 3 sampai 6 bab (bab pertama PENDAHULUAN, bab terakhir PENUTUP) dan beri tiap bab 1 sampai 5 subbab. ' +
        'Gabungkan bagian sumber yang berdekatan agar ringkas. Sampul, kata pengantar, dan daftar isi tidak dijadikan bab. Bab PENUTUP boleh tanpa subbab. ' +
        'Skema: {"judul":"judul formal 5 sampai 15 kata","jenis":"Makalah atau Proposal atau Laporan atau Karya Tulis","rumusan":[],"bab":[{"judul":"JUDUL BAB tanpa kata BAB","sub":["judul subbab tanpa nomor"]}]}';
    },
    babSrc: function (c) {
      return pre(c) + 'Tulis isi bab ke-' + (c.i + 1) + ' dari ' + c.nb + ': "' + c.bab.judul + '". Struktur seluruh dokumen: ' + c.struct + '. Fokus hanya pada bab ini. ' +
        (c.bab.sub.length ? 'Subbab bab ini: ' + c.bab.sub.join('; ') + '. ' : 'Bab ini tidak punya subbab, kembalikan satu objek dengan judul kosong "". ') +
        'Panjang sekitar ' + c.words + ' kata untuk seluruh bab ini. ' + FORMAT +
        ' Skema: {"subs":[{"judul":"sama persis dengan judul subbab","teks":"isi subbab"}]} dengan satu objek per subbab, urut.';
    },
    revisi: function (c) {
      return pre(c) + 'Kamu editor dokumen akademik. Revisi isi bab "' + c.bab.title + '" sesuai arahan pengguna: "' + c.ins + '". ' +
        'Aturan: pertahankan semua fakta, angka, nama, tanggal, dan istilah; jangan membuat data baru; jumlah dan urutan subbab tetap dan judul subbab tidak diubah; ' +
        'tulis ulang seluruh isi tiap subbab, bukan hanya bagian yang berubah. ' + FORMAT + '\nISI SAAT INI (JSON):\n' +
        JSON.stringify({ subs: c.bab.subs.map(function (sb) { return { judul: sb.title, teks: sb.text }; }) }) +
        '\nSkema: {"subs":[{"judul":"sama persis","teks":"isi subbab hasil revisi"}]}';
    },
    kata: function (c) {
      return pre(c) + 'Tulis kata pengantar untuk ' + c.jenis.toLowerCase() + ' ini dalam 3 paragraf pendek. Gunakan kata ganti "' + (c.grup ? 'kami' : 'penulis') + '". ' +
        'Paragraf 1: puji syukur kepada Tuhan Yang Maha Esa dan penyelesaian ' + c.jenis.toLowerCase() + ' berjudul "' + c.title + '"' + (c.mk ? ' sebagai tugas ' + c.mk : '') + (c.inst ? ' di ' + c.inst : '') + '. ' +
        'Paragraf 2: ringkasan isi yang dibahas (' + c.struct + ') dan ucapan terima kasih kepada ' + (c.dosen || 'pembimbing') + ' serta semua pihak yang membantu. ' +
        'Paragraf 3: mengakui kekurangan, mengharap kritik dan saran, dan harapan semoga bermanfaat. Skema: {"kata":[3 paragraf]}';
    },
    pustaka: function (c) {
      return pre(c) + 'Buat daftar pustaka format APA edisi 7. Hanya cantumkan buku, jurnal, atau laporan lembaga yang benar-benar ada dan kamu yakini. ' +
        'Jika ragu, beri lebih sedikit entri. Jangan menulis URL atau DOI yang tidak pasti. Skema: {"pustaka":[5 sampai 6 entri]}';
    }
  };

  /* ---------- sumber berkas ---------- */
  var MAXB = 10 * 1024 * 1024, MAXC = 40000;
  function useSrcNow() { return state.settings.sumberMode === 'berkas' && !!state.source; }
  function canGen() { return state.settings.sumberMode === 'berkas' ? !!state.source : clean(state.title).length >= 5; }
  function normSrc(t) { return String(t).replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
  function isHead(l) {
    l = l.trim();
    var m = l.match(/^(?:[A-Z]|[IVX]{1,4}|\d{1,2})[.)]\s+(\S.{2,80})$/);
    return m && !/[.:;,]$/.test(m[1]) && m[1].split(/\s+/).length <= 9 ? clean(m[1]) : '';
  }
  function headingsOf(t) {
    var all = [], letters = [];
    String(t).split('\n').forEach(function (l) {
      var h = isHead(l); if (!h) return;
      all.push(h); if (/^[A-Z][.)]\s/.test(l.trim())) letters.push(h);
    });
    return letters.length >= 3 ? letters : all;
  }
  function bodyHeads(t) { return headingsOf(t).filter(function (h) { return !/latar|tujuan|penutup|cover|sampul|kesimpulan/i.test(h); }); }
  function sectionBody(t, judul) {
    var ls = String(t).split('\n'), out = [], on = false, key = String(judul).toLowerCase();
    if (!key) return '';
    for (var i = 0; i < ls.length; i++) {
      var h = isHead(ls[i]);
      if (h) { if (on) break; if (h.toLowerCase().indexOf(key) >= 0 || key.indexOf(h.toLowerCase()) >= 0) on = true; continue; }
      if (on && ls[i].trim()) out.push(ls[i].trim());
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }
  function firstWords(t, n) { return String(t).replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' '); }
  function detectJenis(t) {
    var h = String(t).slice(0, 300).toLowerCase();
    return /proposal/.test(h) ? 'Proposal' : /laporan/.test(h) ? 'Laporan' : 'Makalah';
  }
  async function readSource(file) {
    var name = file.name || 'berkas', ext = (name.split('.').pop() || '').toLowerCase();
    if (file.size > MAXB) throw new Error('Berkas terlalu besar. Maksimal 10 MB.');
    var s = { name: name, size: file.size, kind: 'text', text: '', b64: '', cut: false };
    if (ext === 'pdf') { s.kind = 'pdf'; s.b64 = B64(new Uint8Array(await file.arrayBuffer())); return s; }
    if (ext === 'docx') s.text = await Docx.readText(await file.arrayBuffer());
    else if (/^(txt|md|csv|text)$/.test(ext)) s.text = await file.text();
    else throw new Error('Jenis berkas .' + ext + ' belum didukung. Pakai PDF, DOCX, TXT, MD, atau CSV.');
    s.text = normSrc(s.text);
    if (words(s.text) < 20) throw new Error('Isi berkas terlalu sedikit untuk dijadikan dokumen.');
    if (s.text.length > MAXC) { s.text = s.text.slice(0, MAXC); s.cut = true; }
    return s;
  }
  async function ensureSource() {
    var s = state.source;
    if (!s) throw new Error('Pilih berkas dulu.');
    if (s.kind === 'pdf' && !s.text) {
      if (isDemo()) throw new Error(SIM ? 'Di pratinjau, PDF tidak bisa dibaca karena AI mati. Coba berkas DOCX atau TXT.' : 'PDF dibaca oleh AI. Isi API key di Pengaturan dulu.');
      var t = normSrc(await gemini(P.baca(), false, { mime: 'application/pdf', data: s.b64 }));
      if (words(t) < 20) throw new Error('Isi PDF tidak terbaca. Pastikan PDF berisi teks, bukan hasil foto.');
      if (t.length > MAXC) { t = t.slice(0, MAXC); s.cut = true; }
      s.text = t; s.b64 = '';
    }
    return s;
  }

  /* ---------- prediksi ukuran ---------- */
  function curTitle() { return clean(state.title); }
  function predKey() { return useSrcNow() ? 'berkas:' + state.source.name + ':' + state.source.size + '|' + curTitle() : curTitle(); }
  function predValid() { return state.pred && state.pred.key === predKey() ? state.pred : null; }
  function sizeNow() {
    var S = state.settings, p = predValid();
    if (S.ukuranMode === 'auto' && p) return { h: p.hRec, s: p.sRec };
    return { h: Math.round(S.halaman), s: Math.round(S.subbab) };
  }
  function cl(v, a, b) { v = Math.round(+v); if (isNaN(v)) v = a; return Math.min(b, Math.max(a, v)); }
  function fixPred(o, key, src) {
    var hMin = cl(o.hMin, 3, 40), hMax = cl(o.hMax, 3, 40), sMin = cl(o.sMin, 2, 8), sMax = cl(o.sMax, 2, 8), t;
    if (hMax < hMin) { t = hMin; hMin = hMax; hMax = t; }
    if (sMax < sMin) { t = sMin; sMin = sMax; sMax = t; }
    return {
      key: key, src: src, why: clean(o.why || ''),
      hMin: hMin, hMax: hMax, hRec: Math.min(hMax, Math.max(hMin, cl(o.hRec, 3, 40))),
      sMin: sMin, sMax: sMax, sRec: Math.min(sMax, Math.max(sMin, cl(o.sRec, 2, 8)))
    };
  }
  function localPredict(key, title) {
    var t = title.toLowerCase(), w = words(title);
    var broad = /(dampak|pengaruh|peran|perkembangan|sejarah|strategi|analisis|kebijakan|globalisasi|pembangunan|pendidikan|ekonomi|lingkungan|teknologi|kesehatan|sosial)/.test(t);
    var narrow = /(studi kasus|di desa|di kota|di sekolah|pada siswa|pada masyarakat|di kelurahan|di kecamatan)/.test(t);
    var kid = /siswa/.test(state.settings.tipe);
    var rec = cl(7 + Math.min(w, 12) * 0.4 + (broad ? 2 : 0) - (narrow ? 1.5 : 0) - (kid ? 2 : 0), 5, 16);
    var s = rec <= 7 ? 4 : rec <= 12 ? 5 : 6;
    return fixPred({
      hMin: Math.max(4, rec - 4), hMax: rec + 6, hRec: rec, sMin: Math.max(3, s - 1), sMax: Math.min(8, s + 1), sRec: s,
      why: (broad ? 'Topik luas, jadi butuh ruang untuk beberapa sudut pandang. ' : 'Topik cukup terfokus. ') + (narrow ? 'Cakupan sempit membuat makalah bisa lebih ringkas.' : 'Judul sepanjang ' + w + ' kata ini cukup untuk ' + s + ' subbab.')
    }, key, 'local');
  }
  function localPredictSrc(key, text) {
    var w = words(text), hs = bodyHeads(text), rec = cl(5 + w / 220, 5, 20);
    var s = hs.length >= 3 ? cl(hs.length, 3, 8) : (rec <= 8 ? 4 : rec <= 13 ? 5 : 6);
    return fixPred({
      hMin: Math.max(4, rec - 3), hMax: rec + 6, hRec: rec, sMin: Math.max(3, s - 1), sMax: Math.min(8, s + 1), sRec: s,
      why: 'Berkas berisi sekitar ' + w.toLocaleString('id-ID') + ' kata' + (hs.length >= 3 ? ' dan ' + hs.length + ' bagian, jadi bagian-bagiannya bisa dijadikan bab dan subbab.' : '.')
    }, key, 'local');
  }
  async function predictSize() {
    var key = predKey(), br = useSrcNow(), srcT = br ? state.source.text : '', title = curTitle();
    if (!isDemo()) {
      try {
        var r = await askJson(P.size({ title: title, lang: state.settings.bahasa, kid: /siswa/.test(state.settings.tipe), src: srcT }));
        return fixPred({ hMin: r.halaman_min, hMax: r.halaman_maks, hRec: r.halaman_rekomendasi, sMin: r.subbab_min, sMax: r.subbab_maks, sRec: r.subbab_rekomendasi, why: r.alasan }, key, 'ai');
      } catch (e) { if (e.message === 'CANCEL') throw e; }
    } else { await sleep(300); }
    return br ? localPredictSrc(key, srcT) : localPredict(key, title);
  }
  async function doPredict() {
    if (!canGen() || state.predBusy) return;
    state.cancel = false; state.predBusy = true; paintSize();
    try {
      if (useSrcNow()) { await ensureSource(); paintSource(); }
      state.pred = await predictSize();
    } catch (e) { if (e.message !== 'CANCEL') toast(e.message); }
    state.predBusy = false; paintSize();
  }

  /* ---------- isi contoh (tanpa AI) ---------- */
  var DEMO_SUB = ['Pengertian dan Konsep Dasar', 'Faktor yang Memengaruhi', 'Dampak dan Permasalahan', 'Upaya Penanganan', 'Contoh Penerapan', 'Tantangan dan Peluang', 'Kajian Pendukung', 'Perkembangan Terkini'];
  function demoPars(t, n) {
    var base = [
      'Topik "' + t + '" menarik dibahas karena berkaitan langsung dengan kehidupan sehari-hari dan perkembangan ilmu pengetahuan. Pembahasan yang runtut membantu pembaca memahami gambaran umum, hubungan antarunsur, dan alasan topik ini penting dipelajari.',
      'Setiap unsur dalam topik ini saling berkaitan sehingga perlu dilihat secara utuh. Penjelasan yang terarah memudahkan pembaca membedakan hal pokok dari hal pendukung, lalu menarik kesimpulan yang dapat dipertanggungjawabkan.',
      'Dengan memahami uraian ini, pembaca diharapkan mampu menilai persoalan secara kritis dan menyusun langkah yang tepat. Uraian lengkap dengan data dan rujukan akan muncul setelah AI diaktifkan di Pengaturan.'
    ];
    return base.slice(0, n).map(function (p) { return '[CONTOH] ' + p; });
  }
  function demoTitle(c) {
    var first = String(c.src || '').split('\n').filter(function (l) { return l.trim(); })[0] || '';
    first = clean(first);
    if (!first || words(first) > 14) first = (state.source && state.source.name || 'Berkas').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    return first.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  var DEMO = {
    outline: function (c) {
      return {
        rumusan: ['Apa yang dimaksud dengan ' + c.title + '?', 'Faktor apa saja yang memengaruhi ' + c.title + '?', 'Bagaimana upaya yang dapat dilakukan terkait ' + c.title + '?'],
        tujuan: ['Menjelaskan pengertian ' + c.title + '.', 'Mengidentifikasi faktor yang memengaruhi ' + c.title + '.', 'Menguraikan upaya yang dapat dilakukan terkait ' + c.title + '.'],
        subbab: DEMO_SUB.slice(0, c.N)
      };
    },
    bab1: function (c) { return { latar: demoPars(c.title, 3) }; },
    sub: function (c) { return { paragraf: demoPars(c.title, 3) }; },
    bab3: function (c) { return { kesimpulan: demoPars(c.title, 2), saran: demoPars(c.title, 1) }; },
    pustaka: function () { return { pustaka: ['[CONTOH] Penulis, A. (2020). Judul buku contoh. Penerbit Contoh.', '[CONTOH] Peneliti, B. (2022). Judul artikel contoh. Jurnal Contoh, 10(2), 1-15.'] }; },
    kata: function () { return { kata: [] }; },
    revisi: function (c) { return { subs: c.bab.subs.map(function (sb, k) { return { judul: sb.title, teks: sb.text + (k === 0 ? '\n\n[CONTOH REVISI] Sesuai arahan: ' + c.ins + '.' : '') }; }) }; },
    outlineSrc: function (c) {
      var hs = headingsOf(c.src);
      if (hs.length < 3) hs = DEMO_SUB.slice(0, 5);
      var intro = hs.filter(function (h) { return /latar|tujuan|manfaat/i.test(h); });
      var end = hs.filter(function (h) { return /penutup|kesimpulan/i.test(h); });
      var mid = hs.filter(function (h) { return intro.indexOf(h) < 0 && end.indexOf(h) < 0; });
      var bab = [];
      if (intro.length) bab.push({ judul: 'PENDAHULUAN', sub: intro });
      if (mid.length) bab.push({ judul: 'PEMBAHASAN', sub: mid.slice(0, 8) });
      bab.push({ judul: 'PENUTUP', sub: [] });
      return { judul: demoTitle(c), jenis: detectJenis(c.src), bab: bab };
    },
    babSrc: function (c) {
      var subs = (c.bab.sub.length ? c.bab.sub : ['']).map(function (j) {
        var b = j ? sectionBody(c.src, j) : sectionBody(c.src, 'penutup');
        var teks = '[CONTOH] Dari berkas: ' + firstWords(b || c.src, 70) + '.\n\n' + demoPars(c.title || 'topik', 1)[0];
        if (/pendanaan|anggaran|biaya|numerasi/i.test(j)) {
          teks += '\n\n| Komponen | Jumlah | Harga Satuan | Total Biaya |\n| [CONTOH] Bahan utama | 1 paket | Rp10.000 | Rp10.000 |\n| [CONTOH] Kemasan | 10 pcs | Rp1.000 | Rp10.000 |\n| TOTAL BIAYA | | | Rp20.000 |';
        }
        return { judul: j, teks: teks };
      });
      return { subs: subs };
    }
  };
  async function task(kind, ctx) {
    if (state.cancel) throw new Error('CANCEL');
    if (isDemo()) { await sleep(380); return DEMO[kind](ctx); }
    return askJson(P[kind](ctx));
  }

  /* ---------- susun bab dari mode judul ---------- */
  function numbered(a) { return a.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'); }
  function titleChapters(o, latar, subs, kes, sar, jenis) {
    var T = LBL(), jl = String(jenis || 'Makalah').toLowerCase();
    var fix = function (s) { return state.settings.bahasa === 'en' ? s : s.replace(/makalah/g, jl); };
    return [
      { title: T.chapters[0], subs: [
        { title: T.latar, text: latar.join('\n\n') },
        { title: T.rumusan, text: fix(T.rumusanIntro) + '\n\n' + numbered(o.rumusan) },
        { title: T.tujuan, text: fix(T.tujuanIntro) + '\n\n' + numbered(o.tujuan) }
      ] },
      { title: T.chapters[1], subs: subs.map(function (s) { return { title: s.judul, text: s.paragraf.join('\n\n') }; }) },
      { title: T.chapters[2], subs: [
        { title: T.kesimpulan, text: kes.join('\n\n') },
        { title: T.saran, text: (sar.length ? sar : ['-']).join('\n\n') }
      ] }
    ];
  }
  function migrate(d) {
    if (!d) return null;
    if (d.chapters) return d;
    if (d.sec) {
      var s = d.sec;
      return {
        title: d.title, lang: d.lang, jenis: 'Makalah', demo: d.demo, created: d.created, kata: [],
        chapters: titleChapters({ rumusan: s.rumusan || [], tujuan: s.tujuan || [] }, s.latar || [], s.subbab || [], s.kesimpulan || [], s.saran || [], 'Makalah'),
        pustaka: s.pustaka || []
      };
    }
    return null;
  }
  /* ---------- riwayat dokumen ---------- */
  var MAXHIST = 20;
  state.hist = (function () { var h = loadJSON('mk.hist', []); return Array.isArray(h) ? h : []; })();
  state.curId = ''; state.rtab = 'pratinjau'; state.revScope = 'all'; state.revText = ''; state.revBusy = false; state.revErr = ''; state.revNote = ''; state.revUndo = null; state.delArm = '';
  function histSave() {
    for (;;) {
      var json = JSON.stringify(state.hist);
      mem['mk.hist'] = json;
      try { localStorage.setItem('mk.hist', json); return true; }
      catch (e) {
        var ok = true;
        try { localStorage.setItem('mk.t', '1'); localStorage.removeItem('mk.t'); } catch (e2) { ok = false; }
        if (!ok || state.hist.length <= 1) return false;
        state.hist.pop();
      }
    }
  }
  function histFind(id) { for (var i = 0; i < state.hist.length; i++) if (state.hist[i].id === id) return state.hist[i]; return null; }
  function histAdd(d, meta) {
    var e = {
      id: 'd' + Date.now().toString(36), created: Date.now(), updated: Date.now(), title: d.title, jenis: d.jenis, demo: !!d.demo,
      fromFile: d.fromFile || '', mode: meta.mode, inputTitle: meta.inputTitle || '', arahan: meta.arahan || '', srcName: meta.srcName || '', src: meta.src || '', draft: d
    };
    state.hist.unshift(e); state.hist = state.hist.slice(0, MAXHIST); state.curId = e.id; histSave();
    return e;
  }
  function saveDraft() {
    var e = histFind(state.curId);
    if (e && state.draft) { e.draft = state.draft; e.title = state.draft.title; e.jenis = state.draft.jenis; e.updated = Date.now(); histSave(); }
  }
  state.draft = null;
  (function () {
    var old = migrate(loadJSON('mk.draft2', null) || loadJSON('mk.draft', null));
    if (old && !state.hist.length) { histAdd(old, { mode: 'judul', inputTitle: old.title }); state.curId = ''; }
  })();

  /* ---------- alur pembuatan ---------- */
  function structText(chs) {
    return chs.map(function (c, i) {
      var subs = c.subs.map(function (s) { return s.title; }).filter(Boolean);
      return 'Bab ' + (i + 1) + ' ' + c.title + (subs.length ? ' (' + subs.join('; ') + ')' : '');
    }).join('. ');
  }
  function setStep(id, status, label) {
    state.run.steps.forEach(function (s) { if (s.id === id) { s.status = status; if (label) s.label = label; } });
    paintRun();
  }
  function setNote(t) { if (state.run) { state.run.note = t; paintRun(); } }

  async function generate() {
    var S = state.settings, title = clean(state.title);
    var useSrc = S.sumberMode === 'berkas' && !!state.source;
    if (title.length < 5 && !useSrc) return;
    if (title.length < 5) title = '';
    state.title = title; sSet('mk.title', title);
    var inputTitle = title;
    state.cancel = false; state.error = '';

    var needRead = useSrc && state.source.kind === 'pdf' && !state.source.text;
    var needPred = S.ukuranMode === 'auto' && !predValid();
    var defs = (needRead ? [['baca', 'Membaca berkas']] : []).concat(needPred ? [['size', 'Memprediksi ukuran']] : []);
    var wantPus = S.daftarPustaka && (!useSrc || /pustaka|referensi|daftar sumber/i.test((state.source && state.source.text) || '') || needRead);
    if (useSrc) defs = defs.concat([['outline', 'Menyusun struktur dokumen'], ['bab', 'Menulis isi bab'], ['kata', 'Menulis kata pengantar']], wantPus ? [['pustaka', 'Menyusun daftar pustaka']] : []);
    else defs = defs.concat([['outline', 'Menyusun kerangka'], ['bab1', 'Menulis Bab I'], ['bab2', 'Menulis Bab II'], ['bab3', 'Menulis Bab III'], ['kata', 'Menulis kata pengantar']], S.daftarPustaka ? [['pustaka', 'Menyusun daftar pustaka']] : []);
    state.run = { steps: defs.map(function (s) { return { id: s[0], label: s[1], status: 'wait' }; }), note: '' };
    paintRun();

    try {
      if (needRead) { setStep('baca', 'run'); await ensureSource(); setStep('baca', 'done'); }
      if (needPred) { setStep('size', 'run'); state.pred = await predictSize(); setStep('size', 'done'); }
      var sz = sizeNow(), total = Math.round(sz.h * wpp());
      var base = { title: title, src: useSrc ? state.source.text : '', arahan: useSrc ? clean(state.arahan) : '', lang: S.bahasa };
      var chapters, jenis, pus = [], kata = [];

      if (useSrc) {
        /* ---- mode berkas: struktur mengikuti sumber ---- */
        setStep('outline', 'run');
        var o = await task('outlineSrc', Object.assign({}, base));
        var babs = [];
        (Array.isArray(o.bab) ? o.bab : []).slice(0, 8).forEach(function (b) {
          var j = clean(b && (b.judul || b.title) || '').replace(/^bab\s+[ivx\d]+[\s.:\-]*/i, '');
          var sb = b && (b.sub || b.subs || b.subbab) || [];
          sb = (Array.isArray(sb) ? sb : []).map(function (s) { return clean(typeof s === 'string' ? s : (s && (s.judul || s.title)) || '').replace(/^\d+(\.\d+)*[.)]?\s+/, ''); }).filter(Boolean).slice(0, 6);
          if (j) babs.push({ judul: j, sub: sb });
        });
        if (!babs.length) throw new Error('Struktur dari AI tidak lengkap. Coba lagi.');
        if (!title) title = clean(o.judul) || ('Dokumen ' + state.source.name.replace(/\.[^.]+$/, ''));
        var aiJ = JSON_JENIS(o.jenis) || detectJenis(state.source.text);
        jenis = S.jenis === 'Otomatis' ? aiJ : S.jenis;
        base.title = title;
        setStep('outline', 'done');

        var nSub = 0; babs.forEach(function (b) { nSub += Math.max(1, b.sub.length); });
        var perSub = total / Math.max(1, nSub);
        var struct = babs.map(function (b, i) { return 'Bab ' + (i + 1) + ' ' + b.judul + (b.sub.length ? ' (' + b.sub.join('; ') + ')' : ''); }).join('. ');
        chapters = [];
        for (var i = 0; i < babs.length; i++) {
          setStep('bab', 'run', 'Menulis bab ' + (i + 1) + ' dari ' + babs.length);
          var b = babs[i];
          var r = await task('babSrc', Object.assign({}, base, { bab: b, i: i, nb: babs.length, struct: struct, words: Math.round(perSub * Math.max(1, b.sub.length)) }));
          var arr = Array.isArray(r.subs) ? r.subs : [];
          var titles = b.sub.length ? b.sub : [''];
          var subs = titles.map(function (jd, k) {
            var it = null;
            arr.forEach(function (x) { if (!it && x && clean(x.judul || '').toLowerCase() === jd.toLowerCase() && jd) it = x; });
            if (!it) it = arr[k];
            var text = cleanText(teksOf(it));
            if (!text) throw new Error('Bab "' + b.judul + '" kosong dari AI. Coba lagi.');
            return { title: jd, text: text };
          });
          chapters.push({ title: b.judul, subs: subs });
        }
        setStep('bab', 'done', 'Menulis isi bab');
        var sctx = Object.assign({}, base, { src: '' });
        setStep('kata', 'run');
        var kr = await task('kata', Object.assign({}, sctx, kataCtx(title, jenis, struct)));
        kata = strs(kr.kata);
        setStep('kata', 'done');
        if (wantPus) { setStep('pustaka', 'run'); var pr = await task('pustaka', sctx); pus = strs(pr.pustaka); setStep('pustaka', 'done'); }
      } else {
        /* ---- mode judul: kerangka tetap Bab I sampai III ---- */
        var N = sz.s;
        var ctx = Object.assign({}, base, { N: N, w: { latar: Math.round(total * 0.15), sub: Math.round(total * 0.70 / N), tutup: Math.round(total * 0.08) } });
        setStep('outline', 'run');
        var oo = await task('outline', ctx);
        var outline = {
          rumusan: strs(oo.rumusan).map(stripNum).slice(0, 5),
          tujuan: strs(oo.tujuan).map(stripNum).slice(0, 5),
          subbab: strs(oo.subbab).slice(0, N)
        };
        if (!outline.rumusan.length || !outline.tujuan.length) throw new Error('Kerangka dari AI tidak lengkap. Coba lagi.');
        while (outline.subbab.length < N) outline.subbab.push(DEMO_SUB[outline.subbab.length] || 'Pembahasan ' + (outline.subbab.length + 1));
        ctx.o = outline;
        setStep('outline', 'done');

        setStep('bab1', 'run');
        var latar = strs((await task('bab1', ctx)).latar);
        if (!latar.length) throw new Error('Latar belakang kosong dari AI. Coba lagi.');
        setStep('bab1', 'done');

        var subs2 = [];
        for (var q = 0; q < N; q++) {
          setStep('bab2', 'run', 'Menulis Bab II (' + (q + 1) + ' dari ' + N + ')');
          var pars = strs((await task('sub', Object.assign({}, ctx, { i: q, judul: outline.subbab[q] }))).paragraf);
          if (!pars.length) throw new Error('Subbab "' + outline.subbab[q] + '" kosong dari AI. Coba lagi.');
          subs2.push({ judul: outline.subbab[q], paragraf: pars });
        }
        setStep('bab2', 'done', 'Menulis Bab II');

        setStep('bab3', 'run');
        var b3 = await task('bab3', ctx);
        var kes = strs(b3.kesimpulan), sar = strs(b3.saran);
        if (!kes.length) throw new Error('Kesimpulan kosong dari AI. Coba lagi.');
        setStep('bab3', 'done');

        jenis = S.jenis === 'Otomatis' ? 'Makalah' : S.jenis;
        chapters = titleChapters(outline, latar, subs2, kes, sar, jenis);
        var sctx2 = Object.assign({}, base, { src: '' });
        setStep('kata', 'run');
        var kr2 = await task('kata', Object.assign({}, sctx2, kataCtx(title, jenis, structText(chapters))));
        kata = strs(kr2.kata);
        setStep('kata', 'done');
        if (S.daftarPustaka) { setStep('pustaka', 'run'); pus = strs((await task('pustaka', sctx2)).pustaka); setStep('pustaka', 'done'); }
      }

      state.draft = {
        title: title, lang: S.bahasa, jenis: jenis, demo: isDemo(), created: Date.now(), fromFile: useSrc ? state.source.name : '',
        kata: kata, chapters: chapters, pustaka: pus
      };
      histAdd(state.draft, { mode: useSrc ? 'berkas' : 'judul', inputTitle: inputTitle, arahan: useSrc ? clean(state.arahan) : '', srcName: useSrc ? state.source.name : '', src: useSrc ? state.source.text : '' });
      state.rtab = 'pratinjau'; state.revUndo = null; state.revText = ''; state.revErr = '';
      state.run = null; state.view = 'result'; state.savedAs = '';
      render();
    } catch (e) {
      state.run = null;
      if (e.message === 'CANCEL') toast('Dibatalkan.'); else state.error = e.message || 'Terjadi galat.';
      render();
    }
  }
  function JSON_JENIS(j) {
    var v = clean(j || '');
    for (var i = 0; i < JENIS_LIST.length; i++) if (JENIS_LIST[i].toLowerCase() === v.toLowerCase()) return JENIS_LIST[i];
    return '';
  }
  function kataCtx(title, jenis, struct) {
    var S = state.settings, t = function (k) { return String(S[k] || '').trim(); };
    return { title: title, jenis: jenis, struct: struct, grup: /^kel/.test(S.tipe), mk: S.tipe === 'umum' ? '' : t('mataKuliah'), dosen: S.tipe === 'umum' ? '' : t('dosen'), inst: t('instansi') };
  }

  /* ---------- ekspor ---------- */
  var dl = '';
  function defaultLogoURL() {
    if (dl) return dl;
    var c = document.createElement('canvas'); c.width = c.height = 300;
    var x = c.getContext('2d'), P = function (d) { return new Path2D(d); };
    x.scale(3, 3);
    var g = x.createLinearGradient(25, 14, 76, 86); g.addColorStop(0, '#1E8F7A'); g.addColorStop(1, '#0A574A');
    x.fillStyle = g; x.fill(P('M25 27Q25 14 38 14H56L76 34V73Q76 86 63 86H38Q25 86 25 73Z'));
    x.fillStyle = 'rgba(255,255,255,.3)'; x.fill(P('M56 14V27Q56 34 63 34H76Z'));
    var g2 = x.createLinearGradient(40, 27, 58, 76); g2.addColorStop(0, '#FFD166'); g2.addColorStop(1, '#F0A21F');
    x.fillStyle = g2; x.fill(P('M57 27L39 54H50L44 76L63 47H52Z'));
    dl = c.toDataURL('image/png');
    return dl;
  }
  function dataUrlBytes(url) {
    var bin = atob(url.split(',')[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function idBlock(S, t) {
    var grup = /^kel/.test(S.tipe), umum = S.tipe === 'umum';
    return {
      tipe: S.tipe, instansi: t('instansi'), fakultas: umum ? '' : t('fakultas'), mk: umum ? '' : t('mataKuliah'), dosen: umum ? '' : t('dosen'),
      penulis: grup ? '' : t('penulis'), nim: grup || umum ? '' : t('nim'), kelas: umum ? '' : t('kelas'),
      kelompok: grup ? t('kelompok') : '', anggota: grup ? toLines(S.anggota || '') : [],
      alamat: t('alamat'), kota: t('kota'), tahun: t('tahun')
    };
  }
  function modelFrom(d) {
    var S = state.settings, t = function (k) { return String(S[k] || '').trim(); };
    var logo = null;
    if (S.logoOn) {
      var url = S.logo || defaultLogoURL();
      logo = { bytes: dataUrlBytes(url), w: S.logo ? S.logoW : 300, h: S.logo ? S.logoH : 300 };
    }
    return {
      lang: d.lang, title: d.title, jenis: d.jenis || 'Makalah', subjudul: t('subjudul'),
      layout: { top: +S.marginTop, left: +S.marginLeft, bottom: +S.marginBottom, right: +S.marginRight, font: S.font, size: +S.fontSize, spacing: +S.spacing, justify: !!S.justify, indent: +S.indent, numbering: S.numbering },
      opts: { kata: !!S.kataPengantar, isi: !!S.daftarIsi, pustaka: !!S.daftarPustaka, nomor: !!S.nomorHalaman, ttd: !!S.ttd },
      id: idBlock(S, t), logo: logo, lampiran: state.lampiran.map(function (x) { return { bytes: dataUrlBytes(x.url), w: x.w, h: x.h, ext: 'jpg', caption: x.caption }; }), kata: d.kata || [], chapters: d.chapters, pustaka: d.pustaka || []
    };
  }
  function saveDocx() {
    var d = state.draft; if (!d) return;
    var bytes;
    try { bytes = Docx.build(modelFrom(d)); } catch (e) { toast('Gagal menyusun file: ' + e.message); return; }
    var name = d.jenis + ' - ' + d.title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) + '.docx';
    var mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (NATIVE) {
      var where = '';
      try { where = NATIVE.saveFile(name, mime, B64(bytes)); } catch (e) { where = ''; }
      if (where) { state.savedAs = where; paintActions(); toast('Tersimpan di ' + where); }
      else toast('Gagal menyimpan file. Periksa ruang penyimpanan.');
      return;
    }
    var kb = Math.max(1, Math.round(bytes.length / 1024));
    if (SIM) { toast('Pratinjau: file .docx berhasil dibuat (' + kb + ' KB). Di aplikasi Android, file masuk ke folder Download/Makalah.'); return; }
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      toast('File diunduh (' + kb + ' KB).');
    } catch (e) { toast('Browser menolak unduhan.'); }
  }

  /* ---------- tampilan ---------- */
  var view = $('#view'), actions = $('#actions');
  var ICON_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

  function opt(list, cur) {
    return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function sel(label, key, list) { return '<label class="f">' + label + '<select data-s="' + key + '">' + opt(list, state.settings[key]) + '</select></label>'; }
  function inp(label, key, type, ph, extra) {
    return '<label class="f">' + label + '<input type="' + type + '" data-s="' + key + '" value="' + esc(state.settings[key]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' ' + (extra || '') + ' autocomplete="off"></label>';
  }
  function chk(label, key) { return '<label class="check"><span>' + label + '</span><input type="checkbox" data-s="' + key + '"' + (state.settings[key] ? ' checked' : '') + '></label>'; }
  var HAL = [], SUB = [];
  for (var hi = 3; hi <= 40; hi++) HAL.push([hi, hi + ' halaman']);
  for (var si = 2; si <= 8; si++) SUB.push([si, si + ' subbab']);
  var BHS = [['id', 'Indonesia'], ['en', 'English']];
  var JENIS = [['Otomatis', 'Otomatis (ikuti berkas)'], ['Makalah', 'Makalah'], ['Proposal', 'Proposal'], ['Laporan', 'Laporan'], ['Karya Tulis', 'Karya tulis']];
  var NUMB = [['desimal', '1.1   1.2   1.3'], ['huruf', 'A.   B.   C.']];

  /* -- kartu sumber -- */
  function srcInfo(s) {
    var kb = Math.max(1, Math.round(s.size / 1024));
    if (s.kind === 'pdf' && !s.text) return kb + ' KB, ' + (isDemo() ? 'PDF hanya bisa dibaca saat AI aktif (isi API key)' : 'akan dibaca AI saat dokumen dibuat');
    return kb + ' KB, ' + words(s.text).toLocaleString('id-ID') + ' kata terbaca' + (s.cut ? ' (dipotong ke 40.000 karakter pertama)' : '');
  }
  function sumberHTML() {
    var BR = state.settings.sumberMode === 'berkas', s = state.source;
    var h = '<h2>Sumber isi</h2><div class="seg" role="group" aria-label="Sumber isi">' +
      '<button type="button" data-act="smode" data-v="judul" aria-pressed="' + !BR + '">Dari judul</button>' +
      '<button type="button" data-act="smode" data-v="berkas" aria-pressed="' + BR + '">Dari berkas data</button></div>';
    if (!BR) return h + '<p class="note">AI menulis seluruh isi dari judul yang Anda ketik.</p>';
    h += '<div class="pred">';
    if (state.srcBusy) h += '<p class="note" style="margin:0">Membaca berkas...</p>';
    else if (s) h += '<div class="filebox"><div><b class="fname">' + esc(s.name) + '</b><div class="note" style="margin:2px 0 0">' + esc(srcInfo(s)) + '</div></div><button class="btn small" type="button" data-act="srcdel">Hapus</button></div>';
    else {
      h += '<button class="btn" type="button" data-act="srcpick" style="width:100%">Pilih berkas data</button>' +
        '<p class="note">PDF, DOCX, TXT, MD, atau CSV, maksimal 10 MB. Contoh: proposal, laporan, catatan, atau data penelitian.</p>';
    }
    if (state.srcErr) h += '<p class="errbox" style="margin:10px 0 0" role="alert">' + esc(state.srcErr) + '</p>';
    h += '</div><input type="file" id="srcfile" accept=".pdf,.docx,.txt,.md,.csv,application/pdf">' +
      '<label class="f" style="margin-top:14px">Arahan tambahan (boleh kosong)<textarea id="arahan" rows="2" placeholder="Contoh: fokuskan pada analisis keuangan, pakai bahasa sederhana">' + esc(state.arahan) + '</textarea></label>' +
      '<p class="note">Struktur bab mengikuti berkas. AI memakai semua data di berkas apa adanya (angka, nama, tanggal), lalu mengembangkannya dengan penjelasan dan analisis. AI tidak membuat angka baru.</p>';
    return h;
  }
  function paintSource() { var b = $('#srcbox'); if (b) b.innerHTML = sumberHTML(); }
  async function loadSource(file) {
    state.srcBusy = true; state.srcErr = ''; paintSource();
    try { state.source = await readSource(file); state.pred = null; }
    catch (e) { state.srcErr = e.message || 'Berkas tidak bisa dibaca.'; }
    state.srcBusy = false; paintSource(); paintRun(); paintSize();
  }

  /* -- kartu ukuran -- */
  function estNote() {
    var z = sizeNow();
    return 'Dipakai: ' + z.h + ' halaman isi' + (useSrcNow() ? ', subbab mengikuti berkas' : ' dan ' + z.s + ' subbab') + ', sekitar ' + Math.round(z.h * wpp()).toLocaleString('id-ID') + ' kata. Sampul, kata pengantar, dan daftar isi dihitung terpisah.';
  }
  function sizeWarn() {
    var S = state.settings, p = predValid();
    if (S.ukuranMode !== 'manual' || !p) return '';
    var m = [];
    if (S.halaman < p.hMin || S.halaman > p.hMax) m.push('halaman (rentang ' + p.hMin + ' sampai ' + p.hMax + ')');
    if (!useSrcNow() && (S.subbab < p.sMin || S.subbab > p.sMax)) m.push('subbab (rentang ' + p.sMin + ' sampai ' + p.sMax + ')');
    return m.length ? 'Di luar prediksi untuk ' + m.join(' dan ') + '. Tetap bisa dipakai.' : '';
  }
  function updSizeNote() { var a = $('#estnote'), b = $('#sizewarn'); if (a) a.textContent = estNote(); if (b) b.textContent = sizeWarn(); }
  function sizeHTML() {
    var S = state.settings, p = predValid(), auto = S.ukuranMode === 'auto', ok = canGen(), sr = useSrcNow();
    var h = '<h2>Ukuran dokumen</h2><div class="seg" role="group" aria-label="Cara menentukan ukuran">' +
      '<button type="button" data-act="mode" data-v="auto" aria-pressed="' + auto + '">Otomatis</button>' +
      '<button type="button" data-act="mode" data-v="manual" aria-pressed="' + !auto + '">Atur sendiri</button></div><div class="pred">';
    if (state.predBusy) h += '<p class="note" style="margin:0">Memprediksi...</p>';
    else if (p) {
      h += '<div class="rec"><div><span class="big">' + p.hRec + '</span>halaman</div>' + (sr ? '' : '<div><span class="big">' + p.sRec + '</span>subbab</div>') + '</div>' +
        '<p class="note">Rekomendasi. Rentang wajar: <b>' + p.hMin + ' sampai ' + p.hMax + '</b> halaman' + (sr ? '' : ', <b>' + p.sMin + ' sampai ' + p.sMax + '</b> subbab') + '.</p>' +
        (p.why ? '<p class="note">' + esc(p.why) + '</p>' : '') +
        '<p class="note"><span class="tag">' + (p.src === 'ai' ? 'prediksi AI' : 'perkiraan lokal') + '</span> ' + (p.src === 'ai' ? '' : 'Isi API key di Pengaturan agar AI yang memprediksi.') + '</p>' +
        '<button class="btn small" type="button" data-act="predict"' + (ok ? '' : ' disabled') + '>Prediksi ulang</button>';
    } else {
      h += '<p class="note" style="margin:0 0 10px">' + (ok ? 'Lihat rekomendasi ukuran. Jika dilewati, prediksi jalan otomatis saat dokumen dibuat.' : (S.sumberMode === 'berkas' ? 'Pilih berkas dulu, lalu aplikasi memprediksi ukuran yang cocok.' : 'Isi judul dulu, lalu aplikasi memprediksi ukuran yang cocok.')) + '</p>' +
        '<button class="btn small" type="button" data-act="predict"' + (ok ? '' : ' disabled') + '>Prediksi ukuran</button>';
    }
    h += '</div>';
    if (!auto) {
      h += '<div class="grid2" style="margin-top:14px">' + sel('Halaman isi', 'halaman', HAL) + (sr ? '' : sel('Subbab', 'subbab', SUB)) + '</div><p class="note warnnote" id="sizewarn">' + esc(sizeWarn()) + '</p>';
      if (p) h += '<p style="margin:8px 0 0"><button class="btn link" type="button" data-act="userec">Pakai rekomendasi (' + p.hRec + ' hal.' + (sr ? '' : ', ' + p.sRec + ' subbab') + ')</button></p>';
    }
    h += '<div style="margin-top:14px">' + sel('Bahasa', 'bahasa', BHS) + '</div><p class="note" id="estnote">' + esc(estNote()) + '</p>';
    return h;
  }
  function paintSize() { var b = $('#sizebox'); if (b) b.innerHTML = sizeHTML(); }

  /* -- lampiran gambar (opsional) -- */
  var MAXIMG = 20;
  function lampHTML() {
    var L = state.lampiran, h = '<h2>Lampiran gambar (opsional)</h2>';
    if (!L.length) h += '<p class="note" style="margin-top:0">Tambahkan foto atau gambar laporan, misalnya dokumentasi kegiatan, nota, atau grafik. Gambar dicetak di halaman LAMPIRAN setelah daftar pustaka. Lewati jika tidak perlu.</p>';
    L.forEach(function (x, i) {
      h += '<div class="lamp"><img src="' + x.url + '" alt="Lampiran ' + (i + 1) + '"><div class="lampf"><label class="f">Keterangan gambar ' + (i + 1) + '<input type="text" data-l="' + i + '" value="' + esc(x.caption) + '" placeholder="Contoh: Dokumentasi pembuatan produk" maxlength="120"></label>' +
        '<div class="btns"><button class="btn small" type="button" data-act="lampup" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Naikkan">Naik</button>' +
        '<button class="btn small" type="button" data-act="lampdn" data-i="' + i + '"' + (i === L.length - 1 ? ' disabled' : '') + ' aria-label="Turunkan">Turun</button>' +
        '<button class="btn small" type="button" data-act="lampdel" data-i="' + i + '">Hapus</button></div></div></div>';
    });
    if (state.lampBusy) h += '<p class="note">Memproses gambar...</p>';
    else if (L.length < MAXIMG) h += '<button class="btn small" type="button" data-act="lampadd" style="margin-top:' + (L.length ? 12 : 0) + 'px">' + (L.length ? 'Tambah gambar lagi' : 'Pilih gambar') + '</button>';
    if (state.lampErr) h += '<p class="errbox" style="margin:10px 0 0" role="alert">' + esc(state.lampErr) + '</p>';
    h += '<input type="file" id="lampfile" accept="image/*" multiple>';
    if (L.length) h += '<p class="note">' + L.length + ' gambar. Gambar dikecilkan otomatis agar file .docx tidak terlalu besar. Maksimal ' + MAXIMG + ' gambar.</p>';
    return h;
  }
  function paintLamp() { var b = $('#lampbox'); if (b) b.innerHTML = lampHTML(); if (state.view === 'result') paintSum(); }
  function shrinkImage(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('Gambar tidak bisa dibaca.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { rej(new Error('Berkas "' + file.name + '" bukan gambar yang bisa dibuka.')); };
        img.onload = function () {
          var m = 1200, k = Math.min(1, m / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
          res({ url: c.toDataURL('image/jpeg', 0.85), w: w, h: h, caption: '', name: file.name });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function addImages(files) {
    state.lampErr = ''; state.lampBusy = true; paintLamp();
    var bad = [];
    for (var i = 0; i < files.length; i++) {
      if (state.lampiran.length >= MAXIMG) { bad.push('Batas ' + MAXIMG + ' gambar tercapai.'); break; }
      try { state.lampiran.push(await shrinkImage(files[i])); } catch (e) { bad.push(e.message); }
    }
    state.lampErr = bad.join(' '); state.lampBusy = false; paintLamp();
  }

  function formHTML() {
    var S = state.settings, h = '<div class="stack">', BR = S.sumberMode === 'berkas';
    h += '<section class="card" id="srcbox">' + sumberHTML() + '</section>';
    h += '<section class="card"><h2>' + (BR ? 'Judul (boleh kosong)' : 'Judul') + '</h2><textarea id="judul" rows="' + (BR ? 2 : 3) + '" maxlength="200" placeholder="' + (BR ? 'Kosongkan agar AI membuatkan judul dari berkas' : 'Contoh: ' + esc(EXAMPLES[0])) + '" aria-label="Judul"' + (state.run ? ' disabled' : '') + '>' + esc(state.title) + '</textarea>' +
      (BR ? '' : '<div class="chips">' + EXAMPLES.map(function (t, i) { return '<button type="button" data-act="contoh" data-i="' + i + '"' + (state.run ? ' disabled' : '') + '>' + esc(t) + '</button>'; }).join('') + '</div>') + '</section>';
    h += '<section class="card" id="sizebox">' + sizeHTML() + '</section>';
    h += '<section class="card" id="lampbox">' + lampHTML() + '</section>';
    if (isDemo()) {
      h += '<div class="banner">' + (SIM
        ? 'Pratinjau: AI tidak aktif di sini. Di aplikasi Android, isi API key di Pengaturan agar isi ditulis AI. Sekarang hasilnya contoh kerangka.'
        : 'Belum ada API key, jadi hasilnya contoh kerangka dan bukan tulisan AI. Isi API key di Pengaturan.') +
        '<br><button class="btn small" type="button" data-act="goatur">Buka Pengaturan</button></div>';
    }
    if (state.error) h += '<div class="errbox" role="alert">' + esc(state.error) + '</div>';
    h += '<div id="runbox"></div></div>';
    return h;
  }
  function runHTML() {
    if (!state.run) {
      return '<button class="btn main" type="button" data-act="gen"' + (canGen() ? '' : ' disabled') + '>Buat dokumen</button>';
    }
    return '<section class="card"><h2>Sedang menyusun</h2><ul class="steps">' + state.run.steps.map(function (s) {
      return '<li class="' + (s.status === 'run' ? 'run' : s.status === 'done' ? 'done' : '') + '"><span class="dot">' + (s.status === 'done' ? ICON_CHECK : '') + '</span>' + esc(s.label) + '</li>';
    }).join('') + '</ul>' + (state.run.note ? '<p class="note">' + esc(state.run.note) + '</p>' : '') +
      '<p style="margin:14px 0 0"><button class="btn small" type="button" data-act="cancel">Batalkan</button></p></section>';
  }
  function paintRun() { var b = $('#runbox'); if (b) b.innerHTML = runHTML(); }

  /* -- hasil -- */
  function area(label, key, val, rows) {
    return '<label class="f">' + label + '<textarea data-r="' + key + '" rows="' + (rows || 7) + '">' + esc(val) + '</textarea></label>';
  }
  function resultHTML() {
    var d = state.draft, T = LBL(), pv = state.rtab !== 'edit';
    var h = '<div class="stack"><section class="card"><div class="row-between"><h2 style="margin:0">Hasil ' + esc(String(d.jenis).toLowerCase()) + '</h2><button class="btn link" type="button" data-act="baru">Buat baru</button></div>' +
      '<p class="doc-title" style="margin-top:8px">' + esc(d.title) + '</p><div class="sum" id="sum"></div>' +
      '<div class="seg" role="group" aria-label="Tampilan hasil" style="margin-top:16px"><button type="button" data-act="rtab" data-v="pratinjau" aria-pressed="' + pv + '">Pratinjau</button>' +
      '<button type="button" data-act="rtab" data-v="edit" aria-pressed="' + !pv + '">Edit teks</button></div></section>';
    if (d.fromFile) h += '<div class="banner">Isi dikembangkan dari berkas ' + esc(d.fromFile) + '. Periksa angka, nama, dan tanggal sebelum dikumpulkan.</div>';
    if (d.demo) h += '<div class="banner">Ini isi contoh, bukan tulisan AI. Isi ditandai [CONTOH]. Aktifkan AI di Pengaturan lalu buat ulang.</div>';
    if (pv) return h + previewHTML() + '<section class="card" id="revbox">' + revHTML() + '</section></div>';

    d.chapters.forEach(function (c, ci) {
      h += '<details' + (ci === 0 ? ' open' : '') + '><summary>' + esc(T.bab + ' ' + roman(ci + 1) + '. ' + c.title) + (c.subs.length > 1 ? ' <span class="tag">' + c.subs.length + ' subbab</span>' : '') + '</summary><div class="inner">' +
        '<label class="f">Judul bab<input type="text" data-r="ct:' + ci + '" value="' + esc(c.title) + '"></label>';
      c.subs.forEach(function (s, si) {
        h += '<label class="f">Subbab ' + (ci + 1) + '.' + (si + 1) + '<input type="text" data-r="st:' + ci + ':' + si + '" value="' + esc(s.title) + '"></label>' +
          '<textarea data-r="sx:' + ci + ':' + si + '" aria-label="Isi subbab ' + (ci + 1) + '.' + (si + 1) + '">' + esc(s.text) + '</textarea>';
      });
      h += '</div></details>';
    });
    h += '<details><summary>Kata pengantar</summary><div class="inner">' +
      '<p class="note" style="margin:0">Kosongkan untuk memakai kata pengantar bawaan.</p>' + area('Paragraf dipisah baris kosong', 'kata', (d.kata || []).join('\n\n'), 8) + '</div></details>';
    h += '<details><summary>Daftar pustaka <span class="tag">cek dulu</span></summary><div class="inner">' +
      '<p class="note" style="margin:0">AI bisa salah menyebut judul, penulis, atau tahun. Cari tiap sumber di Google Scholar atau perpustakaan sebelum dikumpulkan.</p>' +
      area('Satu sumber per baris', 'pustaka', (d.pustaka || []).join('\n'), 6) + '</div></details>';
    h += '<section class="card" id="lampbox">' + lampHTML() + '</section>';
    h += '<p class="note">Format isi subbab: baris kosong memisahkan paragraf. Awali baris dengan "- " untuk butir, "1. " untuk nomor, "| a | b |" untuk tabel (baris TOTAL otomatis tebal), dan "## " untuk anak subjudul.</p></div>';
    return h;
  }

  /* -- pratinjau -- */
  function cleanName(s) { return String(s).replace(/\s*[-–]\s*(ketua|\d+).*$/i, '').replace(/\s*\(\d+\)\s*(–.*)?$/, '').replace(/\s*[-–]\s*\d{3,}.*$/, '').trim(); }
  function pvBlocks(text) {
    var h = '';
    Docx.parseBlocks(text).forEach(function (b) {
      if (b.t === 'p') h += '<p>' + esc(b.text) + '</p>';
      else if (b.t === 'eq') h += '<div class="eq">' + b.lines.map(esc).join('<br>') + '</div>';
      else if (b.t === 'ul') h += '<ul>' + b.items.map(function (it) {
        var m1 = it.match(/^([^:]{2,46}):\s+(.*)$/);
        return '<li>' + (m1 ? '<b>' + esc(m1[1]) + ':</b> ' + esc(m1[2]) : esc(it)) + '</li>';
      }).join('') + '</ul>';
      else if (b.t === 'ol') h += '<ol>' + b.items.map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ol>';
      else if (b.t === 'h3') h += '<h4>' + esc(b.text) + '</h4>';
      else if (b.t === 'table') {
        h += '<div class="tw"><table><thead><tr>' + b.head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          b.rows.map(function (r) {
            var tot = /^total/i.test(r[0]);
            return '<tr' + (tot ? ' class="tot"' : '') + '>' + r.map(function (c, i) { return '<td' + (i > 0 && /^[Rp\d.,\s%/-]+$/.test(c) && c.trim() ? ' class="num"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
      }
    });
    return h;
  }
  function coverHTML(m, T) {
    var id = m.id, siswa = /siswa/.test(id.tipe || ''), grup = /^kel/.test(id.tipe || ''), h = '';
    var c = function (t, o) {
      o = o || {};
      h += '<div class="cv" style="font-size:' + (o.size || 12) / 12 + 'em;' + (o.bold ? 'font-weight:700;' : '') + (o.italic ? 'font-style:italic;' : '') + 'margin-top:' + (o.before || 0) / 12 + 'em;margin-bottom:' + (o.after || 0) / 12 + 'em">' + esc(t) + '</div>';
    };
    var jenis = String(m.jenis || '').trim(), title = String(m.title || '').trim(), parts = title.split(/\s*:\s+/);
    var needJenis = jenis && title.toLowerCase().indexOf(jenis.toLowerCase()) !== 0;
    if (parts.length > 1) { c(parts[0].toUpperCase(), { bold: 1, size: 14, before: 6 }); c(parts.slice(1).join(': ').toUpperCase(), { bold: 1, size: 17, after: 4 }); }
    else {
      if (needJenis) c(jenis.toUpperCase(), { bold: 1, size: 14, before: 6 });
      c(title.toUpperCase(), { bold: 1, size: needJenis ? 15 : 16, before: needJenis ? 0 : 6, after: 4 });
    }
    var sub = String(m.subjudul || '').trim();
    if (!sub && id.mk) sub = (siswa ? T.mp : T.mk) + ' ' + id.mk;
    if (sub) c(sub, { italic: 1, size: 12, after: 6 });
    if (m.logo) h += '<img class="cvlogo" src="' + logoSrc() + '" alt="Logo">';
    if (grup && (id.kelompok || (id.anggota || []).length || id.kelas)) {
      var kel = id.kelompok ? (/^kelompok/i.test(id.kelompok) ? id.kelompok : 'Kelompok ' + id.kelompok) : 'Kelompok';
      c(T.disusun + ' ' + kel + ':', { bold: 1, before: m.logo ? 0 : 10 });
      if (id.kelas) c(T.kelas + ' ' + id.kelas, { bold: 1 });
      (id.anggota || []).forEach(function (a) { c(a, { size: 11 }); });
    } else if (!grup && id.penulis) {
      c(T.disusun + ':', { bold: 1, before: m.logo ? 0 : 10 }); c(id.penulis, { bold: 1 });
      if (id.nim) c((siswa ? T.nisn : T.nim) + ' ' + id.nim, { size: 11 });
      if (id.kelas) c(T.kelas + ' ' + id.kelas, { size: 11 });
    }
    if (id.dosen) c((siswa ? T.guru : T.dosen) + ': ' + id.dosen, { size: 11, before: 4 });
    var foot = [];
    if (id.fakultas) foot.push([id.fakultas, { size: 12 }]);
    if (id.instansi) foot.push([String(id.instansi).toUpperCase(), { bold: 1, size: 14 }]);
    if (id.alamat) foot.push([id.alamat, { size: 12 }]);
    if (id.tahun) foot.push([id.tahun, { bold: 1, size: 12 }]);
    foot.forEach(function (f, i) { f[1].before = i === 0 ? 16 : 0; c(f[0], f[1]); });
    return h;
  }
  function previewHTML() {
    var d = state.draft, S = state.settings, m = modelFrom(d), T = LBL(), o;
    try { o = Docx.outline(m); } catch (e) { return '<div class="errbox">Pratinjau gagal dibuat: ' + esc(e.message) + '</div>'; }
    var k = 2.6, sty = 'font-family:' + S.font + ',serif;line-height:' + S.spacing + ';padding:' + (S.marginTop * k) + 'cqw ' + (S.marginRight * k) + 'cqw ' + (S.marginBottom * k) + 'cqw ' + (S.marginLeft * k) + 'cqw;' +
      (S.justify ? 'text-align:justify;' : '') + '--ind:' + (S.indent * k) + 'cqw;--pgap:' + (S.indent > 0 ? 0 : .5) + 'em';
    var sh = function (label, inner, cls) { return '<div class="plabel">' + esc(label) + '</div><div class="pgw"><div class="sheet ' + (cls || '') + '" style="' + sty + '">' + inner + '</div></div>'; };
    var h = '<section class="pvwrap"><h2>Pratinjau dokumen</h2><p class="note" style="margin:0 0 6px">Tampilan menyerupai file .docx. Pemisah halaman dan nomor halaman bisa sedikit berbeda saat dibuka di Word.</p>';
    h += sh('Sampul', coverHTML(m, T), 'cover');
    if (S.kataPengantar) {
      h += sh(T.kata.charAt(0) + T.kata.slice(1).toLowerCase(), '<h3 class="c">' + esc(T.kata) + '</h3>' + o.kata.map(function (t) { return '<p class="ind">' + esc(t) + '</p>'; }).join('') +
        '<p class="r" style="margin-top:1.2em">' + esc(o.sign) + '<br>' + esc(o.who) + '</p>');
    }
    if (S.daftarIsi) {
      h += sh('Daftar isi', '<h3 class="c">' + esc(T.isi) + '</h3><div class="toc">' + o.toc.map(function (e) {
        return '<div class="l' + e.lvl + '"><span>' + esc(e.text) + '</span><i></i><span>' + esc(e.page) + '</span></div>';
      }).join('') + '</div>');
    }
    d.chapters.forEach(function (c, ci) {
      var num = ci + 1, onlyOne = c.subs.length === 1, inner = '<h3 class="c">' + esc(T.bab + ' ' + roman(num)) + '<br>' + esc(String(c.title).toUpperCase()) + '</h3>';
      c.subs.forEach(function (sb, si) {
        var st = String(sb.title || '').trim(), noHead = !st || (onlyOne && st.toLowerCase() === String(c.title || '').trim().toLowerCase());
        if (!noHead) inner += '<h4 class="s">' + (S.numbering === 'huruf' ? String.fromCharCode(65 + si) + '. ' : num + '.' + (si + 1) + ' ') + esc(st) + '</h4>';
        inner += pvBlocks(sb.text);
      });
      if (S.ttd && ci === d.chapters.length - 1) {
        var grup = /^kel/.test(m.id.tipe || ''), siswa = /siswa/.test(m.id.tipe || '');
        var ketua = cleanName(grup ? ((m.id.anggota || [])[0] || '') : (m.id.penulis || ''));
        inner += '<div class="ttd"><div>' + esc(grup ? T.ketua : T.penulis) + ',<br><br><br>( ' + esc(ketua || '..................') + ' )</div>' +
          '<div>' + esc(T.mengetahui) + ',<br>' + esc(siswa ? T.guru : T.dosen) + '<br><br>( ' + esc(m.id.dosen || '..................') + ' )</div></div>';
      }
      h += sh(T.bab + ' ' + roman(num), inner);
    });
    var pus = (d.pustaka || []).filter(Boolean);
    if (S.daftarPustaka && pus.length) {
      h += sh(T.pustaka.charAt(0) + T.pustaka.slice(1).toLowerCase(), '<h3 class="c">' + esc(T.pustaka) + '</h3>' +
        pus.slice().sort(function (a, b) { return a.localeCompare(b, d.lang === 'en' ? 'en' : 'id'); }).map(function (r) { return '<p class="hang">' + esc(r) + '</p>'; }).join(''));
    }
    if (state.lampiran.length) {
      h += sh('Lampiran', '<h3 class="c">' + esc(T.lampiran) + '</h3>' + state.lampiran.map(function (x, i) {
        return '<figure><img src="' + x.url + '" alt="' + esc(T.gambar + ' ' + (i + 1)) + '"><figcaption>' + esc(T.gambar + ' ' + (i + 1) + (x.caption ? '. ' + x.caption : '')) + '</figcaption></figure>';
      }).join(''));
    }
    return h + '</section>';
  }

  /* -- revisi dengan AI -- */
  function revHTML() {
    var d = state.draft, T = LBL();
    var opts = [['all', 'Seluruh dokumen']].concat(d.chapters.map(function (c, i) { return [String(i), T.bab + ' ' + roman(i + 1) + ': ' + c.title]; }));
    var ok = clean(state.revText).length >= 5 && !state.revBusy;
    var h = '<h2>Revisi dengan AI</h2><p class="note" style="margin-top:0">Ada yang belum sesuai? Tulis perubahan yang diinginkan. AI hanya mengubah isi bab, dan fakta serta angka tetap dipertahankan. Hasil lama bisa dikembalikan.</p>' +
      '<div class="rows" style="margin-top:14px"><label class="f">Bagian yang direvisi<select id="revscope"' + (state.revBusy ? ' disabled' : '') + '>' + opt(opts, state.revScope) + '</select></label>' +
      '<label class="f">Arahan revisi<textarea id="revtext" rows="3" placeholder="Contoh: perpanjang pembahasan, pakai bahasa lebih sederhana, tambahkan contoh nyata"' + (state.revBusy ? ' disabled' : '') + '>' + esc(state.revText) + '</textarea></label></div>';
    if (isDemo()) h += '<p class="note">AI belum aktif, jadi revisi hanya menambahkan catatan contoh di bab.</p>';
    if (state.revBusy) h += '<p class="note"><b>' + esc(state.revNote || 'Merevisi...') + '</b></p><button class="btn small" type="button" data-act="revcancel">Batalkan</button>';
    else {
      h += '<div class="btns" style="margin-top:14px"><button class="btn small" type="button" data-act="revgo"' + (ok ? '' : ' disabled') + '>Revisi sekarang</button>' +
        (state.revUndo ? '<button class="btn small" type="button" data-act="revundo">Kembalikan sebelum revisi</button>' : '') + '</div>';
    }
    if (state.revErr) h += '<p class="errbox" style="margin:12px 0 0" role="alert">' + esc(state.revErr) + '</p>';
    return h;
  }
  function paintRev() { var b = $('#revbox'); if (b) b.innerHTML = revHTML(); }
  async function revise() {
    var d = state.draft, ins = clean(state.revText);
    if (ins.length < 5 || state.revBusy) return;
    state.revBusy = true; state.revErr = ''; state.cancel = false; paintRev();
    var idx = state.revScope === 'all' ? d.chapters.map(function (c, i) { return i; }) : [+state.revScope];
    var backup = JSON.stringify(d.chapters);
    try {
      for (var k = 0; k < idx.length; k++) {
        var c = d.chapters[idx[k]];
        if (!c) continue;
        state.revNote = 'Merevisi bab ' + (k + 1) + ' dari ' + idx.length; paintRev();
        var r = await task('revisi', { title: d.title, lang: d.lang, src: '', arahan: '', ins: ins, bab: c, i: idx[k] });
        var arr = Array.isArray(r.subs) ? r.subs : [];
        var next = c.subs.map(function (sb, j) { var t = cleanText(teksOf(arr[j])); return t ? t : sb.text; });
        if (next.every(function (t, j) { return t === c.subs[j].text; })) throw new Error('AI tidak mengubah isi bab. Coba arahan yang lebih jelas.');
        c.subs.forEach(function (sb, j) { sb.text = next[j]; });
      }
      state.revUndo = backup; saveDraft(); state.revText = '';
    } catch (e) {
      d.chapters = JSON.parse(backup);
      if (e.message === 'CANCEL') toast('Revisi dibatalkan.'); else state.revErr = e.message || 'Revisi gagal.';
    }
    state.revBusy = false; state.revNote = ''; render();
  }

  function paintSum() {
    var el = $('#sum'); if (!el || !state.draft) return;
    var est; try { est = Docx.estimate(modelFrom(state.draft)); } catch (e) { return; }
    el.innerHTML = '<span><b>' + est.words.toLocaleString('id-ID') + '</b> kata</span><span>sekitar <b>' + est.pages + '</b> halaman isi</span><span><b>' + state.draft.chapters.length + '</b> bab</span>';
  }
  function roman(n) { var m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], o = ''; m.forEach(function (p) { while (n >= p[0]) { o += p[1]; n -= p[0]; } }); return o; }

  /* -- riwayat -- */
  function docWords(d) { var n = 0; d.chapters.forEach(function (c) { c.subs.forEach(function (s) { n += words(s.text); }); }); return n; }
  function fmtDate(t) {
    try { return new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(t).toISOString().slice(0, 10); }
  }
  function histHTML() {
    var h = '<div class="stack">', L = state.hist;
    if (!L.length) {
      return h + '<section class="card"><h2>Riwayat dokumen</h2><p class="note" style="margin:0 0 16px">Belum ada dokumen. Setiap dokumen yang Anda buat tersimpan di sini, lalu bisa dibuka lagi untuk direvisi atau dibuat ulang.</p>' +
        '<button class="btn main" type="button" data-act="gobuat">Buat dokumen</button></section></div>';
    }
    h += '<p class="note" style="margin:0">' + L.length + ' dokumen tersimpan di perangkat ini. Maksimal ' + MAXHIST + ' dokumen terbaru.</p>';
    L.forEach(function (e) {
      var arm = state.delArm === e.id, redo = e.mode === 'judul' ? clean(e.inputTitle).length >= 5 : !!e.src;
      h += '<section class="card hist"><div class="doc-title" style="font-size:18px">' + esc(e.title) + '</div>' +
        '<div class="sum"><span>' + esc(e.jenis) + '</span><span>' + (e.fromFile ? 'dari berkas ' + esc(e.fromFile) : 'dari judul') + '</span><span><b>' + docWords(e.draft).toLocaleString('id-ID') + '</b> kata</span>' + (e.demo ? '<span class="tag">contoh</span>' : '') + '</div>' +
        '<div class="note" style="margin-top:4px">Diubah ' + esc(fmtDate(e.updated)) + '</div>' +
        '<div class="btns hbtns"><button class="btn small" type="button" data-act="hopen" data-id="' + e.id + '">Buka dan revisi</button>' +
        (redo ? '<button class="btn small" type="button" data-act="hredo" data-id="' + e.id + '">Buat ulang</button>' : '') +
        '<button class="btn small' + (arm ? ' danger' : '') + '" type="button" data-act="hdel" data-id="' + e.id + '">' + (arm ? 'Yakin hapus?' : 'Hapus') + '</button></div></section>';
    });
    return h + '</div>';
  }

  /* -- pengaturan -- */
  function previewSVG() {
    var S = state.settings, t = S.marginTop * 10, l = S.marginLeft * 10, b = S.marginBottom * 10, r = S.marginRight * 10;
    var w = Math.max(10, 210 - l - r), hh = Math.max(10, 297 - t - b), lines = '';
    for (var y = 0, i = 0; y + 3 <= hh && i < 40; y += 9, i++) {
      lines += '<rect class="ln" x="' + l + '" y="' + (t + y) + '" width="' + (i % 6 === 5 ? w * 0.6 : w) + '" height="3"/>';
    }
    return '<svg viewBox="0 0 210 297" role="img" aria-label="Pratinjau margin halaman"><rect class="pg" width="210" height="297"/>' + lines +
      '<rect class="area" x="' + l + '" y="' + t + '" width="' + w + '" height="' + hh + '"/></svg>';
  }
  function logoSrc() { return state.settings.logo || defaultLogoURL(); }
  var TIPE = [['mahasiswa', 'Mahasiswa'], ['siswa', 'Siswa'], ['kel_mahasiswa', 'Kelompok mahasiswa'], ['kel_siswa', 'Kelompok siswa'], ['umum', 'Umum / lainnya']];
  function identityHTML() {
    var S = state.settings, T = S.tipe, siswa = /siswa/.test(T), grup = /^kel/.test(T), umum = T === 'umum';
    var h = '<section class="card"><h2>Identitas sampul</h2><div class="rows">' + sel('Saya menulis sebagai', 'tipe', TIPE) +
      sel('Jenis dokumen', 'jenis', JENIS) +
      inp('Baris di bawah judul (boleh kosong)', 'subjudul', 'text', siswa ? 'Contoh: Modul Kokurikuler Numerasi, Kelas 11' : 'Contoh: Tugas mata kuliah semester 3');
    if (grup) {
      h += inp('Nama atau nomor kelompok', 'kelompok', 'text', 'Contoh: Kelompok 3') +
        '<label class="f">Anggota (satu per baris)<textarea data-s="anggota" rows="5" placeholder="' + (siswa ? 'Nama (nomor absen)' : 'Nama - NIM') + '">' + esc(S.anggota) + '</textarea></label>' +
        inp('Kelas', 'kelas', 'text', '');
    } else {
      h += inp('Nama penulis', 'penulis', 'text', 'Nama lengkap');
      if (!umum) h += '<div class="grid2">' + inp(siswa ? 'NISN' : 'NIM', 'nim', 'text', '', 'inputmode="numeric"') + inp('Kelas', 'kelas', 'text', '') + '</div>';
    }
    if (!umum) {
      h += inp(siswa ? 'Mata pelajaran' : 'Mata kuliah', 'mataKuliah', 'text', siswa ? 'Contoh: Bahasa Indonesia' : 'Contoh: Pendidikan Pancasila') +
        inp(siswa ? 'Guru pengampu' : 'Dosen pengampu', 'dosen', 'text', '') +
        inp(siswa ? 'Jurusan atau peminatan (jika ada)' : 'Program studi / fakultas', 'fakultas', 'text', '') +
        inp(siswa ? 'Sekolah' : 'Perguruan tinggi', 'instansi', 'text', siswa ? 'Contoh: SMA Negeri 1 Negara' : '');
    } else h += inp('Instansi atau organisasi', 'instansi', 'text', '');
    return h + inp('Alamat singkat (kabupaten atau kota)', 'alamat', 'text', 'Contoh: Kabupaten Jembrana, Bali') +
      '<div class="grid2">' + inp('Kota (untuk kata pengantar)', 'kota', 'text', '') + inp('Tahun atau tahun ajaran', 'tahun', 'text', '', 'placeholder="Tahun Ajaran 2026/2027"') + '</div></div>' +
      '<p class="note">Kolom yang kosong tidak dicetak di sampul. Isian untuk jenis lain tetap tersimpan.</p></section>';
  }
  function settingsHTML() {
    var S = state.settings;
    var h = '<div class="stack">';
    h += '<section class="card"><h2>Penulis AI</h2><div class="rows">' +
      '<label class="f keyrow">API key Gemini<input type="password" id="apikey" data-s="apiKey" value="' + esc(S.apiKey) + '" placeholder="Tempel API key di sini" autocomplete="off" spellcheck="false"><button class="chip" type="button" data-act="showkey">Lihat</button></label>' +
      inp('Model', 'model', 'text', 'gemini-2.5-flash', 'spellcheck="false" autocapitalize="off"') + '</div>' +
      '<p class="note">' + (SIM ? 'Di pratinjau ini AI tidak dijalankan. Di aplikasi Android, isi ditulis AI setelah key diisi. ' : '') +
      'Key hanya disimpan di perangkat ini. Jika nama model sudah tidak berlaku, ganti dengan model Gemini terbaru.</p>' +
      '<a class="btn small" id="getkey" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="margin-top:14px;text-decoration:none">Buat API key Gemini gratis</a>' +
      '<p class="note">Tombol membuka Google AI Studio di browser. Masuk dengan akun Google, buat key, salin, lalu tempel di kolom di atas.</p></section>';
    h += identityHTML();
    h += '<section class="card"><h2>Logo sampul</h2><div class="logo-row"><img id="logoimg" src="' + logoSrc() + '" alt="Logo sampul"><div class="rows">' +
      chk('Tampilkan logo', 'logoOn') + '<div class="btns"><button class="btn small" type="button" data-act="logopick">Ganti logo</button>' +
      '<button class="btn small" type="button" data-act="logodef">Logo bawaan</button></div></div></div><input type="file" id="logofile" accept="image/*"></section>';
    h += '<section class="card"><h2>Format halaman</h2><div class="margins">' +
      '<label class="f top">Atas (cm)<input type="number" inputmode="decimal" step="0.1" min="0" max="6" data-s="marginTop" value="' + S.marginTop + '"></label>' +
      '<label class="f left">Kiri (cm)<input type="number" inputmode="decimal" step="0.1" min="0" max="6" data-s="marginLeft" value="' + S.marginLeft + '"></label>' +
      '<div class="pv" id="pv">' + previewSVG() + '</div>' +
      '<label class="f right">Kanan (cm)<input type="number" inputmode="decimal" step="0.1" min="0" max="6" data-s="marginRight" value="' + S.marginRight + '"></label>' +
      '<label class="f bottom">Bawah (cm)<input type="number" inputmode="decimal" step="0.1" min="0" max="6" data-s="marginBottom" value="' + S.marginBottom + '"></label></div>' +
      '<div class="rows" style="margin-top:16px"><div class="grid2 wide1">' +
      sel('Huruf', 'font', [['Times New Roman', 'Times New Roman'], ['Arial', 'Arial'], ['Calibri', 'Calibri']]) +
      sel('Ukuran huruf', 'fontSize', [[11, '11 pt'], [12, '12 pt'], [13, '13 pt'], [14, '14 pt']]) + '</div><div class="grid2">' +
      sel('Spasi baris', 'spacing', [[1, '1'], [1.15, '1,15'], [1.5, '1,5'], [2, '2']]) +
      inp('Awal paragraf (cm)', 'indent', 'number', '', 'inputmode="decimal" step="0.05" min="0" max="3"') + '</div>' +
      sel('Penomoran subbab', 'numbering', NUMB) + chk('Rata kiri dan kanan', 'justify') + '</div>' +
      '<p class="note">Bawaan mengikuti contoh makalah Anda: kertas A4, margin 4-3-3-3 cm (kiri 4, lainnya 3), Times New Roman 12, spasi 1,5, paragraf rata tanpa menjorok (isi 0). Isi 1,25 untuk paragraf menjorok.</p></section>';
    h += '<section class="card"><h2>Bagian dokumen</h2>' + chk('Kata pengantar', 'kataPengantar') + chk('Daftar isi', 'daftarIsi') + chk('Daftar pustaka', 'daftarPustaka') +
      chk('Nomor halaman (romawi di depan, angka di isi)', 'nomorHalaman') + chk('Kolom tanda tangan di akhir', 'ttd') + '</section>';
    h += '<section class="card"><h2>Pembaruan aplikasi</h2><p class="note" style="margin-top:0">Versi terpasang: <b>' + esc(appVer() || '-') + '</b>. Aplikasi memeriksa versi terbaru di GitHub setiap dibuka. Jika ada, muncul pilihan Update atau Nanti.</p>' +
      '<button class="btn small" type="button" data-act="updcheck" style="margin-top:12px">Cek pembaruan</button><p class="note" id="updstat" role="status">' + esc(upd.stat) + '</p></section>';
    h += '<button class="btn danger" type="button" data-act="reset" id="resetbtn">Kembalikan semua ke bawaan</button>';
    h += '<p class="note" style="text-align:center">Makalah Kilat ' + esc(appVer() || '') + '</p></div>';
    return h;
  }

  function paintActions() {
    var on = state.tab === 'buat' && state.view === 'result' && state.draft;
    document.body.classList.toggle('has-actions', !!on);
    actions.hidden = !on;
    if (on) actions.innerHTML = '<button class="btn main" type="button" data-act="save">Simpan sebagai .docx</button>' +
      (state.savedAs && NATIVE ? '<button class="btn" type="button" data-act="open" style="flex:none">Buka</button>' : '');
  }
  function paintChip() {
    var on = !isDemo();
    $('#chip').classList.toggle('on', on);
    $('#chipText').textContent = on ? 'AI aktif' : 'Mode contoh';
  }
  function render() {
    document.querySelectorAll('nav button').forEach(function (b) {
      if (b.dataset.tab === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (state.tab === 'atur') view.innerHTML = settingsHTML();
    else if (state.tab === 'riwayat') view.innerHTML = histHTML();
    else if (state.view === 'result' && state.draft) { view.innerHTML = resultHTML(); paintSum(); }
    else { state.view = 'form'; view.innerHTML = formHTML(); paintRun(); }
    paintActions(); paintChip();
  }
  function go(tab) { state.tab = tab; render(); window.scrollTo(0, 0); }

  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ---------- peristiwa ---------- */
  var sumT, szT;
  view.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'arahan') { state.arahan = el.value; return; }
    if (el.id === 'revtext') { state.revText = el.value; var rb = view.querySelector('[data-act="revgo"]'); if (rb) rb.disabled = clean(el.value).length < 5; return; }
    if (el.id === 'revscope') { state.revScope = el.value; return; }
    if (el.dataset.l != null) { var li = state.lampiran[+el.dataset.l]; if (li) li.caption = clean(el.value); clearTimeout(sumT); sumT = setTimeout(function () { if (state.view === 'result') paintSum(); }, 400); return; }
    if (el.id === 'judul') {
      state.title = el.value; sSet('mk.title', el.value);
      var g = view.querySelector('[data-act="gen"]'); if (g) g.disabled = !canGen();
      clearTimeout(szT); szT = setTimeout(paintSize, 250);
      return;
    }
    if (el.dataset.s) {
      var k = el.dataset.s, def = DEFAULTS[k], v;
      if (el.type === 'checkbox') v = el.checked;
      else if (typeof def === 'number') {
        v = parseFloat(String(el.value).replace(',', '.')); if (isNaN(v)) return;
        if (CLAMP[k]) v = Math.min(CLAMP[k][1], Math.max(CLAMP[k][0], v));
      } else v = el.value;
      state.settings[k] = v; saveSettings();
      if (/^margin/.test(k)) { var pv = $('#pv'); if (pv) pv.innerHTML = previewSVG(); }
      if (k === 'apiKey') paintChip();
      if (k === 'halaman' || k === 'subbab') updSizeNote();
      if (k === 'tipe') render();
      return;
    }
    if (el.dataset.r && state.draft) {
      var d = state.draft, r = el.dataset.r, p = r.split(':');
      if (p[0] === 'ct') d.chapters[+p[1]].title = clean(el.value);
      else if (p[0] === 'st') d.chapters[+p[1]].subs[+p[2]].title = clean(el.value);
      else if (p[0] === 'sx') d.chapters[+p[1]].subs[+p[2]].text = el.value;
      else if (r === 'kata') d.kata = String(el.value).split(/\n\s*\n/).map(function (x) { return x.replace(/\s*\n\s*/g, ' ').trim(); }).filter(Boolean);
      else if (r === 'pustaka') d.pustaka = toLines(el.value);
      saveDraft(); clearTimeout(sumT); sumT = setTimeout(paintSum, 400);
    }
  });
  view.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'logofile' && el.files && el.files[0]) readLogo(el.files[0]);
    if (el.id === 'srcfile' && el.files && el.files[0]) loadSource(el.files[0]);
    if (el.id === 'lampfile' && el.files && el.files.length) { var fl = Array.prototype.slice.call(el.files); el.value = ''; addImages(fl); }
  });
  view.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
  actions.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
  document.querySelectorAll('nav button').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.tab); }); });
  $('#chip').addEventListener('click', function () { go('atur'); });

  var resetArmed = false;
  function act(a, el) {
    if (a === 'contoh') { state.title = EXAMPLES[+el.dataset.i]; sSet('mk.title', state.title); var j = $('#judul'); if (j) { j.value = state.title; j.focus(); } var g = view.querySelector('[data-act="gen"]'); if (g) g.disabled = false; paintSize(); }
    else if (a === 'gen') generate();
    else if (a === 'smode') { state.settings.sumberMode = el.dataset.v; saveSettings(); state.error = ''; render(); }
    else if (a === 'lampadd') $('#lampfile').click();
    else if (a === 'lampdel') { state.lampiran.splice(+el.dataset.i, 1); paintLamp(); }
    else if (a === 'lampup' || a === 'lampdn') { var i0 = +el.dataset.i, i1 = a === 'lampup' ? i0 - 1 : i0 + 1, L0 = state.lampiran; if (i1 >= 0 && i1 < L0.length) { var tmp = L0[i0]; L0[i0] = L0[i1]; L0[i1] = tmp; paintLamp(); } }
    else if (a === 'srcpick') $('#srcfile').click();
    else if (a === 'srcdel') { state.source = null; state.pred = null; state.srcErr = ''; paintSource(); paintRun(); paintSize(); }
    else if (a === 'mode') { state.settings.ukuranMode = el.dataset.v; saveSettings(); paintSize(); }
    else if (a === 'predict') doPredict();
    else if (a === 'userec') { var pr = predValid(); if (pr) { state.settings.halaman = pr.hRec; state.settings.subbab = pr.sRec; saveSettings(); paintSize(); } }
    else if (a === 'cancel') { state.cancel = true; el.disabled = true; el.textContent = 'Membatalkan'; }
    else if (a === 'rtab') { state.rtab = el.dataset.v; render(); window.scrollTo(0, 0); }
    else if (a === 'revgo') revise();
    else if (a === 'revcancel') { state.cancel = true; el.disabled = true; el.textContent = 'Membatalkan'; }
    else if (a === 'revundo') { if (state.revUndo) { state.draft.chapters = JSON.parse(state.revUndo); state.revUndo = null; saveDraft(); render(); toast('Isi dikembalikan ke sebelum revisi.'); } }
    else if (a === 'gobuat') go('buat');
    else if (a === 'hopen') {
      var he = histFind(el.dataset.id); if (!he) return;
      if (state.curId !== he.id) state.lampiran = [];
      state.draft = he.draft; state.curId = he.id; state.tab = 'buat'; state.view = 'result'; state.rtab = 'pratinjau';
      state.revUndo = null; state.revText = ''; state.revErr = ''; state.savedAs = ''; render(); window.scrollTo(0, 0);
    }
    else if (a === 'hredo') {
      var hr = histFind(el.dataset.id); if (!hr) return;
      state.settings.sumberMode = hr.mode; saveSettings();
      state.title = hr.inputTitle || ''; sSet('mk.title', state.title); state.arahan = hr.arahan || '';
      state.source = hr.mode === 'berkas' && hr.src ? { name: hr.srcName || 'berkas', size: hr.src.length, kind: 'text', text: hr.src, b64: '', cut: false } : null;
      state.pred = null; state.error = ''; state.tab = 'buat'; state.view = 'form'; render(); window.scrollTo(0, 0); generate();
    }
    else if (a === 'hdel') {
      var hid = el.dataset.id;
      if (state.delArm !== hid) { state.delArm = hid; render(); setTimeout(function () { if (state.delArm === hid) { state.delArm = ''; if (state.tab === 'riwayat') render(); } }, 3500); return; }
      state.delArm = ''; state.hist = state.hist.filter(function (x) { return x.id !== hid; });
      if (state.curId === hid) { state.curId = ''; state.draft = null; state.view = 'form'; }
      histSave(); render(); toast('Dokumen dihapus dari riwayat.');
    }
    else if (a === 'baru') { state.view = 'form'; state.error = ''; render(); window.scrollTo(0, 0); }
    else if (a === 'save') saveDocx();
    else if (a === 'open') { try { if (!NATIVE.openLast()) toast('Belum ada file untuk dibuka.'); } catch (e) { toast('Tidak ada aplikasi yang bisa membuka file .docx.'); } }
    else if (a === 'goatur') go('atur');
    else if (a === 'updcheck') checkUpdate(true);
    else if (a === 'showkey') { var k = $('#apikey'); var show = k.type === 'password'; k.type = show ? 'text' : 'password'; el.textContent = show ? 'Sembunyi' : 'Lihat'; }
    else if (a === 'logopick') $('#logofile').click();
    else if (a === 'logodef') { state.settings.logo = ''; state.settings.logoW = 300; state.settings.logoH = 300; saveSettings(); $('#logoimg').src = logoSrc(); }
    else if (a === 'reset') {
      if (!resetArmed) { resetArmed = true; el.textContent = 'Yakin? Ketuk sekali lagi'; setTimeout(function () { resetArmed = false; var r = $('#resetbtn'); if (r) r.textContent = 'Kembalikan semua ke bawaan'; }, 3500); return; }
      resetArmed = false;
      var key = state.settings.apiKey;
      state.settings = Object.assign({}, DEFAULTS, { apiKey: key });
      saveSettings(); render(); toast('Pengaturan dikembalikan ke bawaan. API key dipertahankan.');
    }
  }
  function readLogo(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var m = 400, s = Math.min(1, m / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        state.settings.logo = c.toDataURL('image/png'); state.settings.logoW = w; state.settings.logoH = h;
        state.settings.logoOn = true; saveSettings(); render();
      };
      img.onerror = function () { toast('Gambar tidak bisa dibaca.'); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ---------- pembaruan aplikasi (rilis GitHub) ---------- */
  var upd = { info: null, state: 'idle', stat: '', msg: '', timer: null };
  var updPending = {}, updSeq = 0;
  function appVer() { try { if (NATIVE) return String(NATIVE.appVersion() || ''); } catch (e) { /* abaikan */ } return SIM ? '1.0' : ''; }
  function verParts(v) { return String(v).replace(/^[^\d]*/, '').split(/[^\d]+/).filter(Boolean).map(Number); }
  function isNewer(a, b) {
    var x = verParts(a), y = verParts(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = x[i] || 0, q = y[i] || 0; if (p !== q) return p > q; }
    return false;
  }
  function mb(n) { return (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  window.__native.onUpd = function (id, b64) {
    var cb = updPending[id]; if (!cb) return; delete updPending[id];
    var r; try { r = JSON.parse(fromB64Text(b64)); } catch (e) { r = { ok: false, err: 'Jawaban GitHub tidak terbaca.' }; }
    cb(r);
  };
  window.__native.onDl = function (pct, done, total) {
    upd.pct = pct; upd.done = done; upd.total = total;
    var bar = $('#updbar'), txt = $('#updtxt');
    if (bar) { bar.style.width = Math.max(2, pct < 0 ? 5 : pct) + '%'; bar.parentNode.setAttribute('aria-valuenow', pct < 0 ? 0 : pct); }
    if (txt) txt.textContent = (pct >= 0 ? pct + '% ' : '') + (total > 0 ? '(' + mb(done) + ' dari ' + mb(total) + ')' : mb(done));
  };
  window.__native.onDlDone = function (status, b64) {
    var m = ''; try { m = fromB64Text(b64); } catch (e) { m = ''; }
    if (status === 'ok') upd.state = 'inst';
    else if (status === 'perm') upd.state = 'perm';
    else if (status === 'perm_no') { upd.state = 'err'; m = 'Izin pemasangan belum diaktifkan. Aktifkan lalu coba lagi.'; }
    else if (status === 'cancel') upd.state = 'ask';
    else { upd.state = 'err'; }
    upd.msg = m; paintUpd();
  };
  function checkUpdate(manual) {
    if (!NATIVE && !SIM) { if (manual) setUpdStat('Pembaruan hanya tersedia di aplikasi Android.'); return; }
    if (manual) setUpdStat('Memeriksa versi terbaru...');
    var handle = function (r) {
      if (!r.ok) { if (manual) setUpdStat(r.err || 'Gagal memeriksa pembaruan.'); return; }
      if (isNewer(r.tag, appVer())) { upd.info = r; upd.state = 'ask'; upd.msg = ''; setUpdStat(''); paintUpd(); }
      else if (manual) setUpdStat('Sudah versi terbaru (' + appVer() + ').');
    };
    if (!NATIVE) {
      setTimeout(function () {
        handle({ ok: true, tag: 'v1.1', url: 'sim', size: 4400000, notes: 'Tampilan baru bergaya soft surface.\nPratinjau dokumen dan revisi dengan AI.\nRiwayat dokumen.' });
      }, manual ? 700 : 1400);
      return;
    }
    var id = 'u' + (++updSeq), done = false;
    updPending[id] = function (r) { done = true; handle(r); };
    setTimeout(function () { if (!done) { delete updPending[id]; if (manual) setUpdStat('GitHub tidak menjawab. Coba lagi nanti.'); } }, 25000);
    try { NATIVE.checkUpdate(id); } catch (e) { if (manual) setUpdStat('Gagal memeriksa pembaruan.'); }
  }
  function setUpdStat(t) { upd.stat = t; var el = $('#updstat'); if (el) el.textContent = t; }
  function startDownload() {
    var i = upd.info; if (!i) return;
    upd.state = 'dl'; upd.pct = 0; upd.done = 0; upd.total = i.size || 0; upd.msg = ''; paintUpd();
    if (!NATIVE) {
      var p = 0; clearInterval(upd.timer);
      upd.timer = setInterval(function () {
        p += 7; if (p >= 100) { clearInterval(upd.timer); window.__native.onDl(100, upd.total, upd.total); setTimeout(function () { upd.state = 'inst'; upd.msg = 'Di pratinjau, pemasangan tidak dijalankan. Di aplikasi Android, layar pemasangan terbuka.'; paintUpd(); }, 400); return; }
        window.__native.onDl(p, Math.round(upd.total * p / 100), upd.total);
      }, 150);
      return;
    }
    try { NATIVE.downloadApk(i.url); } catch (e) { upd.state = 'err'; upd.msg = 'Unduhan tidak bisa dimulai.'; paintUpd(); }
  }
  function paintUpd() {
    var el = $('#upd'); if (!el) return;
    var s = upd.state, i = upd.info || {};
    if (s === 'idle') { el.hidden = true; el.innerHTML = ''; return; }
    var title, body = '', btns = '';
    var notes = String(i.notes || '').replace(/\r/g, '').trim().slice(0, 700);
    if (s === 'ask') {
      title = 'Pembaruan tersedia';
      body = '<p>Versi <b>' + esc(String(i.tag || '').replace(/^v/i, '')) + '</b> siap dipasang. Anda memakai versi <b>' + esc(appVer() || '-') + '</b>' + (i.size ? ' · ' + mb(i.size) : '') + '.</p>' +
        (notes ? '<div class="mnotes">' + esc(notes) + '</div>' : '');
      btns = '<button class="btn" type="button" data-act="updlater">Nanti</button><button class="btn main" type="button" data-act="updgo" style="width:auto;flex:1">Update</button>';
    } else if (s === 'dl') {
      title = 'Mengunduh pembaruan';
      body = '<div class="mbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="updbar" style="width:3%"></i></div><p id="updtxt" class="note" role="status">Memulai unduhan...</p>';
      btns = '<button class="btn" type="button" data-act="updcancel">Batal</button>';
    } else if (s === 'inst') {
      title = 'Memasang pembaruan';
      body = '<p>' + esc(upd.msg || 'Ikuti layar pemasangan Android. Aplikasi dibuka ulang setelah selesai.') + '</p>';
      btns = '<button class="btn" type="button" data-act="updclose">Tutup</button>';
    } else if (s === 'perm') {
      title = 'Izin pemasangan diperlukan';
      body = '<p>Di layar yang terbuka, aktifkan izin untuk Makalah Kilat memasang aplikasi, lalu kembali ke sini. Pemasangan lanjut otomatis.</p>';
      btns = '<button class="btn" type="button" data-act="updclose">Tutup</button>';
    } else {
      title = 'Pembaruan gagal';
      body = '<p class="errtxt">' + esc(upd.msg || 'Terjadi galat.') + '</p>';
      btns = '<button class="btn" type="button" data-act="updclose">Tutup</button><button class="btn main" type="button" data-act="updgo" style="width:auto;flex:1">Coba lagi</button>';
    }
    el.hidden = false;
    el.innerHTML = '<div class="mback"></div><div class="msheet" role="dialog" aria-modal="true" aria-labelledby="updt"><h2 id="updt">' + title + '</h2>' + body + '<div class="mbtns">' + btns + '</div></div>';
    var f = el.querySelector('.btn.main') || el.querySelector('.btn'); if (f) f.focus();
  }
  $('#upd').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act;
    if (a === 'updgo') startDownload();
    else if (a === 'updlater' || a === 'updclose') { upd.state = 'idle'; paintUpd(); }
    else if (a === 'updcancel') { if (NATIVE) { try { NATIVE.cancelDownload(); } catch (e2) { /* abaikan */ } } else { clearInterval(upd.timer); upd.state = 'ask'; paintUpd(); } }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (upd.state === 'ask' || upd.state === 'err')) { upd.state = 'idle'; paintUpd(); } });

  render();
  setTimeout(function () { checkUpdate(false); }, 900);
})();
