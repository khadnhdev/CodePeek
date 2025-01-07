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
    }

    isHTML(text) {
        const trimmed = text.trim();
        return (trimmed.startsWith('<') && trimmed.includes('>')) &&
               (trimmed.includes('</') || trimmed.includes('/>') || 
                trimmed.toLowerCase().includes('<!doctype html') ||
                trimmed.toLowerCase().includes('<html'));
    }

    isMermaid(text) {
        const trimmed = text.trim();
        return this.mermaidKeywords.some(keyword => 
            trimmed.toLowerCase().startsWith(keyword.toLowerCase())
        );
    }

    isCodeBlock(node) {
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