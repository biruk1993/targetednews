const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Initialize RSS Parser (keeping for backup)
const parser = new Parser();

// Database setup - FIXED PATH
const dbPath = path.join(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database:', dbPath);
    initializeDatabase();
    autoInitializeSources(); // AUTO-INITIALIZE ON STARTUP
  }
});

// Create tables - FIXED ORDER
function initializeDatabase() {
  // Create countries table first
  db.run(`CREATE TABLE IF NOT EXISTS countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    flag_emoji TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating countries table:', err);
    } else {
      console.log('✅ Countries table ready');
      insertCountries();
    }
  });

  // Then create news_sources table
  db.run(`CREATE TABLE IF NOT EXISTS news_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT NOT NULL,
    rss_url TEXT NOT NULL,
    source_name TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating news_sources table:', err);
    } else {
      console.log('✅ News sources table ready');
    }
  });

  // Finally create news_articles table
  db.run(`CREATE TABLE IF NOT EXISTS news_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER,
    country_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT UNIQUE,
    pub_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating news_articles table:', err);
    } else {
      console.log('✅ News articles table ready');
    }
  });
}

// Insert countries - SEPARATE FUNCTION
function insertCountries() {
  const countries = [
    { name: 'Eritrea', code: 'eritrea', flag_emoji: '🇪🇷' },
    { name: 'Somalia', code: 'somalia', flag_emoji: '🇸🇴' },
    { name: 'Sudan', code: 'sudan', flag_emoji: '🇸🇩' },
    { name: 'Kenya', code: 'kenya', flag_emoji: '🇰🇪' },
    { name: 'Egypt', code: 'egypt', flag_emoji: '🇪🇬' }
  ];

  countries.forEach(country => {
    db.run(
      `INSERT OR IGNORE INTO countries (name, code, flag_emoji) VALUES (?, ?, ?)`,
      [country.name, country.code, country.flag_emoji],
      function(err) {
        if (err) {
          console.error(`Error inserting ${country.name}:`, err);
        } else {
          if (this.changes > 0) {
            console.log(`✅ Added country: ${country.name}`);
          }
        }
      }
    );
  });
}

// Auto-initialize sources if database is empty
function autoInitializeSources() {
  // Check if sources table is empty
  db.get('SELECT COUNT(*) as count FROM news_sources', (err, row) => {
    if (err) {
      console.error('Error checking sources:', err);
      return;
    }
    
    if (row.count === 0) {
      console.log('🔄 Database empty - auto-initializing sources...');
      initializeDefaultSources();
    } else {
      console.log(`✅ Database has ${row.count} sources already`);
      // Auto-fetch news if sources exist but no articles
      db.get('SELECT COUNT(*) as count FROM news_articles', (err, articleRow) => {
        if (!err && articleRow.count === 0) {
          console.log('🔄 No articles found - auto-fetching news...');
          setTimeout(() => {
            NewsFetcher.fetchAllNews();
          }, 5000);
        }
      });
    }
  });
}

// Initialize default sources (minimal - just for admin panel)
function initializeDefaultSources() {
  const workingSources = [
    { country_code: 'eritrea', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Eritrea' },
    { country_code: 'somalia', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Somalia' },
    { country_code: 'sudan', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Sudan' },
    { country_code: 'kenya', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Kenya' },
    { country_code: 'egypt', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Egypt' }
  ];

  let added = 0;
  workingSources.forEach((source, index) => {
    db.run(
      `INSERT OR IGNORE INTO news_sources (country_code, rss_url, source_name) VALUES (?, ?, ?)`,
      [source.country_code, source.rss_url, source.source_name],
      function(err) {
        if (err) {
          console.error(`❌ Failed to add ${source.source_name}:`, err.message);
        } else {
          console.log(`✅ Auto-added: ${source.source_name}`);
          added++;
        }
        
        // Auto-fetch news after adding all sources
        if (index === workingSources.length - 1) {
          console.log(`🎉 Auto-initialized ${added} sources`);
          // Auto-fetch news after 10 seconds
          setTimeout(() => {
            console.log('🔄 Auto-fetching news from NewsAPI...');
            NewsFetcher.fetchAllNews();
          }, 10000);
        }
      }
    );
  });
}

// News Fetcher Service with NewsAPI
class NewsFetcher {
  static async fetchAllNews() {
    try {
      console.log('📡 Starting news fetch from NewsAPI...');
      
      const countries = {
        eritrea: 'er',
        somalia: 'so', 
        sudan: 'sd',
        kenya: 'ke',
        egypt: 'eg'
      };

      let totalArticles = 0;

      for (const [countryCode, newsApiCode] of Object.entries(countries)) {
        try {
          console.log(`🔍 Fetching news for: ${countryCode}`);
          
          // Use NewsAPI instead of RSS
          const articles = await this.fetchFromNewsAPI(newsApiCode, countryCode);
          await this.saveArticles(articles);
          totalArticles += articles.length;
          
          console.log(`✅ Found ${articles.length} articles for ${countryCode}`);
          
        } catch (error) {
          console.log(`❌ Failed to fetch for ${countryCode}:`, error.message);
        }
      }

      console.log(`🎉 News fetch completed! Total articles: ${totalArticles}`);
      return totalArticles;
      
    } catch (error) {
      console.error('Error in fetchAllNews:', error);
      return 0;
    }
  }

  static async fetchFromNewsAPI(countryCode, countryName) {
    const NEWS_API_KEY = '29ceab457b534b79a5732233a6b95fcd'; // Your API key
    const url = `https://newsapi.org/v2/top-headlines?country=${countryCode}&pageSize=15&apiKey=${NEWS_API_KEY}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'ok' && data.articles && data.articles.length > 0) {
        return data.articles.map(article => ({
          source_id: 1, // Default source ID
          country_code: countryName,
          title: article.title || 'No title available',
          description: article.description || 'No description available',
          link: article.url || '',
          pub_date: article.publishedAt || new Date(),
          source_name: article.source?.name || 'NewsAPI'
        }));
      } else {
        console.log(`No articles found for ${countryCode} or API error`);
        return [];
      }
    } catch (error) {
      console.log(`NewsAPI error for ${countryCode}:`, error.message);
      return [];
    }
  }

  static async saveArticles(articles) {
    return new Promise((resolve, reject) => {
      if (articles.length === 0) {
        resolve();
        return;
      }

      const stmt = db.prepare(`
        INSERT OR IGNORE INTO news_articles 
        (source_id, country_code, title, description, link, pub_date) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let completed = 0;
      let errors = 0;
      
      articles.forEach(article => {
        stmt.run([
          article.source_id,
          article.country_code,
          article.title ? article.title.substring(0, 500) : 'No title',
          article.description ? article.description.substring(0, 1000) : 'No description',
          article.link,
          article.pub_date
        ], (err) => {
          if (err) {
            errors++;
          }
          completed++;
          
          if (completed === articles.length) {
            stmt.finalize();
            if (errors > 0) {
              console.log(`⚠️ ${errors} articles had errors saving`);
            }
            resolve();
          }
        });
      });
    });
  }

  static async getCountryNews(countryCode) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT na.*, ns.source_name 
         FROM news_articles na 
         LEFT JOIN news_sources ns ON na.source_id = ns.id 
         WHERE na.country_code = ? 
         ORDER BY na.pub_date DESC 
         LIMIT 50`,
        [countryCode],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

// Auto-refresh news every 30 minutes (NewsAPI has 100 requests/day limit)
const AutoRefresh = {
  start() {
    // Initial fetch after 30 seconds (let auto-init complete first)
    setTimeout(() => {
      this.fetchAllNews();
    }, 30000);
    
    // Then fetch every 30 minutes to stay within free limits
    setInterval(() => {
      this.fetchAllNews();
    }, 30 * 60 * 1000);
  },
  
  async fetchAllNews() {
    try {
      console.log('🔄 Auto-refreshing news from NewsAPI...');
      const count = await NewsFetcher.fetchAllNews();
      
      // Notify all connected clients
      io.emit('news_updated', {
        timestamp: new Date(),
        message: `Auto-refresh: ${count} new articles processed`,
        count: count
      });
      
      console.log(`✅ Auto-refresh completed: ${count} articles`);
    } catch (error) {
      console.error('❌ Auto-refresh failed:', error);
    }
  }
};

// ==================== API ROUTES ====================

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎯 TargetedNews API is running!',
    developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe',
    news_source: 'NewsAPI - Reliable news data',
    endpoints: {
      countries: '/api/countries',
      news: '/api/news/:countryCode',
      fetchNews: '/api/fetch-news',
      admin_sources: '/admin/sources',
      init_sources: '/api/init-sources'
    }
  });
});

