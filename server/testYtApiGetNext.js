import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const playlistId = 'PLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef';
  const vlPlaylistId = 'VLPLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef';
  
  try {
    console.log("Testing getNext with playlistId...");
    const res = await ytApi.getNext(null, playlistId);
    console.log("getNext keys:", Object.keys(res));
    console.log("getNext content length:", res.content?.length);
    if (res.content?.length > 0) {
      console.log("First 3 items:", JSON.stringify(res.content.slice(0, 3), null, 2));
    }
  } catch (err) {
    console.error("getNext error:", err);
  }

  try {
    console.log("Testing getNext with VL playlistId...");
    const res = await ytApi.getNext(null, vlPlaylistId);
    console.log("getNext VL content length:", res.content?.length);
  } catch (err) {
    console.error("getNext VL error:", err);
  }
}

run();
