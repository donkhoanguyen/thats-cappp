// Initialize the floating button
async function initializeFloatingButton() {
  try {
    const module = await import(chrome.runtime.getURL('components/floating-button/floating-button.js'));
    const floatingButton = module.createFloatingButton();
    if (floatingButton) {
      document.body.appendChild(floatingButton);
      
      // Add click handler for the floating button
      floatingButton.addEventListener('click', async (e) => {
        // Only trigger click if we're in the main button area (first 50px)
        const rect = floatingButton.getBoundingClientRect();
        if (e.clientX <= rect.left + 50) {
          // Show popup
          const popupModule = await import(chrome.runtime.getURL('components/popup/popup.js'));
          const popup = new popupModule.Popup();
          
          // Set up submit callback
          popup.setOnSubmit(async (query) => {
            // Show side panel
            injectSidePanel();
            
            // Extract audio with query
            try {
              const Audio = await extractAudio(query);
              if (Audio) {
                updateSidePanelContent(Audio);
              }
            } catch (error) {
              console.error('Error extracting content:', error);
              showError('Failed to analyze content. Please try again.');
            }
          });
          
          // Initialize and show popup
          await popup.initialize(floatingButton);
        }
      });
    }
  } catch (error) {
    console.error('Error loading floating button module:', error);
  }
}

// Initialize the extension
initializeFloatingButton();

// Function to extract audio
async function extractAudio(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Create WebSocket connection
      const ws = new WebSocket('ws://localhost:8000/ws/start-listening');
      
      return new Promise((resolve, reject) => {
        ws.onopen = async () => {
          try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
              }
            });

            // Create audio context with correct sample rate
            const audioContext = new AudioContext({
              sampleRate: 16000
            });

            // Create media recorder
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });

            // Handle data available event
            mediaRecorder.ondataavailable = async (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                try {
                  // Convert audio data to the correct format
                  const audioData = await event.data.arrayBuffer();
                  ws.send(audioData);
                } catch (error) {
                  console.error('Error processing audio data:', error);
                }
              }
            };

            // Start recording in chunks
            mediaRecorder.start(1000); // Record in 1-second chunks

            // Store mediaRecorder in the WebSocket object for cleanup
            ws.mediaRecorder = mediaRecorder;
            ws.stream = stream;
          } catch (error) {
            console.error('Error accessing microphone:', error);
            reject(error);
          }
        };

        ws.onmessage = async (event) => {
          try {
            // Handle both text and binary messages
            const data = event.data instanceof Blob 
              ? JSON.parse(await event.data.text())
              : JSON.parse(event.data);
            
            // Cleanup
            if (ws.mediaRecorder) {
              ws.mediaRecorder.stop();
            }
            if (ws.stream) {
              ws.stream.getTracks().forEach(track => track.stop());
            }
            ws.close();
            
            resolve(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            ws.close();
            reject(error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          // Cleanup
          if (ws.mediaRecorder) {
            ws.mediaRecorder.stop();
          }
          if (ws.stream) {
            ws.stream.getTracks().forEach(track => track.stop());
          }
          ws.close();
          reject(error);
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          // Ensure cleanup
          if (ws.mediaRecorder) {
            ws.mediaRecorder.stop();
          }
          if (ws.stream) {
            ws.stream.getTracks().forEach(track => track.stop());
          }
        };
      });
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        showError('Failed to connect to backend server. Please ensure it is running at http://localhost:8000');
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
}

// Function to show error message
function showError(message) {
  const errorMessage = document.createElement('div');
  errorMessage.style.position = 'fixed';
  errorMessage.style.top = '20px';
  errorMessage.style.right = '20px';
  errorMessage.style.padding = '10px 20px';
  errorMessage.style.background = '#ff4444';
  errorMessage.style.color = 'white';
  errorMessage.style.borderRadius = '4px';
  errorMessage.style.zIndex = '2147483647';
  errorMessage.textContent = message;
  document.body.appendChild(errorMessage);
  setTimeout(() => errorMessage.remove(), 5000);
}

// Function to update side panel content
function updateSidePanelContent(content) {
  const panel = document.getElementById('ccf-side-panel');
  if (panel) {
    const contentContainer = panel.querySelector('.content-container');
    if (contentContainer) {
      contentContainer.innerHTML = JSON.stringify(content, null, 2);
    }
  }
}

// State management for side panel
let isPanelOpen = false;

// Function to show panel error message
function showPanelError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'panel-error';
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '20px';
  errorDiv.style.right = '20px';
  errorDiv.style.padding = '10px 20px';
  errorDiv.style.background = '#ff4444';
  errorDiv.style.color = 'white';
  errorDiv.style.borderRadius = '4px';
  errorDiv.style.zIndex = '2147483647';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 3000);
}

// Function to handle panel animation
function handlePanelAnimation(panel, isOpening) {
  if (isOpening) {
    panel.style.display = 'block';
    // Force reflow
    panel.offsetHeight;
    panel.classList.add('open');
  } else {
    panel.classList.remove('open');
    // Wait for animation to complete before hiding
    setTimeout(() => {
      panel.style.display = 'none';
    }, 400);
  }
}

// Function to update button state
function updateButtonState(btn, isPanelOpen) {
  if (isPanelOpen) {
    btn.style.opacity = '0';
    btn.style.visibility = 'hidden';
  } else {
    btn.style.opacity = '1';
    btn.style.visibility = 'visible';
  }
}

// Function to cleanup panel
function cleanupPanel(panel) {
  // Remove event listeners
  const closeButton = panel.querySelector('.close-button');
  if (closeButton) {
    closeButton.onclick = null;
  }
  
  // Remove animation classes
  panel.classList.remove('open');
  
  // Remove the panel after animation completes
  setTimeout(() => {
    panel.remove();
  }, 400); // Match this with your CSS transition duration
}

// Function to toggle panel
function togglePanel() {
  const panel = document.getElementById('ccf-side-panel');
  const floatingButton = document.getElementById('ccf-floating-btn');
  
  if (panel) {
    if (isPanelOpen) {
      cleanupPanel(panel);
      isPanelOpen = false;
      updateButtonState(floatingButton, false);
    } else {
      handlePanelAnimation(panel, true);
      isPanelOpen = true;
      updateButtonState(floatingButton, true);
    }
  }
}

// Function to inject side panel
function injectSidePanel() {
  if (!document.getElementById('ccf-side-panel')) {
    const panel = document.createElement('div');
    panel.id = 'ccf-side-panel';
    panel.className = 'panel-container';
    
    // Load the side panel content
    fetch(chrome.runtime.getURL('components/sidepanel/sidepanel.html'))
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(html => {
        // Create a temporary container to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Get the panel content
        const panelContent = tempDiv.querySelector('.panel-container');
        if (panelContent) {
          panel.innerHTML = panelContent.innerHTML;
          document.body.appendChild(panel);
          
          // Add click handler for close button
          const closeButton = panel.querySelector('.close-button');
          if (closeButton) {
            closeButton.onclick = () => togglePanel();
          }
          
          // Initialize panel state
          isPanelOpen = false;
          
          // Add open class after a small delay to trigger animation
          setTimeout(() => {
            handlePanelAnimation(panel, true);
            isPanelOpen = true;
            const floatingButton = document.getElementById('ccf-floating-btn');
            updateButtonState(floatingButton, true);
          }, 50);
        } else {
          throw new Error('Panel content not found in HTML');
        }
      })
      .catch(error => {
        console.error('Error loading side panel:', error);
        showPanelError('Failed to load side panel. Please try again.');
      });
  } else {
    togglePanel();
  }
} 