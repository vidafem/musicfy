import { exec } from 'child_process';
import path from 'path';

const localYtdlp = path.join(process.cwd(), 'yt-dlp.exe');
const playlistUrl = 'https://www.youtube.com/playlist?list=PLbUcKuveG99hEqeoPggJkc-T9gIZug9Ef';

const cmd = `"${localYtdlp}" --dump-single-json --flat-playlist "${playlistUrl}"`;
console.log("Running command:", cmd);

exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
  if (error) {
    console.error("Error:", error);
    return;
  }
  try {
    const data = JSON.parse(stdout);
    console.log("Playlist Title:", data.title);
    console.log("Entries count:", data.entries?.length);
    if (data.entries?.length > 0) {
      console.log("First entry:", JSON.stringify(data.entries[0], null, 2));
    }
  } catch (err) {
    console.error("JSON parse error:", err);
  }
});
