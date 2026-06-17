/**
 * Agent Orchestrator — agentic loop з tool use
 *
 * На відміну від orchestrator.js (один виклик → JSON),
 * цей модуль дає Claude інструменти і крутить loop поки задача не виконана.
 * Claude сам вирішує що перевірити, що запустити, що виправити.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PROJECT_ROOT = path.join(__dirname, '..');

// ─── ІНСТРУМЕНТИ ──────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'execute_script',
    description: 'Написати і виконати Node.js скрипт у контексті проекту. Скрипт має доступ до всіх модулів проекту (meta_api, dropbox_reader тощо) та process.env. Повертає stdout + stderr.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Що робить скрипт (для логів)' },
        code: { type: 'string', description: 'Node.js код для виконання' }
      },
      required: ['description', 'code']
    }
  },
  {
    name: 'read_file',
    description: 'Прочитати файл з проекту. Шлях відносно кореня проекту.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Відносний шлях, наприклад: config/rules.md' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Створити або перезаписати файл у проекті.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Відносний шлях' },
        content: { type: 'string', description: 'Вміст файлу' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'meta_api_get',
    description: 'GET запит до Meta Marketing API. Для отримання структури кампаній, адсетів, креативів.',
    input_schema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Ендпоінт, наприклад: act_915627749178795/campaigns або 120238799722260193/adsets' },
        fields: { type: 'string', description: 'Поля через кому, наприклад: id,name,status,targeting' },
        params: { type: 'object', description: 'Додаткові параметри' }
      },
      required: ['endpoint']
    }
  },
  {
    name: 'fetch_url',
    description: 'Завантажити текст веб-сторінки. Корисно для отримання інформації про клуб зі сторінки apollo.online.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' }
      },
      required: ['url']
    }
  },
  {
    name: 'analyze_image',
    description: 'Завантажити зображення з Dropbox і переглянути що на ньому зображено. Використовуй для визначення маппінгу файлів до адсетів.',
    input_schema: {
      type: 'object',
      properties: {
        dropbox_folder_url: { type: 'string', description: 'Shared link на папку Dropbox' },
        filename: { type: 'string', description: 'Назва файлу в папці, наприклад: s01.jpg' }
      },
      required: ['dropbox_folder_url', 'filename']
    }
  },
  {
    name: 'ask_user',
    description: 'Задати уточнююче питання користувачу і дочекатися відповіді. Використовуй тільки коли справді не вистачає інформації яку неможливо отримати іншим способом.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' }
      },
      required: ['question']
    }
  }
];

// ─── ВИКОНАННЯ ІНСТРУМЕНТІВ ───────────────────────────────────────────────────

async function executeTool(toolName, input, onAskUser) {
  switch (toolName) {

    case 'execute_script': {
      console.log(`🔧 [agent] execute_script: ${input.description}`);
      const file = `/tmp/agent_${Date.now()}.js`;
      fs.writeFileSync(file, input.code);
      return new Promise((resolve) => {
        exec(`node ${file}`, {
          cwd: PROJECT_ROOT,
          timeout: 180000,
          env: { ...process.env }
        }, (err, stdout, stderr) => {
          const result = {
            stdout: stdout || '',
            stderr: stderr || '',
            exit_code: err ? (err.code || 1) : 0
          };
          console.log(`   stdout: ${stdout.substring(0, 200)}`);
          if (stderr) console.log(`   stderr: ${stderr.substring(0, 200)}`);
          resolve(result);
        });
      });
    }

    case 'read_file': {
      const filePath = path.join(PROJECT_ROOT, input.path);
      if (!fs.existsSync(filePath)) return { error: `Файл не знайдено: ${input.path}` };
      const content = fs.readFileSync(filePath, 'utf8');
      // Обрізаємо якщо дуже великий
      return content.length > 8000 ? content.substring(0, 8000) + '\n...[обрізано]' : content;
    }

    case 'write_file': {
      const filePath = path.join(PROJECT_ROOT, input.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, input.content);
      console.log(`📝 [agent] write_file: ${input.path}`);
      return { success: true };
    }

    case 'meta_api_get': {
      const { apiGet } = require('./meta_api');
      const params = { ...(input.params || {}) };
      if (input.fields) params.fields = input.fields;
      const result = await apiGet(input.endpoint, params);
      return result;
    }

    case 'fetch_url': {
      try {
        const response = await axios.get(input.url, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const text = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 6000);
        return text;
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'analyze_image': {
      const { refreshDropboxToken, dropboxRequest } = require('../tools/dropbox_reader');
      await refreshDropboxToken();
      const response = await dropboxRequest(token => axios({
        method: 'post',
        url: 'https://content.dropboxapi.com/2/sharing/get_shared_link_file',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({
            url: input.dropbox_folder_url,
            path: '/' + input.filename
          }),
          'Content-Type': ''
        },
        data: '',
        responseType: 'arraybuffer',
        maxContentLength: 20 * 1024 * 1024
      }));
      // Повертаємо base64 — Claude побачить зображення у наступному витку
      return {
        base64: Buffer.from(response.data).toString('base64'),
        media_type: 'image/jpeg'
      };
    }

    case 'ask_user': {
      // Делегуємо нагору — telegram_bot чекає і повертає відповідь
      return await onAskUser(input.question);
    }

    default:
      return { error: `Невідомий інструмент: ${toolName}` };
  }
}

// ─── СИСТЕМНИЙ ПРОМПТ ─────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const rules = fs.readFileSync(path.join(PROJECT_ROOT, 'config/rules.md'), 'utf8');
  const historyRaw = fs.readFileSync(path.join(PROJECT_ROOT, 'history/launches.json'), 'utf8');
  const history = JSON.parse(historyRaw).slice(-10); // останні 10 запусків

  return `Ти — PPC агент Apollo Next. Працюєш автономно: сам збираєш контекст, пишеш скрипти, виконуєш їх, бачиш результати, виправляєш помилки.

ПРАВИЛА ПРОЕКТУ:
${rules}

ОСТАННІ ЗАПУСКИ (для референсу):
${JSON.stringify(history, null, 2)}

ВАЖЛИВІ КОНСТАНТИ:
- AD_ACCOUNT_ID: act_915627749178795
- PAGE_ID: 107996248132865
- INSTAGRAM_USER_ID: 17841447539432480 (для object_story_spec)
- PIXEL_ID: 393751978682816
- API_VERSION: v21.0

ПРАВИЛА СТВОРЕННЯ КРЕАТИВІВ (обов'язково):
1. asset_feed_spec ЗАВЖДИ передавати разом з object_story_spec { page_id, instagram_user_id }
2. url_tags — окреме поле creative, НЕ в URL: "utm_source=facebook&utm_medium={тип}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&placement={{placement}}"
3. asset_customization_rules — всі 4 labels: image_label, body_label, title_label, link_url_label
4. Threads position: threads_stream (НЕ chronological_feed)
5. Перед маппінгом файлів — завжди переглядати зображення через analyze_image

ПОВЕДІНКА:
- Спочатку збери контекст (стара кампанія, сайт клубу, зображення) — потім питай
- Питай тільки те що неможливо дізнатися самому
- При помилці скрипту — аналізуй stderr і виправляй, не здавайся
- Всі кампанії створюються зі статусом PAUSED
- Після виконання завдання — короткий підсумок юзеру

Сьогодні: ${new Date().toISOString().split('T')[0]}`;
}

// ─── ГОЛОВНИЙ LOOP ────────────────────────────────────────────────────────────

/**
 * @param {Array} messages — масив { role, content } для Claude
 * @param {Function} onMessage — callback для відправки повідомлення юзеру
 * @param {Function} onAskUser — async callback що відправляє питання і повертає відповідь
 * @returns {Array} оновлений масив messages
 */
