// const RENDER_API = 'https://live.jobsum.works/api';
const RENDER_API = 'http://localhost:3000/api';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RENDER_CODE') {
        handleRenderCode(message.payload, sender, sendResponse);
        return true; // Giữ kết nối cho async response
    }
});

async function handleRenderCode({ code, nodeId }, sender, sendResponse) {
    try {
        const response = await fetch(`${RENDER_API}/render`, {
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
            previewId: data.id
        });
    } catch (error) {
        console.error('Failed to render code:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
} 