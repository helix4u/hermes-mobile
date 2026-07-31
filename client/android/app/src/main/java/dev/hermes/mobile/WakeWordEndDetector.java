package dev.hermes.mobile;

final class WakeWordEndDetector {
    enum Result {
        SILENCE("silence"),
        NO_SPEECH("no_speech"),
        MAX_DURATION("max_duration");

        final String value;

        Result(String value) {
            this.value = value;
        }
    }

    static final int CUE_GUARD_FRAMES = 3;
    static final int SPEECH_ONSET_TIMEOUT_FRAMES = 75;
    static final int VOICE_ONSET_FRAMES = 2;
    static final int END_SILENCE_FRAMES = 14;
    static final int MAX_CAPTURE_FRAMES = 450;

    private double noiseFloor;
    private int frameCount;
    private int lastVoiceFrame;
    private int consecutiveVoiceFrames;
    private boolean speechStarted;

    WakeWordEndDetector() {
        this(220.0);
    }

    WakeWordEndDetector(double initialNoiseFloor) {
        noiseFloor = Math.max(80.0, Math.min(initialNoiseFloor, 2_000.0));
    }

    Result accept(short[] frame) {
        frameCount += 1;
        double rms = rootMeanSquare(frame);
        if (frameCount >= MAX_CAPTURE_FRAMES) {
            return Result.MAX_DURATION;
        }
        if (frameCount <= CUE_GUARD_FRAMES) {
            return null;
        }

        double voiceThreshold = Math.max(250.0, noiseFloor * 2.25);
        boolean voiced = rms >= voiceThreshold;

        if (!speechStarted) {
            if (voiced) {
                consecutiveVoiceFrames += 1;
                if (consecutiveVoiceFrames >= VOICE_ONSET_FRAMES) {
                    speechStarted = true;
                    lastVoiceFrame = frameCount;
                }
            } else {
                consecutiveVoiceFrames = 0;
                updateNoiseFloor(rms);
            }
            if (
                !speechStarted &&
                frameCount >= SPEECH_ONSET_TIMEOUT_FRAMES
            ) {
                return Result.NO_SPEECH;
            }
            return null;
        }

        if (voiced) {
            lastVoiceFrame = frameCount;
        } else {
            updateNoiseFloor(rms);
        }
        if (
            frameCount - lastVoiceFrame >= END_SILENCE_FRAMES
        ) {
            return Result.SILENCE;
        }
        return null;
    }

    private void updateNoiseFloor(double rms) {
        if (rms < noiseFloor * 1.8) {
            noiseFloor = Math.max(80.0, noiseFloor * 0.94 + rms * 0.06);
        }
    }

    static double rootMeanSquare(short[] frame) {
        if (frame == null || frame.length == 0) {
            return 0.0;
        }
        double sum = 0.0;
        for (short sample : frame) {
            double value = sample;
            sum += value * value;
        }
        return Math.sqrt(sum / frame.length);
    }
}
