// Constants
const API_KEY = "AIzaSyBy-nCyvDpZUX_5lZYT2aeo3xMeTLAyXi0"
const CONFIG = {
    MAX_COMMENTS: 20,
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    SELECTORS: {
        PRIMARY: 'ytd-comment-thread-renderer #content-text',
        FALLBACK: 'yt-formatted-string#content-text',
        SHORTS: 'ytd-comment-view-model #content-text'
    }
};

// Main event listener
document.addEventListener("DOMContentLoaded", () => {
    setupUI();
    attachEventListeners();
});

function setupUI() {
    // Add progress indicator
    const progressBar = document.createElement('div');
    progressBar.id = 'progress';
    progressBar.style.display = 'none';
    document.body.appendChild(progressBar);
}

function attachEventListeners() {
    document.getElementById("generateCommentBtn").addEventListener("click", handleGenerateComment);
}

async function handleGenerateComment() {
    const resultElement = document.getElementById("generatedComment");
    const progressBar = document.getElementById("progress");
    
    try {
        // Validate we're on YouTube
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        
        if (!tab?.url?.includes('youtube.com')) {
            throw new Error("Please navigate to a YouTube page");
        }
        
        const isShorts = tab.url.includes('/shorts/');
        
        // UI feedback
        updateUIState('scraping');
        
        // Execute scraping
        const comments = await executeScrapingWithRetry(tab.id, isShorts);
        
        // Generate comment
        updateUIState('generating');
        const generatedComment = await generateComment(comments);
        
        // Success state
        updateUIState('success', generatedComment);

    } catch (error) {
        handleError(error);
    }
}

async function executeScrapingWithRetry(tabId, isShorts, retryCount = 2) {
    for (let i = 0; i < retryCount; i++) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: scrapeComments,
                args: [CONFIG.MAX_COMMENTS, CONFIG.SELECTORS, isShorts]
            });

            const comments = results[0]?.result;
            if (comments?.length) {
                return comments;
            }

            // If no comments found, try scrolling
            await chrome.scripting.executeScript({
                target: { tabId },
                func: autoScroll
            });

            // Wait for content to load
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            if (i === retryCount - 1) throw error;
            console.warn(`Retry ${i + 1} failed:`, error);
        }
    }
    
    throw new Error("Unable to find comments after multiple attempts");
}

function scrapeComments(maxComments, selectors, isShorts) {
    const comments = new Set();

    function extractComments(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const text = element.innerText.trim();
            if (text && text.length > 5) {  // Filter out very short comments
                comments.add(text);
            }
        });
    }

    // Use appropriate selector based on page type
    if (isShorts) {
        extractComments(selectors.SHORTS);
    } else {
        extractComments(selectors.PRIMARY);
        if (comments.size < maxComments) {
            extractComments(selectors.FALLBACK);
        }
    }

    return Array.from(comments).slice(0, maxComments);
}

function autoScroll() {
    const scrollHeight = Math.max(
        document.body.scrollHeight, 
        document.documentElement.scrollHeight
    );
    window.scrollTo(0, scrollHeight / 3);  // Scroll to load comments section
}

async function generateComment(comments) {
    
    if (!API_KEY) {
        throw new Error("API key not configured");
    }

    const prompt = `
        Based on these YouTube comments, generate a unique, engaging comment that:
        - Matches the tone and style of the existing comments
        - Adds value to the discussion
        - Is authentic and natural sounding
        - Is between 1-3 sentences long
        
        Comments for reference: ${comments.join(" | ")}
    `;

    const response = await fetch(`${CONFIG.API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 100
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error (${response.status}): ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return extractGeneratedText(data);
}

function extractGeneratedText(data) {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('Invalid API response format');
    }
    return `${text.trim()}\n\n-Pratyush Khanal`;
}

function updateUIState(state, content = '') {
    const resultElement = document.getElementById("generatedComment");
    const progressBar = document.getElementById("progress");

    switch (state) {
        case 'scraping':
            progressBar.style.display = 'block';
            resultElement.textContent = "Analyzing video comments...";
            break;
        case 'generating':
            resultElement.textContent = "Crafting a unique comment...";
            break;
        case 'success':
            progressBar.style.display = 'none';
            resultElement.textContent = content;
            break;
        case 'error':
            progressBar.style.display = 'none';
            resultElement.className = 'error';
            resultElement.textContent = content;
            break;
    }
}

function handleError(error) {
    console.error('Extension error:', error);
    updateUIState('error', `Error: ${error.message}`);
}