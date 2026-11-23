package com.makalahkilat.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.content.res.Configuration;
import android.graphics.Color;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Cangkang WebView. Isi aplikasi ada di assets/. */
public class MainActivity extends Activity {

    private static final String HOST = "generativelanguage.googleapis.com";
    private WebView web;
    private Uri lastSaved;
    private ValueCallback<Uri[]> filePathCb;
    private static final int REQ_FILE = 7;
    private static final int REQ_INSTALL = 8;
    private static final String REPO = "BaksoTumpah/makalahkilat";
    private volatile boolean dlBusy = false;
    private volatile boolean dlCancel = false;
    private File pendingApk;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        applyBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme()) || "appassets".equals(u.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (filePathCb != null) filePathCb.onReceiveValue(null);
                filePathCb = cb;
                try {
                    startActivityForResult(p.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePathCb = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.loadUrl("file:///android_asset/index.html");
    }

    /** Warna bilah sistem mengikuti tema terang atau gelap. */
    private void applyBars() {
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        int bg = dark ? Color.parseColor("#1B2423") : Color.parseColor("#E4EAE8");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(dark ? Color.parseColor("#1B2423") : Color.parseColor("#E4EAE8"));
        int flags = 0;
        if (!dark && Build.VERSION.SDK_INT >= 23) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (!dark && Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        applyBars();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_INSTALL) {
            if (pendingApk != null) {
                if (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls()) startInstall();
                else dlDone("perm_no", "");
            }
            return;
        }
        if (req == REQ_FILE && filePathCb != null) {
            filePathCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            filePathCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        finish();
    }

    private void toJs(final String id, final int status, final byte[] body) {
        final String b64 = Base64.encodeToString(body, Base64.NO_WRAP);
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__native.onAi('" + id + "'," + status + ",'" + b64 + "')", null);
            }
        });
    }

    private void jsFn(final String call) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(call, null);
            }
        });
    }

    private static String b64(String s) {
        try {
            return Base64.encodeToString(s.getBytes("UTF-8"), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return new String(bo.toByteArray(), "UTF-8");
    }

    /** Status unduhan ke JavaScript: ok, perm, perm_no, err, cancel. */
    private void dlDone(String status, String msg) {
        jsFn("window.__native.onDlDone('" + status + "','" + b64(msg) + "')");
    }

    /** Buka pemasang Android untuk APK yang sudah diunduh. Dipanggil di thread utama. */
    private void startInstall() {
        if (pendingApk == null || !pendingApk.exists()) {
            dlDone("err", "Berkas pembaruan hilang. Coba unduh lagi.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            dlDone("perm", "");
            try {
                startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())), REQ_INSTALL);
            } catch (Exception e) {
                dlDone("err", "Tidak bisa membuka pengaturan izin pemasangan.");
            }
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", pendingApk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            dlDone("ok", "");
        } catch (Exception e) {
            dlDone("err", "Tidak bisa membuka pemasang Android.");
        }
    }

    /** Fungsi yang bisa dipanggil dari JavaScript. */
    private class Bridge {

        /** Kirim permintaan ke Gemini. Hanya host Google yang diizinkan. */
        @JavascriptInterface
        public void aiRequest(final String id, final String url, final String key, final String body) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    HttpURLConnection c = null;
                    try {
                        URL u = new URL(url);
                        if (!"https".equals(u.getProtocol()) || !HOST.equals(u.getHost())) {
                            toJs(id, 0, "Host tidak diizinkan".getBytes("UTF-8"));
                            return;
                        }
                        c = (HttpURLConnection) u.openConnection();
                        c.setRequestMethod("POST");
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(120000);
                        c.setDoOutput(true);
                        c.setRequestProperty("Content-Type", "application/json");
                        c.setRequestProperty("x-goog-api-key", key);
                        OutputStream o = c.getOutputStream();
                        o.write(body.getBytes("UTF-8"));
                        o.close();
                        int code = c.getResponseCode();
                        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        if (in != null) {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                            in.close();
                        }
                        toJs(id, code, bo.toByteArray());
                    } catch (Exception e) {
                        try {
                            toJs(id, 0, String.valueOf(e.getMessage()).getBytes("UTF-8"));
                        } catch (Exception ignored) { }
                    } finally {
                        if (c != null) c.disconnect();
                    }
                }
            }).start();
        }

        /** Simpan file ke Download/Makalah. Mengembalikan lokasi, atau string kosong bila gagal. */
        @JavascriptInterface
        public String saveFile(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Makalah");
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return "";
                    OutputStream o = cr.openOutputStream(uri);
                    if (o == null) return "";
                    o.write(data);
                    o.close();
                    lastSaved = uri;
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS), "Makalah");
                    if (!dir.exists() && !dir.mkdirs()) return "";
                    File f = new File(dir, name);
                    FileOutputStream o = new FileOutputStream(f);
                    o.write(data);
                    o.close();
                    lastSaved = Uri.fromFile(f);
                }
                return "Download/Makalah";
            } catch (Exception e) {
                return "";
            }
        }

        /** Buka file terakhir yang disimpan. */
        @JavascriptInterface
        public boolean openLast() {
            if (lastSaved == null) return false;
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(lastSaved,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(i, "Buka makalah").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        }

        /** Nama versi aplikasi yang terpasang. */
        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        /** Cek rilis terbaru di GitHub. Hasil JSON (base64) dikirim ke window.__native.onUpd(id, ...). */
        @JavascriptInterface
        public void checkUpdate(final String id) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    HttpURLConnection c = null;
                    JSONObject out = new JSONObject();
                    try {
                        URL u = new URL("https://api.github.com/repos/" + REPO + "/releases/latest");
                        c = (HttpURLConnection) u.openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(15000);
                        c.setRequestProperty("Accept", "application/vnd.github+json");
                        c.setRequestProperty("User-Agent", "MakalahKilat");
                        int code = c.getResponseCode();
                        if (code == 404) {
                            out.put("ok", false);
                            out.put("err", "Belum ada rilis di GitHub.");
                        } else if (code != 200) {
                            out.put("ok", false);
                            out.put("err", "GitHub membalas galat " + code + ".");
                        } else {
                            JSONObject j = new JSONObject(readAll(c.getInputStream()));
                            JSONArray as = j.optJSONArray("assets");
                            String url = "";
                            String name = "";
                            long size = 0;
                            if (as != null) {
                                for (int k = 0; k < as.length(); k++) {
                                    JSONObject a = as.getJSONObject(k);
                                    String n = a.optString("name", "");
                                    if (n.toLowerCase().endsWith(".apk")) {
                                        name = n;
                                        url = a.optString("browser_download_url", "");
                                        size = a.optLong("size", 0);
                                        break;
                                    }
                                }
                            }
                            out.put("ok", url.length() > 0);
                            if (url.length() == 0) out.put("err", "Rilis terbaru tidak memiliki berkas APK.");
                            out.put("tag", j.optString("tag_name", ""));
                            out.put("notes", j.optString("body", ""));
                            out.put("url", url);
                            out.put("name", name);
                            out.put("size", size);
                        }
                    } catch (Exception e) {
                        out = new JSONObject();
                        try {
                            out.put("ok", false);
                            out.put("err", "Tidak bisa terhubung ke GitHub.");
                        } catch (Exception ignored) { }
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    jsFn("window.__native.onUpd('" + id + "','" + b64(out.toString()) + "')");
                }
            }).start();
        }

        /** Unduh APK rilis (hanya dari repo ini), lalu buka pemasang. Progres ke window.__native.onDl. */
        @JavascriptInterface
        public void downloadApk(final String url) {
            if (dlBusy) return;
            if (url == null || !url.startsWith("https://github.com/" + REPO + "/releases/download/")) {
                dlDone("err", "Alamat unduhan tidak dikenali.");
                return;
            }
            dlBusy = true;
            dlCancel = false;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    HttpURLConnection c = null;
                    File f = null;
                    try {
                        File dir = new File(getCacheDir(), "update");
                        if (!dir.exists()) dir.mkdirs();
                        File[] old = dir.listFiles();
                        if (old != null) for (File o : old) o.delete();
                        f = new File(dir, "MakalahKilat-update.apk");
                        c = (HttpURLConnection) new URL(url).openConnection();
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "MakalahKilat");
                        int code = c.getResponseCode();
                        if (code != 200) {
                            dlDone("err", "Unduhan ditolak (kode " + code + ").");
                            return;
                        }
                        long total = c.getContentLengthLong();
                        InputStream in = c.getInputStream();
                        FileOutputStream o = new FileOutputStream(f);
                        byte[] buf = new byte[16384];
                        int n;
                        long done = 0;
                        long last = 0;
                        while ((n = in.read(buf)) > 0) {
                            if (dlCancel) {
                                o.close();
                                in.close();
                                f.delete();
                                dlDone("cancel", "");
                                return;
                            }
                            o.write(buf, 0, n);
                            done += n;
                            long now = System.currentTimeMillis();
                            if (now - last > 120) {
                                last = now;
                                int pct = total > 0 ? (int) (done * 100 / total) : -1;
                                jsFn("window.__native.onDl(" + pct + "," + done + "," + total + ")");
                            }
                        }
                        o.close();
                        in.close();
                        if (total > 0 && done != total) {
                            f.delete();
                            dlDone("err", "Unduhan tidak lengkap. Coba lagi.");
                            return;
                        }
                        jsFn("window.__native.onDl(100," + done + "," + total + ")");
                        PackageInfo pi = getPackageManager().getPackageArchiveInfo(f.getPath(), 0);
                        if (pi == null || !getPackageName().equals(pi.packageName)) {
                            f.delete();
                            dlDone("err", "Berkas unduhan bukan pembaruan Makalah Kilat.");
                            return;
                        }
                        pendingApk = f;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                startInstall();
                            }
                        });
                    } catch (Exception e) {
                        dlDone("err", "Unduhan gagal. Periksa koneksi internet.");
                    } finally {
                        if (c != null) c.disconnect();
                        dlBusy = false;
                    }
                }
            }).start();
        }

        /** Batalkan unduhan yang sedang berjalan. */
        @JavascriptInterface
        public void cancelDownload() {
            dlCancel = true;
        }
    }
}
