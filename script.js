// 0FluffCook V4.0 Logic - Swiping & Share

// --- STATE MANAGEMENT ---
let recipes = JSON.parse(localStorage.getItem('gourmet_recipes') || '[]');
let apiKey = localStorage.getItem('gourmet_key') || '';
let customRules = localStorage.getItem('gourmet_rules') || ''; 
let currentRecipeId = null;
let isEditingId = null;

// --- SWIPE GESTURE STATE ---
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 80;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if(apiKey) document.getElementById('apiKeyInput').value = apiKey;
    if(customRules) document.getElementById('customRulesInput').value = customRules; 
    render();
});

// --- SETTINGS FUNCTIONS ---
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function saveKey() {
    apiKey = document.getElementById('apiKeyInput').value.trim();
    localStorage.setItem('gourmet_key', apiKey);
    if(apiKey) toggleSettings();
}

// NEW FUNCTION: Save Custom Rules
function saveRules() {
    customRules = document.getElementById('customRulesInput').value.trim();
    localStorage.setItem('gourmet_rules', customRules);
}

// --- SCRAPING ENGINE (MULTI-PROXY) ---
async function fetchHTML(targetUrl) {
    // Strategy 1: Corsproxy.io (Fastest)
    try {
        const p1 = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(p1);
        if(res.ok) return await res.text();
    } catch(e) { console.warn("Proxy 1 failed"); }

    // Strategy 2: AllOrigins (Fallback)
    try {
        const p2 = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(p2);
        const data = await res.json();
        if(data.contents) return data.contents;
    } catch(e) { console.warn("Proxy 2 failed"); }

    return null; // Both failed
}

// --- NEW FIX: DOMParser HTML CLEANING UTILITY (Surgical Clean) ---
function cleanHtmlForAi(html) {
    if (!html) return '';
    
    // 1. Create a temporary, safe DOM document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 2. Define high-noise selectors to remove (Surgical removal)
    const selectorsToRemove = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'img', // Core noise
        'header', 'footer', 'nav', 'aside', // Structural noise
        '[data-nosnippet]', '.ad', '#comments', '[class*="ad-"]' // Common ad/tracking/comment noise
    ];

    selectorsToRemove.forEach(selector => {
        doc.querySelectorAll(selector).forEach(element => {
            element.remove();
        });
    });

    // 3. Get the cleaned content back (use innerText for massive token reduction)
    let cleanedText = doc.body.innerText || doc.documentElement.innerText;
    
    // 4. Clean up whitespace and unnecessary lines
    cleanedText = cleanedText.replace(/\s\s+/g, ' ').trim();
    
    return cleanedText;
}

// --- AI CORE HANDLER (Internal utility) ---
async function _callGeminiAPI(prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0].content) {
        throw new Error("AI returned an empty response. Check API Key or Quota.");
    }

    const rawText = data.candidates[0].content.parts[0].text;
    const jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let recipeData;
    try {
        recipeData = JSON.parse(jsonStr);
    } catch (jsonErr) {
        throw new Error("Failed to parse recipe JSON. AI output was malformed.");
    }
    return recipeData;
}


