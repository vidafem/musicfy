import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const artistBrowseId = 'UCtKIuEMDzPlUmPgdwBhiGcg'; // Maluma
  try {
    console.log(`Getting artist: "${artistBrowseId}"...`);
    const artist = await ytApi.getArtist(artistBrowseId);
    console.log("Artist keys:", Object.keys(artist));
    console.log("Artist name:", artist.name);
    console.log("Artist products/sections:", Object.keys(artist.products || {}));
    
    // Print sections like songs, albums, playlists
    if (artist.products) {
      for (const section of Object.keys(artist.products)) {
        console.log(`Section: "${section}"`);
        const content = artist.products[section];
        console.log(` - Type:`, typeof content);
        console.log(` - Keys:`, Object.keys(content || {}));
        console.log(` - Raw (first 200 chars):`, JSON.stringify(content).substring(0, 200));
      }
    }
  } catch (err) {
    console.error("Artist fetch error:", err);
  }
}

run();
