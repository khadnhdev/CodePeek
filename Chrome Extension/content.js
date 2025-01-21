const RECHECK_INTERVAL = 2000;
const processedNodes = new Map();
const processedContents = new Set();
const detector = new CodeDetector();
let renderHistory = [];
let currentPreviewContainer = null;

// Thêm biến để track trạng thái render
let renderEnabled = true;

// Load initial state
chrome.storage.local.get(['renderEnabled'], (result) => {
    // Nếu chưa có giá trị trong storage, giữ nguyên true
    renderEnabled = result.renderEnabled === undefined ? true : result.renderEnabled;
    
    // Nếu đang tắt và có container, ẩn container
    if (!renderEnabled && currentPreviewContainer) {
        currentPreviewContainer.style.display = 'none';
    }
});

// Listen for toggle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_RENDER') {
        renderEnabled = message.enabled;
        debugLog('Render toggled:', renderEnabled);
        
        // Hide/show container based on toggle
        if (!renderEnabled && currentPreviewContainer) {
            currentPreviewContainer.style.display = 'none';
        } else if (renderEnabled && currentPreviewContainer) {
            currentPreviewContainer.style.display = 'block';
        }
    }
});

var CODEPEEK_DEBUG = false;

function debugLog(message, data = '') {
    const styles = [
        'color: #00ff00',
        'background: #000',
        'font-size: 14px',
        'font-weight: bold',
        'padding: 4px 8px',
        'border-radius: 4px'
    ].join(';');

    if (CODEPEEK_DEBUG && data) {
        console.log(`%c[Preview Debug] ${message}`, styles, data);
    } else if (CODEPEEK_DEBUG) {
        console.log(`%c[Preview Debug] ${message}`, styles);
    }
}

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
        transition: transform 0.3s ease;
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
    title.textContent = 'Live Preview';
    title.style.cssText = `
        font-weight: 500;
        font-size: 14px;
        color: black;
    `;

    const controls = document.createElement('div');
    controls.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
    `;

    // Thêm nút collapse
    const collapseBtn = document.createElement('button');
    collapseBtn.innerHTML = '−'; // Dấu trừ Unicode
    collapseBtn.title = 'Collapse';
    collapseBtn.style.cssText = `
        border: none;
        background: none;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        color: #666;
        display: flex;
        align-items: center;
        width: 24px;
        height: 24px;
        justify-content: center;
    `;

    let isCollapsed = false;
    const content = document.createElement('div');
    content.style.cssText = `
        height: 500px;
        position: relative;
        transition: height 0.3s ease;
    `;

    collapseBtn.onclick = (e) => {
        e.stopPropagation();
        isCollapsed = !isCollapsed;
        
        if (isCollapsed) {
            content.style.height = '0';
            collapseBtn.innerHTML = '+'; // Dấu cộng khi đã collapse
            container.style.minHeight = 'unset';
            container.style.height = 'auto';
            container.style.resize = 'none';
        } else {
            content.style.height = '500px';
            collapseBtn.innerHTML = '−'; // Dấu trừ khi expand
            container.style.minHeight = '300px';
            container.style.resize = 'both';
        }
    };

    // Existing buttons
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
    controls.appendChild(collapseBtn);
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

    openBrowserBtn.onclick = (e) => {
        e.stopPropagation();
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.src) {
            window.open(iframe.src, '_blank');
        }
    };

    return { container, iframe };
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

// Thêm class để quản lý code blocks
class CodeBlockManager {
    constructor() {
        this.blocks = [];
    }

    // Thêm code block mới
    add(code, node, hash) {
        this.blocks.push({
            code,
            hash,
            node,
            timestamp: Date.now()
        });
    }

    // Kiểm tra code block đã tồn tại
    exists(hash) {
        return this.blocks.some(block => block.hash === hash);
    }

    // Xóa tất cả blocks
    clear() {
        this.blocks = [];
    }

    // Lấy block theo hash
    getByHash(hash) {
        return this.blocks.find(block => block.hash === hash);
    }

    // Debug info
    getDebugInfo() {
        return {
            totalBlocks: this.blocks.length,
            blocks: this.blocks.map(b => ({
                hash: b.hash,
                preview: b.code.substring(0, 50) + '...',
                timestamp: new Date(b.timestamp).toISOString()
            }))
        };
    }
}

// Khởi tạo manager
const codeBlockManager = new CodeBlockManager();

async function processCodeBlock(node) {
    if (!renderEnabled) return;
    
    const currentTime = Date.now();
    
    if (processedNodes.has(node)) {
        const lastProcessed = processedNodes.get(node);
        if (currentTime - lastProcessed < RECHECK_INTERVAL) return;
    }

    const code = detector.extractCode(node);
    if (!code) return;

    const isHTML = detector.isHTML(code);
    const isMermaid = detector.isMermaid(code);
    const isSVG = detector.isSVG(code);
    const isReact = detector.isReact(code);
    const isMarkmap = detector.isMarkmap(code);

    if (!isHTML && !isMermaid && !isSVG && !isReact && !isMarkmap) {
        return;
    }

    const contentHash = hashCode(code);

    // Kiểm tra trong manager
    if (codeBlockManager.exists(contentHash)) {
        debugLog('Code block already exists:', {
            hash: contentHash,
            preview: code.substring(0, 50) + '...',
            type: isReact ? 'React' : isHTML ? 'HTML' : isMermaid ? 'Mermaid' : isMarkmap ? 'Markmap' : 'SVG'
        });
        return;
    }

    debugLog('Processing new code block:', { 
        hasContainer: !!currentPreviewContainer,
        contentHash,
        preview: code.substring(0, 50) + '...',
        type: isReact ? 'React' : isHTML ? 'HTML' : isMermaid ? 'Mermaid' : isMarkmap ? 'Markmap' :  'SVG'
    });

    node.dataset.lastContent = code;
    node.dataset.contentHash = contentHash;
    node.dataset.codeType = isReact ? 'react' : isHTML ? 'html' : isMermaid ? 'mermaid' : isMarkmap ? 'markmap' : 'svg';
    
    const previewId = currentPreviewContainer?.dataset.previewId;

    // Gọi API upsert với thông tin về loại code
    chrome.runtime.sendMessage({
        type: 'RENDER_CODE',
        payload: { 
            code,
            nodeId: previewId || undefined,
            codeType: isReact ? 'react' : isHTML ? 'html' : isMermaid ? 'mermaid' : isMarkmap ? 'markmap' : 'svg'
        }
    }, response => {
        if (response && response.success) {
            debugLog('Upsert response:', response);

            if (!currentPreviewContainer) {
                debugLog('Creating new container');
                const { container, iframe } = createPreviewContainer();
                iframe.src = response.url;
                document.body.appendChild(container);
                currentPreviewContainer = container;
                container.dataset.previewId = response.previewId;
                container.dataset.codeType = isReact ? 'react' : isHTML ? 'html' : isMermaid ? 'mermaid' : isMarkmap ? 'markmap' : 'svg';
            }

            // Thêm vào manager
            codeBlockManager.add(code, node, contentHash);
            processedNodes.set(node, currentTime);

            debugLog('Code blocks status:', codeBlockManager.getDebugInfo());
        }
    }); 
}

// Hàm tạo hash từ string
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

// Sửa lại hàm checkNodeChanges
function checkNodeChanges(node) {
    if (!node || !node.textContent) return;
    
    const currentContent = detector.extractCode(node);
    if (!currentContent) return;

    const currentHash = hashCode(currentContent);

    // Kiểm tra xem nội dung này đã được xử lý chưa
    const existingBlock = codeBlockManager.getByHash(currentHash);
    if (existingBlock) {
        // Nội dung này đã được xử lý, cập nhật dataset của node
        node.dataset.contentHash = currentHash;
        node.dataset.lastContent = currentContent;
        return;
    }

    // So sánh với nội dung cuối cùng được lưu trong node
    const lastContent = node.dataset.lastContent;
    if (!lastContent || !isContentEqual(lastContent, currentContent)) {
        debugLog('Content changed:', {
            nodeId: node.dataset.nodeId,
            preview: currentContent.substring(0, 50) + '...'
        });
        processCodeBlock(node);
    }
}

// Hàm so sánh nội dung chi tiết
function isContentEqual(oldContent, newContent) {
    // Chuẩn hóa content bằng cách:
    const normalize = (content) => {
        return content
            .trim() // Bỏ khoảng trắng đầu cuối
            .replace(/\s+/g, ' ') // Gộp nhiều khoảng trắng thành 1
            .replace(/\n\s*/g, '\n') // Chuẩn hóa xuống dòng
            .replace(/>\s+</g, '><'); // Bỏ khoảng trắng giữa các tags
    };

    return normalize(oldContent) === normalize(newContent);
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

// Thêm biến để track trạng thái scanning
let isScanning = false;

// Hàm scan page với debounce và safety checks
async function scanPage() {
    if (isScanning) {
        debugLog('Already scanning, skip');
        return;
    }

    try {
        isScanning = true;
        debugLog('Scanning page for code blocks...');

        // Tìm tất cả các code blocks
        const codeBlocks = document.querySelectorAll('pre, code');
        debugLog(`Found ${codeBlocks.length} potential code blocks`);

        // Xử lý từng block
        for (const block of codeBlocks) {
            await processCodeBlock(block);
        }

    } catch (error) {
        debugLog('Error scanning page:', error);
    } finally {
        isScanning = false;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced scan function
const debouncedScan = debounce(scanPage, 1000);

// Xử lý khi trang thay đổi nội dung động
const pageObserver = new MutationObserver((mutations) => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        debugLog('URL changed, resetting code blocks');
        codeBlockManager.clear();
        processedContents.clear();
        debouncedScan();
    }
    // Kiểm tra các thay đổi DOM quan trọng
    const shouldRescan = mutations.some(mutation => {
        // Thay đổi lớn trong DOM
        if (mutation.addedNodes.length > 0) {
            const hasCodeBlocks = Array.from(mutation.addedNodes).some(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return false;
                return node.tagName === 'PRE' || 
                       node.tagName === 'CODE' ||
                       node.querySelector('pre, code');
            });
            return hasCodeBlocks;
        }
        return false;
    });

    if (shouldRescan) {
        debugLog('Significant DOM changes detected, rescanning...');
        debouncedScan();
    }
});

// Cấu hình page observer
pageObserver.observe(document, {
    childList: true,
    subtree: true
});

// Scan ban đầu khi script load
debugLog('Initial page scan');
scanPage();

// Scan định kỳ nhưng với interval dài hơn
setInterval(() => {
    debugLog('Periodic scan check');
    if (!isScanning) {
        debouncedScan();
    }
}, RECHECK_INTERVAL * 5); // 10 seconds 