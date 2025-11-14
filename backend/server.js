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

// Initialize RSS Parser
const parser = new Parser();

// Database setup - FIXED PATH
const dbPath = path.join(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database:', dbPath);
    initializeDatabase();
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

// News Fetcher Service
class NewsFetcher {
  static async fetchAllNews() {
    try {
      console.log('📡 Starting news fetch from all sources...');
      
      // Get all active sources
      const sources = await new Promise((resolve, reject) => {
        db.all(
          `SELECT ns.*, c.name as country_name 
           FROM news_sources ns 
           JOIN countries c ON ns.country_code = c.code 
           WHERE ns.is_active = 1`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      let totalArticles = 0;

      for (const source of sources) {
        try {
          console.log(`🔍 Fetching from: ${source.source_name} (${source.country_code})`);
          
          const feed = await parser.parseURL(source.rss_url);
          console.log(`✅ Found ${feed.items.length} articles from ${source.source_name}`);
          
          const articles = feed.items.map(item => ({
            source_id: source.id,
            country_code: source.country_code,
            title: item.title || 'No title',
            description: item.description || item.content || item['content:encoded'] || '',
            link: item.link || '',
            pub_date: item.pubDate || item.isoDate || new Date()
          }));

          // Save articles to database
          await this.saveArticles(articles);
          totalArticles += articles.length;
          
        } catch (error) {
          console.log(`❌ Failed to fetch from ${source.source_name}:`, error.message);
        }
      }

      console.log(`🎉 News fetch completed! Total articles: ${totalArticles}`);
      return totalArticles;
      
    } catch (error) {
      console.error('Error in fetchAllNews:', error);
      return 0;
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
          article.description ? article.description.substring(0, 1000) : '',
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

// Auto-refresh news every 10 minutes
const AutoRefresh = {
  start() {
    // Initial fetch
    setTimeout(() => {
      this.fetchAllNews();
    }, 5000); // Wait 5 seconds after server start
    
    // Then fetch every 10 minutes
    setInterval(() => {
      this.fetchAllNews();
    }, 10 * 60 * 1000);
  },
  
  async fetchAllNews() {
    try {
      console.log('🔄 Auto-refreshing news...');
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
    endpoints: {
      countries: '/api/countries',
      news: '/api/news/:countryCode',
      fetchNews: '/api/fetch-news',
      admin_sources: '/admin/sources'
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

// Fetch and update all news
app.get('/api/fetch-news', async (req, res) => {
  try {
    const count = await NewsFetcher.fetchAllNews();
    res.json({
      success: true,
      message: `Successfully processed ${count} articles`,
      count: count
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
      count: news.length
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
          id: this.lastID 
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
            changes: this.changes
          });
        }
      }
    }
  );
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 TargetedNews Backend Active!`);
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
