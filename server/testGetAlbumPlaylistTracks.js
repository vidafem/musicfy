import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const albumBrowseId = 'MPREb_EXCXIrKWriC'; 
  const playlistBrowseId = 'VLPLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef'; 
  const cleanPlaylistId = 'PLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef';
  
  try {
    console.log(`Getting playlist with VL: "${playlistBrowseId}"...`);
    const playlist = await ytApi.getPlaylist(playlistBrowseId);
    console.log("Result keys:", Object.keys(playlist));
    if (playlist.error) {
      console.log("Error details:", playlist.error);
    }
  } catch (err) {
    console.error("Playlist fetch error:", err);
  }

  try {
    console.log(`Getting playlist without VL: "${cleanPlaylistId}"...`);
    const playlist = await ytApi.getPlaylist(cleanPlaylistId);
    console.log("Result keys:", Object.keys(playlist));
    console.log("Playlist title:", playlist.title || playlist.name);
    console.log("Tracks count:", playlist.content?.length);
    if (playlist.content?.length > 0) {
      console.log("First track keys:", Object.keys(playlist.content[0]));
    }
  } catch (err) {
    console.error("Clean playlist fetch error:", err);
  }

  try {
    console.log(`Getting album: "${albumBrowseId}"...`);
    const album = await ytApi.getAlbum(albumBrowseId);
    console.log("Album keys:", Object.keys(album));
    console.log("Album title:", album.title || album.name);
    console.log("Album artist:", album.artist);
    console.log("Tracks count:", album.content?.length);
    if (album.content?.length > 0) {
      console.log("First track keys:", Object.keys(album.content[0]));
    }
  } catch (err) {
    console.error("Album fetch error:", err);
  }
}

run();
