const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const API_BASE = 'https://api.meshy.ai/openapi/v2';

function headers() {
  const key = process.env.MESHY_API_KEY || '';
  return { Authorization: `Bearer ${key}` };
}

async function createPreview(prompt) {
  const payload = {
    mode: 'preview',
    prompt,
    art_style: 'realistic',
    should_remesh: true
  };
  const { data } = await axios.post(`${API_BASE}/text-to-3d`, payload, { headers: headers() });
  return data.result;
}

async function pollTask(id) {
  while (true) {
    const { data } = await axios.get(`${API_BASE}/text-to-3d/${id}`, { headers: headers() });
    if (data.status === 'SUCCEEDED') return data;
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function createRefine(previewId) {
  const payload = { mode: 'refine', preview_task_id: previewId };
  const { data } = await axios.post(`${API_BASE}/text-to-3d`, payload, { headers: headers() });
  return data.result;
}

async function download(url, filePath) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  await fs.writeFile(filePath, res.data);
}

async function generateModel(prompt, filePath) {
  const previewId = await createPreview(prompt);
  await pollTask(previewId);
  const refineId = await createRefine(previewId);
  const refineTask = await pollTask(refineId);
  const glbUrl = refineTask.model_urls.glb;
  await download(glbUrl, filePath);
  return filePath;
}

module.exports = { generateModel };
