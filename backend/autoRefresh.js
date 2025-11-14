const NewsFetcher = require('./newsFetcher');
const { io } = require('../server');

class AutoRefresh {
  static start() {
    // Fetch news every 10 minutes
    setInterval(() => {
      console.log('🔄 Auto-refreshing news...');
      this.refreshAllNews();
    }, 10 * 60 * 1000);

    // Initial fetch
    this.refreshAllNews();
  }

  static async refreshAllNews() {
    try {
      const allNews = await NewsFetcher.getAllCountriesNews();
      
      // Send real-time update to all connected clients
      io.emit('news_updated', {
        timestamp: new Date(),
        message: 'News refreshed automatically'
      });
      
      console.log('✅ News refresh completed');
    } catch (error) {
      console.error('❌ News refresh failed:', error);
    }
  }
}

module.exports = AutoRefresh;
