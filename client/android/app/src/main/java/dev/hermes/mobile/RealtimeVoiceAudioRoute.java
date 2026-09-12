package dev.hermes.mobile;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Owns Android's communication output route for exactly the lifetime of live voice. */
final class RealtimeVoiceAudioRoute {
    enum DeviceKind {
        NONE,
        EARPIECE,
        SPEAKER,
        WIRED,
        USB,
        BLUETOOTH,
        HEARING_AID,
        OTHER
    }

    interface Backend {
        boolean usesCommunicationDeviceApi();
        int currentMode();
        void enterCommunicationMode();
        void restoreModeIfStillCommunication(int previousMode);
        DeviceKind currentCommunicationDevice();
        List<DeviceKind> availableCommunicationDevices();
        boolean selectCommunicationDevice(DeviceKind kind);
        void clearCommunicationDevice();
        boolean isSpeakerphoneOn();
        void setSpeakerphoneOn(boolean enabled);
        boolean hasActiveLegacyExternalRoute();
    }

    private final Backend backend;
    private final Set<String> leaseIds = new HashSet<>();
    private int previousMode;
    private boolean previousSpeakerphoneOn;
    private boolean ownsCommunicationSelection;
    private boolean changedLegacySpeakerphone;

    RealtimeVoiceAudioRoute(Backend backend) {
        this.backend = backend;
    }

    synchronized DeviceKind retain(String leaseId) {
        if (leaseIds.contains(leaseId)) {
            return ensure(leaseId);
        }
        boolean firstLease = leaseIds.isEmpty();
        leaseIds.add(leaseId);
        if (!firstLease) {
            return ensure(leaseId);
        }

        previousMode = backend.currentMode();
        previousSpeakerphoneOn = backend.isSpeakerphoneOn();
        ownsCommunicationSelection = false;
        changedLegacySpeakerphone = false;
        try {
            backend.enterCommunicationMode();
            return ensure(leaseId);
        } catch (RuntimeException error) {
            leaseIds.remove(leaseId);
            restore();
            throw error;
        }
    }

    synchronized DeviceKind ensure(String leaseId) {
        if (!leaseIds.contains(leaseId)) {
            throw new IllegalStateException("Live voice does not own this audio route");
        }

        if (!backend.usesCommunicationDeviceApi()) {
            if (backend.hasActiveLegacyExternalRoute()) {
                return DeviceKind.OTHER;
            }
            if (!backend.isSpeakerphoneOn()) {
                backend.setSpeakerphoneOn(true);
                changedLegacySpeakerphone = !previousSpeakerphoneOn;
            }
            return DeviceKind.SPEAKER;
        }

        DeviceKind current = backend.currentCommunicationDevice();
        if (isAudibleHandsFreeRoute(current)) {
            return current;
        }

        DeviceKind selected = preferredRoute(backend.availableCommunicationDevices());
        if (selected == DeviceKind.NONE) {
            throw new IllegalStateException(
                "No speaker or connected headset is available for live voice"
            );
        }
        if (!backend.selectCommunicationDevice(selected)) {
            throw new IllegalStateException(
                "Android refused the live voice output route"
            );
        }
        ownsCommunicationSelection = true;
        return selected;
    }

    synchronized void release(String leaseId) {
        if (!leaseIds.remove(leaseId) || !leaseIds.isEmpty()) {
            return;
        }
        restore();
    }

    synchronized void releaseAll() {
        if (leaseIds.isEmpty()) {
            return;
        }
        leaseIds.clear();
        restore();
    }

    static DeviceKind preferredRoute(List<DeviceKind> available) {
        DeviceKind[] priority = new DeviceKind[] {
            DeviceKind.SPEAKER,
            DeviceKind.BLUETOOTH,
            DeviceKind.HEARING_AID,
            DeviceKind.WIRED,
            DeviceKind.USB
        };
        for (DeviceKind candidate : priority) {
            if (available.contains(candidate)) {
                return candidate;
            }
        }
        return DeviceKind.NONE;
    }

    private static boolean isAudibleHandsFreeRoute(DeviceKind kind) {
        return kind == DeviceKind.SPEAKER ||
            kind == DeviceKind.WIRED ||
            kind == DeviceKind.USB ||
            kind == DeviceKind.BLUETOOTH ||
            kind == DeviceKind.HEARING_AID;
    }

    private void restore() {
        try {
            if (backend.usesCommunicationDeviceApi()) {
                if (ownsCommunicationSelection) {
                    backend.clearCommunicationDevice();
                }
            } else if (changedLegacySpeakerphone) {
                backend.setSpeakerphoneOn(previousSpeakerphoneOn);
            }
        } finally {
            backend.restoreModeIfStillCommunication(previousMode);
            ownsCommunicationSelection = false;
            changedLegacySpeakerphone = false;
        }
    }
}
