const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath);

// ADD YOUR WORKING RSS FEEDS HERE
const rssSources = [
  // 🇪🇷 ERITREA
  { country_code: 'eritrea', rss_url: 'http://www.shabait.com/feed', source_name: 'Shabait' },
  { country_code: 'eritrea', rss_url: 'http://www.tesfanews.net/feed/', source_name: 'TesfaNews' },
  
  // 🇸🇴 SOMALIA
  { country_code: 'somalia', rss_url: 'https://www.garoweonline.com/feed', source_name: 'Garowe Online' },
  { country_code: 'somalia', rss_url: 'https://www.hiiraan.com/rss.aspx', source_name: 'Hiiraan Online' },
  
  // 🇸🇩 SUDAN
  { country_code: 'sudan', rss_url: 'https://www.sudantribune.com/rss.php', source_name: 'Sudan Tribune' },
  { country_code: 'sudan', rss_url: 'https://www.dabangasudan.org/en/rss.xml', source_name: 'Dabanga Sudan' },
  
  // 🇰🇪 KENYA
  { country_code: 'kenya', rss_url: 'https://www.standardmedia.co.ke/rss/defence', source_name: 'The Standard Defence' },
  { country_code: 'kenya', rss_url: 'https://nation.africa/kenya/-/rss', source_name: 'Nation Africa' },
  
  // 🇪🇬 EGYPT
  { country_code: 'egypt', rss_url: 'https://www.egypttoday.com/RSS', source_name: 'Egypt Today' },
  { country_code: 'egypt', rss_url: 'http://english.ahram.org.eg/Portal/1/Rss.aspx', source_name: 'Ahram Online' }
];

console.log('🚀 Adding RSS sources to database...');

rssSources.forEach((source, index) => {
  db.run(
    `INSERT OR IGNORE INTO news_sources (country_code, rss_url, source_name) VALUES (?, ?, ?)`,
    [source.country_code, source.rss_url, source.source_name],
    function(err) {
      if (err) {
        console.log(`❌ Failed to add: ${source.source_name} - ${err.message}`);
      } else {
        if (this.changes > 0) {
          console.log(`✅ Added: ${source.source_name} for ${source.country_code}`);
        }
      }
      
      // Close DB after last item
      if (index === rssSources.length - 1) {
        setTimeout(() => {
          db.close();
          console.log('🎉 All RSS sources added!');
          console.log('📊 Check sources at: http://localhost:3001/admin/sources');
        }, 1000);
      }
    }
  );
});
