// Copy code function
function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const icon = button.querySelector('i');
        icon.className = 'fas fa-check';
        setTimeout(() => {
            icon.className = 'fas fa-copy';
        }, 2000);
    });
} 

// Add JSON syntax highlighting
function highlightJSON() {
    document.querySelectorAll('.code-block code').forEach(block => {
        if (block.textContent.trim().startsWith('{')) {
            let content = block.textContent;
            content = content.replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:');
            content = content.replace(/: "([^"]+)"/g, ': <span class="json-string">"$1"</span>');
            content = content.replace(/[{},]/g, '<span class="json-punctuation">$&</span>');
            block.innerHTML = content;
        }
    });
}

// Run when page loads
document.addEventListener('DOMContentLoaded', highlightJSON); 