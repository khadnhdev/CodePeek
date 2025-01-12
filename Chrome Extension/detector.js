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

        // Thêm pattern để nhận dạng SVG
        this.svgPatterns = [
            /<svg[^>]*>/i,
            /<svg\s+xmlns=/i,
            /<svg\s+width=/i,
            /<svg\s+height=/i,
            /<svg\s+viewBox=/i
        ];

        // Thêm patterns để nhận dạng React code
        this.reactPatterns = [
            // JSX syntax
            /<[A-Z][A-Za-z]*\s*[^>]*>/,
            // React hooks
            /use[A-Z][A-Za-z]*/,
            // React components
            /class\s+[A-Z][A-Za-z]*\s+extends\s+React\.Component/,
            /function\s+[A-Z][A-Za-z]*\s*\([^)]*\)\s*{/,
            // Common React imports
            /import\s+.*?from\s+['"]react['"]/,
            /import\s+.*?from\s+['"]react-dom['"]/,
            // React state và props
            /this\.props\./,
            /this\.state\./,
            /setState\(/,
            // React lifecycle methods
            /componentDidMount|componentDidUpdate|componentWillUnmount/
        ];
    }

    isHTML(text) {
        const trimmed = text.trim();
        
        // Kiểm tra xem có phải là config file không
        if (this.isConfigFile(trimmed)) {
            return false;
        }

        // Kiểm tra SVG trước khi kiểm tra HTML
        if (this.isSVG(trimmed)) {
            return false;
        }

        // Kiểm tra HTML
        const hasHtmlIndicators = (
            trimmed.toLowerCase().includes('<!doctype html') ||
            trimmed.toLowerCase().includes('<html') ||
            /<(div|span|p|a|img|table|form|input|button|h[1-6])\b/i.test(trimmed)
        );

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

    isSVG(text) {
        const trimmed = text.trim();
        
        // Kiểm tra xem có phải là config file không
        if (this.isConfigFile(trimmed)) {
            return false;
        }

        // Kiểm tra có start với <svg và end với </svg>
        const hasSVGTags = trimmed.startsWith('<svg') && trimmed.endsWith('</svg>');
        
        // Kiểm tra các pattern đặc trưng của SVG
        const hasSVGPatterns = this.svgPatterns.some(pattern => pattern.test(trimmed));

        // Sửa lại logic kiểm tra tính hợp lệ của SVG
        const isValidSVG = (
            hasSVGTags && 
            hasSVGPatterns &&
            // Sửa lại điều kiện này - điều kiện cũ có lỗi logic
            (trimmed.indexOf('<svg') < trimmed.lastIndexOf('</svg>'))
        );

        // Đơn giản hóa điều kiện kiểm tra SVG hoàn chỉnh
        const isCompleteSVG = (
            isValidSVG &&
            // Đếm số lượng dấu < và > phải bằng nhau
            (trimmed.match(/</g) || []).length === (trimmed.match(/>/g) || []).length
        );

        // Thêm log để debug
        // console.log('SVG Check:', {
        //     text: trimmed.substring(0, 100),
        //     hasSVGTags,
        //     hasSVGPatterns,
        //     isValidSVG,
        //     isCompleteSVG
        // });

        return isCompleteSVG;
    }

    isReact(text) {
        const trimmed = text.trim();
        
        // Kiểm tra xem có phải là config file không
        if (this.isConfigFile(trimmed)) {
            return false;
        }

        // Đếm số lượng patterns React match được
        const matchCount = this.reactPatterns.reduce((count, pattern) => {
            return count + (pattern.test(trimmed) ? 1 : 0);
        }, 0);

        // Nếu có ít nhất 2 patterns match thì có khả năng cao là React code
        return matchCount >= 2;
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
            
            // Thêm log để debug
            console.log('Checking code block:', {
                isSVG: this.isSVG(text),
                isHTML: this.isHTML(text),
                isMermaid: this.isMermaid(text),
                isReact: this.isReact(text),
                preview: text.substring(0, 100)
            });

            // Thêm kiểm tra React vào điều kiện return
            return this.isSVG(text) || 
                   this.isHTML(text) || 
                   this.isMermaid(text) ||
                   this.isReact(text);
        }
        return false;
    }

    extractCode(node) {
        let code = node.textContent.trim();
        
        // Loại bỏ các dòng copy button hoặc language indicator
        code = code.replace(/^(Copy code|Copy to clipboard|javascript|html|css|svg|xml|Copy XML|XML|xmlCopy code)$/gm, '').trim();
        code = code.replace("xmlCopy code",'');
        code = code.replace("javascriptCopied",'');
        // Nếu là SVG, đảm bảo lấy toàn bộ nội dung SVG và loại bỏ comments XML
        if (this.isSVG(code)) {
            // Loại bỏ XML comments trước khi extract SVG
            code = code.replace(/<!--[\s\S]*?-->/g, '');
            
            const svgStart = code.indexOf('<svg');
            const svgEnd = code.lastIndexOf('</svg>') + 6;
            if (svgStart >= 0 && svgEnd > svgStart) {
                code = code.substring(svgStart, svgEnd);
            }
            
            // Clean up khoảng trắng thừa
            code = code.replace(/\s+/g, ' ')
                      .replace(/>\s+</g, '><')
                      .trim();
        }
        // Thêm xử lý đặc biệt cho React code
        else if (this.isReact(code)) {
            // Tìm component chính
            const componentMatch = code.match(
                // Tìm functional component
                /(?:function|const)\s+([A-Z][A-Za-z]*)\s*(?:=|\()/
                // Hoặc class component
                || /class\s+([A-Z][A-Za-z]*)\s+extends\s+React\.Component/
            );

            if (componentMatch) {
                const componentName = componentMatch[1];
                
                // Tìm điểm bắt đầu và kết thúc của component
                let startIndex = code.indexOf(componentMatch[0]);
                let endIndex = code.length;
                let braceCount = 0;
                let inComponent = false;

                // Tìm toàn bộ nội dung component
                for (let i = startIndex; i < code.length; i++) {
                    if (code[i] === '{') {
                        braceCount++;
                        inComponent = true;
                    } else if (code[i] === '}') {
                        braceCount--;
                        if (inComponent && braceCount === 0) {
                            endIndex = i + 1;
                            break;
                        }
                    }
                }

                // Thêm phần render vào cuối nếu chưa có
                let extractedCode = code.substring(startIndex, endIndex).trim();
                if (!extractedCode.includes('ReactDOM.createRoot')) {
                    extractedCode += `\n\n// Render component
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<${componentName} />);`;
                }

                code = extractedCode;
            }

            // Thêm imports nếu chưa có
            if (!code.includes('import React')) {
                code = `const { useState, useEffect } = React;\n\n${code}`;
            }
        }
        
        return code;
    }

    hasBeenProcessed(node) {
        return this.processedNodes.has(node);
    }

    markAsProcessed(node) {
        this.processedNodes.add(node);
    }
} 