// --- MAIN LOGIC (COOK - EXTRACTION) ---
async function cook() {
    let input = document.getElementById('rawInput').value.trim();
    if (!input) return alert("Please enter a URL or recipe text first.");
    if (!apiKey) {
        alert("API Key missing. Please open settings ⚙️ and add your Gemini Key.");
        toggleSettings();
        return;
    }

    const loadingEl = document.getElementById('loading');
    loadingEl.classList.remove('hidden');
    loadingEl.innerText = "Initializing Chef...";

    try {
        // Phase 1: Scraping (if URL)
        if (input.startsWith('http')) {
            loadingEl.innerText = "Scraping website content...";
            const htmlContent = await fetchHTML(input);
            
            if (htmlContent) {
                // APPLY NEW FIX: Surgical Cleaning
                const cleanedText = cleanHtmlForAi(htmlContent);
                input = "SOURCE TEXT: " + cleanedText.substring(0, 50000);
            } else {
                alert("Security Warning: This site blocked our scrapers. AI will attempt to extract based on the URL alone (accuracy may vary).");
            }
        }

        // Phase 2: AI Processing (Extraction Prompt)
        loadingEl.innerText = "AI is cleaning & formatting...";

        const prompt = `You are a professional cookbook editor.
        Analyze the provided text/HTML and extract the recipe into JSON: { "title": "String", "ingredients": ["String"], "steps": ["String"] }.
        
        STRICT RULES:
        1. TRUTH: Use ONLY the provided text. Do not invent ingredients.
        2. FORMATTING: Clean up the output. Remove repetitive prefixes and simplify where necessary.
        3. JSON ONLY. No markdown, no conversation.
        
        TEXT TO ANALYZE: ${input}`;

        const recipeData = await _callGeminiAPI(prompt);
        
        // --- VALIDATION CHECK ---
        if(recipeData.error) {
            alert("AI Error: " + recipeData.error);
            return;
        } else if (recipeData.ingredients.length === 0 && recipeData.steps.length === 0) {
            alert("Extraction Failed: AI couldn't locate any ingredients or steps in that text.");
            return; 
        } 
        
        // Success Path 
        recipeData.id = Date.now();
        recipeData.isFavorite = false;
        recipes.unshift(recipeData);
        saveRecipes();
        render();
        document.getElementById('rawInput').value = '';

    } catch (e) {
        alert("Error: " + e.message);
        console.error(e);
    } finally {
        loadingEl.classList.add('hidden');
    }
}

// --- NEW LOGIC (CHEF MODE - GENERATION) ---
async function generateRecipe() {
    const input = document.getElementById('rawInput').value.trim();
    if (!input) return alert("Please describe the recipe you want to generate (e.g., 'a low-carb chicken curry')");
    if (!apiKey) {
        alert("API Key missing. Please open settings ⚙️ and add your Gemini Key.");
        toggleSettings();
        return;
    }

    const loadingEl = document.getElementById('loading');
    loadingEl.classList.remove('hidden');
    loadingEl.innerText = "Chef is creatively generating your recipe...";

    try {
        // Phase 1: AI Processing (Generation Prompt)
        let prompt = `You are a creative executive chef.
        Generate a new recipe based on the user's description and preferences, outputting ONLY JSON: { "title": "String", "ingredients": ["String"], "steps": ["String"] }.
        
        STRICT RULES:
        1. CREATIVITY: Invent a unique title and coherent steps/ingredients.
        2. JSON ONLY. No markdown, no conversation.
        `;

        // Prepend custom rules to the prompt if they exist
        if (customRules) {
            prompt = `
            # USER-DEFINED SYSTEM CONSTRAINTS
            Apply these rules to your generation:
            ${customRules}
            
            ---
            
            ${prompt}
            `
        }

        prompt += `
        USER DESCRIPTION: ${input}
        `;

        const recipeData = await _callGeminiAPI(prompt);
        
        // --- VALIDATION CHECK ---
        if(recipeData.error) {
            alert("AI Error: " + recipeData.error);
            return;
        } else if (!recipeData.title || recipeData.ingredients.length === 0) {
            alert("Generation Failed: AI couldn't create a valid recipe structure.");
            return; 
        } 
        
        // Success Path 
        recipeData.id = Date.now();
        recipeData.isFavorite = false;
        recipes.unshift(recipeData);
        saveRecipes();
        render();
        document.getElementById('rawInput').value = '';

    } catch (e) {
        alert("Error: " + e.message);
        console.error(e);
    } finally {
        loadingEl.classList.add('hidden');
    }
}


// --- RENDER ENGINE ---
function render() {
    const list = document.getElementById('recipeList');
    list.innerHTML = '';
    
    // SVG Icons (minimal, efficient, "0Fluff")
    // FIX: Switched to simple, high-contrast emojis
    const deleteIcon = `❌`;
    const favoriteIcon = `♥️`;

    // Sort: Favorites first, then Newest
    const sorted = [...recipes].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return b.id - a.id;
        return a.isFavorite ? -1 : 1;
    });

    sorted.forEach(r => {
        const card = document.createElement('div');
        card.className = `recipe-card ${r.isFavorite ? 'favorite' : ''}`;
        card.setAttribute('data-id', r.id); // Set the ID for swiping
        card.innerHTML = `
            <div class="swipe-overlay swipe-delete">${deleteIcon}</div>
            <div class="swipe-overlay swipe-favorite">${favoriteIcon}</div>
            <div class="card-content">
                <div class="fav-icon">${r.isFavorite ? '❤️' : '♡'}</div>
                <div class="recipe-title">${r.title}</div>
                <div class="tags">
                    <span>🍽 ${r.ingredients.length} ingredients</span>
                </div>
            </div>
        `;

        // Attach touch/click handlers to the card itself
        card.onclick = (e) => {
            // Prevent opening modal if a swipe was just performed
            if (e.target.closest('.recipe-card').classList.contains('swiping-active')) return;
            openModal(r);
        };
        card.addEventListener('touchstart', handleTouchStart, { passive: true });
        card.addEventListener('touchmove', handleTouchMove, { passive: true });
        card.addEventListener('touchend', handleTouchEnd);


        list.appendChild(card);
    });
}

