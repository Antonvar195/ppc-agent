/**
 * creative_variants.js
 *
 * Створює варіації креативів через color grading (Sharp).
 * Текст і брендинг зберігаються ідеально.
 * Швидко, безкоштовно, надійно.
 */

const sharp = require('sharp');

/**
 * Пресети варіацій для A/B тестів
 */
const VARIANTS = {
  // Холодна синьо-фіолетова гамма
  cool_blue: {
    label: 'cool_blue',
    description: 'Холодна синьо-фіолетова гамма',
    modulate: { saturation: 1.1, hue: 30 },
    tint: { r: 180, g: 200, b: 255 }
  },
  // Більш контрастний темний стиль
  dark_contrast: {
    label: 'dark_contrast',
    description: 'Темний з підвищеним контрастом',
    linear: [1.3, -20],
    modulate: { saturation: 1.2 }
  },
  // Тепла золота гамма
  warm_gold: {
    label: 'warm_gold',
    description: 'Тепла золотиста гамма',
    modulate: { saturation: 1.15, hue: -15, brightness: 1.05 },
    tint: { r: 255, g: 230, b: 180 }
  },
  // Монохромний з акцентом
  mono_accent: {
    label: 'mono_accent',
    description: 'Майже монохром з акцентним кольором',
    modulate: { saturation: 0.3, brightness: 1.1 }
  }
};

/**
 * Застосувати варіацію до зображення
 * @param {Buffer} inputBuffer — вхідне зображення
 * @param {string} variantName — назва варіації з VARIANTS
 * @returns {Buffer} — оброблене зображення
 */
async function applyVariant(inputBuffer, variantName) {
  const variant = VARIANTS[variantName];
  if (!variant) throw new Error(`Невідома варіація: ${variantName}. Доступні: ${Object.keys(VARIANTS).join(', ')}`);

  let pipeline = sharp(inputBuffer);

  if (variant.modulate) {
    pipeline = pipeline.modulate(variant.modulate);
  }
  if (variant.linear) {
    pipeline = pipeline.linear(variant.linear[0], variant.linear[1]);
  }
  if (variant.tint) {
    pipeline = pipeline.tint(variant.tint);
  }

  return pipeline.jpeg({ quality: 92 }).toBuffer();
}

/**
 * Створити всі варіації для одного зображення
 * @param {Buffer} inputBuffer
 * @param {string[]} variantNames — масив назв, дефолт ['cool_blue', 'dark_contrast']
 * @returns {Object} { original: Buffer, variants: { name: Buffer } }
 */
async function createAllVariants(inputBuffer, variantNames = ['cool_blue', 'dark_contrast']) {
  const results = {};
  for (const name of variantNames) {
    results[name] = await applyVariant(inputBuffer, name);
    console.log(`   ✅ Варіація "${name}" готова`);
  }
  return results;
}

module.exports = { applyVariant, createAllVariants, VARIANTS };

// Тест
if (require.main === module) {
  const fs = require('fs');

  const testFile = '/tmp/s01.jpg';
  if (!fs.existsSync(testFile)) {
    console.error('❌ Немає /tmp/s01.jpg');
    process.exit(1);
  }

  const buffer = fs.readFileSync(testFile);
  console.log('🎨 Генерую варіації...');

  createAllVariants(buffer, ['cool_blue', 'dark_contrast', 'warm_gold'])
    .then(variants => {
      for (const [name, buf] of Object.entries(variants)) {
        const out = `/tmp/variant_${name}.jpg`;
        fs.writeFileSync(out, buf);
        console.log(`   Збережено: ${out}`);
      }
    })
    .catch(console.error);
}
