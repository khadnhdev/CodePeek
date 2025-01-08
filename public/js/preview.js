document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.preview-tab');
    const codes = document.querySelectorAll('.preview-code');
    const runButton = document.querySelector('.run-button');
    const refreshButton = document.querySelector('.refresh-button');
    const previewFrame = document.getElementById('previewFrame');

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            codes.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const targetCode = document.querySelector(`.preview-code.${tab.dataset.tab}`);
            targetCode.classList.add('active');
        });
    });

    // Run code
    runButton.addEventListener('click', () => {
        const activeCode = document.querySelector('.preview-code.active');
        const code = activeCode.textContent;
        const type = activeCode.classList[1];

        if (type === 'html') {
            previewFrame.srcdoc = code;
        } else {
            // Handle other code types through API
            fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code })
            })
            .then(res => res.json())
            .then(data => {
                previewFrame.srcdoc = `<pre>${data.output || data.error}</pre>`;
            });
        }
    });

    // Refresh preview
    refreshButton.addEventListener('click', () => {
        previewFrame.srcdoc = previewFrame.srcdoc;
    });
}); 