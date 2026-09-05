package dev.hermes.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class OpenWakeWordEngineTest {
    @Test
    public void mapsOnlyBundledWakeWordModels() {
        assertEquals(
            "wakeword/hey_hermes.onnx",
            OpenWakeWordEngine.modelAssetPath("hey_hermes")
        );
        assertEquals(
            "wakeword/alexa_v0.1.onnx",
            OpenWakeWordEngine.modelAssetPath("alexa")
        );
        assertEquals(
            "wakeword/hey_jarvis_v0.1.onnx",
            OpenWakeWordEngine.modelAssetPath("hey_jarvis")
        );
        assertEquals(
            "wakeword/hey_mycroft_v0.1.onnx",
            OpenWakeWordEngine.modelAssetPath("hey_mycroft")
        );
        assertEquals(
            "wakeword/hey_rhasspy_v0.1.onnx",
            OpenWakeWordEngine.modelAssetPath("hey_rhasspy")
        );
        assertNull(OpenWakeWordEngine.modelAssetPath("../../custom"));
        assertNull(OpenWakeWordEngine.modelAssetPath("unknown"));
    }

    @Test
    public void validatesBoundedSherpaKeywordDefinitionsForOneRecognizer() {
        assertTrue(
            SherpaWakeWordEngine.isValidKeywords(
                "▁COMP U TER @COMPUTER"
            )
        );
        assertFalse(SherpaWakeWordEngine.isValidKeywords(""));
        assertFalse(
            SherpaWakeWordEngine.isValidKeywords(
                "▁COMP U TER @computer"
            )
        );
        assertTrue(
            SherpaWakeWordEngine.isValidKeywords(
                "▁ONE @ONE\n▁TWO @TWO"
            )
        );
        assertTrue(SherpaWakeWordEngine.isValidKeywords("▁ONE @ONE\n▁TWO @TWO\n▁THREE @THREE"));
        assertFalse(SherpaWakeWordEngine.isValidKeywords("▁ONE @ONE\n▁TWO @TWO\n▁THREE @THREE\n▁FOUR @FOUR"));
    }
}
