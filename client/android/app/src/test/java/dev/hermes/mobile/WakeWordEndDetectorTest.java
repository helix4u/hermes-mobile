package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class WakeWordEndDetectorTest {
    private static short[] frame(int amplitude) {
        short[] samples = new short[OpenWakeWordEngine.FRAME_SAMPLES];
        for (int index = 0; index < samples.length; index += 1) {
            samples[index] = (short) (index % 2 == 0 ? amplitude : -amplitude);
        }
        return samples;
    }

    @Test
    public void endsQuietCaptureWithoutPretendingSpeechWasHeard() {
        WakeWordEndDetector detector = new WakeWordEndDetector();
        for (
            int index = 0;
            index <
                WakeWordEndDetector.SPEECH_ONSET_TIMEOUT_FRAMES - 1;
            index += 1
        ) {
            assertNull(detector.accept(frame(100)));
        }
        assertEquals(
            WakeWordEndDetector.Result.NO_SPEECH,
            detector.accept(frame(100))
        );
    }

    @Test
    public void ignoresTheReadyCueAndWaitsForARealRequest() {
        WakeWordEndDetector detector = new WakeWordEndDetector(100.0);
        for (
            int index = 0;
            index < WakeWordEndDetector.CUE_GUARD_FRAMES;
            index += 1
        ) {
            assertNull(detector.accept(frame(4_000)));
        }
        for (int index = 0; index < 20; index += 1) {
            assertNull(detector.accept(frame(100)));
        }
        for (
            int index = 0;
            index < WakeWordEndDetector.VOICE_ONSET_FRAMES;
            index += 1
        ) {
            assertNull(detector.accept(frame(420)));
        }
        for (
            int index = 0;
            index < WakeWordEndDetector.END_SILENCE_FRAMES - 1;
            index += 1
        ) {
            assertNull(detector.accept(frame(100)));
        }
        assertEquals(
            WakeWordEndDetector.Result.SILENCE,
            detector.accept(frame(100))
        );
    }

    @Test
    public void waitsForSustainedSilenceAfterSpeech() {
        WakeWordEndDetector detector = new WakeWordEndDetector();
        for (int index = 0; index < 8; index += 1) {
            assertNull(detector.accept(frame(2_400)));
        }
        for (
            int index = 0;
            index < WakeWordEndDetector.END_SILENCE_FRAMES - 1;
            index += 1
        ) {
            assertNull(detector.accept(frame(100)));
        }
        while (true) {
            WakeWordEndDetector.Result result = detector.accept(frame(100));
            if (result != null) {
                assertEquals(WakeWordEndDetector.Result.SILENCE, result);
                return;
            }
        }
    }

    @Test
    public void capsAnUtteranceThatNeverBecomesQuiet() {
        WakeWordEndDetector detector = new WakeWordEndDetector();
        for (
            int index = 0;
            index < WakeWordEndDetector.MAX_CAPTURE_FRAMES - 1;
            index += 1
        ) {
            assertNull(detector.accept(frame(2_400)));
        }
        assertEquals(
            WakeWordEndDetector.Result.MAX_DURATION,
            detector.accept(frame(2_400))
        );
    }
}
