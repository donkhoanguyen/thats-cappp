// --- Configuration ---
const SERVER_URL = "ws://localhost:8000";
const START_LISTENING_ENDPOINT = `${SERVER_URL}/ws/start-listening`;
const AUDIO_SAMPLERATE = 16000; // Must match your server's expected samplerate (16kHz for Whisper)
const AUDIO_CHANNELS = 1;        // Mono audio
const RECORD_DURATION = 35;    // seconds to record audio for each segment
const SCHEDULE_INTERVAL = 30;  // seconds between the START of each new recording

// Offscreen document configuration
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const MIC_HELPER_PATH = 'mic_permission.html';

// Global state variables
let websocket = null;
let isListening = false;
let segmentIdCounter = 0;
let recordingIntervalId; // To store the interval for scheduling segments
let micHelperWindowId = null;

// --- Offscreen Document Management ---
async function hasOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });
    return existingContexts.length > 0;
}

async function closeOldOffscreenDocument() {
    if (await hasOffscreenDocument()) {
        console.log('[Background] Closing existing offscreen document.');
        await chrome.offscreen.closeDocument();
        console.log('[Background] Existing offscreen document closed.');
    }
}

async function createOffscreenDocumentForAudio() {
    await closeOldOffscreenDocument(); 
    console.log('[Background] Creating new offscreen document for audio capture...');
    await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'], // AUDIO_PLAYBACK might be needed if offscreen plays audio/uses AudioContext
        justification: 'Microphone access and audio processing for transcription.',
    });
    console.log('[Background] New offscreen document creation initiated.');
}

// Function to convert Float32Array to Int16Array
function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF; // Convert to 16-bit PCM
    }
    return buf.buffer; // Return as ArrayBuffer
}

// This is the function that will now be called after mic helper confirms permission
async function proceedWithOffscreenAudioInit() {
    console.log('[Background] Mic helper confirmed permission. Adding delay before offscreen audio init...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
    console.log('[Background] Proceeding with offscreen audio init after delay...');
    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error('[Background] Timeout waiting for offscreen audio response (after mic helper).');
            chrome.runtime.onMessage.removeListener(offscreenAudioResponseListener);
            reject(new Error('Timeout waiting for offscreen audio response.'));
        }, 15000);

        const offscreenAudioResponseListener = (message, sender) => {
            if (sender.id !== chrome.runtime.id || !message.type || !message.type.startsWith('offscreen-audio')) {
                return false; 
            }
            if (message.type === 'offscreen-audio-ready') {
                console.log('[Background] Received offscreen-audio-ready signal.');
                clearTimeout(timeout);
                chrome.runtime.onMessage.removeListener(offscreenAudioResponseListener);
                resolve(message.data); 
            } else if (message.type === 'offscreen-audio-error') {
                console.error('[Background] Received offscreen-audio-error signal from offscreen.js:', message.error);
                clearTimeout(timeout);
                chrome.runtime.onMessage.removeListener(offscreenAudioResponseListener);
                reject(new Error(`Offscreen audio error: ${message.error}`));
            }
        };
        chrome.runtime.onMessage.addListener(offscreenAudioResponseListener);

        try {
            await createOffscreenDocumentForAudio(); // Create offscreen doc
            // Offscreen.js will attempt getUserMedia on its own load now that global perm is hopefully set
            console.log('[Background] Offscreen document creation requested. Waiting for its audio status (after mic helper)...');
        } catch (error) {
            console.error('[Background] Error during createOffscreenDocumentForAudio (after mic helper):', error);
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(offscreenAudioResponseListener);
            reject(error);
        }
    });
}

async function launchMicPermissionHelper() {
    return new Promise((resolve, reject) => {
        const helperUrl = chrome.runtime.getURL(MIC_HELPER_PATH);
        chrome.windows.create({
            url: helperUrl,
            type: 'popup',
            width: 400,
            height: 200,
            focused: true // Try to focus it to ensure prompt is visible
        }, (newWindow) => {
            if (chrome.runtime.lastError || !newWindow) {
                console.error("[Background] Error creating mic helper window:", chrome.runtime.lastError?.message);
                return reject(new Error(chrome.runtime.lastError?.message || "Failed to create mic helper window."));
            }
            micHelperWindowId = newWindow.id;
            console.log("[Background] Mic helper window created with ID:", micHelperWindowId);
            
            const micHelperListener = (message, sender) => {
                if (sender.id !== chrome.runtime.id) return false; // Only messages from our extension

                if (message.type === 'mic-helper-permission-confirmed') {
                    console.log("[Background] Mic helper confirmed permission.");
                    chrome.runtime.onMessage.removeListener(micHelperListener);
                    if (micHelperWindowId) try { chrome.windows.remove(micHelperWindowId); } catch(e){} finally { micHelperWindowId = null; }
                    resolve();
                } else if (message.type === 'mic-helper-permission-denied') {
                    console.error("[Background] Mic helper denied permission:", message.error);
                    chrome.runtime.onMessage.removeListener(micHelperListener);
                    if (micHelperWindowId) try { chrome.windows.remove(micHelperWindowId); } catch(e){} finally { micHelperWindowId = null; }
                    reject(new Error(`Mic permission denied by helper: ${message.error}`));
                }
            };
            chrome.runtime.onMessage.addListener(micHelperListener);
        });
    });
}

