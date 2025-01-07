document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('renderToggle');
    const status = document.getElementById('status');

    // Load saved state, mặc định là true
    chrome.storage.local.get(['renderEnabled'], (result) => {
        // Nếu chưa có giá trị trong storage, set mặc định là true
        if (result.renderEnabled === undefined) {
            chrome.storage.local.set({ renderEnabled: true });
            toggle.checked = true;
        } else {
            toggle.checked = result.renderEnabled;
        }
        updateStatus(toggle.checked);
    });

    // Handle toggle changes
    toggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        chrome.storage.local.set({ renderEnabled: enabled });
        updateStatus(enabled);

        // Notify content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'TOGGLE_RENDER',
                    enabled: enabled
                });
            }
        });
    });

    function updateStatus(enabled) {
        status.textContent = enabled ? 'Preview is active' : 'Preview is disabled';
        status.style.color = enabled ? '#48BB78' : '#718096';
    }
}); 