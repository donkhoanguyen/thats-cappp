    // frontend/offscreen.js
    console.log('[Offscreen] Script loaded. Attempting audio capture on load.');

    let mediaRecorder;
    let audioStream;
    let webSocket;
    const audioChunks = [];
    // let offscreenConfigData; // Not used in this simplified version yet

    // Default audio configuration (can be overridden by message from background if needed)
    // const DEFAULT_AUDIO_CONFIG = {
    //     audioSampleRate: 16000,
    //     audioChannels: 1,
    // };

    async function initializeMicrophone() {
        console.log('[Offscreen] initializeMicrophone called (direct on load).');
        try {
            // Introduce a small delay
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
            console.log('[Offscreen] Attempting getUserMedia with { audio: true } after small delay.');
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            console.log('[Offscreen] Microphone stream obtained successfully.');
            globalThis.offscreenIsActive = true;
            chrome.runtime.sendMessage({
                type: 'offscreen-audio-ready',
                data: {}
            });
        } catch (error) {
            console.error('[Offscreen] Error getting media stream:', error.name, error.message);
            globalThis.offscreenIsActive = false;
            chrome.runtime.sendMessage({ type: 'offscreen-audio-error', error: error.message });
        }
    }

    // Call initializeMicrophone when the script loads
    if (typeof navigator.mediaDevices !== 'undefined' && typeof navigator.mediaDevices.getUserMedia !== 'undefined') {
        initializeMicrophone(); // Direct call
    } else {
        console.error('[Offscreen] getUserMedia is not supported in this context.');
        chrome.runtime.sendMessage({ type: 'offscreen-audio-error', error: 'getUserMedia not supported in offscreen document.' });
    }

    function setupMediaRecorderAndWebSocket(config) {
        if (!audioStream) {
            console.error('[Offscreen] Cannot setup MediaRecorder: audioStream is not available.');
            return;
        }
        console.log('[Offscreen] Placeholder: setupMediaRecorderAndWebSocket called with config:', config);
        // TODO: Implement MediaRecorder and WebSocket logic here
        chrome.runtime.sendMessage({ type: 'offscreen-statusUpdate', message: 'Offscreen ready for processing (MediaRecorder/WebSocket TBD).'});
    }

    function stopAudioProcessingAndCapture() {
        console.log('[Offscreen] stopAudioProcessingAndCapture called.');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        if (webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.close();
        }
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        audioChunks.length = 0;
        globalThis.offscreenIsActive = false;
        console.log('[Offscreen] Audio processing and capture stopped.');
        chrome.runtime.sendMessage({ type: 'offscreen-statusUpdate', message: 'Offscreen processing stopped.'});
    }

    chrome.runtime.onMessage.addListener(async (request) => {
        console.log('[Offscreen] Received message:', request);
        if (request.target === 'offscreen') {
            if (request.type === 'start-processing-audio') {
                if (!globalThis.offscreenIsActive || !audioStream) {
                    console.error('[Offscreen] Received start-processing-audio but microphone not ready/active.');
                    return true; 
                }
                console.log('[Offscreen] Received start-processing-audio command.', request.data);
                setupMediaRecorderAndWebSocket(request.data);
            } else if (request.type === 'stop-processing-audio') {
                console.log('[Offscreen] Received stop-processing-audio command.');
                stopAudioProcessingAndCapture();
            }
            // Remove the 'trigger-mic-init' handler as it's not used in this simplified version
        }
        return true; 
    });

    console.log('[Offscreen] Event listeners set up.');