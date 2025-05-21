// Handle extension context invalidation
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension context is being suspended');
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'open_side_panel') {
    try {
      // Open the side panel
      chrome.sidePanel.open({ windowId: sender.tab.windowId });
      
      // Forward the content to the side panel if available
      if (message.content) {
        chrome.runtime.sendMessage({
          action: 'open_side_panel',
          content: message.content
        }).catch(error => {
          console.error('Error sending message to side panel:', error);
        });
      }
    } catch (error) {
      console.error('Error opening side panel:', error);
    }
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'API_REQUEST') {
    handleApiRequest(request)
      .then(data => sendResponse({ data }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async sendResponse
  }
});

// Handle API requests
async function handleApiRequest(request) {
  const { method, endpoint, data } = request;
  
  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
