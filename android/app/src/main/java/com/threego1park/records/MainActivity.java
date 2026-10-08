package com.threego1park.records;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.documentfile.provider.DocumentFile;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 웹앱(assets 의 index.html)을 화면 가득 보여 준다.
 * 기록은 웹앱이 앱 안(WebView 저장 공간)에 두고, AndroidBridge 로 사용자가 고른 갤탭 폴더에 백업 파일을 쓴다.
 * 고른 폴더는 안드로이드에 "계속 허락"(persistable permission)을 받아 두므로 앱을 다시 열어도 다시 고를 필요가 없다.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/index.html";
    private static final int REQUEST_FILE = 1;
    private static final int REQUEST_FOLDER = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("records", MODE_PRIVATE);

        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // assets 를 https 주소로 보여 준다 (저장 공간·보안 기능이 웹과 똑같이 동작하도록)
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                // 바깥 주소(GitHub 등)는 브라우저로 연다
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // 열 앱이 없으면 무시
                }
                return true;
            }
        });

        // <input type="file"> (백업 파일 고르기, 책 사진 고르기)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                // 갤탭은 .json 파일을 "JSON 형식"으로 알아보지 못해 형식으로 거르면 파일이 흐리게 나와 고를 수 없다.
                // 그래서 사진을 고를 때만 사진으로 거르고, 나머지(백업 파일)는 모든 파일을 보여 준다.
                boolean images = false;
                for (String type : params.getAcceptTypes()) {
                    if (type != null && type.startsWith("image")) images = true;
                }
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(images ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, images ? "사진 고르기" : "백업 파일 고르기"), REQUEST_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_FOLDER) {
            String name = "";
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri tree = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(tree,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    prefs.edit().putString("folder", tree.toString()).apply();
                    DocumentFile dir = folder();
                    name = dir == null || dir.getName() == null ? "" : dir.getName();
                } catch (Exception e) {
                    name = "";
                }
            }
            web.evaluateJavascript("window.__onNativeFolder && window.__onNativeFolder(" + JSONObject.quote(name) + ")", null);
        }
    }

    /** 고른 폴더 (계속 허락이 남아 있을 때만) */
    private DocumentFile folder() {
        String saved = prefs.getString("folder", null);
        if (saved == null) return null;
        Uri tree = Uri.parse(saved);
        boolean allowed = false;
        for (UriPermission p : getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isWritePermission()) allowed = true;
        }
        return allowed ? DocumentFile.fromTreeUri(this, tree) : null;
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        return out.toString("UTF-8");
    }

    /** 웹앱에서 window.AndroidBridge 로 부르는 기능 (모두 글자로 결과를 돌려준다) */
    private class Bridge {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        /** 폴더 고르기 창을 띄운다. 결과는 window.__onNativeFolder(폴더 이름 또는 "") 로 알려 준다 */
        @JavascriptInterface
        public void pickFolder() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(intent, REQUEST_FOLDER);
                } catch (Exception e) {
                    web.evaluateJavascript("window.__onNativeFolder && window.__onNativeFolder(\"\")", null);
                }
            });
        }

        @JavascriptInterface
        public String folderName() {
            DocumentFile dir = folder();
            return dir == null || dir.getName() == null ? "" : dir.getName();
        }

        @JavascriptInterface
        public boolean hasFile(String name) {
            DocumentFile dir = folder();
            return dir != null && dir.findFile(name) != null;
        }

        /** 파일 내용. 없거나 못 읽으면 "" */
        @JavascriptInterface
        public String readFile(String name) {
            try {
                DocumentFile dir = folder();
                DocumentFile file = dir == null ? null : dir.findFile(name);
                if (file == null) return "";
                try (InputStream in = getContentResolver().openInputStream(file.getUri())) {
                    return in == null ? "" : readAll(in);
                }
            } catch (Exception e) {
                return "";
            }
        }

        /** 파일 쓰기 (있으면 덮어쓰기). "ok" 또는 "denied:…" / "error:…" */
        @JavascriptInterface
        public String writeFile(String name, String text) {
            try {
                DocumentFile dir = folder();
                if (dir == null) return "denied:폴더 허락이 없어요";
                DocumentFile file = dir.findFile(name);
                if (file == null) file = dir.createFile("application/json", name);
                if (file == null) return "error:파일을 만들지 못했어요";
                try (OutputStream out = getContentResolver().openOutputStream(file.getUri(), "wt")) {
                    if (out == null) return "error:파일을 열지 못했어요";
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
                return "ok";
            } catch (SecurityException e) {
                return "denied:" + e.getMessage();
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** 폴더 안 파일 이름들 (JSON 배열) */
        @JavascriptInterface
        public String listFiles() {
            JSONArray names = new JSONArray();
            try {
                DocumentFile dir = folder();
                if (dir != null) {
                    for (DocumentFile f : dir.listFiles()) {
                        if (f.isFile() && f.getName() != null) names.put(f.getName());
                    }
                }
            } catch (Exception ignored) {
                // 빈 목록
            }
            return names.toString();
        }

        @JavascriptInterface
        public void deleteFile(String name) {
            try {
                DocumentFile dir = folder();
                DocumentFile file = dir == null ? null : dir.findFile(name);
                if (file != null) file.delete();
            } catch (Exception ignored) {
                // 못 지워도 괜찮다
            }
        }

        /** "내 파일 → 다운로드" 에 파일로 저장. "ok" 또는 "error:…" */
        @JavascriptInterface
        public String saveDownload(String name, String text) {
            try {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return "error:파일을 만들지 못했어요";
                try (OutputStream out = resolver.openOutputStream(uri, "w")) {
                    if (out == null) return "error:파일을 열지 못했어요";
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }
    }
}
