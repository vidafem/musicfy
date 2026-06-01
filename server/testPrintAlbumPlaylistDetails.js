import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const albumBrowseId = 'MPREb_EXCXIrKWriC'; 
  const playlistBrowseId = 'PLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef'; // Daddy Yankee etc playlist
  
  try {
    console.log(`Getting album details for: "${albumBrowseId}"...`);
    const album = await ytApi.getAlbum(albumBrowseId);
    console.log("Album Response structure:", JSON.stringify(album, null, 2));
  } catch (err) {
    console.error("Album fetch error:", err);
  }

  try {
    console.log(`Getting playlist details for: "${playlistBrowseId}"...`);
    const playlist = await ytApi.getPlaylist(playlistBrowseId);
    console.log("Playlist Response structure:", JSON.stringify(playlist, null, 2));
  } catch (err) {
    console.error("Playlist fetch error:", err);
  }
}

run();