// --- SWIPE LOGIC ---
function handleTouchStart(e) {
    // Only process the first touch (for multi-touch devices)
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    
    // Reset any existing transformation
    const cardContent = this.querySelector('.card-content');
    cardContent.style.transition = 'none';
}

function handleTouchMove(e) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    
    // Check if it's mostly a horizontal swipe (prevents scroll-hijack)
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        // e.preventDefault(); // Uncomment if you want to completely disable vertical scroll during swipe
        const cardContent = this.querySelector('.card-content');
        
        // Clamp the swipe distance to prevent it from flying off screen
        const maxOffset = 120; // Max visual offset
        const offset = Math.min(Math.max(dx, -maxOffset), maxOffset);

        cardContent.style.transform = `translateX(${offset}px)`;
        this.classList.add('swiping-active');
        
        // Show/Hide overlays based on direction
        this.querySelector('.swipe-delete').style.opacity = offset < 0 ? Math.abs(offset) / maxOffset : 0;
        this.querySelector('.swipe-favorite').style.opacity = offset > 0 ? offset / maxOffset : 0;
    }
}

function handleTouchEnd(e) {
    const card = this;
    const recipeId = parseInt(card.getAttribute('data-id'));
    const cardContent = card.querySelector('.card-content');
    const transformValue = cardContent.style.transform;
    let dx = 0;
    
    // Extract the translateX value
    if (transformValue) {
        const match = transformValue.match(/translateX\(([^)]+)/);
        if (match) {
            dx = parseFloat(match[1]);
        }
    }

    cardContent.style.transition = 'transform 0.3s ease-out';
    card.classList.remove('swiping-active');

    // --- Action Logic ---
    if (dx > SWIPE_THRESHOLD) {
        // Swipe Right: Favorite/Unfavorite
        toggleFavoriteById(recipeId); // Perform the action
        
        // FIX: Removed manual transform which caused the flicker/jump. 
        // We let the card snap back to 0, then immediately re-render.
        cardContent.style.transform = 'translateX(0)'; 

        // Wait 0ms to ensure the UI snaps back before we redraw the whole list
        setTimeout(() => {
            render();
        }, 0); 

    } else if (dx < -SWIPE_THRESHOLD) {
        // Swipe Left: Delete
        // The delete action still benefits from the slide out for visual drama
        deleteRecipeById(recipeId);
        cardContent.style.transform = 'translateX(-100%)'; // Swipe out left
        
        // Wait for the visual transition to complete, then re-render
        setTimeout(() => {
            render();
        }, 300);
    } else {
        // Snap back
        cardContent.style.transform = 'translateX(0)';
    }
}

function toggleFavoriteById(id) {
    const r = recipes.find(i => i.id === id);
    if(r) {
        r.isFavorite = !r.isFavorite;
        saveRecipes();
        return r; // Return the updated recipe
    }
    return null;
}

function deleteRecipeById(id) {
    recipes = recipes.filter(r => r.id !== id);
    saveRecipes();
}