// Get all countries
app.get('/api/countries', (req, res) => {
  db.all('SELECT * FROM countries ORDER BY name', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get all countries with news counts
app.get('/api/countries-with-news', (req, res) => {
  db.all(`
    SELECT c.*, COUNT(na.id) as article_count 
    FROM countries c 
    LEFT JOIN news_articles na ON c.code = na.country_code 
    GROUP BY c.id 
    ORDER BY c.name
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Initialize RSS sources (for admin panel)
app.get('/api/init-sources', (req, res) => {
  const workingSources = [
    { country_code: 'eritrea', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Eritrea' },
    { country_code: 'somalia', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Somalia' },
    { country_code: 'sudan', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Sudan' },
    { country_code: 'kenya', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Kenya' },
    { country_code: 'egypt', rss_url: 'https://newsapi.org', source_name: 'NewsAPI - Egypt' }
  ];

  let added = 0;
  let errors = 0;

  // Add each source
  workingSources.forEach((source, index) => {
    db.run(
      `INSERT OR IGNORE INTO news_sources (country_code, rss_url, source_name) VALUES (?, ?, ?)`,
      [source.country_code, source.rss_url, source.source_name],
      function(err) {
        if (err) {
          console.error(`Failed: ${source.source_name} - ${err.message}`);
          errors++;
        } else {
          console.log(`Added: ${source.source_name}`);
          added++;
        }
        
        // When all sources are processed
        if (index === workingSources.length - 1) {
          res.json({
            success: true,
            message: `Added ${added} sources, ${errors} errors`,
            added: added,
            errors: errors,
            developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe'
          });
        }
      }
    );
  });
});

// Fetch and update all news
app.get('/api/fetch-news', async (req, res) => {
  try {
    const count = await NewsFetcher.fetchAllNews();
    res.json({
      success: true,
      message: `Successfully processed ${count} articles from NewsAPI`,
      count: count,
      developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get news for specific country
app.get('/api/news/:countryCode', async (req, res) => {
  try {
    const { countryCode } = req.params;
    const news = await NewsFetcher.getCountryNews(countryCode);
    
    res.json({
      success: true,
      country: countryCode,
      articles: news,
      count: news.length,
      developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Add RSS source
app.post('/admin/sources', (req, res) => {
  const { country_code, rss_url, source_name } = req.body;
  
  console.log('Adding source:', { country_code, rss_url, source_name });
  
  if (!country_code || !rss_url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Country code and RSS URL are required' 
    });
  }
  
  db.run(
    `INSERT OR IGNORE INTO news_sources (country_code, rss_url, source_name) 
     VALUES (?, ?, ?)`,
    [country_code, rss_url, source_name || 'Unknown Source'],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ success: false, error: err.message });
      } else {
        console.log('Source added successfully, ID:', this.lastID);
        res.json({ 
          success: true, 
          message: 'Source added successfully',
          id: this.lastID,
          developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe'
        });
      }
    }
  );
});

// Admin: Get all sources
app.get('/admin/sources', (req, res) => {
  db.all(
    `SELECT ns.*, c.name as country_name, c.flag_emoji
     FROM news_sources ns 
     JOIN countries c ON ns.country_code = c.code 
     ORDER BY c.name, ns.source_name`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});

// Admin: Delete RSS source
app.delete('/admin/sources/:sourceId', (req, res) => {
  const sourceId = req.params.sourceId;
  
  console.log('Deleting source ID:', sourceId);
  
  if (!sourceId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Source ID is required' 
    });
  }
  
  db.run(
    `DELETE FROM news_sources WHERE id = ?`,
    [sourceId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ success: false, error: err.message });
      } else {
        if (this.changes === 0) {
          res.status(404).json({ 
            success: false, 
            error: 'Source not found' 
          });
        } else {
          console.log('Source deleted successfully');
          res.json({ 
            success: true, 
            message: 'Source deleted successfully',
            changes: this.changes,
            developer: 'powerd by Ethiopian electronic warfare department by developer second lieutenant biruk zenebe'
          });
        }
      }
    }
  );
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 TargetedNews Backend Active!`);
  console.log(`📰 Using NewsAPI for reliable news data`);
  console.log(`👨‍💻 Developer: Second Lieutenant Biruk Zenebe`);
  console.log(`🏢 Ethiopian Electronic Warfare Department`);
});

// Start auto-refresh when server starts
AutoRefresh.start();

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
  });
});

// Export for testing
module.exports = { app, db, parser, io };
