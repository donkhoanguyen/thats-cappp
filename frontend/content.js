// Inject floating button only if not already present
if (!document.getElementById('ccf-floating-btn')) {
  const btn = document.createElement('button');
  btn.id = 'ccf-floating-btn';
  btn.style.position = 'fixed';
  btn.style.top = '50%';
  btn.style.right = '0';
  btn.style.transform = 'translateY(-50%)';
  btn.style.background = 'rgba(255, 255, 255, 0.95)';
  btn.style.border = 'none';
  btn.style.borderRadius = '14px 0 0 14px';
  btn.style.padding = '0';
  btn.style.width = '50px';
  btn.style.height = '50px';
  btn.style.zIndex = '2147483647';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
  btn.style.display = 'flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.userSelect = 'none';
  btn.style.transition = 'all 0.3s ease-in-out';
  btn.style.overflow = 'hidden';

  // Create dotted pattern container
  const dottedArea = document.createElement('div');
  dottedArea.style.width = '25px';
  dottedArea.style.height = '100%';
  dottedArea.style.backgroundImage = 'radial-gradient(circle, #ccc 1px, transparent 1px)';
  dottedArea.style.backgroundSize = '4px 4px';
  dottedArea.style.backgroundPosition = 'center';
  dottedArea.style.opacity = '0.5';
  dottedArea.style.position = 'absolute';
  dottedArea.style.right = '-25px';
  dottedArea.style.top = '0';
  dottedArea.style.transition = 'right 0.2s ease';
  dottedArea.style.pointerEvents = 'none';
  dottedArea.style.borderLeft = '1px solid #eee';

  // Use the icons/pplx_logo.png as the icon, perfectly centered
  const img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/pplx_logo.png');
  img.alt = 'Concepts';
  img.style.width = '28px';
  img.style.height = '28px';
  img.style.display = 'block';
  img.style.margin = '0 auto';
  img.style.pointerEvents = 'none';
  img.style.position = 'relative';
  img.style.zIndex = '1';

  btn.appendChild(dottedArea);
  btn.appendChild(img);

  btn.title = 'Show Concepts';

  // Show dotted area on hover
  btn.addEventListener('mouseenter', () => {
    btn.style.width = '75px';
    dottedArea.style.right = '0';
    dottedArea.style.pointerEvents = 'auto';
    btn.style.cursor = 'move';
  });

  btn.addEventListener('mouseleave', () => {
    if (!isDragging) {
      btn.style.width = '50px';
      dottedArea.style.right = '-25px';
      dottedArea.style.pointerEvents = 'none';
      btn.style.cursor = 'pointer';
    }
  });

  // Dragging functionality
  let isDragging = false;
  let startY;
  let startTop;
  let hasDragged = false;

  btn.addEventListener('mousedown', (e) => {
    // Only start dragging if we're in the dotted area
    const rect = btn.getBoundingClientRect();
    if (e.clientX > rect.left + 50) {
      isDragging = true;
      hasDragged = false;
      startY = e.clientY;
      startTop = parseInt(window.getComputedStyle(btn).top);
      btn.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    hasDragged = true;
    const deltaY = e.clientY - startY;
    const newTop = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, startTop + deltaY));
    btn.style.top = `${newTop}px`;
    btn.style.transform = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      btn.style.cursor = 'move';
    }
  });

  // Add this to your content.js
  async function extractPageContent(retries = 3) {
    const pageContent = {
      url: window.location.href,
      // html: document.documentElement.outerHTML
    };

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch('http://localhost:8000/extract-content', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pageContent)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i === retries - 1) {
          // On last attempt, show a user-friendly error
          const errorMessage = document.createElement('div');
          errorMessage.style.position = 'fixed';
          errorMessage.style.top = '20px';
          errorMessage.style.right = '20px';
          errorMessage.style.padding = '10px 20px';
          errorMessage.style.background = '#ff4444';
          errorMessage.style.color = 'white';
          errorMessage.style.borderRadius = '4px';
          errorMessage.style.zIndex = '2147483647';
          errorMessage.textContent = 'Failed to connect to backend server. Please ensure it is running at http://localhost:8000';
          document.body.appendChild(errorMessage);
          setTimeout(() => errorMessage.remove(), 5000);
          return null;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    return null;
  }

  // Add this function to inject the side panel
  function injectSidePanel() {
    if (!document.getElementById('ccf-side-panel')) {
      const panel = document.createElement('div');
      panel.id = 'ccf-side-panel';
      panel.className = 'panel-container';
      
      // Load the side panel content
      fetch(chrome.runtime.getURL('sidepanel.html'))
        .then(response => response.text())
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
              closeButton.onclick = () => {
                panel.classList.remove('open');
                btn.style.right = '0';
                btn.style.opacity = '1';
                btn.style.visibility = 'visible';
              };
            }
            
            // Add open class after a small delay to trigger animation
            setTimeout(() => {
              panel.classList.add('open');
              // Hide the floating button
              btn.style.opacity = '0';
              btn.style.visibility = 'hidden';
            }, 50);
          }
        })
        .catch(error => {
          console.error('Error loading side panel:', error);
        });
    } else {
      const panel = document.getElementById('ccf-side-panel');
      if (panel.classList.contains('open')) {
        // Close panel
        panel.classList.remove('open');
        btn.style.right = '0';
        btn.style.opacity = '1';
        btn.style.visibility = 'visible';
      } else {
        // Open panel
        panel.classList.add('open');
        btn.style.opacity = '0';
        btn.style.visibility = 'hidden';
      }
    }
  }

  // Modify the click handler
  btn.onclick = async (e) => {
    // Only trigger click if we're in the main button area (first 50px)
    const rect = btn.getBoundingClientRect();
    if (e.clientX <= rect.left + 50 && !hasDragged) {
      try {
        // Inject the side panel
        injectSidePanel();
        
        // Then try to get the content
        const content = await extractPageContent();
        if (content) {
          // Send the extracted content to your side panel
          const sidePanel = document.getElementById('ccf-side-panel');
          if (sidePanel) {
            const event = new CustomEvent('updateContent', { detail: content });
            sidePanel.dispatchEvent(event);
          }
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }
    hasDragged = false;
  };

  document.body.appendChild(btn);
}
