// Popup functionality
export class Popup {
  constructor() {
    this.popup = null;
    this.inputField = null;
    this.submitButton = null;
    this.closeButton = null;
    this.onSubmitCallback = null;
    this.floatingButton = null;
  }

  // Initialize the popup
  async initialize(floatingButton) {
    this.floatingButton = floatingButton;
    
    if (!document.getElementById('ccf-popup')) {
      this.popup = document.createElement('div');
      this.popup.id = 'ccf-popup';
      this.popup.className = 'popup-container';
      
      try {
        const response = await fetch(chrome.runtime.getURL('components/popup/popup.html'));
        const html = await response.text();
        
        // Create a temporary container to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Get the popup content
        const popupContent = tempDiv.querySelector('.popup-container');
        if (popupContent) {
          this.popup.innerHTML = popupContent.innerHTML;
          document.body.appendChild(this.popup);
          
          // Initialize elements
          this.inputField = this.popup.querySelector('.popup-input');
          this.submitButton = this.popup.querySelector('.submit-button');
          this.closeButton = this.popup.querySelector('.close-button');
          
          // Set up event listeners
          this.setupEventListeners();
          
          // Position the popup relative to the floating button
          this.positionPopup();
          
          // Show popup
          this.show();
        }
      } catch (error) {
        console.error('Error loading popup:', error);
      }
    }
  }

  // Position the popup relative to the floating button
  positionPopup() {
    if (this.floatingButton) {
      const btnRect = this.floatingButton.getBoundingClientRect();
      const popupHeight = 272; // Height of the popup
      this.popup.style.top = `${btnRect.top + (btnRect.height / 2) - (popupHeight / 2)}px`;
    }
  }

  // Set up event listeners
  setupEventListeners() {
    if (this.closeButton) {
      this.closeButton.onclick = () => this.hide();
    }

    if (this.submitButton && this.inputField) {
      this.submitButton.onclick = () => this.handleSubmit();
      
      // Add enter key handler
      this.inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleSubmit();
        }
      });
    }

    // Close popup when clicking outside
    const closePopup = (e) => {
      if (this.popup && !this.popup.contains(e.target) && e.target !== this.floatingButton) {
        this.hide();
        document.removeEventListener('click', closePopup);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  // Handle submit
  handleSubmit() {
    const query = this.inputField.value.trim();
    if (this.onSubmitCallback) {
      this.onSubmitCallback(query);
    }
    this.hide();
  }

  // Show popup
  show() {
    // Hide the floating button
    if (this.floatingButton) {
      this.floatingButton.style.opacity = '0';
      this.floatingButton.style.visibility = 'hidden';
    }

    // Animate the popup in
    requestAnimationFrame(() => {
      this.popup.classList.add('open');
      this.inputField.focus();
    });
  }

  // Hide popup
  hide() {
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
        this.inputField = null;
        this.submitButton = null;
        this.closeButton = null;
      }
    }, 300);
  }

  // Set submit callback
  setOnSubmit(callback) {
    this.onSubmitCallback = callback;
  }
} 