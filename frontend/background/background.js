// --- Configuration ---
const SERVER_URL = "ws://localhost:8000";
const START_LISTENING_ENDPOINT = `${SERVER_URL}/ws/start-listening`;
const AUDIO_SAMPLERATE = 16000; // Must match your server's expected samplerate (16kHz for Whisper)
const AUDIO_CHANNELS = 1;        // Mono audio
const RECORD_DURATION = 35;    // seconds to record audio for each segment
const SCHEDULE_INTERVAL = 30;  // seconds between the START of each new recording

let audioContext = null;
let mediaStreamSource = null;
let scriptProcessor = null;
let websocket = null;
let isListening = false;
let currentSegmentBuffer = [];
let samplesReadForCurrentSegment = 0; // Track samples for current segment
let segmentIdCounter = 0;
let recordingIntervalId; // To store the interval for scheduling segments

// Function to convert Float32Array to Int16Array
function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
        buf[l] = Math.min(1, buffer[l]) * 0x7FFF; // Convert to 16-bit PCM
    }
    return buf.buffer; // Return as ArrayBuffer
}

async function initializeAudioStream() {
    if (audioContext && audioContext.state === 'running') {
        console.log("Audio stream already initialized.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: AUDIO_SAMPLERATE,
                channelCount: AUDIO_CHANNELS,
                // Add constraints for desired quality/format if needed
            }
        });

        audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLERATE });
        mediaStreamSource = audioContext.createMediaStreamSource(stream);

        const bufferSize = 4096;
        scriptProcessor = audioContext.createScriptProcessor(bufferSize, AUDIO_CHANNELS, AUDIO_CHANNELS);

        scriptProcessor.onaudioprocess = (event) => {
            if (!isListening) return;

            const inputBuffer = event.inputBuffer.getChannelData(0); // Get mono data
            currentSegmentBuffer.push(new Float32Array(inputBuffer)); // Push a copy
            samplesReadForCurrentSegment += inputBuffer.length;
        };

        mediaStreamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination); // Connect to destination to start processing (silent)

        console.log("Audio stream initialized and processing.");
    } catch (error) {
        console.error("Error initializing audio stream:", error);
        chrome.runtime.sendMessage({ action: "updateStatus", message: `Error initializing audio: ${error.message}` });
        stopListening();
        throw error; // Re-throw to propagate error to caller
    }
}


async function startAudioRecordingAndStreaming() {
    if (isListening) {
        console.log("Already listening.");
        return;
    }

    try {
        // Initialize audio stream first
        await initializeAudioStream();

        websocket = new WebSocket(START_LISTENING_ENDPOINT);

        websocket.onopen = (event) => {
            console.log("WebSocket connected:", event);
            isListening = true;
            chrome.runtime.sendMessage({ action: "updateStatus", message: "Connected to server. Starting audio stream..." });
            startRecordingScheduler(); // Start scheduling segments
        };

        websocket.onmessage = (event) => {
            console.log("Message from server:", event.data);
            // Send the transcription result to the side panel
            chrome.runtime.sendMessage({
                action: "displayTranscription",
                transcription: event.data
            });
        };

        websocket.onerror = (event) => {
            console.error("WebSocket error:", event);
            chrome.runtime.sendMessage({ action: "updateStatus", message: `WebSocket error: ${event.message}` });
            stopListening();
        };

        websocket.onclose = (event) => {
            console.log("WebSocket closed:", event);
            isListening = false;
            chrome.runtime.sendMessage({ action: "updateStatus", message: "Disconnected from server." });
            stopListening(); // Clean up audio resources
        };

    } catch (error) {
        console.error("Error connecting to WebSocket or initializing audio:", error);
        chrome.runtime.sendMessage({ action: "updateStatus", message: `Error starting: ${error.message}` });
        stopListening();
    }
}

async function startRecordingScheduler() {
    // Clear any existing scheduler to prevent duplicates
    if (recordingIntervalId) {
        clearInterval(recordingIntervalId);
    }

    segmentIdCounter = 0;

    // Send the first segment immediately upon starting the scheduler
    // The onaudioprocess will already be buffering, so we send what we have.
    // This assumes some audio has been buffered since `initializeAudioStream` was called.
    segmentIdCounter++;
    sendCurrentSegment(segmentIdCounter);


    // Schedule subsequent segments
    recordingIntervalId = setInterval(() => {
        if (isListening) { // Only schedule if still listening
            segmentIdCounter++;
            sendCurrentSegment(segmentIdCounter);
        } else {
            clearInterval(recordingIntervalId); // Stop scheduling if not listening
        }
    }, SCHEDULE_INTERVAL * 1000); // Convert seconds to milliseconds
}

