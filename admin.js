let orders = [];
let activeFilter = 'all';

// Форматування валюти
function formatPrice(value) {
  return `${value} ₴`;
}

// Форматування дати замовлення
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('uk-UA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Отримання списку замовлень з сервера
async function fetchOrders() {
  try {
    const response = await fetch('/api/orders');
    if (!response.ok) throw new Error('Помилка завантаження даних');
    orders = await response.json();
    
    updateFilterCounts();
    renderOrders();
  } catch (err) {
    console.error('❌ Помилка завантаження замовлень:', err);
    const grid = document.getElementById('ordersGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="orders-error" style="grid-column: 1/-1; text-align: center; padding: var(--space-12) var(--space-4);">
          <p style="color: #c0392b; font-weight: 600; font-size: var(--text-lg); margin-bottom: var(--space-2);">Не вдалося завантажити замовлення</p>
          <span style="color: var(--color-text-secondary); font-size: var(--text-sm);">Перевірте, чи запущено сервер Node.js</span>
        </div>
      `;
    }
  }
}

// Оновлення кількості замовлень у табах фільтрів
function updateFilterCounts() {
  const counts = {
    all: orders.length,
    new: orders.filter(o => o.status === 'new').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length
  };

  document.getElementById('countAll').textContent = counts.all;
  document.getElementById('countNew').textContent = counts.new;
  document.getElementById('countPreparing').textContent = counts.preparing;
  document.getElementById('countReady').textContent = counts.ready;
  document.getElementById('countCompleted').textContent = counts.completed;
}

// Оновлення статусу замовлення
async function updateOrderStatus(orderId, newStatus) {
  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) throw new Error('Помилка оновлення статусу');
    
    // Оновлюємо локально для миттєвого рендерингу перед запитом на сервер
    const order = orders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    
    updateFilterCounts();
    renderOrders();
    
    // Перезавантажуємо з сервера для надійності
    fetchOrders();
  } catch (err) {
    console.error('❌ Не вдалося оновити статус:', err);
    alert('Помилка оновлення статусу замовлення');
  }
}

// Видалення замовлення
async function deleteOrder(orderId) {
  if (!confirm(`Видалити замовлення #${orderId} з бази даних?`)) return;

  try {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
    });

    if (!response.ok) throw new Error('Помилка видалення замовлення');
    
    orders = orders.filter(o => o.id !== orderId);
    updateFilterCounts();
    renderOrders();
  } catch (err) {
    console.error('❌ Не вдалося видалити замовлення:', err);
    alert('Помилка видалення замовлення');
  }
}

// Отримання тексту статусу українською
function getStatusLabel(status) {
  switch (status) {
    case 'new': return 'Нове';
    case 'preparing': return 'Готується';
    case 'ready': return 'Готово';
    case 'completed': return 'Видано';
    case 'cancelled': return 'Скасовано';
    default: return status;
  }
}

// Рендеринг замовлень
function renderOrders() {
  const grid = document.getElementById('ordersGrid');
  if (!grid) return;

  // Фільтруємо
  const filtered = activeFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === activeFilter);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="orders-empty-state" style="grid-column: 1/-1; text-align: center; padding: var(--space-12) var(--space-4); background: #fff; border-radius: var(--radius-xl); border: 1px solid rgba(11, 59, 36, 0.08);">
        <p style="font-weight: 600; font-size: var(--text-base); margin-bottom: var(--space-1); color: var(--color-text-primary);">Замовлень немає</p>
        <span style="font-size: var(--text-xs); color: var(--color-text-muted);">Немає замовлень зі статусом «${getStatusLabel(activeFilter)}»</span>
      </div>
    `;
    return;
  }

  filtered.forEach((order) => {
    const card = document.createElement('div');
    card.classList.add('order-card');
    card.classList.add(`order-card--status-${order.status}`);

    const dateStr = formatDate(order.created_at);
    const statusLabel = getStatusLabel(order.status);
    
    // Розрахунок підсумку замовлення
    const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Створення елементів списку страв
    const itemsHtml = order.items.map(item => `
      <div class="order-card-item">
        <div class="order-card-item__info">
          <span class="order-card-item__name">${item.name}</span>
          <span class="order-card-item__meta">${item.size_label} · ${item.size_volume} · ${item.quantity} шт.</span>
        </div>
        <span class="order-card-item__price">${formatPrice(item.price * item.quantity)}</span>
      </div>
    `).join('');

    // Створення кнопок управління статусом
    let actionButtonsHtml = '';
    if (order.status === 'new') {
      actionButtonsHtml = `
        <button class="btn btn--primary btn--sm" onclick="updateOrderStatus(${order.id}, 'preparing')">Прийняти в роботу</button>
        <button class="btn btn--outline btn--sm" onclick="updateOrderStatus(${order.id}, 'cancelled')" style="color: #c0392b; border-color: rgba(192, 57, 43, 0.2);">Скасувати</button>
      `;
    } else if (order.status === 'preparing') {
      actionButtonsHtml = `
        <button class="btn btn--primary btn--sm" onclick="updateOrderStatus(${order.id}, 'ready')" style="background-color: #2980b9; border-color: #2980b9;">Готово</button>
      `;
    } else if (order.status === 'ready') {
      actionButtonsHtml = `
        <button class="btn btn--primary btn--sm" onclick="updateOrderStatus(${order.id}, 'completed')" style="background-color: var(--color-mocha); border-color: var(--color-mocha);">Видати клієнту</button>
      `;
    } else {
      actionButtonsHtml = `
        <button class="btn btn--outline btn--sm" onclick="deleteOrder(${order.id})" style="color: #c0392b; border-color: rgba(192, 57, 43, 0.2); width: 100%;">Видалити замовлення</button>
      `;
    }

    card.innerHTML = `
      <header class="order-card__header">
        <div class="order-card__meta">
          <span class="order-card__id">Замовлення #${order.id}</span>
          <span class="order-card__date">${dateStr}</span>
        </div>
        <span class="order-card__badge order-card__badge--${order.status}">${statusLabel}</span>
      </header>

      <div class="order-card__client">
        <p class="order-card__client-name">${order.customer_name}</p>
        <a class="order-card__client-phone" href="tel:${order.customer_phone}">${order.customer_phone}</a>
      </div>

      <div class="order-card__pickup">
        <span class="order-card__pickup-label">Дата та час забору:</span>
        <strong class="order-card__pickup-value">${order.pickup_date} о ${order.pickup_time}</strong>
      </div>

      <div class="order-card__items">
        ${itemsHtml}
      </div>

      <div class="order-card__total">
        <span>Разом до сплати:</span>
        <strong>${formatPrice(total)}</strong>
      </div>

      <footer class="order-card__actions">
        ${actionButtonsHtml}
      </footer>
    `;

    grid.appendChild(card);
  });
}

// Ініціалізація табів фільтрів
function initFilterTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('filter-tab--active'));
      tab.classList.add('filter-tab--active');
      activeFilter = tab.dataset.status;
      renderOrders();
    });
  });
}

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('adminLoginOverlay');
  const loginForm = document.getElementById('adminLoginForm');
  const passInput = document.getElementById('adminPasswordInput');
  const errorMsg = document.getElementById('adminLoginError');
  const loginBtn = loginForm.querySelector('.admin-login-btn');

  function initAdmin() {
    overlay.classList.add('hidden');
    initFilterTabs();
    
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', () => {
      fetchOrders();
    });

    fetchOrders();
    setInterval(fetchOrders, 10000);
  }

  // Если уже авторизован в этой сессии
  if (sessionStorage.getItem('admin_auth') === 'ok') {
    initAdmin();
    return;
  }

  // Обработка формы входа
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = passInput.value;
    if (!value) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Перевірка...';

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });

      if (res.ok) {
        sessionStorage.setItem('admin_auth', 'ok');
        errorMsg.textContent = '';
        passInput.classList.remove('error');
        initAdmin();
      } else {
        errorMsg.textContent = 'Невірний пароль. Спробуйте ще раз.';
        passInput.classList.add('error');
        passInput.value = '';
        passInput.focus();
        setTimeout(() => passInput.classList.remove('error'), 500);
      }
    } catch (err) {
      errorMsg.textContent = 'Помилка з\'єднання з сервером.';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Увійти';
    }
  });
});
