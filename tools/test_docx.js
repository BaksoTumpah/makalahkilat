// Uji ekspor dengan isi mirip makalah contoh (Blue Squash).
// Pakai: node tools/test_docx.js <logo.png|-> <keluaran.docx>
const fs = require('fs');
const path = require('path');
const Docx = require(path.join(__dirname, '../app/src/main/assets/docx.js'));

const chapters = [
  { title: 'Pendahuluan', subs: [
    { title: 'Latar Belakang', text:
`Kabupaten Jembrana memiliki iklim tropis yang panas dan lembap, sehingga minuman dingin selalu menjadi pilihan utama masyarakat, termasuk para pelajar. Di lingkungan sekolah, minuman yang dijual pada jam istirahat umumnya berupa minuman manis kemasan atau minuman sederhana dengan tampilan yang biasa saja.

Dari kondisi tersebut, terdapat peluang untuk menghadirkan minuman dingin dengan tampilan yang unik dan rasa yang segar. Kelompok kami memilih membuat minuman berwarna biru, dengan memadukan sirup blue curacao, soda Sprite, sirup strawberry, lemon, daun mint, dan biji selasih.` },
    { title: 'Tujuan', text:
`Tujuan kegiatan usaha ini adalah sebagai berikut.

1. Menghadirkan minuman Blue Squash yang segar, higienis, dan menarik sebagai alternatif minuman bagi warga sekolah.
2. Menerapkan numerasi dalam perencanaan usaha, meliputi perhitungan modal, rencana anggaran biaya, harga pokok produksi (HPP), penentuan harga jual, proyeksi laba, dan titik impas (BEP).
3. Melatih keterampilan berwirausaha, kerja sama tim, dan tanggung jawab dalam mengelola usaha kelompok.` },
    { title: 'Manfaat', text:
`- Bagi Kelompok (Siswa): melatih keterampilan berwirausaha, meningkatkan kemampuan berhitung finansial, serta melatih kerja sama dan pembagian tugas dalam tim.
- Bagi Konsumen (Warga Sekolah): mendapatkan pilihan minuman dingin yang segar dan unik dengan porsi besar dan tampilan menarik.
- Bagi Sekolah: mendukung terlaksananya kegiatan kokurikuler yang kreatif dan menumbuhkan budaya wirausaha di lingkungan sekolah.` }
  ] },
  { title: 'Gambaran Usaha dan Analisis', subs: [
    { title: 'Analisis Pasar', text:
`Target pasar utama kami adalah warga SMA Negeri 1 Negara, yaitu siswa, guru, dan staf sekolah. Siswa merupakan kelompok terbesar dengan daya beli terbatas, sehingga kami memilih produk yang terasa istimewa namun harganya masih wajar.` },
    { title: 'Analisis SWOT', text:
`- Strengths (Kekuatan): tampilan unik, rasa segar, bahan mudah diperoleh, proses pembuatan sederhana, serta pembagian kerja kelompok yang jelas (9 anggota).
- Weaknesses (Kelemahan): harga lebih tinggi daripada minuman kantin, soda cepat kehilangan gelembung, serta kelompok masih pemula.
- Opportunities (Peluang): tingginya minat remaja terhadap minuman bertampilan menarik dan cuaca Jembrana yang panas.
- Threats (Ancaman): kenaikan harga sirup, soda, dan lemon, serta persaingan menu minuman dengan kelompok lain.` }
  ] },
  { title: 'Pendanaan dan Analisis Numerasi', subs: [
    { title: 'Modal Awal Kelompok', text:
`Modal Awal = Nominal Iuran per Anggota × Jumlah Anggota
= Rp20.000 × 9 orang = Rp180.000` },
    { title: 'Rencana Anggaran Biaya (RAB)', text:
`Rencana produksi adalah 25 cup Blue Squash ukuran 16 oz, sesuai isi satu pak cup dan sedotan (25 pcs).

## Biaya Bahan Baku dan Bumbu (Variable Cost)

| Nama Bahan Baku | Takaran / Qty | Harga Satuan | Total Biaya |
| Sirup blue curacao | 1 botol (640 ml) | Rp45.000 / botol | Rp45.000 |
| Sirup Marjan Strawberry | 1 botol | Rp25.000 / botol | Rp25.000 |
| Sprite 1 liter | 1 botol | Rp14.000 / botol | Rp14.000 |
| Lemon | 4 buah | Rp2.500 / buah | Rp10.000 |
| TOTAL BIAYA BAHAN BAKU | | | Rp106.000 |

## Total Biaya Produksi (TC)

TC = Biaya Bahan Baku + Biaya Kemasan + Biaya Operasional
TC = Rp106.000 + Rp33.000 + Rp12.000 = Rp151.000` },
    { title: 'Analisis Titik Impas (BEP)', text:
`BEP (Porsi) = Total Biaya Operasional / (Harga Jual per Porsi − Biaya Variabel per Porsi)
= Rp12.000 / (Rp8.000 − Rp5.560) = Rp12.000 / Rp2.440 = 4,9 ≈ 5 porsi` }
  ] },
  { title: 'Penutup', subs: [
    { title: 'Penutup', text:
`Demikian proposal usaha kuliner Blue Squash ini kami susun. Kelompok kami telah menyiapkan modal, rencana anggaran, pembagian tugas, dan perhitungan numerasi secara matang sehingga siap menjalankan usaha ini dengan baik.` }
  ] }
];

const logoPath = process.argv[2];
const model = {
  lang: 'id', title: 'Proposal Usaha Kuliner: Blue Squash', jenis: 'Proposal',
  subjudul: 'Modul Kokurikuler Numerasi — Kelas 11',
  layout: { top: 3, left: 4, bottom: 3, right: 3, font: 'Times New Roman', size: 12, spacing: 1.5, justify: true, indent: 0, numbering: 'desimal' },
  opts: { kata: true, isi: true, pustaka: false, nomor: true, ttd: true },
  id: {
    tipe: 'kel_siswa', instansi: 'SMA Negeri 1 Negara', alamat: 'Kabupaten Jembrana, Bali', tahun: 'Tahun Ajaran 2026/2027', kota: 'Negara',
    dosen: '', mk: '', kelompok: '', kelas: 'XI.A2',
    anggota: ['Anak Agung Putri Cintya Dewi (01) – Ketua', 'Dinike Frissayla (02)', 'I Kadek Dwi Hendra Jaya (11)', 'Ni Gusti Ayu Putu Aura Puspita Dewi (19)', 'Taufan Fadila Hariono (36)']
  },
  logo: logoPath && logoPath !== '-' ? { bytes: new Uint8Array(fs.readFileSync(logoPath)), w: 120, h: 120 } : null,
  kata: null, chapters, pustaka: []
};
console.log(JSON.stringify(Docx.estimate(model)));
fs.writeFileSync(process.argv[3] || 'out.docx', Docx.build(model));
