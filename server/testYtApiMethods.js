import YoutubeMusicApi from 'youtube-music-api';

const ytApi = new YoutubeMusicApi();

console.log("ytApi methods:");
let obj = ytApi;
do {
  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (typeof ytApi[prop] === 'function') {
      console.log(" - " + prop);
    }
  });
} while ((obj = Object.getPrototypeOf(obj)));