async function runAgentLoop(messages, onMessage, onAskUser) {
  let iteration = 0;
  const MAX_ITERATIONS = 20;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n🤖 [agent] iteration ${iteration}`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages
    });

    // Додаємо відповідь Claude в messages
    messages.push({ role: 'assistant', content: response.content });

    // Якщо Claude закінчив — відправляємо фінальний текст
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      if (text) await onMessage(text);
      break;
    }

    // Виконуємо всі tool_use блоки
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      // Текстові блоки до tool_use — відправляємо юзеру як прогрес
      const textBlocks = response.content.filter(b => b.type === 'text');
      for (const tb of textBlocks) {
        if (tb.text.trim()) await onMessage(tb.text);
      }

      for (const toolUse of toolUseBlocks) {
        console.log(`   🔨 ${toolUse.name}: ${JSON.stringify(toolUse.input).substring(0, 100)}`);

        let result;
        try {
          result = await executeTool(toolUse.name, toolUse.input, onAskUser);
        } catch (e) {
          result = { error: e.message };
          console.error(`   ❌ tool error: ${e.message}`);
        }

        // Якщо analyze_image — передаємо як vision content
        if (toolUse.name === 'analyze_image' && result.base64) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: [{
              type: 'image',
              source: {
                type: 'base64',
                media_type: result.media_type || 'image/jpeg',
                data: result.base64
              }
            }]
          });
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    await onMessage('⚠️ Досягнуто ліміт ітерацій. Зупиняюсь.');
  }

  return messages;
}

module.exports = { runAgentLoop };
