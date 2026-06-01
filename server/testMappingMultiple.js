import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const terms = ['kok', 'koko', 'maluma', 'omar', 'feid'];
  for (const q of terms) {
    try {
      console.log(`Searching for "${q}"...`);
      const searchResult = await ytApi.search(q, 'song');
      const items = (searchResult.content || []).map((item, idx) => {
        try {
          const artistName = Array.isArray(item.artist) 
            ? item.artist.map(a => a.name).join(', ') 
            : (item.artist?.name || item.artist || 'Artista Desconocido');
          return {
            id: { videoId: item.videoId },
            title: item.name,
            artist: artistName
          };
        } catch (err) {
          console.error(`Error mapping item at index ${idx} for query "${q}":`, err);
          console.log("Item content:", item);
          throw err;
        }
      });
      console.log(`Successfully mapped ${items.length} items for "${q}"`);
    } catch (err) {
      console.error(`Failed for "${q}":`, err);
    }
  }
}

run();
