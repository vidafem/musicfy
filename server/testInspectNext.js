import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

async function findKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (key === 'videoId' || key === 'title' || key === 'artist') {
      console.log(`Found: ${currentPath} = ${JSON.stringify(obj[key])}`);
    } else if (typeof obj[key] === 'object') {
      await findKeys(obj[key], currentPath);
    }
  }
}

async function run() {
  await ytApi.initalize();
  console.log("Initialized.");
  
  const playlistId = 'PLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef';
  try {
    const res = await ytApi.getNext(null, playlistId);
    console.log("getNext response keys:", Object.keys(res));
    console.log("Searching for fields...");
    await findKeys(res);
  } catch (err) {
    console.error(err);
  }
}

run();
