// 0FluffCook V3.1 Stable Logic (Pre-HTML Cleaner)

// --- STATE MANAGEMENT ---
let recipes = JSON.parse(localStorage.getItem('gourmet_recipes') || '[]');
let apiKey = localStorage.getItem('gourmet_key') || '';
let currentRecipeId = null;
let isEditingId = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if(apiKey) document.getElementById('apiKeyInput').value = apiKey;
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

// --- MAIN LOGIC (COOK) ---
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
                // OLD V3.1 LOGIC: Sends raw HTML (can still fail on noisy sites)
                input = "SOURCE HTML: " + htmlContent.substring(0, 50000);
            } else {
                alert("Security Warning: This site blocked our scrapers. AI will attempt to extract based on the URL alone (accuracy may vary).");
            }
        }

        // Phase 2: AI Processing
        loadingEl.innerText = "AI is cleaning & formatting...";

        const prompt = `You are a professional cookbook editor.
        Analyze the provided text/HTML and extract the recipe into JSON: { "title": "String", "ingredients": ["String"], "steps": ["String"] }.
        
        STRICT RULES:
        1. TRUTH: Use ONLY the provided text. Do not invent ingredients.
        2. FORMATTING: Clean up the output. Remove repetitive prefixes and simplify where necessary.
        3. JSON ONLY. No markdown, no conversation.
        
        TEXT TO ANALYZE: ${input}`;

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
        
        // --- V3.1 FINAL VALIDATION CHECK ---
        if(recipeData.error) {
            alert("AI Error: " + recipeData.error);
            return;
        } else if (recipeData.ingredients.length === 0 && recipeData.steps.length === 0) {
            // Fails on noisy sites
            alert("Extraction Failed: AI couldn't locate any ingredients or steps in that text.");
            return; 
        } 
        // --- END V3.1 VALIDATION ---
        
        // Success Path (only runs if data is valid and non-empty)
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
    
    // Sort: Favorites first, then Newest
    const sorted = [...recipes].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return b.id - a.id;
        return a.isFavorite ? -1 : 1;
    });

    sorted.forEach(r => {
        const card = document.createElement('div');
        card.className = `recipe-card ${r.isFavorite ? 'favorite' : ''}`;
        card.innerHTML = `
            <div class="fav-icon">${r.isFavorite ? '❤️' : '♡'}</div>
            <div class="recipe-title">${r.title}</div>
            <div class="tags">
                <span>🍽 ${r.ingredients.length} ingredients</span>
            </div>
        `;
        card.onclick = (e) => {
            openModal(r);
        };
        list.appendChild(card);
    });
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
    const r = recipes.find(i => i.id === currentRecipeId);
    if(r) {
        r.isFavorite = !r.isFavorite;
        saveRecipes();
        render();
        closeModal('recipeModal');
    }
}

function deleteCurrentRecipe() {
    if(confirm("Delete this recipe permanently?")) {
        recipes = recipes.filter(r => r.id !== currentRecipeId);
        saveRecipes();
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
