// background.js

const SERVER_URL = "ws://localhost:8000";
const RECORD_DURATION = 35 * 1000; // 35 seconds in milliseconds
const SCHEDULE_INTERVAL = 30 * 1000; // 30 seconds in milliseconds

let recordingIntervalId;
let isRecordingActive = false;
let offscreenDocumentReady = false; // Flag to track offscreen doc readiness

// A promise to wait for the offscreen document to be fully ready
let offscreenReadyPromiseResolver;
let offscreenReadyPromise = new Promise(resolve => {
    offscreenReadyPromiseResolver = resolve;
});

// Function to create or get the Offscreen Document
async function setupOffscreenDocument() {
  if (offscreenDocumentReady) {
    console.log("Background: Offscreen document already active.");
    return true;
  }

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });

  if (existingContexts.length > 0) {
    console.log("Background: Offscreen document already exists.");
    offscreenDocumentReady = true;
    offscreenReadyPromiseResolver(); // Resolve the promise immediately
    return true;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'To record microphone audio for streaming.',
    });
    console.log("Background: Offscreen document created.");
    // Do NOT set offscreenDocumentReady = true here.
    // It will be set when offscreen.js sends its "ready" message.
    return true;
  } catch (error) {
    console.error("Background: Failed to create offscreen document:", error);
    chrome.runtime.sendMessage({ type: "error", message: `Failed to create offscreen document: ${error.message}` });
    return false;
  }
}

// Start the continuous recording cycle
async function startRecordingCycle() {
    if (isRecordingActive) {
        console.log("Background: Recording cycle already active.");
        return;
    }

    const docCreated = await setupOffscreenDocument();
    if (!docCreated) {
        console.error("Background: Offscreen document not created. Cannot start recording.");
        return;
    }

    isRecordingActive = true;
    console.log("Background: Starting recording cycle...");

    // Wait for the offscreen document to signal its readiness
    await offscreenReadyPromise;
    console.log("Background: Offscreen document is now fully ready to receive commands.");

    // Send initial command to offscreen to start first segment
    chrome.runtime.sendMessage(
        {
            target: 'offscreen',
            command: 'startRecording',
            SERVER_URL: SERVER_URL,
            RECORD_DURATION: RECORD_DURATION
        }
    );

    // Schedule subsequent segments
    recordingIntervalId = setInterval(() => {
        if (isRecordingActive && offscreenDocumentReady) { // Check offscreenDocumentReady here too
            console.log("Background: Scheduling next segment record...");
            chrome.runtime.sendMessage({ target: 'offscreen', command: 'recordSegment' });
        } else if (!isRecordingActive) {
            clearInterval(recordingIntervalId);
            console.log("Background: Recording cycle stopped by interval clear.");
        } else {
            console.warn("Background: Offscreen document not ready. Skipping segment record.");
        }
    }, SCHEDULE_INTERVAL);

    console.log(`Background: Client will start new recordings every ${SCHEDULE_INTERVAL / 1000} seconds, each lasting ${RECORD_DURATION / 1000} seconds.`);
    chrome.runtime.sendMessage({ type: "recordingStatus", status: "started" });
}

// Stop the continuous recording cycle
async function stopRecordingCycle() {
    if (!isRecordingActive) {
        console.log("Background: Recording cycle is not active.");
        return;
    }
    isRecordingActive = false;
    clearInterval(recordingIntervalId);

    // Send stop command to offscreen document only if it's ready
    if (offscreenDocumentReady) {
        chrome.runtime.sendMessage({ target: 'offscreen', command: 'stopRecording' });
    }


    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')],
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      offscreenDocumentReady = false;
      // Reset the promise for future starts
      offscreenReadyPromise = new Promise(resolve => { offscreenReadyPromiseResolver = resolve; });
      console.log("Background: Offscreen document closed.");
    }

    console.log("Background: Recording cycle stopped.");
    chrome.runtime.sendMessage({ type: "recordingStatus", status: "stopped" });
}

// Listen for messages from the popup or offscreen document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Message from Offscreen document
    if (request.sender === 'offscreen') { // Use a specific sender property for clarity
        if (request.type === 'offscreenReady') {
            console.log("Background: Offscreen document signaled ready.");
            offscreenDocumentReady = true;
            offscreenReadyPromiseResolver(); // Resolve the promise
        } else if (request.type === "offscreenStatus") {
            console.log("Background: Offscreen status update:", request.status);
            chrome.runtime.sendMessage({ type: "connectionStatus", status: request.status });
        } else if (request.type === "serverMessage") {
            chrome.runtime.sendMessage({ type: "serverMessage", data: request.data }); // Relay to popup
        } else if (request.type === "error") {
            console.error("Background: Error from offscreen:", request.message);
            chrome.runtime.sendMessage({ type: "error", message: `Offscreen Error: ${request.message}` }); // Relay to popup
        } else if (request.command === "stopRecordingCycle") {
            console.warn("Background: Offscreen requested to stop recording cycle.");
            stopRecordingCycle();
        }
    } else { // Message from Popup
        if (request.command === "startRecording") {
            startRecordingCycle();
            sendResponse({ status: "started" });
        } else if (request.command === "stopRecording") {
            stopRecordingCycle();
            sendResponse({ status: "stopped" });
        } else if (request.command === "getRecordingStatus") {
            sendResponse({ isRecordingActive: isRecordingActive });
        } else if (request.command === "getConnectionStatus") {
            // A more accurate status would involve querying offscreen, but for simplicity,
            // we'll rely on the offscreenReadyPromise and isRecordingActive for now.
            sendResponse({ status: offscreenDocumentReady ? (isRecordingActive ? "connected" : "idle_ready") : "disconnected" });
        }
    }
    return true; // Indicates an asynchronous response
});

// Initialize on extension startup - ensure offscreen document can be ready if needed
// setupOffscreenDocument(); // Not strictly necessary to call on startup, but good practice if you want it ready early.