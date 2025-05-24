// --- Configuration ---
const SERVER_URL = "ws://localhost:8000";
const START_LISTENING_ENDPOINT = `${SERVER_URL}/ws/start-listening`;
const STOP_LISTENING_ENDPOINT = `${SERVER_URL}/ws/stop-listening`; // Not strictly needed for continuous, but good to have

const AUDIO_SAMPLERATE = 16000; // Must match your server's expected samplerate (16kHz for Whisper)
const RECORD_DURATION = 35;     // seconds to record audio for each segment
const SCHEDULE_INTERVAL = 30;   // seconds between the START of each new recording

// --- DOM Elements ---
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusParagraph = document.getElementById('status');
const responseList = document.getElementById('responseList');

// --- Global Variables ---
let mediaRecorder;
let audioChunksBuffer = []; // This will accumulate ALL audio chunks continuously
let websocket;
let segmentIdCounter = 0;
let sendingIntervalId; // Renamed for clarity: this schedules the *sending* of segments
let isRecording = false;
let recordedDuration = 0; // To track the estimated duration of buffered audio

// --- Helper Functions ---
function updateStatus(message) {
    statusParagraph.textContent = `Status: ${message}`;
}

function addMessage(message) {
    const listItem = document.createElement('li');
    listItem.textContent = message;
    responseList.prepend(listItem); // Add to top
    // Keep the list from growing too large
    if (responseList.children.length > 50) {
        responseList.removeChild(responseList.lastChild);
    }
}

// Function to convert audio chunks to a format suitable for the server
async function processAndSendAudio(segmentId, chunksToSend) {
    if (chunksToSend.length === 0) {
        console.warn(`No audio data available to send for segment ${segmentId}.`);
        addMessage(`Segment ${segmentId}: No audio data available to send.`);
        return;
    }

    const audioBlob = new Blob(chunksToSend, { type: 'audio/webm;codecs=opus' });

    console.log(`Processing and sending audio for segment ${segmentId} (${audioBlob.size} bytes)...`);
    addMessage(`Segment ${segmentId}: Processing and sending audio (${audioBlob.size} bytes)...`);

    try {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(audioBlob);
            addMessage(`Segment ${segmentId}: Sent ${audioBlob.size} bytes (WebM Blob).`);
            console.log(`Segment ${segmentId}: Sent ${audioBlob.size} bytes (WebM Blob).`);
        } else {
            addMessage(`Segment ${segmentId}: WebSocket not open, cannot send audio.`);
            console.warn(`Segment ${segmentId}: WebSocket not open, cannot send audio.`);
        }
    } catch (error) {
        console.error(`Error processing audio for segment ${segmentId}:`, error);
        addMessage(`Segment ${segmentId}: Error processing audio: ${error.message}`);
    }
}

// --- WebSocket Handling ---
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        websocket = new WebSocket(START_LISTENING_ENDPOINT);

        websocket.onopen = () => {
            console.log("WebSocket connected.");
            addMessage("WebSocket connected to server.");
            updateStatus("Connected, ready to record.");
            resolve();
        };

        websocket.onmessage = (event) => {
            console.log("Message from server:", event.data);
            addMessage(`Server: ${event.data}`);
        };

        websocket.onerror = (error) => {
            console.error("WebSocket error:", error);
            addMessage(`WebSocket Error: ${error.message}`);
            updateStatus("WebSocket Error. Check console.");
            reject(error);
        };

        websocket.onclose = (event) => {
            console.log("WebSocket closed:", event);
            addMessage(`WebSocket Closed: Code ${event.code}, Reason: ${event.reason}`);
            updateStatus("WebSocket Disconnected.");
            // Optionally try to reconnect if closed unexpectedly
            if (isRecording) { // Only try to reconnect if we were actively recording
                console.log("Attempting to reconnect WebSocket...");
                addMessage("Attempting to reconnect WebSocket...");
                setTimeout(connectWebSocket, 3000); // Try reconnecting after 3 seconds
            }
        };
    });
}

