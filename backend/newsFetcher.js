const Parser = require('rss-parser');
const { db } = require('../server');

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['pubDate', 'description', 'content:encoded']
  }
});

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
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO news_articles 
        (source_id, country_code, title, description, link, pub_date) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let completed = 0;
      
      articles.forEach(article => {
        stmt.run([
          article.source_id,
          article.country_code,
          article.title.substring(0, 500), // Limit title length
          article.description.substring(0, 1000), // Limit description
          article.link,
          article.pub_date
        ], (err) => {
          if (err) {
            console.log('Error saving article:', err.message);
          }
          completed++;
          
          if (completed === articles.length) {
            stmt.finalize();
            resolve();
          }
        });
      });

      if (articles.length === 0) resolve();
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

module.exports = NewsFetcher;
