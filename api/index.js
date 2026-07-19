const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const IS_VERCEL = !!process.env.VERCEL;
let db = null;

// Тимчасове сховище в пам'яті для Vercel Serverless
let memoryOrders = [];
let memoryOrderItems = [];
let memoryNextOrderId = 1;
let memoryNextItemId = 1;

if (!IS_VERCEL) {
  // Використовуємо рядкову назву, щоб приховати модуль від статичного аналізу збірки Vercel
  const sqliteModuleName = 'sqlite3';
  const sqlite3 = require(sqliteModuleName).verbose();
  const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
  
  // Підключення до бази даних
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Помилка підключення до БД:', err.message);
    } else {
      console.log('📦 Успішно підключено до SQLite БД');
    }
  });

  // Ініціалізація таблиць
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        pickup_date TEXT NOT NULL,
        pickup_time TEXT NOT NULL,
        status TEXT DEFAULT 'new',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        coffee_id TEXT NOT NULL,
        name TEXT NOT NULL,
        size_label TEXT NOT NULL,
        size_volume TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
      )
    `);
    
    console.log('⚙️ Таблиці бази даних перевірено/створено');
  });
} else {
  console.log('☁️ Запущено у середовищі Vercel. Використовується in-memory сховище.');
}

// Дозволяємо JSON та статику
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Промісифіковані хелпери для БД з підтримкою Vercel In-Memory
function dbRun(query, params = []) {
  if (IS_VERCEL) {
    return new Promise((resolve) => {
      if (query.startsWith('INSERT INTO orders')) {
        const [name, phone, date, time] = params;
        const newOrder = {
          id: memoryNextOrderId++,
          customer_name: name,
          customer_phone: phone,
          pickup_date: date,
          pickup_time: time,
          status: 'new',
          created_at: new Date().toISOString()
        };
        memoryOrders.push(newOrder);
        resolve({ lastID: newOrder.id, changes: 1 });
      } else if (query.startsWith('INSERT INTO order_items')) {
        const [orderId, coffeeId, name, sizeLabel, sizeVolume, price, quantity] = params;
        const newItem = {
          id: memoryNextItemId++,
          order_id: Number(orderId),
          coffee_id: coffeeId,
          name,
          size_label: sizeLabel,
          size_volume: sizeVolume,
          price: Number(price),
          quantity: Number(quantity)
        };
        memoryOrderItems.push(newItem);
        resolve({ lastID: newItem.id, changes: 1 });
      } else if (query.startsWith('UPDATE orders')) {
        const [status, id] = params;
        const order = memoryOrders.find(o => o.id === Number(id));
        if (order) {
          order.status = status;
          resolve({ changes: 1 });
        } else {
          resolve({ changes: 0 });
        }
      } else if (query.startsWith('DELETE FROM order_items')) {
        if (params.length === 0) {
          memoryOrderItems = [];
          resolve({ changes: 1 });
        } else {
          const [orderId] = params;
          memoryOrderItems = memoryOrderItems.filter(item => item.order_id !== Number(orderId));
          resolve({ changes: 1 });
        }
      } else if (query.startsWith('DELETE FROM orders')) {
        if (params.length === 0) {
          const initialCount = memoryOrders.length;
          memoryOrders = [];
          resolve({ changes: initialCount });
        } else {
          const [id] = params;
          const initialCount = memoryOrders.length;
          memoryOrders = memoryOrders.filter(o => o.id !== Number(id));
          resolve({ changes: initialCount - memoryOrders.length });
        }
      } else {
        resolve({ changes: 0 });
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
}

function dbAll(query, params = []) {
  if (IS_VERCEL) {
    return new Promise((resolve) => {
      if (query.includes('FROM orders')) {
        const statusPriority = {
          'new': 1,
          'preparing': 2,
          'ready': 3,
          'completed': 4,
          'cancelled': 5
        };
        const sorted = [...memoryOrders].sort((a, b) => {
          const prioA = statusPriority[a.status] || 6;
          const prioB = statusPriority[b.status] || 6;
          if (prioA !== prioB) {
            return prioA - prioB;
          }
          return new Date(b.created_at) - new Date(a.created_at);
        });
        resolve(sorted);
      } else if (query.includes('FROM order_items')) {
        resolve([...memoryOrderItems]);
      } else {
        resolve([]);
      }
    });
  } else {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

function dbGet(query, params = []) {
  if (IS_VERCEL) {
    return new Promise((resolve) => {
      resolve(null);
    });
  } else {
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

/* ==========================================================
   API МАРШРУТИ
   ========================================================== */

// 0. Авторизація адмін-панелі (POST /api/auth)
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Невірний пароль' });
  }
});

// 1. Створення замовлення (POST /api/orders)
app.post('/api/orders', async (req, res) => {
  const { name, phone, pickup_date, pickup_time, time, cart } = req.body;

  // Валідація вхідних даних
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Введіть ваше ім'я" });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: "Введіть ваш номер телефону" });
  }
  
  // Сумісність зі старими запитами
  let dateVal = pickup_date;
  let timeVal = pickup_time;
  if (!dateVal && time) {
    if (time.startsWith('Завтра о ')) {
      dateVal = 'Завтра';
      timeVal = time.replace('Завтра о ', '');
    } else {
      dateVal = 'Сьогодні';
      timeVal = time;
    }
  }

  if (!dateVal || !dateVal.trim()) {
    return res.status(400).json({ error: "Вкажіть дату самовивозу" });
  }
  if (!timeVal || !timeVal.trim()) {
    return res.status(400).json({ error: "Вкажіть час самовивозу" });
  }
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: "Кошик порожній" });
  }

  try {
    // Вставка замовлення
    const orderResult = await dbRun(
      `INSERT INTO orders (customer_name, customer_phone, pickup_date, pickup_time, status) VALUES (?, ?, ?, ?, 'new')`,
      [name.trim(), phone.trim(), dateVal.trim(), timeVal.trim()]
    );
    const orderId = orderResult.lastID;

    // Вставка елементів замовлення
    for (const item of cart) {
      await dbRun(
        `INSERT INTO order_items (order_id, coffee_id, name, size_label, size_volume, price, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.coffeeId, item.name, item.sizeLabel, item.sizeVolume, item.price, item.quantity]
      );
    }

    console.log(`📦 Створено замовлення #${orderId} для ${name}`);
    res.status(201).json({ success: true, orderId });
  } catch (err) {
    console.error('❌ Помилка БД при створенні замовлення:', err.message);
    res.status(500).json({ error: 'Помилка бази даних на сервері' });
  }
});

