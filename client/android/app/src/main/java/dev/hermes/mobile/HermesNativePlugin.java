package dev.hermes.mobile;

import android.Manifest;
import android.content.SharedPreferences;
import android.app.Dialog;
import android.graphics.Color;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

@CapacitorPlugin(
    name = "HermesNative",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class HermesNativePlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "hermes_mobile_credentials_v1";
    private static final String PREFERENCES = "hermes_mobile_secure_v1";
    private static final String CREDENTIAL_PREFIX = "credential.";
    private static final String GATEWAY_PATH =
        "/api/plugins/hermes-mobile/v1/gateway";
    private static final String CORE_GATEWAY_PATH = "/api/ws";
    private static final String PORTAL_BASE_URL =
        "https://portal.nousresearch.com";
    private static final String[] GATEWAY_SESSION_COOKIES = new String[] {
        "__Host-hermes_session_at",
        "__Secure-hermes_session_at",
        "hermes_session_at",
        "__Host-hermes_session_rt",
        "__Secure-hermes_session_rt",
        "hermes_session_rt"
    };

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build();
    private final OkHttpClient audioHttpClient = httpClient.newBuilder()
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .callTimeout(240, TimeUnit.SECONDS)
        .build();
    private final ExecutorService ioExecutor = Executors.newCachedThreadPool();
    private final Map<String, WebSocket> sockets = new ConcurrentHashMap<>();
    private final Set<String> cancelledSocketIds =
        ConcurrentHashMap.newKeySet();
    private final Set<String> retainedSocketIds =
        ConcurrentHashMap.newKeySet();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object recorderLock = new Object();
    private MediaRecorder recorder;
    private File recordingFile;
    private long recordingStartedAt;

    @PluginMethod
    public void setCredential(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String token = call.getString("token", "").trim();
        if (connectionId == null) {
            return;
        }
        if (token.isEmpty()) {
            call.reject("A credential is required");
            return;
        }

        try {
            preferences().edit()
                .putString(CREDENTIAL_PREFIX + connectionId, encrypt(token))
                .apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not protect the Hermes credential");
        }
    }

    @PluginMethod
    public void hasCredential(PluginCall call) {
        String connectionId = requireConnectionId(call);
        if (connectionId == null) {
            return;
        }
        JSObject result = new JSObject();
        result.put(
            "present",
            preferences().contains(CREDENTIAL_PREFIX + connectionId)
        );
        call.resolve(result);
    }

    @PluginMethod
    public void listCredentialIds(PluginCall call) {
        JSONArray ids = new JSONArray();
        for (String key : preferences().getAll().keySet()) {
            if (key.startsWith(CREDENTIAL_PREFIX)) {
                String id = key.substring(CREDENTIAL_PREFIX.length());
                if (!id.isEmpty()) {
                    ids.put(id);
                }
            }
        }
        JSObject result = new JSObject();
        result.put("connectionIds", ids);
        call.resolve(result);
    }

    @PluginMethod
    public void removeCredential(PluginCall call) {
        String connectionId = requireConnectionId(call);
        if (connectionId == null) {
            return;
        }
        preferences().edit().remove(CREDENTIAL_PREFIX + connectionId).apply();
        call.resolve();
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias(
                "microphone",
                call,
                "microphonePermissionCallback"
            );
            return;
        }
        startRecordingAfterPermission(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission is required for speech to text");
            return;
        }
        startRecordingAfterPermission(call);
    }

    private void startRecordingAfterPermission(PluginCall call) {
        synchronized (recorderLock) {
            if (recorder != null) {
                call.reject("A voice recording is already active");
                return;
            }

            try {
                recordingFile = File.createTempFile(
                    "hermes-mobile-voice-",
                    ".m4a",
                    getContext().getCacheDir()
                );
                MediaRecorder next = new MediaRecorder();
                next.setAudioSource(MediaRecorder.AudioSource.MIC);
                next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                next.setAudioEncodingBitRate(96_000);
                next.setAudioSamplingRate(44_100);
                next.setOutputFile(recordingFile.getAbsolutePath());
                next.prepare();
                next.start();
                recorder = next;
                recordingStartedAt = System.currentTimeMillis();

                JSObject result = new JSObject();
                result.put("status", "recording");
                call.resolve(result);
            } catch (Exception error) {
                releaseRecorderLocked();
                deleteRecordingFileLocked();
                call.reject("Could not start microphone recording");
            }
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        final File completedFile;
        final long durationMs;
        synchronized (recorderLock) {
            if (recorder == null || recordingFile == null) {
                call.reject("No voice recording is active");
                return;
            }
            completedFile = recordingFile;
            durationMs = Math.max(
                0,
                System.currentTimeMillis() - recordingStartedAt
            );
            try {
                recorder.stop();
            } catch (RuntimeException error) {
                releaseRecorderLocked();
                deleteRecordingFileLocked();
                call.reject("The voice recording was too short");
                return;
            }
            releaseRecorderLocked();
            recordingFile = null;
            recordingStartedAt = 0;
        }

        ioExecutor.execute(() -> {
            try {
                byte[] bytes = readFileBytes(completedFile);
                if (bytes.length == 0) {
                    call.reject("The voice recording is empty");
                    return;
                }
                String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
                JSObject result = new JSObject();
                result.put(
                    "dataUrl",
                    "data:audio/mp4;base64," + encoded
                );
                result.put("mimeType", "audio/mp4");
                result.put("durationMs", durationMs);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not read the voice recording");
            } finally {
                completedFile.delete();
            }
        });
    }

    private static byte[] readFileBytes(File file) throws Exception {
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            byte[] buffer = new byte[16_384];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private void releaseRecorderLocked() {
        if (recorder == null) {
            return;
        }
        try {
            recorder.reset();
        } catch (RuntimeException ignored) {
        }
        try {
            recorder.release();
        } catch (RuntimeException ignored) {
        }
        recorder = null;
    }

    private void deleteRecordingFileLocked() {
        if (recordingFile != null) {
            recordingFile.delete();
            recordingFile = null;
        }
        recordingStartedAt = 0;
    }

    @PluginMethod
    public void httpRequest(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String url = call.getString("url", "");
        if (connectionId == null || !requireSecureUrl(call, url, false)) {
            return;
        }

        final String credential = credentialOrNull(connectionId);
        final String cookies = cookiesFor(url);
        if (credential == null && cookies.isEmpty()) {
            call.reject("No usable authentication is stored for this connection");
            return;
        }

        String method = call.getString("method", "GET").toUpperCase();
        String body = call.getString("body", "");
        Request.Builder builder = new Request.Builder()
            .url(url)
            .header("Accept", "application/json");
        if (credential != null) {
            builder
                .header("Authorization", "Bearer " + credential)
                .header("X-Hermes-Session-Token", credential);
        }
        if (!cookies.isEmpty()) {
            builder.header("Cookie", cookies);
        }

        JSObject headers = call.getObject("headers");
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String name = keys.next();
                if (
                    name.equalsIgnoreCase("authorization") ||
                    name.equalsIgnoreCase("x-hermes-session-token")
                ) {
                    continue;
                }
                builder.header(name, headers.optString(name, ""));
            }
        }

        RequestBody requestBody = null;
        if (!method.equals("GET") && !method.equals("HEAD")) {
            requestBody = RequestBody.create(
                body,
                MediaType.get("application/json; charset=utf-8")
            );
        }
        builder.method(method, requestBody);

        OkHttpClient requestClient =
            url.contains("/api/audio/") ? audioHttpClient : httpClient;
        int requestedTimeoutMs = call.getInt("timeoutMs", 0);
        if (requestedTimeoutMs > 0) {
            int timeoutMs = Math.min(requestedTimeoutMs, 15 * 60 * 1000);
            requestClient = requestClient.newBuilder()
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build();
        }
        requestClient.newCall(builder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call request, java.io.IOException error) {
                call.reject(
                    "Native HTTP request failed (" +
                    error.getClass().getSimpleName() +
                    ")"
                );
            }

            @Override
            public void onResponse(Call request, Response response) {
                try (response) {
                    storeResponseCookies(url, response);
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put("body", responseBody(response.body()));
                    JSObject responseHeaders = new JSObject();
                    for (String name : response.headers().names()) {
                        responseHeaders.put(name, response.header(name, ""));
                    }
                    result.put("headers", responseHeaders);
                    call.resolve(result);
                } catch (java.io.IOException error) {
                    call.reject(
                        "Could not read the native HTTP response (" +
                        error.getClass().getSimpleName() +
                        ")"
                    );
                }
            }
        });
    }

    @PluginMethod
    public void connectSocket(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String socketId = requireSocketId(call);
        String url = call.getString("url", "");
        if (
            connectionId == null ||
            socketId == null ||
            !requireSecureUrl(call, url, true)
        ) {
            return;
        }

        final String credential = credentialOrNull(connectionId);
        final String httpUrl = url.replaceFirst("^wss:", "https:");
        if (credential == null && cookiesFor(httpUrl).isEmpty()) {
            call.reject("No usable authentication is stored for this connection");
            return;
        }

        cancelledSocketIds.remove(socketId);
        try {
            // Start the foreground owner while the connection request still
            // comes from a visible activity. Android can reject a new
            // foreground-service launch after the app has already backgrounded.
            HermesConnectionService.retain(getContext(), socketId);
            retainedSocketIds.add(socketId);
        } catch (RuntimeException error) {
            call.reject(
                "Could not retain the native WebSocket (" +
                error.getClass().getSimpleName() +
                ")"
            );
            return;
        }

        ioExecutor.execute(() -> {
            Ticket ticket;
            try {
                ticket = mintSocketTicket(url, credential);
            } catch (Exception error) {
                releaseSocketLease(socketId);
                call.reject(
                    "Could not mint a WebSocket ticket (" +
                    error.getClass().getSimpleName() +
                    ")"
                );
                return;
            }

            if (cancelledSocketIds.remove(socketId)) {
                releaseSocketLease(socketId);
                call.reject("The native WebSocket connection was cancelled");
                return;
            }

            Request request = new Request.Builder()
                .url(withTicket(url, ticket))
                .build();
            AtomicBoolean opened = new AtomicBoolean(false);
            AtomicBoolean terminated = new AtomicBoolean(false);
            AtomicBoolean callSettled = new AtomicBoolean(false);
            try {
                WebSocket socket = httpClient.newWebSocket(
                    request,
                    new WebSocketListener() {
                    @Override
                    public void onOpen(WebSocket webSocket, Response response) {
                        if (cancelledSocketIds.contains(socketId)) {
                            webSocket.close(1000, "client disconnect");
                            if (callSettled.compareAndSet(false, true)) {
                                call.reject(
                                    "The native WebSocket connection was cancelled"
                                );
                            }
                            return;
                        }
                        opened.set(true);
                        emitSocketState(connectionId, socketId, "open", null);
                        if (callSettled.compareAndSet(false, true)) {
                            call.resolve();
                        }
                    }

                    @Override
                    public void onMessage(WebSocket webSocket, String text) {
                        if (cancelledSocketIds.contains(socketId)) {
                            return;
                        }
                        JSObject event = new JSObject();
                        event.put("connectionId", connectionId);
                        event.put("socketId", socketId);
                        event.put("data", text);
                        notifyListeners("socketMessage", event);
                    }

                    @Override
                    public void onClosing(
                        WebSocket webSocket,
                        int code,
                        String reason
                    ) {
                        emitSocketState(
                            connectionId,
                            socketId,
                            "closing",
                            null
                        );
                    }

                    @Override
                    public void onClosed(
                        WebSocket webSocket,
                        int code,
                        String reason
                    ) {
                        terminated.set(true);
                        sockets.remove(socketId, webSocket);
                        cancelledSocketIds.remove(socketId);
                        releaseSocketLease(socketId);
                        emitSocketState(
                            connectionId,
                            socketId,
                            "closed",
                            null
                        );
                    }

                    @Override
                    public void onFailure(
                        WebSocket webSocket,
                        Throwable error,
                        Response response
                    ) {
                        terminated.set(true);
                        sockets.remove(socketId, webSocket);
                        cancelledSocketIds.remove(socketId);
                        releaseSocketLease(socketId);
                        String safeError =
                            "Native WebSocket failed (" +
                            error.getClass().getSimpleName() +
                            ")";
                        emitSocketState(
                            connectionId,
                            socketId,
                            "failed",
                            safeError
                        );
                        if (
                            !opened.get() &&
                            callSettled.compareAndSet(false, true)
                        ) {
                            call.reject(safeError);
                        }
                    }
                    }
                );
                sockets.put(socketId, socket);
                if (terminated.get()) {
                    sockets.remove(socketId, socket);
                }
                if (cancelledSocketIds.remove(socketId)) {
                    sockets.remove(socketId, socket);
                    socket.close(1000, "client disconnect");
                    releaseSocketLease(socketId);
                    if (callSettled.compareAndSet(false, true)) {
                        call.reject(
                            "The native WebSocket connection was cancelled"
                        );
                    }
                }
            } catch (RuntimeException error) {
                releaseSocketLease(socketId);
                if (callSettled.compareAndSet(false, true)) {
                    call.reject(
                        "Could not start the native WebSocket (" +
                        error.getClass().getSimpleName() +
                        ")"
                    );
                }
            }
        });
    }

    @PluginMethod
    public void sendSocket(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String socketId = requireSocketId(call);
        String data = call.getString("data");
        if (connectionId == null || socketId == null) {
            return;
        }
        if (data == null) {
            call.reject("WebSocket data is required");
            return;
        }

        WebSocket socket = sockets.get(socketId);
        if (socket == null || !socket.send(data)) {
            call.reject("The native Hermes WebSocket is not connected");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void disconnectSocket(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String socketId = requireSocketId(call);
        if (connectionId == null || socketId == null) {
            return;
        }
        cancelledSocketIds.add(socketId);
        WebSocket socket = sockets.remove(socketId);
        releaseSocketLease(socketId);
        if (socket != null) {
            socket.close(1000, "client disconnect");
        }
        call.resolve();
    }

    @PluginMethod
    public void cloudStatus(PluginCall call) {
        call.resolve(cloudStatusResult());
    }

    @PluginMethod
    public void gatewayStatus(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String requestedUrl = call.getString("baseUrl", "").trim();
        if (
            connectionId == null ||
            !requireSecureUrl(call, requestedUrl, false)
        ) {
            return;
        }
        String baseUrl = requestedUrl.replaceAll("/+$", "");

        ioExecutor.execute(() -> {
            try {
                HttpUrl healthUrl = HttpUrl.get(baseUrl + "/api/health");
                Request.Builder request = new Request.Builder()
                    .url(healthUrl)
                    .header("Accept", "application/json");
                String cookies = cookiesFor(baseUrl);
                if (!cookies.isEmpty()) {
                    request.header("Cookie", cookies);
                }
                try (Response response = httpClient
                    .newCall(request.build())
                    .execute()) {
                    storeResponseCookies(baseUrl, response);
                    String body = responseBody(response.body());
                    if (!response.isSuccessful()) {
                        call.reject(
                            "Hermes gateway health returned HTTP " +
                            response.code()
                        );
                        return;
                    }
                    JSONObject parsed = new JSONObject(body);
                    boolean authRequired = parsed.optBoolean(
                        "auth_required",
                        false
                    );
                    boolean signedIn = false;
                    if (authRequired) {
                        HttpUrl ticketUrl = HttpUrl.get(
                            baseUrl + "/api/auth/ws-ticket"
                        );
                        signedIn = requestTicket(ticketUrl, null) != null;
                    }
                    JSObject result = new JSObject();
                    result.put("baseUrl", baseUrl);
                    result.put("authRequired", authRequired);
                    result.put("signedIn", signedIn);
                    result.put("version", parsed.optString("version", ""));
                    call.resolve(result);
                }
            } catch (Exception error) {
                call.reject(gatewayProbeFailure(baseUrl, error));
            }
        });
    }

    @PluginMethod
    public void gatewayLogin(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String requestedUrl = call.getString("baseUrl", "").trim();
        if (
            connectionId == null ||
            !requireSecureUrl(call, requestedUrl, false)
        ) {
            return;
        }
        String baseUrl = requestedUrl.replaceAll("/+$", "");
        mainHandler.post(() -> {
            clearGatewaySessionCookies(baseUrl);
            openAuthenticationWindow(
                call,
                baseUrl + "/",
                baseUrl,
                GATEWAY_SESSION_COOKIES,
                "Sign in to Hermes gateway",
                () -> {
                    JSObject result = new JSObject();
                    result.put("baseUrl", baseUrl);
                    result.put(
                        "connected",
                        hasAnyCookie(baseUrl, GATEWAY_SESSION_COOKIES)
                    );
                    call.resolve(result);
                }
            );
        });
    }

    @PluginMethod
    public void cloudLogin(PluginCall call) {
        openAuthenticationWindow(
            call,
            PORTAL_BASE_URL,
            PORTAL_BASE_URL,
            new String[] { "privy-token" },
            "Sign in to Hermes Cloud",
            () -> call.resolve(cloudStatusResult())
        );
    }

    @PluginMethod
    public void cloudLogout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager manager = CookieManager.getInstance();
            manager.removeAllCookies(value -> {
                manager.flush();
                call.resolve(cloudStatusResult());
            });
        });
    }

    @PluginMethod
    public void cloudDiscover(PluginCall call) {
        if (!hasAnyCookie(PORTAL_BASE_URL, new String[] { "privy-token" })) {
            call.reject("Sign in to Hermes Cloud before discovering agents");
            return;
        }
        String org = call.getString("org", "").trim();
        HttpUrl.Builder url = HttpUrl.get(PORTAL_BASE_URL + "/api/agents")
            .newBuilder();
        if (!org.isEmpty()) {
            url.addQueryParameter("org", org);
        }

        ioExecutor.execute(() -> {
            Request.Builder request = new Request.Builder()
                .url(url.build())
                .header("Accept", "application/json");
            String cookies = cookiesFor(PORTAL_BASE_URL);
            if (!cookies.isEmpty()) {
                request.header("Cookie", cookies);
            }
            try (Response response = httpClient.newCall(request.build()).execute()) {
                storeResponseCookies(PORTAL_BASE_URL, response);
                String body = responseBody(response.body());
                if (response.code() == 401) {
                    call.reject("Your Hermes Cloud session has expired");
                    return;
                }
                JSONObject parsed = new JSONObject(body);
                if (
                    response.code() == 409 &&
                    "org_selection_required".equals(parsed.optString("error"))
                ) {
                    JSObject result = new JSObject();
                    result.put("needsOrgSelection", true);
                    result.put("orgs", trimOrganizations(parsed.optJSONArray("orgs")));
                    call.resolve(result);
                    return;
                }
                if (!response.isSuccessful()) {
                    call.reject(
                        "Hermes Cloud discovery returned HTTP " +
                        response.code()
                    );
                    return;
                }
                call.resolve(trimCloudDiscovery(parsed));
            } catch (Exception error) {
                call.reject(
                    "Hermes Cloud discovery failed (" +
                    error.getClass().getSimpleName() +
                    ")"
                );
            }
        });
    }

    @PluginMethod
    public void cloudAgentSignIn(PluginCall call) {
        String connectionId = requireConnectionId(call);
        String dashboardUrl = call.getString("dashboardUrl", "").trim();
        if (
            connectionId == null ||
            !requireSecureUrl(call, dashboardUrl, false)
        ) {
            return;
        }
        if (!hasAnyCookie(PORTAL_BASE_URL, new String[] { "privy-token" })) {
            call.reject("Your Hermes Cloud session has expired");
            return;
        }
        String baseUrl = dashboardUrl.replaceAll("/+$", "");
        openAuthenticationWindow(
            call,
            baseUrl + "/",
            baseUrl,
            GATEWAY_SESSION_COOKIES,
            "Connecting to Hermes Cloud agent",
            () -> {
                JSObject result = new JSObject();
                result.put("baseUrl", baseUrl);
                result.put(
                    "connected",
                    hasAnyCookie(baseUrl, GATEWAY_SESSION_COOKIES)
                );
                call.resolve(result);
            }
        );
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (recorderLock) {
            releaseRecorderLocked();
            deleteRecordingFileLocked();
        }
        for (Map.Entry<String, WebSocket> entry : sockets.entrySet()) {
            cancelledSocketIds.add(entry.getKey());
            releaseSocketLease(entry.getKey());
            entry.getValue().cancel();
        }
        sockets.clear();
        retainedSocketIds.clear();
        cancelledSocketIds.clear();
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(
            PREFERENCES,
            android.content.Context.MODE_PRIVATE
        );
    }

    private String requireConnectionId(PluginCall call) {
        String connectionId = call.getString("connectionId", "").trim();
        if (!connectionId.matches("[A-Za-z0-9._-]{1,128}")) {
            call.reject("A valid connection ID is required");
            return null;
        }
        return connectionId;
    }

    private boolean requireSecureUrl(
        PluginCall call,
        String value,
        boolean websocket
    ) {
        try {
            URI uri = URI.create(value);
            String expected = websocket ? "wss" : "https";
            if (
                !expected.equalsIgnoreCase(uri.getScheme()) ||
                uri.getHost() == null ||
                uri.getHost().isBlank() ||
                uri.getUserInfo() != null
            ) {
                call.reject(
                    "Native Hermes connections must use " +
                    expected.toUpperCase()
                );
                return false;
            }
            return true;
        } catch (IllegalArgumentException error) {
            call.reject("The Hermes connection URL is invalid");
            return false;
        }
    }

    private String credential(String connectionId) throws Exception {
        String encrypted = preferences().getString(
            CREDENTIAL_PREFIX + connectionId,
            ""
        );
        if (encrypted == null || encrypted.isEmpty()) {
            throw new IllegalStateException("credential missing");
        }
        return decrypt(encrypted);
    }

    private String credentialOrNull(String connectionId) {
        try {
            return credential(connectionId);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String cookiesFor(String url) {
        String cookies = CookieManager.getInstance().getCookie(url);
        return cookies == null ? "" : cookies;
    }

    private boolean hasAnyCookie(String url, String[] names) {
        String cookies = cookiesFor(url);
        if (cookies.isEmpty()) {
            return false;
        }
        for (String part : cookies.split(";")) {
            String name = part.trim().split("=", 2)[0];
            for (String expected : names) {
                if (expected.equals(name)) {
                    return true;
                }
            }
        }
        return false;
    }

    private void clearGatewaySessionCookies(String url) {
        CookieManager manager = CookieManager.getInstance();
        for (String name : GATEWAY_SESSION_COOKIES) {
            manager.setCookie(
                url,
                name + "=; Max-Age=0; Path=/; Secure; SameSite=Lax"
            );
        }
        manager.flush();
    }

    private String gatewayProbeFailure(String baseUrl, Exception error) {
        String host;
        try {
            host = URI.create(baseUrl).getHost();
        } catch (IllegalArgumentException ignored) {
            host = "the configured host";
        }
        if (host == null || host.isBlank()) {
            host = "the configured host";
        }
        String kind = error.getClass().getSimpleName();
        if ("UnknownHostException".equals(kind)) {
            return "Could not resolve Hermes host " + host;
        }
        if (
            "SSLHandshakeException".equals(kind) ||
            "SSLPeerUnverifiedException".equals(kind)
        ) {
            return "Android rejected the HTTPS certificate for " + host;
        }
        if ("SocketTimeoutException".equals(kind)) {
            return "Timed out reaching Hermes at " + host;
        }
        if ("ConnectException".equals(kind)) {
            return "Connection refused by Hermes host " + host;
        }
        if (error instanceof JSONException) {
            return "Hermes health response from " + host + " was not valid JSON";
        }
        return "Hermes gateway probe failed for " + host + " (" + kind + ")";
    }

    private void storeResponseCookies(String url, Response response) {
        CookieManager manager = CookieManager.getInstance();
        for (String cookie : response.headers("Set-Cookie")) {
            manager.setCookie(url, cookie);
        }
        manager.flush();
    }

    private JSObject cloudStatusResult() {
        JSObject result = new JSObject();
        result.put("portalBaseUrl", PORTAL_BASE_URL);
        result.put(
            "signedIn",
            hasAnyCookie(PORTAL_BASE_URL, new String[] { "privy-token" })
        );
        return result;
    }

    private void openAuthenticationWindow(
        PluginCall call,
        String startUrl,
        String cookieUrl,
        String[] successCookies,
        String title,
        Runnable onSuccess
    ) {
        getActivity().runOnUiThread(() -> {
            AtomicBoolean settled = new AtomicBoolean(false);
            Dialog dialog = new Dialog(getActivity());
            LinearLayout layout = new LinearLayout(getActivity());
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setBackgroundColor(Color.WHITE);
            TextView heading = new TextView(getActivity());
            heading.setText(title);
            heading.setTextSize(18);
            int padding = (int) (16 * getContext().getResources()
                .getDisplayMetrics().density);
            heading.setPadding(padding, padding, padding, padding);
            WebView webView = new WebView(getActivity());
            layout.addView(
                heading,
                new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            );
            layout.addView(
                webView,
                new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1
                )
            );
            dialog.setContentView(layout);
            if (dialog.getWindow() != null) {
                dialog.getWindow().setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
            }

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setMixedContentMode(
                WebSettings.MIXED_CONTENT_NEVER_ALLOW
            );
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            manager.setAcceptThirdPartyCookies(webView, true);

            Runnable finish = () -> {
                if (!settled.compareAndSet(false, true)) {
                    return;
                }
                try {
                    dialog.dismiss();
                    webView.destroy();
                } finally {
                    onSuccess.run();
                }
            };
            Runnable[] poll = new Runnable[1];
            poll[0] = () -> {
                if (settled.get()) {
                    return;
                }
                if (hasAnyCookie(cookieUrl, successCookies)) {
                    finish.run();
                    return;
                }
                mainHandler.postDelayed(poll[0], 500);
            };

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (hasAnyCookie(cookieUrl, successCookies)) {
                        finish.run();
                    }
                }

                @Override
                public boolean onRenderProcessGone(
                    WebView view,
                    RenderProcessGoneDetail detail
                ) {
                    if (settled.compareAndSet(false, true)) {
                        dialog.dismiss();
                        view.destroy();
                        call.reject(
                            "The sign-in renderer stopped; reopen sign-in"
                        );
                    }
                    return true;
                }
            });
            dialog.setOnCancelListener(ignored -> {
                if (settled.compareAndSet(false, true)) {
                    webView.destroy();
                    call.reject(
                        "Sign-in window closed before authentication completed"
                    );
                }
            });
            dialog.show();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
            }
            webView.loadUrl(startUrl);
            mainHandler.post(poll[0]);
        });
    }

    private JSObject trimCloudDiscovery(JSONObject parsed)
        throws JSONException {
        JSObject result = new JSObject();
        JSONArray agents = new JSONArray();
        JSONArray rawAgents = parsed.optJSONArray("agents");
        if (rawAgents != null) {
            for (int i = 0; i < rawAgents.length(); i++) {
                JSONObject raw = rawAgents.optJSONObject(i);
                if (raw == null || raw.optString("id").isEmpty()) {
                    continue;
                }
                JSONObject agent = new JSONObject();
                agent.put("id", raw.optString("id"));
                agent.put("name", raw.optString("name", raw.optString("id")));
                agent.put("status", raw.optString("status", ""));
                agent.put(
                    "dashboardUrl",
                    raw.isNull("dashboardUrl")
                        ? JSONObject.NULL
                        : raw.optString("dashboardUrl", null)
                );
                agent.put(
                    "dashboardGatewayState",
                    raw.optString("dashboardGatewayState", "")
                );
                agents.put(agent);
            }
        }
        result.put("agents", agents);
        JSONObject org = parsed.optJSONObject("org");
        result.put(
            "org",
            org == null ? JSONObject.NULL : trimOrganization(org)
        );
        return result;
    }

    private JSONArray trimOrganizations(JSONArray raw)
        throws JSONException {
        JSONArray result = new JSONArray();
        if (raw == null) {
            return result;
        }
        for (int i = 0; i < raw.length(); i++) {
            JSONObject org = raw.optJSONObject(i);
            if (org != null && !org.optString("id").isEmpty()) {
                result.put(trimOrganization(org));
            }
        }
        return result;
    }

    private JSONObject trimOrganization(JSONObject raw)
        throws JSONException {
        JSONObject org = new JSONObject();
        org.put("id", raw.optString("id"));
        org.put(
            "slug",
            raw.isNull("slug") ? JSONObject.NULL : raw.optString("slug", null)
        );
        org.put("name", raw.optString("name", raw.optString("id")));
        org.put("isPersonal", raw.optBoolean("isPersonal"));
        org.put("role", raw.optString("role", "MEMBER"));
        return org;
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
        byte[] encrypted = cipher.doFinal(
            value.getBytes(StandardCharsets.UTF_8)
        );
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) +
            ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        String[] parts = value.split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("invalid credential envelope");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            encryptionKey(),
            new GCMParameterSpec(
                128,
                Base64.decode(parts[0], Base64.NO_WRAP)
            )
        );
        return new String(
            cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
            StandardCharsets.UTF_8
        );
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) {
            return (SecretKey) existing;
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT |
                KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(
                    KeyProperties.ENCRYPTION_PADDING_NONE
                )
                .build()
        );
        return generator.generateKey();
    }

    private Ticket mintSocketTicket(
        String websocketUrl,
        String credential
    ) throws Exception {
        String httpUrl = websocketUrl.replaceFirst("^wss:", "https:");
        HttpUrl gatewayUrl = HttpUrl.get(httpUrl);
        String path = gatewayUrl.encodedPath();
        int marker = path.indexOf(GATEWAY_PATH);
        if (marker < 0) {
            marker = path.indexOf(CORE_GATEWAY_PATH);
        }
        if (marker < 0) {
            throw new IllegalArgumentException("unexpected gateway path");
        }
        String prefix = path.substring(0, marker);

        HttpUrl coreTicketUrl = gatewayUrl.newBuilder()
            .encodedPath(prefix + "/api/auth/ws-ticket")
            .query(null)
            .build();
        String ticket = requestTicket(coreTicketUrl, credential);
        if (ticket != null) {
            return new Ticket("ticket", ticket);
        }

        HttpUrl mobileTicketUrl = gatewayUrl.newBuilder()
            .encodedPath(
                prefix + "/api/plugins/hermes-mobile/v1/ws-ticket"
            )
            .query(null)
            .build();
        ticket = requestTicket(mobileTicketUrl, credential);
        if (ticket != null) {
            return new Ticket("mobile_ticket", ticket);
        }
        throw new IllegalStateException("no ticket issuer accepted credential");
    }

    private String requestTicket(HttpUrl url, String credential)
        throws Exception {
        Request.Builder builder = new Request.Builder()
            .url(url)
            .post(RequestBody.create(new byte[0], null));
        if (credential != null) {
            builder
                .header("Authorization", "Bearer " + credential)
                .header("X-Hermes-Session-Token", credential);
        }
        String cookies = cookiesFor(url.toString());
        if (!cookies.isEmpty()) {
            builder.header("Cookie", cookies);
        }
        try (
            Response response = httpClient.newCall(builder.build()).execute()
        ) {
            storeResponseCookies(url.toString(), response);
            if (!response.isSuccessful()) {
                return null;
            }
            String body = responseBody(response.body());
            String ticket = new JSONObject(body).optString("ticket", "");
            return ticket.isEmpty() ? null : ticket;
        }
    }

    private String withTicket(String websocketUrl, Ticket ticket) {
        String httpUrl = websocketUrl.replaceFirst("^wss:", "https:");
        String ticketed = HttpUrl.get(httpUrl).newBuilder()
            .query(null)
            .addQueryParameter(ticket.name, ticket.value)
            .build()
            .toString();
        return ticketed.replaceFirst("^https:", "wss:");
    }

    private String responseBody(ResponseBody body)
        throws java.io.IOException {
        return body == null ? "" : body.string();
    }

    private void emitSocketState(
        String connectionId,
        String socketId,
        String state,
        String error
    ) {
        JSObject event = new JSObject();
        event.put("connectionId", connectionId);
        event.put("socketId", socketId);
        event.put("state", state);
        if (error != null) {
            event.put("error", error);
        }
        notifyListeners("socketState", event);
    }

    private void releaseSocketLease(String socketId) {
        if (retainedSocketIds.remove(socketId)) {
            HermesConnectionService.release(getContext(), socketId);
        }
    }

    private String requireSocketId(PluginCall call) {
        String socketId = call.getString("socketId", "").trim();
        if (socketId.isEmpty()) {
            call.reject("A socket ID is required");
            return null;
        }
        return socketId;
    }

    private static final class Ticket {
        private final String name;
        private final String value;

        private Ticket(String name, String value) {
            this.name = name;
            this.value = value;
        }
    }
}
