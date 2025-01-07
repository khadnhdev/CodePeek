class CodeDetector {
    constructor() {
        this.processedNodes = new Set();
        this.mermaidKeywords = [
            'graph ',
            'flowchart ',
            'sequenceDiagram',
            'classDiagram',
            'stateDiagram',
            'gantt',
            'pie',
            'gitGraph'
        ];

        // Các pattern thường thấy trong config files
        this.configPatterns = [
            /^server\s*{/i,
            /^location\s+/i,
            /^<VirtualHost/i,
            /^Listen\s+\d+/i,
            /^DocumentRoot/i,
            /^ProxyPass/i,
            /^RewriteRule/i,
            /^worker_processes/i,
            /^events\s*{/i,
            /^http\s*{/i,
            /^upstream\s+/i,
            /^proxy_pass/i,
            /^<Directory/i,
            /^ErrorLog/i,
            /^CustomLog/i,
            /^LoadModule/i
        ];
    }

    isHTML(text) {
        const trimmed = text.trim();
        
        // Kiểm tra xem có phải là config file không
        if (this.isConfigFile(trimmed)) {
            return false;
        }

        // Kiểm tra HTML
        const hasHtmlIndicators = (
            // Có DOCTYPE
            trimmed.toLowerCase().includes('<!doctype html') ||
            // Hoặc có thẻ html
            trimmed.toLowerCase().includes('<html') ||
            // Hoặc có các thẻ HTML phổ biến
            /<(div|span|p|a|img|table|form|input|button|h[1-6])\b/i.test(trimmed)
        );

        // Kiểm tra cấu trúc thẻ HTML cơ bản
        const hasHtmlStructure = (
            trimmed.startsWith('<') && 
            trimmed.includes('>') && 
            (trimmed.includes('</') || trimmed.includes('/>'))
        );

        return hasHtmlIndicators && hasHtmlStructure;
    }

    isMermaid(text) {
        const trimmed = text.trim();
        
        // Kiểm tra xem có phải là config file không
        if (this.isConfigFile(trimmed)) {
            return false;
        }

        return this.mermaidKeywords.some(keyword => 
            trimmed.toLowerCase().startsWith(keyword.toLowerCase())
        );
    }

    isConfigFile(text) {
        // Kiểm tra các pattern đặc trưng của config files
        return this.configPatterns.some(pattern => pattern.test(text));
    }

    isCodeBlock(node) {
        // Bỏ qua các elements có class hoặc data attribute liên quan đến config
        const classAndAttrs = (node.className || '') + ' ' + (node.getAttribute('data-language') || '');
        if (/\b(config|conf|nginx|apache|httpd)\b/i.test(classAndAttrs)) {
            return false;
        }

        if (node.tagName === 'PRE' || node.tagName === 'CODE' ||
            node.className.includes('code') || 
            node.className.includes('snippet')) {
            
            const text = node.textContent.trim();
            return this.isHTML(text) || this.isMermaid(text);
        }
        return false;
    }

    extractCode(node) {
        let code = node.textContent.trim();
        // Loại bỏ các dòng copy button hoặc language indicator
        code = code.replace(/^(Copy code|Copy to clipboard|javascript|html|css)$/gm, '').trim();
        return code;
    }

    hasBeenProcessed(node) {
        return this.processedNodes.has(node);
    }

    markAsProcessed(node) {
        this.processedNodes.add(node);
    }
} 