// 2. Отримання списку замовлень (GET /api/orders)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await dbAll(`
      SELECT * FROM orders 
      ORDER BY 
        CASE status
          WHEN 'new' THEN 1
          WHEN 'preparing' THEN 2
          WHEN 'ready' THEN 3
          WHEN 'completed' THEN 4
          WHEN 'cancelled' THEN 5
          ELSE 6
        END ASC,
        created_at DESC
    `);

    const items = await dbAll(`SELECT * FROM order_items`);

    const ordersWithItems = orders.map((order) => {
      return {
        ...order,
        items: items.filter((item) => item.order_id === order.id),
      };
    });

    res.json(ordersWithItems);
  } catch (err) {
    console.error('❌ Помилка БД при отриманні замовлень:', err.message);
    res.status(500).json({ error: 'Помилка бази даних на сервері' });
  }
});

// 3. Оновлення статусу замовлення (PATCH /api/orders/:id)
app.patch('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['new', 'preparing', 'ready', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недійсний статус замовлення' });
  }

  try {
    const result = await dbRun(
      `UPDATE orders SET status = ? WHERE id = ?`,
      [status, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Замовлення не знайдено' });
    }

    console.log(`🔄 Статус замовлення #${id} змінено на "${status}"`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Помилка БД при оновленні статусу:', err.message);
    res.status(500).json({ error: 'Помилка бази даних на сервері' });
  }
});

// 4. Видалення замовлення (DELETE /api/orders/:id)
app.delete('/api/orders/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await dbRun(`DELETE FROM order_items WHERE order_id = ?`, [id]);
    const result = await dbRun(`DELETE FROM orders WHERE id = ?`, [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Замовлення не знайдено' });
    }

    console.log(`🗑️ Видалено замовлення #${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Помилка БД при видаленні замовлення:', err.message);
    res.status(500).json({ error: 'Помилка бази даних на сервері' });
  }
});

// 5. Видалення всіх замовлень (DELETE /api/orders)
app.delete('/api/orders', async (req, res) => {
  try {
    await dbRun(`DELETE FROM order_items`);
    await dbRun(`DELETE FROM orders`);
    console.log(`🗑️ Видалено всі замовлення`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Помилка БД при видаленні всіх замовлень:', err.message);
    res.status(500).json({ error: 'Помилка бази даних на сервері' });
  }
});

// Запуск сервера (тільки локально, не на Vercel)
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на http://localhost:${PORT}`);
  });
}

module.exports = app;
