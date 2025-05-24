// offscreen.js

let mediaRecorder;
let audioChunks = [];
let websocket;
let segmentIdCounter = 0;
let SERVER_URL;
let RECORD_DURATION;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5; // Or a number suitable for your needs
const RECONNECT_DELAY = 2000; // 2 seconds

// Function to connect to WebSocket from offscreen
async function connectWebSocket() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        console.log("Offscreen: WebSocket already open.");
        return true; // Return true if already open
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error("Offscreen: Max reconnect attempts reached. Signalling stop.");
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "error", message: "Offscreen: Max WebSocket reconnect attempts reached." });
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenCommand", command: "stopRecordingCycle" });
        return false; // Could not connect
    }

    reconnectAttempts++;
    console.log(`Offscreen: Attempting WebSocket connection (attempt <span class="math-inline">\{reconnectAttempts\}/</span>{MAX_RECONNECT_ATTEMPTS})...`);

    try {
        websocket = new WebSocket(`${SERVER_URL}/ws/start-listening`);

        return new Promise((resolve, reject) => {
            websocket.onopen = () => {
                console.log("Offscreen: WebSocket connection established.");
                chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenStatus", status: "connected" });
                reconnectAttempts = 0; // Reset on successful connection
                resolve(true);
            };

            websocket.onmessage = (event) => {
                console.log("Offscreen: Message from server:", event.data);
                chrome.runtime.sendMessage({ sender: 'offscreen', type: "serverMessage", data: event.data });
            };

            websocket.onclose = (event) => {
                console.log("Offscreen: WebSocket connection closed:", event.code, event.reason);
                chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenStatus", status: "disconnected" });
                // If closed unexpectedly, try to reconnect (unless intentionally stopped)
                if (event.code !== 1000 && event.code !== 1005) { // 1000 is normal closure, 1005 is no status received
                    console.warn("Offscreen: WebSocket closed unexpectedly. Attempting reconnect...");
                    // This might cause a loop if not careful. The startRecordingSegment logic
                    // will attempt connectWebSocket again.
                }
            };

            websocket.onerror = (error) => {
                console.error("Offscreen: WebSocket error:", error);
                chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenStatus", status: "error", message: error.message });
                websocket.close(); // Ensure it's closed to try clean reconnect
                reject(new Error("WebSocket connection error")); // Reject the promise
            };
        })
        .catch(async (e) => {
            console.warn(`Offscreen: WebSocket connection failed. Retrying in ${RECONNECT_DELAY / 1000} seconds...`);
            await new Promise(res => setTimeout(res, RECONNECT_DELAY));
            return connectWebSocket(); // Recursive call for retry
        });

    } catch (error) {
        console.error("Offscreen: Failed to create WebSocket object:", error);
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenStatus", status: "error", message: error.message });
        return false; // Cannot even create WS object
    }
}


// Function to start recording a segment from offscreen
async function startRecordingSegment() {
    if (!SERVER_URL || !RECORD_DURATION) {
        console.error("Offscreen: SERVER_URL or RECORD_DURATION not set. Cannot record.");
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "error", message: "Offscreen: Configuration missing." });
        return;
    }

    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        console.log("Offscreen: WebSocket not open, attempting to reconnect...");
        await connectWebSocket();
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            console.error("Offscreen: Could not establish WebSocket connection. Cannot record.");
            chrome.runtime.sendMessage({ sender: 'offscreen', type: "error", message: "Offscreen: WebSocket connection failed." });
            return;
        }
    }

    const isConnected = await connectWebSocket();
    if (!isConnected) {
        console.error("Offscreen: Could not establish WebSocket connection after retries. Cannot record.");
        // Do NOT send stopRecordingCycle here, connectWebSocket handles max attempts
        return;
    }

    segmentIdCounter++;
    console.log(`Offscreen: --- Segment ${segmentIdCounter} ---`);
    console.log(`Offscreen: Starting recording for ${RECORD_DURATION / 1000} seconds...`);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });

        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            console.log(`Offscreen: Finished recording segment ${segmentIdCounter}.`);
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm; codecs=opus' });

            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBytes = new Uint8Array(arrayBuffer);

            if (audioBytes.length > 0) {
                console.log(`Offscreen: Sending ${audioBytes.length} bytes for segment ${segmentIdCounter}...`);
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                    websocket.send(audioBytes);
                    console.log(`Offscreen: Segment ${segmentIdCounter} sent.`);
                } else {
                    console.error("Offscreen: WebSocket not open, cannot send audio.");
                    chrome.runtime.sendMessage({ sender: 'offscreen', type: "error", message: "Offscreen: WebSocket not open, cannot send audio." });
                }
            } else {
                console.log(`Offscreen: No audio recorded for segment ${segmentIdCounter}.`);
            }

            stream.getTracks().forEach(track => track.stop()); // Stop all tracks
        };

        mediaRecorder.start();
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, RECORD_DURATION);

    } catch (err) {
        console.error("Offscreen: Error accessing microphone:", err.name, err); // <--- CHANGE THIS LINE
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "error", message: `Offscreen: Microphone access error: ${err.name}` }); // <--- CHANGE THIS LINE
        // Inform background script to stop recording if microphone access fails
        chrome.runtime.sendMessage({ sender: 'offscreen', type: "offscreenCommand", command: "stopRecordingCycle" });
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'offscreen') { // Only process messages specifically for offscreen
        if (message.command === 'startRecording') {
            SERVER_URL = message.SERVER_URL;
            RECORD_DURATION = message.RECORD_DURATION;
            await connectWebSocket(); // Ensure WS is connected before first record
            startRecordingSegment();
        } else if (message.command === 'recordSegment') {
            startRecordingSegment();
        } else if (message.command === 'stopRecording') {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.close();
            }
            console.log("Offscreen: Recording stopped.");
        }
    }
});

// Signal to the background script that this offscreen document is ready
console.log("Offscreen: Script loaded and ready.");
chrome.runtime.sendMessage({ sender: 'offscreen', type: 'offscreenReady' });