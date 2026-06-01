import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const q = 'Maluma';
  try {
    console.log(`Searching for albums of "${q}"...`);
    const resAlbums = await ytApi.search(q, 'album');
    console.log("Albums count:", resAlbums.content?.length);
    if (resAlbums.content?.length > 0) {
      console.log("First album:", JSON.stringify(resAlbums.content[0], null, 2));
    }
  } catch (err) {
    console.error("Album search error:", err);
  }

  try {
    console.log(`Searching for playlists of "${q}"...`);
    const resPlaylists = await ytApi.search(q, 'playlist');
    console.log("Playlists count:", resPlaylists.content?.length);
    if (resPlaylists.content?.length > 0) {
      console.log("First playlist:", JSON.stringify(resPlaylists.content[0], null, 2));
    }
  } catch (err) {
    console.error("Playlist search error:", err);
  }
}

run();