async function startAudioRecordingAndStreaming() {
    if (isListening) {
        console.log("[Background] Already listening.");
        return;
    }
    console.log("[Background] Attempting to start audio recording and streaming (with mic helper)...");
    try {
        await launchMicPermissionHelper(); // Step 1: Get permission via visible helper
        const offscreenData = await proceedWithOffscreenAudioInit(); // Step 2: Init offscreen audio
        
        console.log("[Background] Audio stream via offscreen reported as ready. Data:", offscreenData);
        isListening = true;
        chrome.runtime.sendMessage({ action: "updateStatus", message: "Microphone active. Processing..." });

        chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'start-processing-audio',
            data: { 
                 audioSampleRate: AUDIO_SAMPLERATE, 
                 audioChannels: AUDIO_CHANNELS,
                 serverUrl: START_LISTENING_ENDPOINT
            }
        });
        console.log("[Background] Sent 'start-processing-audio' to offscreen document.");

    } catch (error) {
        const errorMessage = (error && typeof error === 'object' && error.message) ? error.message : String(error);
        console.error("[Background] Error in startAudioRecordingAndStreaming (with mic helper):", errorMessage);
        chrome.runtime.sendMessage({ action: "updateStatus", message: `Error starting: ${errorMessage}` });
        stopListening(); 
    }
}

function stopListening() {
    console.log("[Background] stopListening called.");
    if (!isListening && !globalThis.offscreenIsActive) { 
        console.log("[Background] Not currently listening or offscreen known to be inactive.");
    }
    isListening = false;
    globalThis.offscreenIsActive = false; 

    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-processing-audio' });
    console.log("[Background] Sent 'stop-processing-audio' to offscreen document.");
    
    if (micHelperWindowId) {
        try { chrome.windows.remove(micHelperWindowId); } catch(e){ console.warn("Error removing mic helper window during stop:", e.message); } 
        finally { micHelperWindowId = null; }
    }
    // closeOldOffscreenDocument(); // Consider policy for closing offscreen

    chrome.runtime.sendMessage({ action: "listeningStopped" }); 
    chrome.runtime.sendMessage({ action: "updateStatus", message: "Listening stopped." });
}

// Listen for messages from the popup or other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Basic filtering for sender
    if (sender.id !== chrome.runtime.id && !sender.tab) {
      // Allow messages from web pages (sender.tab will exist) 
      // or from our own extension contexts (sender.id === chrome.runtime.id)
      console.warn("[Background] Ignoring message from unexpected source:", sender);
      return false; 
    }

    console.log('[Background] Received message:', request, 'from sender context:', sender.url || sender.id);

    if (request.action === "startListening") {
        console.log("[Background] 'startListening' action identified.");
        if (!sender.tab || typeof sender.tab.windowId === 'undefined') {
            console.error("[Background] 'startListening' message from invalid context or missing windowId.");
            sendResponse({success: false, error: "Invalid sender context for startListening"});
            return true; 
        }
        console.log(`[Background] Attempting to open side panel for windowId: ${sender.tab.windowId}`);
        try {
            chrome.sidePanel.open({ windowId: sender.tab.windowId });
            console.log("[Background] Side panel open initiated.");
            startAudioRecordingAndStreaming(); // This now calls the flow with the mic helper
            sendResponse({success: true, message: "Listening process initiated with mic helper."});
        } catch (error) {
            const errMsg = error && typeof error === 'object' && error.message ? error.message : String(error);
            console.error("[Background] Error in startListening flow:", errMsg);
            sendResponse({success: false, error: errMsg});
        }
        return true;
    } else if (request.action === "stopListening") {
        console.log("[Background] 'stopListening' action received.");
        stopListening();
        sendResponse({success: true, message: "Stop listening processed."});
        return true;
    } else if (request.type && (request.type.startsWith('offscreen-audio') || request.type.startsWith('mic-helper'))) {
        // These should be caught by dedicated listeners, but log if they reach here.
        console.log(`[Background] Main onMessage: Received ${request.type}. Data/Error:`, request.data || request.error);
    } else if (request.type === 'offscreen-transcription') {
        console.log('[Background] Received transcription from offscreen:', request.transcription);
        chrome.runtime.sendMessage({ action: "displayTranscription", transcription: request.transcription });
    } else if (request.type === 'offscreen-statusUpdate') {
        console.log('[Background] Status update from offscreen:', request.message);
        chrome.runtime.sendMessage({ action: "updateStatus", message: request.message });
    }
    // Return true if sendResponse might be called for this specific message type by this listener.
    // Default to false if the message is handled by other more specific listeners (like for offscreen/mic-helper promises).
    if (request.action === "startListening" || request.action === "stopListening") return true;
    return false; 
});

console.log("[Background] Service worker script loaded (mic helper version).");

// Set up the side panel on extension installation or update
chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setOptions({
        enabled: true,
        path: 'components/sidepanel/sidepanel.html'
    }).catch(error => console.error("[Background] Error setting side panel options:", error));
    console.log("[Background] Side panel options set on install/update.");
});

// Handle extension context invalidation
chrome.runtime.onSuspend.addListener(() => {
    console.log('[Background] Extension context is being suspended. Cleaning up.');
    if (micHelperWindowId) { try { chrome.windows.remove(micHelperWindowId); } catch(e){} }
    closeOldOffscreenDocument();
});