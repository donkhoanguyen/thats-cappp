// Floating Button Component
export function createFloatingButton() {
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

    // Use the icons/pplx_logo.png as the icon
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

    return btn;
  }
  return null;
} 