// --- Audio Recording Logic ---
async function startRecording() {
    if (isRecording) return;

    try {
        await connectWebSocket(); // Ensure WebSocket is connected before starting audio
        if (websocket.readyState !== WebSocket.OPEN) {
            console.error("WebSocket not open, cannot start recording.");
            updateStatus("Failed to connect to server.");
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Request a specific sample rate if possible, though browser might override.
        // For consistent sample rates, consider using AudioContext and AudioWorklet.
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });

        audioChunksBuffer = []; // Clear buffer for new recording session
        recordedDuration = 0;   // Reset estimated duration

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksBuffer.push(event.data);
                // Estimate duration by adding a fixed duration per chunk
                // (This is a rough estimate; actual duration depends on codec and chunk content)
                recordedDuration += (event.data.size / 1000) / 10; // Approx 100ms per 1000 bytes for opus at 16kHz
                // More accurately, if mediaRecorder.start(interval) is used:
                // recordedDuration += interval / 1000;
            }
        };

        mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped.");
            // Any remaining chunks in audioChunksBuffer after stop.
            // If the user stops recording mid-interval, this ensures the last bit is sent.
            if (audioChunksBuffer.length > 0) {
                console.log("Sending final buffered audio segment after stop.");
                segmentIdCounter++;
                processAndSendAudio(segmentIdCounter, audioChunksBuffer);
                audioChunksBuffer = []; // Clear after sending
                recordedDuration = 0;
            }
        };

        // Request data in chunks every 1000ms (1 second). This helps manage the buffer.
        mediaRecorder.start(1000); // Fire ondataavailable every 1 second
        isRecording = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        updateStatus("Recording...");
        addMessage("Recording started. Buffering audio...");

        // Schedule sending segments
        sendingIntervalId = setInterval(() => {
            if (!isRecording) {
                clearInterval(sendingIntervalId);
                return;
            }

            // Calculate the required number of chunks for RECORD_DURATION
            // This is an estimation based on the `mediaRecorder.start(interval)`
            // If chunks are roughly 1 second long, then RECORD_DURATION chunks are needed.
            const estimatedChunksPerSegment = Math.ceil(RECORD_DURATION);

            if (audioChunksBuffer.length >= estimatedChunksPerSegment) {
                segmentIdCounter++;
                console.log(`--- Segment ${segmentIdCounter} ---`);

                // Take the last `estimatedChunksPerSegment` chunks for the current segment.
                // This creates the overlap: The last N chunks include data from the previous period.
                const chunksForThisSegment = audioChunksBuffer.slice(-estimatedChunksPerSegment);

                console.log(`Sending segment ${segmentIdCounter}. Chunks in segment: ${chunksForThisSegment.length}`);
                processAndSendAudio(segmentIdCounter, chunksForThisSegment);

                // Now, manage the `audioChunksBuffer` for the next cycle.
                // We want to keep the overlap portion for the next segment.
                // The overlap is `RECORD_DURATION - SCHEDULE_INTERVAL` seconds.
                const overlapDuration = RECORD_DURATION - SCHEDULE_INTERVAL;
                const estimatedOverlapChunks = Math.ceil(overlapDuration);

                // Trim the buffer, keeping only the estimated overlap chunks at the end.
                if (estimatedOverlapChunks > 0 && audioChunksBuffer.length > estimatedOverlapChunks) {
                    audioChunksBuffer = audioChunksBuffer.slice(-estimatedOverlapChunks);
                    console.log(`Retained ${audioChunksBuffer.length} chunks for overlap (${estimatedOverlapChunks} estimated).`);
                } else {
                    audioChunksBuffer = []; // Clear if no overlap or buffer is too small
                    console.log("Buffer cleared or too small for overlap. Starting fresh accumulation.");
                }
                recordedDuration = 0; // Reset estimated duration after sending a segment
            } else {
                console.log(`Buffering: ${audioChunksBuffer.length} chunks. Need at least ${estimatedChunksPerSegment} for a full segment.`);
                updateStatus(`Recording... Buffering audio (${audioChunksBuffer.length}s est.)`);
            }

        }, SCHEDULE_INTERVAL * 1000); // Convert seconds to milliseconds

    } catch (error) {
        console.error("Error starting recording:", error);
        updateStatus(`Error: ${error.message}`);
        addMessage(`Error starting recording: ${error.message}`);
        startButton.disabled = false;
        stopButton.disabled = true;
    }
}

function stopRecording() {
    if (!isRecording) return;

    clearInterval(sendingIntervalId); // Stop the scheduling interval
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); // This will trigger onstop (if not already inactive)
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop microphone access
    }

    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close();
    }

    isRecording = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    updateStatus("Stopped.");
    addMessage("Recording stopped.");

    // The mediaRecorder.onstop will handle sending any final buffered audio.
}

// --- Event Listeners ---
startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);

// Handle page unload to ensure cleanup
window.addEventListener('beforeunload', () => {
    if (isRecording) {
        stopRecording();
    }
});