function sendCurrentSegment(segmentId) {
    console.log(`--- Segment ${segmentId} ---`);
    chrome.runtime.sendMessage({ action: "updateStatus", message: `Processing segment ${segmentId}...` });

    if (!isListening) {
        console.log(`Client stopping during sending of segment ${segmentId}.`);
        return;
    }

    if (currentSegmentBuffer.length > 0) {
        // Concatenate all Float32Array chunks into a single Float32Array
        // We need to re-calculate total samples based on what was actually buffered
        let totalSamplesInCurrentBuffer = 0;
        for (const buffer of currentSegmentBuffer) {
            totalSamplesInCurrentBuffer += buffer.length;
        }

        const fullAudioSegmentFloat32 = new Float32Array(totalSamplesInCurrentBuffer);
        let offset = 0;
        for (const buffer of currentSegmentBuffer) {
            fullAudioSegmentFloat32.set(buffer, offset);
            offset += buffer.length;
        }

        // Convert to Int16Array and then to ArrayBuffer
        const audioBytesToSend = convertFloat32ToInt16(fullAudioSegmentFloat32);

        console.log(`Sending ${audioBytesToSend.byteLength} bytes for segment ${segmentId}. (Expected ~${AUDIO_SAMPLERATE * RECORD_DURATION * 2} bytes)`); // Expected bytes for 16-bit mono
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(audioBytesToSend);
            console.log(`Segment ${segmentId} sent.`);
            chrome.runtime.sendMessage({ action: "updateStatus", message: `Segment ${segmentId} sent.` });
        } else {
            console.warn(`WebSocket not open to send segment ${segmentId}.`);
            chrome.runtime.sendMessage({ action: "updateStatus", message: `WebSocket not ready for segment ${segmentId}.` });
        }
    } else {
        console.log(`No audio recorded for segment ${segmentId}.`);
        chrome.runtime.sendMessage({ action: "updateStatus", message: `No audio recorded for segment ${segmentId}.` });
    }

    // Reset buffer for the next segment
    currentSegmentBuffer = [];
    samplesReadForCurrentSegment = 0;
}


function stopListening() {
    if (!isListening) return;

    isListening = false;
    clearInterval(recordingIntervalId); // Stop the scheduling

    // Close WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close();
    }
    websocket = null;

    // Clean up Web Audio API resources
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (mediaStreamSource && mediaStreamSource.mediaStream) {
        mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop()); // Stop all tracks on the stream
        mediaStreamSource = null;
    }
    if (audioContext) {
        audioContext.close().then(() => {
            console.log("AudioContext closed.");
            audioContext = null;
        }).catch(e => console.error("Error closing AudioContext:", e));
    }

    // Clear any remaining buffered audio
    currentSegmentBuffer = [];
    samplesReadForCurrentSegment = 0;

    console.log("Listening stopped and resources cleaned up.");
    chrome.runtime.sendMessage({ action: "listeningStopped" }); // Notify popup
    chrome.runtime.sendMessage({ action: "updateStatus", message: "Listening stopped." });
}

// Listen for messages from the popup or other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startListening") {
        console.log("Received startListening command from popup.");
        // Open the side panel first
        try {
            chrome.sidePanel.open({ windowId: sender.tab.windowId });
            // Then start the audio recording
            startAudioRecordingAndStreaming();
        } catch (error) {
            console.error("Error opening side panel:", error);
        }
    } else if (request.action === "stopListening") {
        console.log("Received stopListening command.");
        stopListening();
    } else if (request.action === "open_side_panel") {
        try {
            chrome.sidePanel.open({ windowId: sender.tab.windowId });
            if (request.content) {
                chrome.runtime.sendMessage({
                    action: 'displayTranscription',
                    transcription: request.content
                });
            }
        } catch (error) {
            console.error('Error opening side panel:', error);
        }
    }
});

// Set up the side panel on extension installation or update
chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setOptions({
        enabled: true,
        path: 'components/sidepanel/sidepanel.html'
    });
});

// Handle extension context invalidation
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension context is being suspended');
    // Ensure all resources are cleaned up if the service worker is suspended
    stopListening();
});