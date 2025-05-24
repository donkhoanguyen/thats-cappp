// Initialize the floating button
async function initializeFloatingButton() {
  try {
    console.log('[ContentJS] Initializing floating button...'); // <-- ADD THIS
    const module = await import(chrome.runtime.getURL('components/floating-button/floating-button.js'));
    const floatingButton = module.createFloatingButton();
    if (floatingButton) {
      document.body.appendChild(floatingButton);
      console.log('[ContentJS] Floating button appended to body.'); // <-- ADD THIS
      
      // Add click handler for the floating button
      floatingButton.addEventListener('click', async (e) => {
        console.log('[ContentJS] Floating button clicked.'); // <-- ADD THIS
        // Only trigger click if we're in the main button area (first 50px)
        const rect = floatingButton.getBoundingClientRect();
        if (e.clientX <= rect.left + 50) {
          console.log('[ContentJS] Main area of floating button clicked, attempting to show popup.'); // <-- ADD THIS
          // Show popup
          try {
            // Show popup
            console.log('[ContentJS] Attempting to get chrome object:', chrome);
            console.log('[ContentJS] Attempting to get chrome.runtime object:', chrome.runtime);
            const popupModule = await import(chrome.runtime.getURL('components/popup/popup.js'));
            console.log('[ContentJS] Popup module imported:', popupModule); // <-- ADD THIS
            const popup = new popupModule.Popup();
            console.log('[ContentJS] Popup instance created:', popup); // <-- ADD THIS
            
            // Removed: popup.setOnSubmit() is no longer a function
            // popup.setOnSubmit(async (query) => {
            //   // Show side panel - This logic is now handled by popup.js when
            //   // "startListening" is triggered, by sending a message to background.js
            //   // which then opens the side panel.
            //   injectSidePanel();
            // });
            
            // Initialize and show popup
            await popup.initialize(floatingButton);
            console.log('[ContentJS] Popup initialize called.'); // <-- ADD THIS
          } catch (error) {
            console.error('[ContentJS] Error importing or initializing popup:', error); // <-- ADD THIS
          }
        }
      });
    }
  } catch (error) {
    console.error('Error loading floating button module:', error);
  }
}

// Initialize the extension
initializeFloatingButton();

// Function to show error message (Keep as is)
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

// Function to update side panel content (Keep as is)
function updateSidePanelContent(content) {
  const panel = document.getElementById('ccf-side-panel');
  if (panel) {
    const contentContainer = panel.querySelector('.content-container');
    if (contentContainer) {
      contentContainer.innerHTML = JSON.stringify(content, null, 2);
    }
  }
}

// State management for side panel (Keep as is)
let isPanelOpen = false;

// Function to show panel error message (Keep as is)
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

// Function to handle panel animation (Keep as is)
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

// Function to update button state (Keep as is)
function updateButtonState(btn, isPanelOpen) {
  if (isPanelOpen) {
    btn.style.opacity = '0';
    btn.style.visibility = 'hidden';
  } else {
    btn.style.opacity = '1';
    btn.style.visibility = 'visible';
  }
}

// Function to cleanup panel (Keep as is)
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

// Function to toggle panel (Keep as is)
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

// Function to inject side panel (Keep as is, though opening is handled by background.js now)
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