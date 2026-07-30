package dev.hermes.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String LOG_TAG = "HermesWebView";
    private boolean rendererRecoveryScheduled = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HermesNativePlugin.class);
        super.onCreate(savedInstanceState);
        receiveShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveShareIntent(intent);
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

    @Override
    protected void load() {
        super.load();
        WebView webView = bridge.getWebView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(
                WebView.RENDERER_PRIORITY_IMPORTANT,
                false
            );
        }
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
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
}
