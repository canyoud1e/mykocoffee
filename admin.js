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

// Отримання заголовка авторизації для API
function getAuthHeader() {
  const password = sessionStorage.getItem('admin_password');
  return password ? { 'Authorization': `Bearer ${password}` } : {};
}

let audioCtx = null;

// Ініціалізація та розблокування звуку в браузері
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Додаємо слухачі для розблокування AudioContext при першій же взаємодії
document.addEventListener('click', initAudio, { once: false });
document.addEventListener('touchstart', initAudio, { once: false });

// Програвання звуку при новому замовленні
function playNotificationSound() {
  const checkbox = document.getElementById('adminSoundCheckbox');
  if (!checkbox || !checkbox.checked) return;

  try {
    initAudio();
    if (!audioCtx) return;

    // Перший тон
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);

    // Другий тон (трохи вищий і з затримкою)
    setTimeout(() => {
      if (!audioCtx || audioCtx.state === 'suspended') return;
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
      gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.35);
    }, 80);
  } catch (e) {
    console.warn('Не вдалося відтворити звук сповіщення:', e);
  }
}

// Отримання списку замовлень з сервера
async function fetchOrders() {
  try {
    const response = await fetch('/api/orders', {
      headers: getAuthHeader()
    });
    if (!response.ok) {
      if (response.status === 401) {
        // Якщо токен недійсний (наприклад, змінився пароль) - виходимо
        sessionStorage.removeItem('admin_password');
        window.location.reload();
        return;
      }
      throw new Error('Помилка завантаження даних');
    }
    const data = await response.json();
    
    // Перевірка на нові замовлення для звукового сигналу
    const prevIds = new Set(orders.map(o => o.id));
    const newOrders = data.filter(o => !prevIds.has(o.id));
    
    orders = data;
    
    if (prevIds.size > 0 && newOrders.length > 0) {
      playNotificationSound();
    }

    updateFilterCounts();
    updateStatistics();
    renderOrders();
  } catch (err) {
    console.error('❌ Помилка завантаження замовлень:', err);
    const grid = document.getElementById('ordersGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="orders-error" style="grid-column: 1/-1; text-align: center; padding: var(--space-12) var(--space-4);">
          <p style="color: #c0392b; font-weight: 600; font-size: var(--text-lg); margin-bottom: var(--space-2);">Не вдалося завантажити замовлення</p>
          <span style="color: var(--color-text-secondary); font-size: var(--text-sm);">Перевірте з'єднання або запустіть сервер</span>
        </div>
      `;
    }
  }
}

// Оновлення статистики дашборду
function updateStatistics() {
  const completedOrders = orders.filter(o => o.status === 'completed');
  
  const totalRevenue = completedOrders.reduce((sum, order) => {
    const orderTotal = order.items.reduce((itemSum, item) => itemSum + item.price * item.quantity, 0);
    return sum + orderTotal;
  }, 0);

  const count = completedOrders.length;
  const average = count > 0 ? Math.round(totalRevenue / count) : 0;

  document.getElementById('statsRevenue').textContent = formatPrice(totalRevenue);
  document.getElementById('statsCount').textContent = count;
  document.getElementById('statsAverage').textContent = formatPrice(average);
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
        ...getAuthHeader()
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) throw new Error('Помилка оновлення статусу');
    
    const order = orders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    
    updateFilterCounts();
    updateStatistics();
    renderOrders();
    fetchOrders();
  } catch (err) {
    console.error('❌ Не вдалося оновити статус:', err);
  }
}

// Кастомний діалог підтвердження
let currentConfirmAction = null;

function showAdminConfirm(title, message, onConfirm) {
  const modal = document.getElementById('adminConfirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const messageEl = document.getElementById('confirmMessage');

  if (!modal || !titleEl || !messageEl) return;

  titleEl.textContent = title;
  messageEl.textContent = message;
  currentConfirmAction = onConfirm;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function initAdminConfirmModal() {
  const modal = document.getElementById('adminConfirmModal');
  const cancelBtn = document.getElementById('confirmCancelBtn');
  const okBtn = document.getElementById('confirmOkBtn');

  if (!modal) return;

  function closeModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    currentConfirmAction = null;
  }

  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  okBtn?.addEventListener('click', () => {
    if (typeof currentConfirmAction === 'function') {
      currentConfirmAction();
    }
    closeModal();
  });
}

// Видалення замовлення
async function deleteOrder(orderId) {
  showAdminConfirm(
    'Видалити замовлення?',
    `Ви дійсно хочете видалити замовлення #${orderId} з бази даних? Цю дію неможливо скасувати.`,
    async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: 'DELETE',
          headers: getAuthHeader()
        });

        if (!response.ok) throw new Error('Помилка видалення замовлення');
        
        orders = orders.filter(o => o.id !== orderId);
        updateFilterCounts();
        updateStatistics();
        renderOrders();
      } catch (err) {
        console.error('❌ Не вдалося видалити замовлення:', err);
      }
    }
  );
}

