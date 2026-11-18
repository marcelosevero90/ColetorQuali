const fs = require('fs');
const transcriptPath = 'C:/Users/marce/.gemini/antigravity/brain/85429a8e-db52-4351-8b9d-3aa8f9c8a30d/.system_generated/logs/transcript.jsonl';
if (fs.existsSync(transcriptPath)) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  lines.forEach((l, idx) => {
    try {
      const obj = JSON.parse(l);
      if (obj.content && obj.content.includes('"action":"script"')) {
        console.log('--- Step', idx, '---');
        const intentMatch = obj.content.match(/"intent":"(.*?)"/);
        if (intentMatch) console.log('Intent:', intentMatch[1]);
        const valMatch = obj.content.match(/"value":(.*)/);
        if (valMatch) console.log('Value:', valMatch[1].substring(0, 400));
      }
    } catch (e) {}
  });
}
