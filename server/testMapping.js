import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  try {
    const q = 'parce';
    const searchResult = await ytApi.search(q, 'song');
    console.log("Results found:", searchResult.content?.length);
    
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
        console.error(`Error mapping item at index ${idx}:`, err);
        console.log("Item content:", item);
        throw err;
      }
    });
    console.log("Mapped successfully:", items.length, "items");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

run();
