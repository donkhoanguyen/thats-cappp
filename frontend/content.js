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

  // Add this function to create and show the popup
  function showPopup(btn) {
    const popup = document.createElement('div');
    popup.id = 'ccf-popup';
    popup.style.position = 'fixed';
    popup.style.width = '340px';
    popup.style.background = 'white';
    popup.style.borderRadius = '18px';
    popup.style.boxShadow = '0 4px 24px rgba(80, 0, 120, 0.18)';
    popup.style.padding = '0 0 24px 0';
    popup.style.zIndex = '2147483646';
    popup.style.transition = 'all 0.2s cubic-bezier(.4,0,.2,1)';
    popup.style.opacity = '0';
    popup.style.transform = 'scale(0.95)';
    popup.style.fontFamily = 'system-ui, sans-serif';

    // Set popup dimensions
    const popupWidth = 340;
    const popupHeight = Math.round(popupWidth * 0.8); // 272px
    popup.style.width = popupWidth + 'px';
    popup.style.height = popupHeight + 'px';

    // Position the popup so its center aligns with the button's center
    const btnRect = btn.getBoundingClientRect();
    popup.style.right = '20px';
    popup.style.left = 'unset';
    popup.style.top = `${btnRect.top + (btnRect.height / 2) - (popupHeight / 2)}px`;

    // Header
    const header = document.createElement('div');
    header.style.background = '#7c3aed';
    header.style.borderRadius = '18px 18px 0 0';
    header.style.height = '64px';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '0 20px';
    header.style.position = 'relative';

    // Logo (use your extension icon or a placeholder)
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('icons/pplx_logo.png');
    logo.alt = 'Logo';
    logo.style.width = '40px';
    logo.style.height = '40px';
    logo.style.background = 'white';
    logo.style.borderRadius = '12px';
    logo.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
    logo.style.position = 'absolute';
    logo.style.left = 'calc(50% - 20px)';
    logo.style.top = '12px';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'white';
    closeBtn.style.fontSize = '22px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '16px';
    closeBtn.style.top = '16px';
    closeBtn.onclick = () => {
      popup.remove();
      btn.style.opacity = '1';
      btn.style.visibility = 'visible';
      document.removeEventListener('click', closePopup);
    };

    header.appendChild(logo);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Title
    const title = document.createElement('div');
    title.textContent = 'Concepts';
    title.style.textAlign = 'center';
    title.style.fontWeight = '700';
    title.style.fontSize = '22px';
    title.style.margin = '48px 0 0 0';
    title.style.letterSpacing = '-0.5px';
    popup.appendChild(title);

    // Context input
    const contextLabel = document.createElement('label');
    contextLabel.textContent = 'Context';
    contextLabel.style.display = 'block';
    contextLabel.style.margin = '24px 32px 6px 32px';
    contextLabel.style.fontWeight = '500';
    contextLabel.style.fontSize = '15px';
    contextLabel.style.color = '#7c3aed';
    popup.appendChild(contextLabel);

    const contextInput = document.createElement('input');
    contextInput.type = 'text';
    contextInput.placeholder = 'Add context (optional)';
    contextInput.style.display = 'block';
    contextInput.style.width = 'calc(100% - 64px)';
    contextInput.style.margin = '0 32px 0 32px';
    contextInput.style.padding = '10px 12px';
    contextInput.style.border = '1.5px solid #e5e7eb';
    contextInput.style.borderRadius = '6px';
    contextInput.style.fontSize = '15px';
    contextInput.style.marginBottom = '24px';
    popup.appendChild(contextInput);

    // Start Listening button
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Listening';
    startBtn.style.background = '#7c3aed';
    startBtn.style.color = 'white';
    startBtn.style.border = 'none';
    startBtn.style.borderRadius = '999px';
    startBtn.style.padding = '18px 0';
    startBtn.style.margin = '0 32px';
    startBtn.style.width = 'calc(100% - 64px)';
    startBtn.style.fontWeight = '700';
    startBtn.style.fontSize = '20px';
    startBtn.style.cursor = 'pointer';
    startBtn.style.boxShadow = '0 2px 8px rgba(124,58,237,0.10)';
    startBtn.style.transition = 'background 0.2s';
    startBtn.onmouseenter = () => startBtn.style.background = '#5b21b6';
    startBtn.onmouseleave = () => startBtn.style.background = '#7c3aed';
    startBtn.onclick = () => {
      popup.remove();
      injectSidePanel();
      // You can use contextInput.value here if you want to pass context
    };
    popup.appendChild(startBtn);

    document.body.appendChild(popup);

    // Hide the floating button
    btn.style.opacity = '0';
    btn.style.visibility = 'hidden';

    // Animate the popup in
    requestAnimationFrame(() => {
      popup.style.opacity = '1';
      popup.style.transform = 'scale(1)';
    });

    // Close popup when clicking outside (except on the popup or button)
    const closePopup = (e) => {
      if (!popup.contains(e.target) && e.target !== btn) {
        popup.remove();
        btn.style.opacity = '1';
        btn.style.visibility = 'visible';
        document.removeEventListener('click', closePopup);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closePopup);
    }, 100);
  }

  // Modify the click handler
  btn.onclick = async (e) => {
    // Only trigger click if we're in the main button area (first 50px)
    const rect = btn.getBoundingClientRect();
    if (e.clientX <= rect.left + 50 && !hasDragged) {
      // Show popup instead of directly opening the panel
      showPopup(btn);
    }
    hasDragged = false;
  };

  document.body.appendChild(btn);
}
