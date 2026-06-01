import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const videoId = 'pSk0VKN0Cfk'; // A popular video ID
  try {
    console.log(`Getting next for video: "${videoId}"...`);
    const res = await ytApi.getNext(videoId);
    console.log("Response keys:", Object.keys(res));
    console.log("Content length:", res.content?.length);
    if (res.content?.length > 0) {
       console.log("First item:", JSON.stringify(res.content[0], null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
