// Use environment variable or default to localhost for development
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api' 
  : 'https://your-backend-url.railway.app/api';

const SOCKET_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://your-backend-url.railway.app';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadCountries();
    setupWebSocket();
});

// Real-time WebSocket connection
function setupWebSocket() {
    const socket = io(SOCKET_URL);
    
    socket.on('news_updated', (data) => {
        console.log('News updated:', data);
        showNotification(`News updated: ${data.message}`);
        
        // Refresh current view if news is being shown
        if (document.getElementById('news-display').style.display !== 'none') {
            const currentCountry = document.getElementById('current-country').textContent;
            const countryCode = getCountryCodeFromText(currentCountry);
            if (countryCode) {
                loadCountryNews(countryCode);
            }
        }
        
        // Always refresh country counts
        loadCountries();
    });
    
    socket.on('connect', () => {
        console.log('Connected to server for real-time updates');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// Load countries with news counts
async function loadCountries() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/countries-with-news`);
        const countries = await response.json();
        
        const grid = document.getElementById('countries-grid');
        grid.innerHTML = '';
        
        countries.forEach(country => {
            const countryCard = document.createElement('div');
            countryCard.className = 'country-card';
            countryCard.setAttribute('data-country', country.code);
            countryCard.onclick = () => loadCountryNews(country.code);
            
            countryCard.innerHTML = `
                <div class="country-flag">${country.flag_emoji}</div>
                <div class="country-name">${country.name}</div>
                <div class="article-count">${country.article_count || 0} articles</div>
            `;
            
            grid.appendChild(countryCard);
        });
        hideLoading();
    } catch (error) {
        console.error('Error loading countries:', error);
        hideLoading();
    }
}

// Load news for specific country
async function loadCountryNews(countryCode) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/news/${countryCode}`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('country-selection').style.display = 'none';
            document.getElementById('news-display').style.display = 'block';
            
            const country = data.country.toUpperCase();
            document.getElementById('current-country').textContent = `${getFlag(countryCode)} ${country} Military News`;
            document.getElementById('news-count').textContent = `${data.count} articles`;
            
            displayNews(data.articles);
        }
        hideLoading();
    } catch (error) {
        console.error('Error loading news:', error);
        hideLoading();
    }
}

// Display news articles
function displayNews(articles) {
    const newsList = document.getElementById('news-list');
    
    if (articles.length === 0) {
        newsList.innerHTML = `
            <div class="news-article">
                <p>No news articles found. Try fetching news from the admin panel.</p>
            </div>
        `;
        return;
    }
    
    newsList.innerHTML = articles.map(article => `
        <div class="news-article">
            <div class="article-title">${article.title}</div>
            <div class="article-description">${article.description || 'No description available'}</div>
            <div class="article-meta">
                <span class="article-source">Source: ${article.source_name || 'Unknown'}</span>
                <span class="article-date">${formatDate(article.pub_date)}</span>
                <a href="${article.link}" target="_blank" class="article-link">Read more →</a>
            </div>
        </div>
    `).join('');
}

// Show country selection
function showCountrySelection() {
    document.getElementById('news-display').style.display = 'none';
    document.getElementById('country-selection').style.display = 'block';
    loadCountries();
}

// Admin functions
function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function fetchAllNews() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/fetch-news`);
        const data = await response.json();
        
        alert(data.message);
        loadCountries(); // Refresh country counts
        hideLoading();
    } catch (error) {
        console.error('Error fetching news:', error);
        alert('Error fetching news');
        hideLoading();
    }
}

async function viewSources() {
    try {
        const response = await fetch('http://localhost:3001/admin/sources');
        const sources = await response.json();
        
        const adminContent = document.getElementById('admin-content');
        adminContent.innerHTML = `
            <h4>Current RSS Sources (${sources.length})</h4>
            <div style="max-height: 400px; overflow-y: auto; margin-top: 1rem;">
                ${sources.length === 0 ? 
                    '<p>No sources added yet. Add some using the form below.</p>' : 
                    sources.map(source => `
                    <div style="border: 1px solid #444; padding: 1rem; margin: 0.5rem 0; border-radius: 5px; background: #2d2d2d;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <strong>${source.country_name} ${source.flag_emoji}</strong><br>
                                <strong style="color: #4ecdc4;">${source.source_name}</strong><br>
                                <small style="color: #888; word-break: break-all;">${source.rss_url}</small><br>
                                <small style="color: #666;">ID: ${source.id} • Added: ${new Date(source.created_at).toLocaleDateString()}</small>
                            </div>
                            <button onclick="deleteSource(${source.id}, '${source.source_name}')" 
                                    style="background: #e74c3c; color: white; border: none; padding: 0.5rem; border-radius: 5px; cursor: pointer; margin-left: 1rem;">
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading sources:', error);
        document.getElementById('admin-content').innerHTML = '<p>Error loading sources</p>';
    }
}

// Delete RSS source
async function deleteSource(sourceId, sourceName) {
    if (!confirm(`Are you sure you want to delete "${sourceName}"?\n\nThis will remove the source but keep existing articles.`)) {
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3001/admin/sources/${sourceId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ Source "${sourceName}" deleted successfully!`);
            viewSources(); // Refresh the sources list
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error deleting source:', error);
        alert('❌ Network error deleting source');
    }
}

