package dev.hermes.mobile;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.view.View;
import android.util.DisplayMetrics;
import android.view.ViewParent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String LOG_TAG = "HermesWebView";
    private boolean rendererRecoveryScheduled = false;
    private int systemInsetTop = 0;
    private int systemInsetRight = 0;
    private int systemInsetBottom = 0;
    private int systemInsetLeft = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HermesNativePlugin.class);
        super.onCreate(savedInstanceState);
        receiveShareIntent(getIntent());
        receiveSessionOpenIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveShareIntent(intent);
        receiveSessionOpenIntent(intent);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (bridge != null && bridge.getWebView() != null) {
            ViewCompat.requestApplyInsets(bridge.getWebView());
        }
    }

    private void receiveShareIntent(Intent intent) {
        if (
            intent == null ||
            !Intent.ACTION_SEND.equals(intent.getAction())
        ) {
            return;
        }
        HermesNativePlugin.receiveShare(getApplicationContext(), intent);
        // Activity recreation must not ingest the same one-shot share twice.
        intent.setAction(null);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_STREAM);
    }

    private void receiveSessionOpenIntent(Intent intent) {
        if (
            intent == null ||
            !HermesNativePlugin.ACTION_OPEN_SESSION.equals(intent.getAction())
        ) {
            return;
        }
        HermesNativePlugin.receiveSessionOpen(intent);
        intent.setAction(null);
        intent.removeExtra(HermesNativePlugin.EXTRA_NOTIFICATION_TARGET_ID);
        intent.removeExtra(HermesNativePlugin.EXTRA_CONNECTION_ID);
        intent.removeExtra(HermesNativePlugin.EXTRA_RUNTIME_SESSION_ID);
        intent.removeExtra(HermesNativePlugin.EXTRA_STORED_SESSION_ID);
        intent.removeExtra(HermesNativePlugin.EXTRA_SESSION_TITLE);
        intent.removeExtra(HermesNativePlugin.EXTRA_SESSION_PREVIEW);
    }

    @Override
    protected void load() {
        super.load();
        WebView webView = bridge.getWebView();
        configureSystemInsets(webView);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(
                WebView.RENDERER_PRIORITY_IMPORTANT,
                false
            );
        }
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                applySystemInsetsCss(view);
            }

            @Override
            public boolean onRenderProcessGone(
                WebView view,
                RenderProcessGoneDetail detail
            ) {
                if (rendererRecoveryScheduled) {
                    return true;
                }
                rendererRecoveryScheduled = true;
                Log.e(
                    LOG_TAG,
                    detail.didCrash()
                        ? "Hermes WebView renderer crashed; recreating activity"
                        : "Hermes WebView renderer was killed; recreating activity"
                );
                ViewParent parent = view.getParent();
                if (parent instanceof ViewGroup) {
                    ((ViewGroup) parent).removeView(view);
                }
                view.destroy();
                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed()) {
                        recreate();
                    }
                });
                return true;
            }
        });
    }

    private void configureSystemInsets(WebView webView) {
        View container = (View) webView.getParent();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout()
            );
            DisplayMetrics display = new DisplayMetrics();
            getWindowManager().getDefaultDisplay().getRealMetrics(display);
            int[] location = new int[2];
            view.getLocationOnScreen(location);
            int bottomExcluded = Math.max(0, display.heightPixels - location[1] - view.getHeight());
            int ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int keyboardPadding = WindowViewportInsets.remainingInset(ime, bottomExcluded);
            view.setPadding(0, 0, 0, keyboardPadding);
            systemInsetTop = WindowViewportInsets.remainingInset(insets.top, location[1]);
            systemInsetRight = WindowViewportInsets.remainingInset(insets.right,
                display.widthPixels - location[0] - view.getWidth());
            systemInsetBottom = ime > 0 ? 0 : WindowViewportInsets.remainingInset(insets.bottom, bottomExcluded);
            systemInsetLeft = WindowViewportInsets.remainingInset(insets.left, location[0]);
            applySystemInsetsCss(webView);
            return windowInsets;
        });
        container.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom)
                ViewCompat.requestApplyInsets(container);
        });
        ViewCompat.requestApplyInsets(container);
    }

    private void applySystemInsetsCss(WebView webView) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0) {
            density = 1;
        }
        String script = "(() => {" +
            "const root = document.documentElement;" +
            "if (!root) return;" +
            "root.style.setProperty('--android-safe-top', '" +
            Float.toString(systemInsetTop / density) + "px');" +
            "root.style.setProperty('--android-safe-right', '" +
            Float.toString(systemInsetRight / density) + "px');" +
            "root.style.setProperty('--android-safe-bottom', '" +
            Float.toString(systemInsetBottom / density) + "px');" +
            "root.style.setProperty('--android-safe-left', '" +
            Float.toString(systemInsetLeft / density) + "px');" +
            "})();";
        webView.post(() -> {
            if (!isFinishing() && !isDestroyed()) {
                webView.evaluateJavascript(script, null);
            }
        });
    }
}
