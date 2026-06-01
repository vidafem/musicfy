import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  try {
    const res = await ytApi.search('Maluma', 'artist');
    console.log("Maluma artist search result content keys:", Object.keys(res.content?.[0] || {}));
    console.log("First item:", JSON.stringify(res.content?.[0], null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
