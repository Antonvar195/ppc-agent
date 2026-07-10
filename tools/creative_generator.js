/**
 * creative_generator.js
 *
 * Генерує варіації рекламних креативів через Replicate (FLUX Kontext Max).
 * Зберігає текст і брендинг на зображенні завдяки instruction-based редагуванню.
 */

require('dotenv').config();
const Replicate = require('replicate');
const axios = require('axios');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

// FLUX Kontext Max — instruction-based img2img з підтримкою тексту
const FLUX_MODEL = 'black-forest-labs/flux-kontext-max';

/**
 * Генерує варіацію зображення через FLUX Kontext Max
 *
 * @param {Buffer} imageBuffer  — оригінальне зображення
 * @param {string} prompt       — інструкція що змінити (зберігаючи текст і брендинг)
 * @param {Object} options
 *   @param {string} aspectRatio — '1:1' для feed, '9:16' для story
 *   @param {number} steps       — кількість кроків (дефолт 28)
 * @returns {Buffer} — варіація як буфер
 */
async function generateVariation(imageBuffer, prompt, options = {}) {
  const {
    aspectRatio = '1:1',
    steps = 28
  } = options;

  console.log(`🎨 Replicate FLUX Kontext Max: генерую варіацію...`);
  console.log(`   Prompt: ${prompt.substring(0, 120)}`);

  const base64 = imageBuffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const output = await replicate.run(FLUX_MODEL, {
    input: {
      input_image: dataUri,
      prompt,
      aspect_ratio: aspectRatio,
      num_inference_steps: steps,
      output_format: 'jpg',
      output_quality: 90
    }
  });

  const resultUrl = Array.isArray(output) ? output[0] : output;
  if (!resultUrl) throw new Error('Replicate не повернув результат');

  console.log(`   ✅ Варіація готова, завантажую...`);
  const response = await axios.get(
    typeof resultUrl === 'string' ? resultUrl : resultUrl.url(),
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data);
}

/**
 * Будує промпт для варіації Apollo Next креативу
 *
 * @param {string} variationType — 'color' | 'style' | 'mood'
 * @param {string} extra         — додатковий контекст
 */
function buildVariationPrompt(variationType = 'color', extra = '') {
  const base = `Keep all text, numbers, logos, and branding exactly as they are. Do not change any typography. ${extra}`;

  const variations = {
    color: `${base} Change the background color scheme to a cool dark blue and purple gradient. Keep the gym interior photo visible but with blue tones.`,
    warm:  `${base} Change the background color scheme to a warm golden orange gradient. Keep the gym interior photo visible but with warm amber tones.`,
    dark:  `${base} Make the overall image darker and more dramatic with higher contrast. Deep dark background, keep all text clearly readable.`,
    green: `${base} Change the background color scheme to a deep forest green gradient. Keep the gym interior photo visible with green tones.`
  };

  return variations[variationType] || variations.color;
}

/**
 * Створити варіацію Apollo Next креативу
 *
 * @param {Buffer} imageBuffer
 * @param {string} variationType — 'color' | 'warm' | 'dark' | 'green'
 * @param {string} aspectRatio   — '1:1' або '9:16'
 */
async function createAdVariation(imageBuffer, variationType = 'color', aspectRatio = '1:1') {
  const prompt = buildVariationPrompt(variationType);
  return generateVariation(imageBuffer, prompt, { aspectRatio });
}

module.exports = { generateVariation, buildVariationPrompt, createAdVariation };

// Тест якщо запускати напряму
if (require.main === module) {
  const fs = require('fs');

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ REPLICATE_API_TOKEN не встановлено в .env');
    process.exit(1);
  }

  const testFile = '/tmp/s01.jpg';
  if (!fs.existsSync(testFile)) {
    console.error(`❌ Тестовий файл не знайдено: ${testFile}`);
    process.exit(1);
  }

  console.log('🧪 Тест FLUX Kontext Max...');
  const buffer = fs.readFileSync(testFile);

  createAdVariation(buffer, 'color', '1:1')
    .then(result => {
      const outPath = '/tmp/kontext_variation_color.jpg';
      fs.writeFileSync(outPath, result);
      console.log(`✅ Збережено: ${outPath} (${result.length} bytes)`);
    })
    .catch(err => {
      console.error('❌ Помилка:', err.message);
    });
}
