import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const terms = ['kok', 'koko', 'parce'];
  for (const q of terms) {
    try {
      const searchResult = await ytApi.search(q, 'song');
      (searchResult.content || []).forEach((item, idx) => {
        const artistName = Array.isArray(item.artist) 
          ? item.artist.map(a => a.name).join(', ') 
          : (item.artist?.name || item.artist || 'Artista Desconocido');
        
        if (typeof artistName !== 'string') {
          console.log(`[WARNING] artistName is NOT a string for "${q}" at index ${idx}!`);
          console.log("Type:", typeof artistName);
          console.log("Value:", artistName);
          console.log("Original item.artist:", item.artist);
        }
      });
    } catch (err) {
      console.error(err);
    }
  }
  console.log("Check complete.");
}

run();
