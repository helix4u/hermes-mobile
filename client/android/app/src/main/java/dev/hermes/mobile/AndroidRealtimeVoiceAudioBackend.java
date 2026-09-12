package dev.hermes.mobile;

import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Android adapter for the testable live-voice route owner. */
final class AndroidRealtimeVoiceAudioBackend
    implements RealtimeVoiceAudioRoute.Backend {
    private final AudioManager audioManager;

    AndroidRealtimeVoiceAudioBackend(AudioManager audioManager) {
        this.audioManager = audioManager;
    }

    @Override
    public boolean usesCommunicationDeviceApi() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    @Override
    public int currentMode() {
        return audioManager.getMode();
    }

    @Override
    public void enterCommunicationMode() {
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
    }

    @Override
    public void restoreModeIfStillCommunication(int previousMode) {
        if (audioManager.getMode() == AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(previousMode);
        }
    }

    @Override
    public RealtimeVoiceAudioRoute.DeviceKind currentCommunicationDevice() {
        if (usesCommunicationDeviceApi()) {
            return kindOf(audioManager.getCommunicationDevice());
        }
        if (audioManager.isSpeakerphoneOn()) {
            return RealtimeVoiceAudioRoute.DeviceKind.SPEAKER;
        }
        if (audioManager.isBluetoothScoOn()) {
            return RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH;
        }
        return RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
    }

    @Override
    public List<RealtimeVoiceAudioRoute.DeviceKind> availableCommunicationDevices() {
        if (!usesCommunicationDeviceApi()) {
            return Collections.emptyList();
        }
        List<RealtimeVoiceAudioRoute.DeviceKind> result = new ArrayList<>();
        for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
            RealtimeVoiceAudioRoute.DeviceKind kind = kindOf(device);
            if (!result.contains(kind)) {
                result.add(kind);
            }
        }
        return result;
    }

    @Override
    public boolean selectCommunicationDevice(
        RealtimeVoiceAudioRoute.DeviceKind requested
    ) {
        if (!usesCommunicationDeviceApi()) {
            return false;
        }
        for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
            if (kindOf(device) == requested) {
                return audioManager.setCommunicationDevice(device);
            }
        }
        return false;
    }

    @Override
    public void clearCommunicationDevice() {
        if (usesCommunicationDeviceApi()) {
            audioManager.clearCommunicationDevice();
        }
    }

    @Override
    public boolean isSpeakerphoneOn() {
        return audioManager.isSpeakerphoneOn();
    }

    @Override
    public void setSpeakerphoneOn(boolean enabled) {
        audioManager.setSpeakerphoneOn(enabled);
    }

    @Override
    public boolean hasActiveLegacyExternalRoute() {
        if (audioManager.isBluetoothScoOn()) {
            return true;
        }
        for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            RealtimeVoiceAudioRoute.DeviceKind kind = kindOf(device);
            if (
                kind == RealtimeVoiceAudioRoute.DeviceKind.WIRED ||
                kind == RealtimeVoiceAudioRoute.DeviceKind.USB ||
                kind == RealtimeVoiceAudioRoute.DeviceKind.HEARING_AID
            ) {
                return true;
            }
        }
        return false;
    }

    private static RealtimeVoiceAudioRoute.DeviceKind kindOf(AudioDeviceInfo device) {
        if (device == null) {
            return RealtimeVoiceAudioRoute.DeviceKind.NONE;
        }
        switch (device.getType()) {
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
                return RealtimeVoiceAudioRoute.DeviceKind.EARPIECE;
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return RealtimeVoiceAudioRoute.DeviceKind.SPEAKER;
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_LINE_ANALOG:
            case AudioDeviceInfo.TYPE_LINE_DIGITAL:
                return RealtimeVoiceAudioRoute.DeviceKind.WIRED;
            case AudioDeviceInfo.TYPE_USB_ACCESSORY:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return RealtimeVoiceAudioRoute.DeviceKind.USB;
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_BLE_SPEAKER:
                return RealtimeVoiceAudioRoute.DeviceKind.BLUETOOTH;
            case AudioDeviceInfo.TYPE_HEARING_AID:
                return RealtimeVoiceAudioRoute.DeviceKind.HEARING_AID;
            default:
                return RealtimeVoiceAudioRoute.DeviceKind.OTHER;
        }
    }
}