// Видалення всіх замовлень
async function deleteAllOrders() {
  showAdminConfirm(
    'Видалити всі замовлення?',
    'Ви дійсно хочете видалити ВСІ замовлення з бази даних? Це повністю очистить історію та статистику.',
    async () => {
      try {
        const response = await fetch('/api/orders', {
          method: 'DELETE',
          headers: getAuthHeader()
        });

        if (!response.ok) throw new Error('Помилка видалення всіх замовлень');
        
        orders = [];
        updateFilterCounts();
        updateStatistics();
        renderOrders();
      } catch (err) {
        console.error('❌ Не вдалося видалити всі замовлення:', err);
      }
    }
  );
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

  const searchInput = document.getElementById('adminSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Спочатку фільтруємо за статусом табів
  let filtered = activeFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === activeFilter);

  // Потім фільтруємо за рядком пошуку
  if (query) {
    filtered = filtered.filter(o => {
      const matchName = o.customer_name.toLowerCase().includes(query);
      const matchPhone = o.customer_phone.includes(query);
      const matchId = String(o.id) === query || `#${o.id}` === query;
      const matchItems = o.items.some(item => item.name.toLowerCase().includes(query));
      return matchName || matchPhone || matchId || matchItems;
    });
  }

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="orders-empty-state" style="grid-column: 1/-1; text-align: center; padding: var(--space-12) var(--space-4); background: #fff; border-radius: var(--radius-xl); border: 1px solid rgba(11, 59, 36, 0.08);">
        <p style="font-weight: 600; font-size: var(--text-base); margin-bottom: var(--space-1); color: var(--color-text-primary);">Нічого не знайдено</p>
        <span style="font-size: var(--text-xs); color: var(--color-text-muted);">Спробуйте змінити фільтр або параметри пошуку</span>
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
    
    const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const itemsHtml = order.items.map(item => `
      <div class="order-card-item">
        <div class="order-card-item__info">
          <span class="order-card-item__name">${item.name}</span>
          <span class="order-card-item__meta">${item.size_label} · ${item.size_volume} · ${item.quantity} шт.</span>
        </div>
        <span class="order-card-item__price">${formatPrice(item.price * item.quantity)}</span>
      </div>
    `).join('');

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

      ${order.comment ? `
      <div class="order-card__comment" style="background-color: #fff9e6; border: 1px solid #ffe8cc; color: #b25e00; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); font-weight: 500; margin-top: var(--space-2); text-align: left; word-break: break-word;">
        💬 <strong>Побажання:</strong> ${order.comment}
      </div>
      ` : ''}

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

  // Ініціалізація AudioContext на першу взаємодію користувача
  let audioCtx = null;
  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  ['click', 'keydown', 'touchstart'].forEach(type => {
    document.addEventListener(type, initAudio, { once: true });
  });

  function initAdmin() {
    overlay.classList.add('hidden');
    initFilterTabs();
    initAdminConfirmModal();
    
    // Кнопка оновлення
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', () => {
      fetchOrders();
    });

    // Кнопка видалення всього
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    deleteAllBtn?.addEventListener('click', () => {
      deleteAllOrders();
    });

    // Пошук в реальному часі
    const searchInput = document.getElementById('adminSearchInput');
    searchInput?.addEventListener('input', () => {
      renderOrders();
    });

    fetchOrders();
    setInterval(fetchOrders, 10000);
  }

  // Если уже авторизован в этой сессии (проверяем наличие сохраненного пароля)
  if (sessionStorage.getItem('admin_password')) {
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
        sessionStorage.setItem('admin_password', value);
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
