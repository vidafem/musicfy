import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const artistBrowseId = 'UCtKIuEMDzPlUmPgdwBhiGcg'; // Maluma
  try {
    const artist = await ytApi.getArtist(artistBrowseId);
    console.log("First song structure:", JSON.stringify(artist.products.songs.content[0], null, 2));
    console.log("First album structure:", JSON.stringify(artist.products.albums.content[0], null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
