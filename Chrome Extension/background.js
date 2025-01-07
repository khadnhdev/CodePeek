const RENDER_API = 'http://localhost:3000/api/render';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RENDER_CODE') {
        handleRenderCode(message.payload, sender, sendResponse);
        return true; // Giữ kết nối cho async response
    }
});

async function handleRenderCode({ code, nodeId }, sender, sendResponse) {
    try {
        const response = await fetch(RENDER_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: code })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        sendResponse({
            success: true,
            url: data.url,
            previewId: nodeId
        });
    } catch (error) {
        console.error('Failed to render code:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
} 