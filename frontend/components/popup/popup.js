// Global listener for messages from the background script (e.g., if listening stops)
// This should ideally be outside the class, as it's a runtime event listener for the popup context.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const startListeningButton = document.getElementById('startListeningButton');
  const statusMessage = document.getElementById('statusMessage');

  if (request.action === "listeningStopped") {
    if (startListeningButton) {
      startListeningButton.disabled = false;
    }
    if (statusMessage) {
      statusMessage.textContent = "Listening stopped.";
    }
  }
  // You might also want to handle an "updateStatus" message here
  if (request.action === "updateStatus") {
    if (statusMessage) {
      statusMessage.textContent = request.message;
    }
  }
});


export class Popup {
  constructor() {
    console.log('[PopupJS] Constructor called.'); // <-- ADD THIS
    this.popup = null;
    // Updated to match the elements for the listening feature
    this.startListeningButton = null;
    this.statusMessage = null;
    this.queryInput = null; // Assuming an input for initial query
    
    // Original properties for existing popup structure
    // this.inputField = null; 
    // this.submitButton = null;
    this.closeButton = null;
    // this.onSubmitCallback = null; // Not directly used for listening
    this.floatingButton = null;
  }

  // Initialize the popup
  async initialize(floatingButton) {
    console.log('[PopupJS] Initialize method called.'); // <-- ADD THIS
    this.floatingButton = floatingButton;
    
    if (!document.getElementById('ccf-popup')) {
      this.popup = document.createElement('div');
      this.popup.id = 'ccf-popup';
      this.popup.className = 'popup-container'; // Ensure your popup.html has this container class
      
      try {
        console.log('[PopupJS] Fetching popup.html...'); // <-- ADD THIS
        // Fetch the popup.html content
        const response = await fetch(chrome.runtime.getURL('components/popup/popup.html'));
        const html = await response.text();
        console.log('[PopupJS] popup.html fetched.'); // <-- ADD THIS
        
        // Create a temporary container to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Get the popup content
        // Assuming popup.html itself contains the elements, not necessarily a nested '.popup-container'
        // If your popup.html only contains the inner elements (button, input, etc.), then directly append.
        // If popup.html includes a wrapper div with class 'popup-container', this is fine.
        const popupContent = tempDiv.querySelector('.popup-container'); // Adjust this selector if your popup.html structure is different
        
        if (popupContent) { // If popup.html has a wrapping container
          this.popup.innerHTML = popupContent.innerHTML;
        } else { // If popup.html directly contains the elements (e.g., just the button, input, etc.)
          this.popup.innerHTML = html;
        }
        
        document.body.appendChild(this.popup);
        console.log('[PopupJS] Popup element appended to body.'); // <-- ADD THIS
          
        // Initialize elements specific to the listening functionality
        this.startListeningButton = this.popup.querySelector('#startListeningButton'); // Use ID selector
        this.statusMessage = this.popup.querySelector('#statusMessage');     // Use ID selector
        this.queryInput = this.popup.querySelector('#queryInput');           // Use ID selector
        
        // Initialize other existing popup elements if they are still relevant
        this.closeButton = this.popup.querySelector('.close-button'); // Assuming you keep this

        console.log('[PopupJS] startListeningButton element:', this.startListeningButton); // <-- ADD THIS
        console.log('[PopupJS] queryInput element:', this.queryInput); // <-- ADD THIS
        console.log('[PopupJS] closeButton element:', this.closeButton); // <-- ADD THIS
          
        // Set up event listeners (including the new listening button)
        this.setupEventListeners();
          
        // Position the popup relative to the floating button
        this.positionPopup();
          
        // Show popup
        this.show();
        
      } catch (error) {
        console.error('[PopupJS] Error loading popup HTML or setting up elements:', error); // <-- ADD THIS
      }
    }
  }

  // Position the popup relative to the floating button
  positionPopup() {
    if (this.floatingButton && this.popup) { // Ensure popup exists
      const btnRect = this.floatingButton.getBoundingClientRect();
      // Adjust popupHeight as needed, or calculate dynamically after content is loaded
      const popupHeight = 272; 
      this.popup.style.top = `${btnRect.top + (btnRect.height / 2) - (popupHeight / 2)}px`;
    }
  }

