// Kirim versi baru Makalah Kilat ke situs ApkSwift (Firestore proyek apkswift-4ea9e) secara otomatis.
// Dipanggil workflow setelah GitHub Release terbit. Situs ApkSwift membangun ulang dirinya tiap 15 menit dari data ini.
// Env: APKSWIFT_USER, APKSWIFT_PASS (akun developer ApkSwift), APK_FILE, APK_URL, VERSION, NOTES
import { statSync, readFileSync, existsSync } from "node:fs";

const API_KEY = "AIzaSyAkIQW8CF8CbtGU04XWYCatJDCjvn6oZDI";   // kunci web publik ApkSwift (sama dengan yang ada di halamannya)
const PROJECT = "apkswift-4ea9e", DEV_EMAIL = "dev@toko-apk.local", REFERER = "https://apkswift.web.app/";
const PKG = "com.makalahkilat.app", ID = PKG;
const ICON = "data:image/webp;base64,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";
const { APKSWIFT_USER, APKSWIFT_PASS, APK_FILE, APK_URL, VERSION, NOTES } = process.env;

if (!APKSWIFT_USER || !APKSWIFT_PASS) { console.log("Secret APKSWIFT_USER / APKSWIFT_PASS belum diisi, kirim ke ApkSwift dilewati."); process.exit(0); }

const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
const J = (r) => r.json().catch(() => ({}));

// 1) masuk sebagai developer (format sandi sama seperti halaman developer: "pengguna|sandi")
let r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + API_KEY, {
  method: "POST", headers: { "content-type": "application/json", referer: REFERER },
  body: JSON.stringify({ email: DEV_EMAIL, password: APKSWIFT_USER.trim() + "|" + APKSWIFT_PASS, returnSecureToken: true }),
});
let j = await J(r);
if (!r.ok) { console.error("Login ApkSwift gagal:", (j.error && j.error.message) || r.status); process.exit(1); }
const H = { authorization: "Bearer " + j.idToken, "content-type": "application/json", referer: REFERER };

// 2) baca dokumen aplikasi (kalau sudah ada)
const base = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/apps/" + encodeURIComponent(ID);
const dec = (v) => v == null ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue
  : "booleanValue" in v ? v.booleanValue : "arrayValue" in v ? (v.arrayValue.values || []).map(dec) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)])) : null;
const enc = (v) => typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(Math.round(v)) } : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };

r = await fetch(base, { headers: H });
let cur = null;
if (r.ok) { const d = await r.json(); cur = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])); }
else if (r.status !== 404) { console.error("Gagal membaca ApkSwift:", r.status); process.exit(1); }

// 3) tambah / ganti versi ini di urutan paling atas
const size = fmtSize(statSync(APK_FILE).size);
const date = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" });
// catatan versi: ambil bagian "## <versi>" dari CHANGELOG.md; bila tidak ada, pakai NOTES (judul commit)
let log = (NOTES || "").trim();
if (existsSync("CHANGELOG.md")) {
  const m = readFileSync("CHANGELOG.md", "utf8").split(/^## +/m).find((b) => b.split("\n")[0].trim() === VERSION);
  if (m) log = m.split("\n").slice(1).join("\n").trim() || log;
}
const entry = { v: VERSION, url: APK_URL, size, log: log.slice(0, 1500), date };
const doc = {
  name: (cur && cur.name) || "Makalah Kilat", pkg: PKG,
  cat: (cur && cur.cat) || "Pendidikan",
  desc: (cur && cur.desc) || "Pembuat makalah dan proposal otomatis dengan AI: dari judul atau berkas data jadi dokumen Word, lengkap dengan pratinjau, revisi, lampiran gambar, dan riwayat.",
  icon: (cur && cur.icon) || ICON,
  versions: [entry].concat(((cur && cur.versions) || []).filter((x) => x.v !== VERSION)).slice(0, 200),
  updated: Date.now(),
};
const fields = Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, enc(v)]));
r = await fetch(base, { method: "PATCH", headers: H, body: JSON.stringify({ fields }) });
if (!r.ok) { console.error("Gagal menulis ke ApkSwift:", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
console.log("ApkSwift diperbarui: Makalah Kilat " + VERSION + " (" + size + "). Situs tampil dalam maks. 15 menit.");
