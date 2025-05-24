// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const statusDiv = document.getElementById('status');
    const serverStatusDiv = document.getElementById('serverStatus');

    function updateUI(isRecordingActive, connectionStatus) {
        if (isRecordingActive) {
            statusDiv.textContent = "Status: Recording...";
            startButton.disabled = true;
            stopButton.disabled = false;
        } else {
            statusDiv.textContent = "Status: Idle";
            startButton.disabled = false;
            stopButton.disabled = true;
        }

        serverStatusDiv.textContent = `Server: ${connectionStatus}`;
        if (connectionStatus === "connected") {
            serverStatusDiv.style.color = "green";
        } else if (connectionStatus === "disconnected") {
            serverStatusDiv.style.color = "grey";
        } else if (connectionStatus === "error") {
            serverStatusDiv.style.color = "red";
        }
    }

    // Request initial status from background script
    chrome.runtime.sendMessage({ command: "getRecordingStatus" }, (response) => {
        chrome.runtime.sendMessage({ command: "getConnectionStatus" }, (connResponse) => {
            updateUI(response.isRecordingActive, connResponse.status);
        });
    });

    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: "startRecording" }, (response) => {
            if (response.status === "started") {
                updateUI(true, "connecting..."); // Optimistic update
            }
        });
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: "stopRecording" }, (response) => {
            if (response.status === "stopped") {
                updateUI(false, "disconnected"); // Optimistic update
            }
        });
    });

    // Listen for status updates from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "recordingStatus") {
            // Get actual connection status from background script
            chrome.runtime.sendMessage({ command: "getConnectionStatus" }, (connResponse) => {
                updateUI(request.status === "started", connResponse.status);
            });
        } else if (request.type === "connectionStatus") {
            chrome.runtime.sendMessage({ command: "getRecordingStatus" }, (recResponse) => {
                updateUI(recResponse.isRecordingActive, request.status);
            });
        } else if (request.type === "serverMessage") {
            console.log("Server message in popup:", request.data);
            // Optionally display server messages in the popup
        } else if (request.type === "error") {
            console.error("Error from background:", request.message);
            statusDiv.textContent = `Error: ${request.message}`;
            statusDiv.style.color = "red";
            updateUI(false, "error");
        }
    });
});