  // Set up event listeners
  setupEventListeners() {
    console.log('[PopupJS] setupEventListeners called.'); // <-- ADD THIS
    if (this.closeButton) {
      this.closeButton.onclick = () => this.hide();
    }

    // --- NEW LISTENING LOGIC HERE ---
    if (this.startListeningButton) {
      console.log('[PopupJS] Attaching click listener to startListeningButton.');
      this.startListeningButton.addEventListener('click', async () => {
        console.log('[PopupJS] Start Listening button clicked.');
        if (this.statusMessage) {
          // Optional: Update status to indicate process is starting
          this.statusMessage.textContent = 'Initiating listening process...'; 
        }
        
        try {
          // REMOVE getUserMedia call from popup.js
          // console.log('[PopupJS] Requesting microphone permission...');
          // const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // console.log('[PopupJS] Microphone permission granted.');
          // stream.getTracks().forEach(track => track.stop()); 

          // if (this.statusMessage) {
          //   this.statusMessage.textContent = 'Microphone access granted. Preparing to start...';
          // }
          
          const messagePayload = { 
            action: "startListening",
            query: this.queryInput ? this.queryInput.value : ""
          };
          console.log('[PopupJS] Sending message to background:', messagePayload); 
          
          chrome.runtime.sendMessage(messagePayload, function(response) {
            if (chrome.runtime.lastError) {
                console.error('[PopupJS] sendMessage Lasterror:', chrome.runtime.lastError.message); 
            } else {
                console.log('[PopupJS] Message sent, response from background:', response); 
                if (response && response.success) {
                    // Optionally update popup UI based on successful initiation
                    // if (this.statusMessage) this.statusMessage.textContent = response.message;
                } else if (response && !response.success) {
                    if (this.statusMessage) this.statusMessage.textContent = `Error: ${response.error}`;
                    // Re-enable button if start failed and was due to a recoverable error handled by background
                    if (this.startListeningButton) this.startListeningButton.disabled = false;
                }
            }
          });

          // Disable button immediately assuming background will handle it
          // Re-enable on error if necessary, based on response from background
          if (this.startListeningButton) {
            this.startListeningButton.disabled = true;
          }
          // Do not hide the popup immediately. Hide it based on successful response or specific UX choice.
          // this.hide(); 

        } catch (error) {
          // This catch block is now less likely to catch getUserMedia errors as it's removed
          console.error('[PopupJS] Error in startListeningButton click handler (setup phase):', error.name, error.message); 
          if (this.statusMessage) {
            this.statusMessage.textContent = `Error: ${error.message}.`;
          }
           if (this.startListeningButton) { // Re-enable button on local error
            this.startListeningButton.disabled = false;
          }
        }
      });
    } else {
      console.warn('[PopupJS] startListeningButton not found, cannot attach listener.');
    }

    // --- Original submit button logic (if still needed, re-add here) ---
    // if (this.submitButton && this.inputField) {
    //   this.submitButton.onclick = () => this.handleSubmit();
    //   this.inputField.addEventListener('keypress', (e) => {
    //     if (e.key === 'Enter') {
    //       this.handleSubmit();
    //     }
    //   });
    // }

    // Close popup when clicking outside
    const closePopup = (e) => {
      // Ensure this.popup is not null and the click is not on the popup itself or the floating button
      if (this.popup && !this.popup.contains(e.target) && e.target !== this.floatingButton) {
        this.hide();
        document.removeEventListener('click', closePopup);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  // Original handleSubmit is now largely replaced by the startListeningButton logic.
  // If you still need a separate text submission, you'd re-implement it here.
  // handleSubmit() {
  //   const query = this.inputField.value.trim();
  //   if (this.onSubmitCallback) {
  //     this.onSubmitCallback(query);
  //   }
  //   this.hide();
  // }

  // Show popup
  show() {
    if (!this.popup) return; // Ensure popup element exists

    // Hide the floating button
    if (this.floatingButton) {
      this.floatingButton.style.opacity = '0';
      this.floatingButton.style.visibility = 'hidden';
    }

    // Animate the popup in
    requestAnimationFrame(() => {
      this.popup.classList.add('open');
      // Focus on the query input for listening if it exists
      if (this.queryInput) {
        this.queryInput.focus();
      } 
      // else if (this.inputField) { // Fallback to original input field if you keep it
      //   this.inputField.focus();
      // }
    });
  }

  // Hide popup
  hide() {
    if (!this.popup) return; // Ensure popup element exists

    this.popup.classList.remove('open');
    
    // Show the floating button
    if (this.floatingButton) {
      this.floatingButton.style.opacity = '1';
      this.floatingButton.style.visibility = 'visible';
    }
    
    setTimeout(() => {
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
        // Nullify references to ensure garbage collection
        this.startListeningButton = null;
        this.statusMessage = null;
        this.queryInput = null;
        this.closeButton = null;
      }
    }, 300);
  }

  // Set submit callback (if you still need a generic submit, otherwise remove)
  // setOnSubmit(callback) {
  //   this.onSubmitCallback = callback;
  // }
}