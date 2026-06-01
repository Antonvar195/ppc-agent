require('dotenv').config();

// Запускаємо HTTP сервер (privacy policy)
require('./server.js');

// Запускаємо Telegram бот
require('./bot/telegram_bot.js');
