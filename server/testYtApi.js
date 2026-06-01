import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  try {
    console.log("Searching for song 'parce'...");
    const resSong = await ytApi.search('parce', 'song');
    console.log("Song results count:", resSong.content?.length);
    if (resSong.content?.length > 0) {
      console.log("First song result keys:", Object.keys(resSong.content[0]));
      console.log("First song result artist:", resSong.content[0].artist);
    }
  } catch (err) {
    console.error("Song search error:", err);
  }

  try {
    console.log("Searching for video 'parce'...");
    const resVideo = await ytApi.search('parce', 'video');
    console.log("Video results count:", resVideo.content?.length);
    if (resVideo.content?.length > 0) {
      console.log("First video result keys:", Object.keys(resVideo.content[0]));
      console.log("First video result artist:", resVideo.content[0].artist);
    }
  } catch (err) {
    console.error("Video search error:", err);
  }
}

run();
