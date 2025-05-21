// Mock data for demonstration
const mockConcepts = [
  'Software development',
  'Billing',
  'Usage tracking',
  'Pricing models',
  'Real-time invoicing',
  'API',
  'SaaS',
  'Revenue',
  'Series B',
  'Web technologies'
];

// State management
let isListening = false;
let websocket = null;
let currentSessionId = null;

// Function to start listening
async function startListening() {
  try {
    // Create WebSocket connection
    websocket = new WebSocket('ws://127.0.0.1:8000/ws/start-listening');
    
    websocket.onopen = () => {
      console.log('WebSocket connection established');
      isListening = true;
      
      // Show listening UI
      const listeningStatus = document.querySelector('.listening-status');
      const stopButton = document.querySelector('.stop-button');
      if (listeningStatus) listeningStatus.style.display = 'flex';
      if (stopButton) stopButton.style.display = 'block';
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'transcription') {
        // Update UI with transcription
        const contentContainer = document.querySelector('.content-container');
        if (contentContainer) {
          const transcriptionElement = document.createElement('div');
          transcriptionElement.className = 'content-section';
          transcriptionElement.innerHTML = `
            <h3>Transcription</h3>
            <p>${data.text}</p>
          `;
          contentContainer.appendChild(transcriptionElement);
        }
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      cleanupListening();
    };

    websocket.onclose = () => {
      console.log('WebSocket connection closed');
      cleanupListening();
    };

  } catch (error) {
    console.error('Error starting listening:', error);
    cleanupListening();
  }
}

// Function to stop listening
async function stopListening() {
  try {
    // Create WebSocket connection for stopping
    const stopWebSocket = new WebSocket('ws://127.0.0.1:8000/ws/stop-listening');
    
    stopWebSocket.onopen = () => {
      console.log('Stop listening WebSocket connection established');
      // Send stop command
      stopWebSocket.send(JSON.stringify({
        type: "stop"
      }));
    };

    stopWebSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'status') {
        if (data.status === 'stopping') {
          console.log('Stopping listening...');
        } else if (data.status === 'stopped') {
          console.log('Successfully stopped listening');
          // Close the main listening WebSocket
          if (websocket) {
            websocket.close();
          }
          cleanupListening();
          // Close the stop WebSocket after cleanup
          stopWebSocket.close();
        }
      } else if (data.type === 'error') {
        console.error('Error stopping listening:', data.message);
        cleanupListening();
        stopWebSocket.close();
      }
    };

    stopWebSocket.onerror = (error) => {
      console.error('Stop listening WebSocket error:', error);
      cleanupListening();
      stopWebSocket.close();
    };

    stopWebSocket.onclose = () => {
      console.log('Stop listening WebSocket connection closed');
    };

  } catch (error) {
    console.error('Error in stop listening:', error);
    cleanupListening();
  }
}

// Function to cleanup listening state
function cleanupListening() {
  // Close WebSocket if it exists
  if (websocket) {
    websocket.close();
    websocket = null;
  }

  // Reset state
  isListening = false;
  currentSessionId = null;

  // Update UI
  const listeningStatus = document.querySelector('.listening-status');
  const stopButton = document.querySelector('.stop-button');
  if (listeningStatus) listeningStatus.style.display = 'none';
  if (stopButton) stopButton.style.display = 'none';

  // Clear any temporary data
  const contentContainer = document.querySelector('.content-container');
  if (contentContainer) {
    contentContainer.innerHTML = '<p style="text-align:center; color:#666;">Listening stopped</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Listen for content update events
  document.addEventListener('updateContent', (event) => {
    displayContent(event.detail);
  });

  // Set page info (mock)
  document.getElementById('page-title').textContent = 'Loading...';
  document.getElementById('page-meta').textContent = ''; // Clear mock meta

  // Populate concepts
  const conceptsList = document.getElementById('concepts-list');
  // mockConcepts.forEach(concept => {
  //   const btn = document.createElement('button');
  //   btn.className = 'concept-tag';
  //   btn.textContent = concept;
  //   btn.onclick = () => alert(`Lookup: ${concept}`);
  //   conceptsList.appendChild(btn);
  // });
  conceptsList.innerHTML = '<p style="text-align:center; color:#666;">Loading page content...</p>'; // Add loading indicator

  const recordButton = document.getElementById('record-button');
  let isRecording = false;

  recordButton.addEventListener('click', function() {
    isRecording = !isRecording;
    
    if (isRecording) {
      recordButton.textContent = 'Stop Recording';
      recordButton.classList.add('recording');
      // TODO: Add recording start logic here
    } else {
      recordButton.textContent = 'Start Recording';
      recordButton.classList.remove('recording');
      // TODO: Add recording stop logic here
    }
  });

  // Add stop button functionality
  const stopButton = document.querySelector('.stop-button');
  if (stopButton) {
    stopButton.addEventListener('click', stopListening);
  }

  // Add start listening functionality (if you have a start button)
  const startButton = document.querySelector('.start-button');
  if (startButton) {
    startButton.addEventListener('click', startListening);
  }
});

