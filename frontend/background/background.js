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
