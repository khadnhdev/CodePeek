// const RENDER_API = 'https://live.jobsum.works/api';
const RENDER_API = 'http://localhost:3000/api';
//const RENDER_API = 'https://codepeek.jobsum.works/api';

function debugLog(message, data = '') {
    const styles = [
        'color: #00ff00',
        'background: #000',
        'font-size: 14px',
        'font-weight: bold',
        'padding: 4px 8px',
        'border-radius: 4px'
    ].join(';');

    if (data) {
        console.log(`%c[Preview Debug] ${message}`, styles, data);
    } else {
        console.log(`%c[Preview Debug] ${message}`, styles);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RENDER_CODE') {
        handleRenderCode(message.payload, sender, sendResponse);
        return true; // Giữ kết nối cho async response
    }
});

async function handleRenderCode({ code, nodeId }, sender, sendResponse) {
    try {
        debugLog('Sending upsert request:', { nodeId, codePreview: code.substring(0, 100) + '...' });

        const response = await fetch(`${RENDER_API}/render/upsert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                content: code,
                id: nodeId
            })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        debugLog('Upsert response:', data);

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