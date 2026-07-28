package dev.hermes.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class HermesConnectionService extends Service {
    private static final String LOG_TAG = "HermesConnection";
    private static final String ACTION_RETAIN =
        "dev.hermes.mobile.action.RETAIN_CONNECTION";
    private static final String ACTION_RELEASE =
        "dev.hermes.mobile.action.RELEASE_CONNECTION";
    private static final String EXTRA_SOCKET_ID = "socket_id";
    private static final String CHANNEL_ID = "hermes_live_connection";
    private static final int NOTIFICATION_ID = 2201;
    private static final Set<String> requestedSocketIds =
        ConcurrentHashMap.newKeySet();
    private static volatile boolean serviceCreated = false;

    private final Set<String> socketIds = ConcurrentHashMap.newKeySet();
    private PowerManager.WakeLock wakeLock;

    public static void retain(Context context, String socketId) {
        boolean newlyRequested = requestedSocketIds.add(socketId);
        if (!newlyRequested && serviceCreated) {
            return;
        }
        Intent intent = serviceIntent(context, ACTION_RETAIN, socketId);
        try {
            // Always use the foreground-service entry point. serviceCreated can
            // change between this thread reading it and Android delivering the
            // intent, so choosing startService here would leave a teardown race
            // where a background retain tries to recreate an ordinary service.
            // onStartCommand reasserts foreground state for every retain.
            ContextCompat.startForegroundService(context, intent);
        } catch (RuntimeException error) {
            if (newlyRequested) {
                requestedSocketIds.remove(socketId);
            }
            throw error;
        }
    }

    public static void release(Context context, String socketId) {
        requestedSocketIds.remove(socketId);
        if (!serviceCreated) {
            // A pending retain will promote the service first, observe that this
            // socket is no longer requested, and then stop cleanly. Starting a
            // release service here can overtake that retain and trigger
            // ForegroundServiceDidNotStartInTimeException.
            return;
        }
        try {
            context.startService(serviceIntent(context, ACTION_RELEASE, socketId));
        } catch (RuntimeException ignored) {
            // The service may already be gone after process teardown.
        }
    }

    private static Intent serviceIntent(
        Context context,
        String action,
        String socketId
    ) {
        Intent intent = new Intent(context, HermesConnectionService.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_SOCKET_ID, socketId);
        return intent;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        // A service created through startForegroundService must promote before
        // any retain/release reconciliation can stop it. Doing this in
        // onStartCommand leaves a race where a fast release brings the service
        // down while Android is still waiting for startForeground.
        try {
            promoteToForeground();
        } catch (RuntimeException error) {
            Log.e(
                LOG_TAG,
                "Could not initially promote the Hermes connection service",
                error
            );
        }
        serviceCreated = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        String socketId =
            intent == null ? "" : intent.getStringExtra(EXTRA_SOCKET_ID);

        if (ACTION_RETAIN.equals(action)) {
            try {
                // onCreate is not called when a new retain reaches a service
                // instance that is still being torn down. Reassert foreground
                // state for every retain before any release/idle logic can
                // stop or demote the service.
                promoteToForeground();
            } catch (RuntimeException error) {
                if (socketId != null && !socketId.isEmpty()) {
                    requestedSocketIds.remove(socketId);
                }
                socketIds.clear();
                releaseWakeLock();
                Log.e(
                    LOG_TAG,
                    "Could not promote the Hermes connection service for a retain",
                    error
                );
                stopSelfResult(startId);
                return START_NOT_STICKY;
            }
        }

        if (
            (ACTION_RETAIN.equals(action) || ACTION_RELEASE.equals(action)) &&
            socketId != null &&
            !socketId.isEmpty()
        ) {
            socketIds.clear();
            socketIds.addAll(requestedSocketIds);
        }

        if (!socketIds.isEmpty()) {
            try {
                acquireWakeLock();
            } catch (RuntimeException error) {
                requestedSocketIds.removeAll(socketIds);
                socketIds.clear();
                releaseWakeLock();
                Log.e(
                    LOG_TAG,
                    "Could not retain the Hermes foreground connection",
                    error
                );
                stopSelfResult(startId);
            }
        } else {
            stopWhenIdle(startId);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        serviceCreated = false;
        socketIds.clear();
        releaseWakeLock();
        removeForegroundNotification();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void promoteToForeground() {
        Notification notification = connectionNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification connectionNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(
            Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_hermes)
            .setContentTitle("Hermes Mobile connected")
            .setContentText("Keeping live Hermes sessions connected")
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Live Hermes connection",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(
            "Keeps authenticated Hermes sessions connected while the screen is off"
        );
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager manager = getSystemService(PowerManager.class);
            if (manager == null) {
                return;
            }
            wakeLock = manager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "hermes-mobile:live-connection"
            );
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            wakeLock.acquire();
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void stopWhenIdle(int startId) {
        if (!socketIds.isEmpty() || !requestedSocketIds.isEmpty()) {
            return;
        }
        releaseWakeLock();
        // Keep the service foreground until Android actually destroys it. A
        // retain can arrive after this idle decision but before onDestroy; an
        // early stopForeground would create a live-but-demoted service that
        // misses the next startForegroundService deadline.
        stopSelfResult(startId);
    }

    private void removeForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }
}