// --- MODAL & ACTIONS ---
function openModal(r) {
    currentRecipeId = r.id;
    document.getElementById('modalTitle').innerText = r.title;
    document.getElementById('modalIngredients').innerHTML = r.ingredients.map(i => `<div class="ingredient-item">• ${i}</div>`).join('');
    document.getElementById('modalSteps').innerHTML = r.steps.map((s, i) => `<div class="step-item"><b>${i+1}.</b> ${s}</div>`).join('');
    document.getElementById('recipeModal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function toggleFavoriteCurrent() {
    toggleFavoriteById(currentRecipeId);
    render();
    closeModal('recipeModal');
}

function deleteCurrentRecipe() {
    if(confirm("Delete this recipe permanently?")) {
        deleteRecipeById(currentRecipeId);
        render();
        closeModal('recipeModal');
    }
}

function copyToClipboard() {
    const r = recipes.find(i => i.id === currentRecipeId);
    if(!r) return;
    const text = `${r.title}\n\nINGREDIENTS:\n${r.ingredients.join('\n')}\n\nSTEPS:\n${r.steps.join('\n')}`;
    navigator.clipboard.writeText(text).then(() => alert("Recipe copied to clipboard!"));
}

function shareRecipe() {
    const r = recipes.find(i => i.id === currentRecipeId);
    if (!r) return;

    const shareText = `${r.title}\n\nINGREDIENTS:\n${r.ingredients.join('\n')}\n\nSTEPS:\n${r.steps.join('\n')}`;

    if (navigator.share) {
        navigator.share({
            title: r.title,
            text: shareText
        }).catch((error) => console.error('Error sharing', error));
    } else {
        copyToClipboard();
        alert("Share API not available. Recipe copied to clipboard instead!");
    }
}


// --- EDITOR LOGIC ---
function openEditor() {
    const viewOpen = document.getElementById('recipeModal').classList.contains('active');
    
    if (viewOpen && currentRecipeId) {
        // Edit Mode
        const r = recipes.find(i => i.id === currentRecipeId);
        isEditingId = currentRecipeId;
        document.getElementById('editTitle').value = r.title;
        document.getElementById('editIngredients').value = r.ingredients.join('\n');
        document.getElementById('editSteps').value = r.steps.join('\n');
        closeModal('recipeModal');
    } else {
        // Create Mode
        isEditingId = null;
        document.getElementById('editTitle').value = '';
        document.getElementById('editIngredients').value = '';
        document.getElementById('editSteps').value = '';
    }
    document.getElementById('editorModal').classList.add('active');
}

function editCurrentRecipe() {
    openEditor();
}

function saveEditor() {
    const title = document.getElementById('editTitle').value.trim();
    const ingRaw = document.getElementById('editIngredients').value.split('\n').filter(l => l.trim()!=='');
    const stepsRaw = document.getElementById('editSteps').value.split('\n').filter(l => l.trim()!=='');
    
    if(!title) return alert("Recipe Title is required.");
    
    if(isEditingId) {
        const idx = recipes.findIndex(r => r.id === isEditingId);
        if(idx !== -1) { 
            recipes[idx].title = title; 
            recipes[idx].ingredients = ingRaw; 
            recipes[idx].steps = stepsRaw; 
        }
    } else {
        recipes.unshift({ 
            id: Date.now(), 
            title, 
            ingredients: ingRaw, 
            steps: stepsRaw, 
            isFavorite: false 
        });
    }
    saveRecipes();
    render();
    closeModal('editorModal');
}

// --- DATA MANAGEMENT ---
function exportData() {
    const dataStr = JSON.stringify(recipes, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `0Fluff_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(input) {
    const f = input.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            if(confirm(`Found ${d.length} recipes. Overwrite current list?`)) { 
                recipes = d; 
                saveRecipes(); 
                render(); 
                alert("Import successful!"); 
            }
        } catch(err) { alert("Invalid file format."); }
    };
    r.readAsText(f);
    // Reset input so same file can be selected again if needed
    input.value = '';
}

function saveRecipes() {
    localStorage.setItem('gourmet_recipes', JSON.stringify(recipes));
}

// Expose internal functions for HTML binding
window.cook = cook;
window.generateRecipe = generateRecipe;
window.toggleSettings = toggleSettings;
window.saveKey = saveKey;
window.saveRules = saveRules; 
window.exportData = exportData;
window.importData = importData;
window.openEditor = openEditor;
window.editCurrentRecipe = editCurrentRecipe; 
window.saveEditor = saveEditor;
window.closeModal = closeModal;
window.toggleFavoriteCurrent = toggleFavoriteCurrent;
window.deleteCurrentRecipe = deleteCurrentRecipe;
window.copyToClipboard = copyToClipboard;
window.shareRecipe = shareRecipe;
