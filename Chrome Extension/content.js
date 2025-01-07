const RECHECK_INTERVAL = 2000;
const processedNodes = new Map();
const detector = new CodeDetector();
let renderHistory = [];
let currentPreviewContainer = null;

function createPreviewContainer() {
    const container = document.createElement('div');
    container.id = 'code-preview-container';
    container.className = 'code-preview';
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 600px;
        background: white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        border-radius: 8px;
        z-index: 999999;
        resize: both;
        overflow: auto;
        min-width: 400px;
        min-height: 300px;
        max-width: 90vw;
        max-height: 90vh;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        padding: 8px;
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        border-radius: 8px 8px 0 0;
    `;

    const title = document.createElement('div');
    title.textContent = 'Preview';
    title.style.cssText = `
        font-weight: 500;
        font-size: 14px;
    `;

    const controls = document.createElement('div');
    controls.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
    `;

    // History dropdown
    const historySelect = document.createElement('select');
    historySelect.style.cssText = `
        padding: 2px;
        font-size: 12px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
    `;
    historySelect.onchange = (e) => {
        const url = e.target.value;
        const iframe = container.querySelector('iframe');
        if (iframe) iframe.src = url;
    };

    // Open in Browser button
    const openBrowserBtn = document.createElement('button');
    openBrowserBtn.innerHTML = '↗';
    openBrowserBtn.title = 'Open in Browser';
    openBrowserBtn.style.cssText = `
        border: none;
        background: none;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        color: #666;
        display: flex;
        align-items: center;
    `;
    openBrowserBtn.onclick = (e) => {
        e.stopPropagation();
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.src) {
            window.open(iframe.src, '_blank');
        }
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        border: none;
        background: none;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        color: #666;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        height: 500px;
        position: relative;
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    `;

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        container.remove();
        currentPreviewContainer = null;
    };

    // Make container draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.onmousedown = dragStart;

    function dragStart(e) {
        initialX = e.clientX - container.offsetLeft;
        initialY = e.clientY - container.offsetTop;
        isDragging = true;

        document.onmousemove = drag;
        document.onmouseup = dragEnd;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            const maxX = window.innerWidth - container.offsetWidth;
            const maxY = window.innerHeight - container.offsetHeight;
            currentX = Math.min(Math.max(0, currentX), maxX);
            currentY = Math.min(Math.max(0, currentY), maxY);

            container.style.left = currentX + 'px';
            container.style.top = currentY + 'px';
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        }
    }

    function dragEnd() {
        isDragging = false;
        document.onmousemove = null;
        document.onmouseup = null;
    }

    // Assemble the components
    controls.appendChild(historySelect);
    controls.appendChild(openBrowserBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);
    content.appendChild(iframe);
    container.appendChild(header);
    container.appendChild(content);

    // Thêm resize observer để đảm bảo iframe luôn fit với container
    const resizeObserver = new ResizeObserver(() => {
        if (container.style.height) {
            content.style.height = `${parseInt(container.style.height) - header.offsetHeight}px`;
        }
    });
    resizeObserver.observe(container);

    return { container, iframe, historySelect };
}

function updateHistory(url, timestamp = new Date()) {
    // Thêm vào history
    renderHistory.unshift({ url, timestamp });
    // Giới hạn history 20 items
    renderHistory = renderHistory.slice(0, 20);

    // Cập nhật dropdown nếu container tồn tại
    if (currentPreviewContainer) {
        const select = currentPreviewContainer.querySelector('select');
        select.innerHTML = renderHistory.map((item, index) => `
            <option value="${item.url}" ${index === 0 ? 'selected' : ''}>
                ${new Date(item.timestamp).toLocaleTimeString()} - Preview ${renderHistory.length - index}
            </option>
        `).join('');
    }
}

async function processCodeBlock(node) {
    const currentTime = Date.now();
    
    if (processedNodes.has(node)) {
        const lastProcessed = processedNodes.get(node);
        if (currentTime - lastProcessed < RECHECK_INTERVAL) return;
    }

    const code = detector.extractCode(node);
    if (!code) return;

    // Kiểm tra xem có phải HTML hoặc Mermaid không
    if (!detector.isHTML(code) && !detector.isMermaid(code)) {
        return; // Bỏ qua nếu không phải HTML hoặc Mermaid
    }

    node.dataset.lastContent = code;
    
    chrome.runtime.sendMessage({
        type: 'RENDER_CODE',
        payload: { 
            code,
            nodeId: node.dataset.previewId || crypto.randomUUID()
        }
    }, response => {
        if (response && response.success) {
            if (!currentPreviewContainer) {
                const { container, iframe } = createPreviewContainer();
                document.body.appendChild(container);
                currentPreviewContainer = container;
                iframe.src = response.url;
            } else {
                const iframe = currentPreviewContainer.querySelector('iframe');
                if (iframe) iframe.src = response.url;
            }

            updateHistory(response.url);
            node.dataset.previewId = response.previewId;
            processedNodes.set(node, currentTime);
        }
    });
}

// Thêm hàm mới để cập nhật content
async function updateRenderContent(id, code) {
    try {
        const response = await fetch(`${RENDER_API.replace('/render', '')}/render/${id}/content`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: code })
        });

        if (!response.ok) {
            throw new Error('Failed to update content');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating content:', error);
        return { success: false, error: error.message };
    }
}

// Sửa lại hàm checkNodeChanges
function checkNodeChanges(node) {
    if (!node || !node.textContent) return;
    
    const currentContent = detector.extractCode(node);
    const lastContent = node.dataset.lastContent;
    const previewId = node.dataset.previewId;

    if (currentContent !== lastContent && previewId) {
        // Nếu đã có previewId, update content trực tiếp
        updateRenderContent(previewId, currentContent).then(response => {
            if (response.success) {
                node.dataset.lastContent = currentContent;
            }
        });
    } else if (currentContent !== lastContent) {
        // Nếu chưa có previewId, tạo render mới
        processCodeBlock(node);
    }
}

// Theo dõi các thay đổi trong DOM
const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        // Xử lý các nodes mới được thêm vào
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'PRE' || node.tagName === 'CODE') {
                    processCodeBlock(node);
                }
                
                node.querySelectorAll('pre, code').forEach(element => {
                    processCodeBlock(element);
                });
            }
        });

        // Kiểm tra thay đổi nội dung
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
            let targetNode = mutation.target;
            if (targetNode.nodeType === Node.TEXT_NODE) {
                targetNode = targetNode.parentNode;
            }
            if(targetNode.tagName) {
                if (targetNode.tagName === 'PRE' || targetNode.tagName === 'CODE') {
                    checkNodeChanges(targetNode);
                }
            }
        }
    });
});

// Cấu hình observer để theo dõi mọi thay đổi
observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true
});

// Kiểm tra định kỳ các code blocks
setInterval(() => {
    document.querySelectorAll('pre, code').forEach(node => {
        checkNodeChanges(node);
    });
}, RECHECK_INTERVAL);

// Xử lý các code block có sẵn khi trang load
document.querySelectorAll('pre, code').forEach(block => {
    processCodeBlock(block);
});

// Xử lý khi trang thay đổi nội dung động (ví dụ: SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('URL changed, rescanning page...');
        document.querySelectorAll('pre, code').forEach(block => {
            processCodeBlock(block);
        });
    }
}).observe(document, { subtree: true, childList: true }); 