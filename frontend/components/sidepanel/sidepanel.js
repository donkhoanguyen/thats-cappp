document.addEventListener('DOMContentLoaded', () => {
  const transcriptionOutput = document.getElementById('transcriptionOutput'); // Now points to .content-container
  const statusMessage = document.getElementById('statusMessage');
  const stopListeningButton = document.getElementById('stopListeningButton');

  // Check if elements are found, important for debugging if something goes wrong
  if (!transcriptionOutput) console.error("Element with ID 'transcriptionOutput' not found.");
  if (!statusMessage) console.error("Element with ID 'statusMessage' not found.");
  if (!stopListeningButton) console.error("Element with ID 'stopListeningButton' not found.");

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "displayTranscription") {
      const p = document.createElement('p');
      p.textContent = request.transcription;
      transcriptionOutput.appendChild(p);
      transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight; // Scroll to bottom
    } else if (request.action === "updateStatus") {
      statusMessage.textContent = request.message;
    }
  });

  if (stopListeningButton) { // Only add listener if button is found
    stopListeningButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "stopListening" });
      statusMessage.textContent = "Stopping...";
    });
  }

  // Initial status message
  if (statusMessage) { // Only set text if element is found
    statusMessage.textContent = "Ready to receive transcriptions.";
  }
});