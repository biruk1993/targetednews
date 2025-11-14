const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'news.db');
const db = new sqlite3.Database(dbPath);

// Working RSS feeds that actually work
const workingSources = [
    // Eritrea
    { country_code: 'eritrea', rss_url: 'http://www.shabait.com/feed', source_name: 'Shabait Eritrea' },
    { country_code: 'eritrea', rss_url: 'https://allafrica.com/tools/headlines/rdf/eritrea/headlines.rdf', source_name: 'AllAfrica Eritrea' },
    
    // Somalia
    { country_code: 'somalia', rss_url: 'https://allafrica.com/tools/headlines/rdf/somalia/headlines.rdf', source_name: 'AllAfrica Somalia' },
    
    // Sudan
    { country_code: 'sudan', rss_url: 'https://allafrica.com/tools/headlines/rdf/sudan/headlines.rdf', source_name: 'AllAfrica Sudan' },
    { country_code: 'sudan', rss_url: 'https://sudanow-magazine.net/feed', source_name: 'Sudanow Magazine' },
    
    // Kenya
    { country_code: 'kenya', rss_url: 'https://allafrica.com/tools/headlines/rdf/kenya/headlines.rdf', source_name: 'AllAfrica Kenya' },
    { country_code: 'kenya', rss_url: 'https://www.the-star.co.ke/rss', source_name: 'The Star Kenya' },
    
    // Egypt
    { country_code: 'egypt', rss_url: 'https://allafrica.com/tools/headlines/rdf/egypt/headlines.rdf', source_name: 'AllAfrica Egypt' },
    { country_code: 'egypt', rss_url: 'https://www.dailynewsegypt.com/feed/', source_name: 'Daily News Egypt' }
];

// Clear old sources and add new working ones
db.run(`DELETE FROM news_sources`, function(err) {
    if (err) {
        console.error('Error clearing sources:', err);
        return;
    }
    
    console.log('🗑️ Cleared all old sources');
    
    let added = 0;
    workingSources.forEach((source, index) => {
        db.run(
            `INSERT INTO news_sources (country_code, rss_url, source_name) VALUES (?, ?, ?)`,
            [source.country_code, source.rss_url, source.source_name],
            function(err) {
                if (err) {
                    console.log(`❌ Failed: ${source.source_name} - ${err.message}`);
                } else {
                    console.log(`✅ Added: ${source.source_name}`);
                    added++;
                }
                
                if (index === workingSources.length - 1) {
                    console.log(`🎉 Successfully added ${added} working RSS sources!`);
                    console.log('🚀 Restart your server and fetch news again!');
                    db.close();
                }
            }
        );
    });
});