// Chatbot DOM Elements (added for chatbot functionality)
const chatDisplay = document.getElementById('chat-display');
const chatInput = document.getElementById('chat-input');
const sendChatButton = document.getElementById('send-chat-button');

// Function to display a message in the chat window
function appendMessageToChat(text, sender) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('chat-message', sender === 'user' ? 'user-message' : 'bot-message');
  messageElement.textContent = text;
  chatDisplay.appendChild(messageElement);
  chatDisplay.scrollTop = chatDisplay.scrollHeight; // Auto-scroll to the latest message
}

// Function to send message to chatbot backend
async function sendMessageToBot(message) {
  appendMessageToChat(message, 'user');
  chatInput.value = ''; // Clear input field
  chatInput.disabled = true;
  sendChatButton.disabled = true;

  try {
    // Replace with your actual backend URL if different
    const response = await fetch('http://127.0.0.1:8000/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: message }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Unknown error communicating with bot." }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    appendMessageToChat(data.reply, 'bot');
  } catch (error) {
    console.error('Error sending message to bot:', error);
    appendMessageToChat(`Error: ${error.message || 'Could not connect to the bot.'}`, 'bot');
  } finally {
    chatInput.disabled = false;
    sendChatButton.disabled = false;
    chatInput.focus();
  }
}

// Event listener for the send button
if (sendChatButton) {
  sendChatButton.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
      sendMessageToBot(message);
    }
  });
}

// Optional: Event listener for Enter key in the input field
if (chatInput) {
  chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission if it's in a form
      const message = chatInput.value.trim();
      if (message) {
        sendMessageToBot(message);
      }
    }
  });
}

function displayContent(content) {
  // Set page info
  document.getElementById('page-title').textContent = content.title || 'No Title';
  document.getElementById('page-meta').textContent = content.url || 'No URL';

  // Clear existing concepts
  const conceptsList = document.getElementById('concepts-list');
  conceptsList.innerHTML = '';

  // Display extracted content
  if (content.main_text) {
    // Create a section for main text
    const mainTextSection = document.createElement('div');
    mainTextSection.className = 'content-section';
    mainTextSection.innerHTML = `
      <h3>Main Content</h3>
      <p>${content.main_text.substring(0, 200)}...</p>
    `;
    conceptsList.appendChild(mainTextSection);
  }

  // Display headings if available
  if (content.headings && content.headings.length > 0) {
    const headingsSection = document.createElement('div');
    headingsSection.className = 'content-section';
    headingsSection.innerHTML = `
      <h3>Headings</h3>
      <ul>
        ${content.headings.map(heading => `<li>${heading}</li>`).join('')}
      </ul>
    `;
    conceptsList.appendChild(headingsSection);
  }

  // Display links if available
  if (content.links && content.links.length > 0) {
    const linksSection = document.createElement('div');
    linksSection.className = 'content-section';
    linksSection.innerHTML = `
      <h3>Links</h3>
      <ul>
        ${content.links.map(link => `<li><a href="${link}" target="_blank">${link}</a></li>`).join('')}
      </ul>
    `;
    conceptsList.appendChild(linksSection);
  }

  // Display images if available
  if (content.images && content.images.length > 0) {
    const imagesSection = document.createElement('div');
    imagesSection.className = 'content-section';
    imagesSection.innerHTML = `
      <h3>Images</h3>
      <div class="image-grid">
        ${content.images.map(image => `
          <div class="image-item">
            <img src="${image}" alt="Page image" onerror="this.style.display='none'">
          </div>
        `).join('')}
      </div>
    `;
    conceptsList.appendChild(imagesSection);
  }

  // If no content is available, show a message
  if (!content.main_text && !content.headings && !content.links && !content.images) {
    const noContent = document.createElement('p');
    noContent.textContent = 'No content extracted from this page.';
    noContent.style.textAlign = 'center';
    noContent.style.color = '#666';
    conceptsList.appendChild(noContent);
  }
}