// Add RSS source form
function addSourceForm() {
    const adminContent = document.getElementById('admin-content');
    adminContent.innerHTML = `
        <h4>Add New RSS Source</h4>
        <form id="add-source-form" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <select id="source-country" required style="padding: 0.5rem; border: 1px solid #444; border-radius: 5px; background: #2d2d2d; color: #e0e0e0;">
                <option value="">Select Country</option>
                <option value="eritrea">🇪🇷 Eritrea</option>
                <option value="somalia">🇸🇴 Somalia</option>
                <option value="sudan">🇸🇩 Sudan</option>
                <option value="kenya">🇰🇪 Kenya</option>
                <option value="egypt">🇪🇬 Egypt</option>
            </select>
            <input type="text" id="source-name" placeholder="Source Name (e.g., BBC News)" required style="padding: 0.5rem; border: 1px solid #444; border-radius: 5px; background: #2d2d2d; color: #e0e0e0;">
            <input type="url" id="source-url" placeholder="RSS Feed URL (must start with http:// or https://)" required style="padding: 0.5rem; border: 1px solid #444; border-radius: 5px; background: #2d2d2d; color: #e0e0e0;">
            <button type="button" onclick="addNewSource()" class="btn" style="background: #27ae60;">Add Source</button>
        </form>
        <div id="add-source-result" style="margin-top: 1rem;"></div>
    `;
}

// Add new RSS source
async function addNewSource() {
    const country = document.getElementById('source-country').value;
    const name = document.getElementById('source-name').value;
    const url = document.getElementById('source-url').value;
    const resultDiv = document.getElementById('add-source-result');
    
    if (!country || !url) {
        resultDiv.innerHTML = '<p style="color: red;">Please fill in all required fields</p>';
        return;
    }
    
    try {
        resultDiv.innerHTML = '<p>Adding source...</p>';
        
        const response = await fetch('http://localhost:3001/admin/sources', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                country_code: country,
                rss_url: url,
                source_name: name || 'Unknown Source'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = '<p style="color: green;">✅ Source added successfully!</p>';
            // Clear form
            document.getElementById('source-country').value = '';
            document.getElementById('source-name').value = '';
            document.getElementById('source-url').value = '';
            
            // Refresh sources list
            setTimeout(() => {
                viewSources();
            }, 1000);
        } else {
            resultDiv.innerHTML = `<p style="color: red;">❌ Error: ${data.error}</p>`;
        }
    } catch (error) {
        console.error('Error adding source:', error);
        resultDiv.innerHTML = `<p style="color: red;">❌ Network error: ${error.message}</p>`;
    }
}

// Cleanup old news
async function cleanupOldNews() {
    if (!confirm('Fetch fresh news?\n\nThis will fetch the latest articles from all sources.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/fetch-news`);
        const data = await response.json();
        
        alert(`✅ News fetched successfully! ${data.count} articles processed`);
        loadCountries(); // Refresh country counts
    } catch (error) {
        console.error('Error during news fetch:', error);
        alert('❌ Error fetching news');
    }
}

// Show notification
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 1rem;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Utility functions
function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function getFlag(countryCode) {
    const flags = {
        eritrea: '🇪🇷',
        somalia: '🇸🇴',
        sudan: '🇸🇩',
        kenya: '🇰🇪',
        egypt: '🇪🇬'
    };
    return flags[countryCode] || '🇺🇳';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function getCountryCodeFromText(text) {
    const codes = ['eritrea', 'somalia', 'sudan', 'kenya', 'egypt'];
    return codes.find(code => text.toLowerCase().includes(code));
}
