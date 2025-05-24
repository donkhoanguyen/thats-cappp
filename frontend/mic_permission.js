// frontend/mic_permission.js
(async () => {
    console.log('[MicPermission] Helper page loaded. Requesting microphone access...');
    try {
        // Request microphone access just to satisfy the user gesture requirement from a visible page.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[MicPermission] Microphone stream obtained by helper page.');
        
        // We don't need to use this stream here. Stop the tracks immediately.
        stream.getTracks().forEach(track => track.stop());
        console.log('[MicPermission] Tracks stopped. Global permission should now be activated for the extension origin.');

        // Notify background that this step is done.
        // Background will then proceed with the offscreen document as before.
        chrome.runtime.sendMessage({ type: 'mic-helper-permission-confirmed' }, () => {
            if (chrome.runtime.lastError) {
                console.error('[MicPermission] Error sending mic-helper-permission-confirmed:', chrome.runtime.lastError.message);
            }
            // Close this helper page
            window.close(); 
        });

    } catch (err) {
        console.error('[MicPermission] Error in helper page getUserMedia:', err.name, err.message);
        chrome.runtime.sendMessage({ type: 'mic-helper-permission-denied', error: err.message }, () => {
            if (chrome.runtime.lastError) {
                console.error('[MicPermission] Error sending mic-helper-permission-denied:', chrome.runtime.lastError.message);
            }
            // Close this helper page even on error
            window.close(); 
        });
    }
})(); 