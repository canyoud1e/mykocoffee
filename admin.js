let orders = [];
let activeFilter = 'all';
let currentConfirmAction = null;
let orderDetailsModal = null;
let confirmModal = null;

// Форматування валюти
function formatPrice(value) {
  return `${value} ₴`;
}

// Форматування дати замовлення
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
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
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (audioCtx && audioCtx.state === 'running') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    }
  } catch (err) {
    console.warn('Помилка ініціалізації AudioContext:', err);
  }
}

document.addEventListener('click', initAudio, { once: false });
document.addEventListener('touchstart', initAudio, { once: false });
document.addEventListener('mousedown', initAudio, { once: false });

// Програвання звуку при новому замовленні
async function playNotificationSound() {
  const checkbox = document.getElementById('adminSoundCheckbox');
  if (!checkbox || !checkbox.checked) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    gain1.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);

    setTimeout(() => {
      try {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
        gain2.gain.setValueAtTime(0.40, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.35);
      } catch (err2) {
        console.warn('Помилка відтворення другого тону:', err2);
      }
    }, 80);
  } catch (e) {
    console.warn('Не вдалося відтворити звук сповіщення:', e);
  }
}

// Отримання списку замовлень з сервера або fallback до localStorage
async function fetchOrders() {
  try {
    let fetchedData = [];
    const response = await fetch('/api/orders', {
      headers: getAuthHeader()
    });
    
    if (response.ok) {
      fetchedData = await response.json();
    } else {
      if (response.status === 401) {
        sessionStorage.removeItem('admin_password');
        window.location.reload();
        return;
      }
      throw new Error('Помилка завантаження даних');
    }

    // Якщо є збережені замовлення в localStorage
    try {
      const localLastOrder = localStorage.getItem('myko_last_order');
      const deletedList = JSON.parse(localStorage.getItem('myko_deleted_orders') || '[]');
      
      if (localLastOrder) {
        const parsed = JSON.parse(localLastOrder);
        if (parsed && parsed.orderNumber && !deletedList.includes(String(parsed.orderNumber)) && !fetchedData.some(o => String(o.id) === String(parsed.orderNumber))) {
          fetchedData.unshift({
            id: parsed.orderNumber,
            customer_name: parsed.name || 'Олексій Коваленко',
            customer_phone: parsed.phone || '+380 (67) 123-45-67',
            pickup_date: parsed.cityName || parsed.city || 'Миколаїв',
            pickup_time: parsed.branchName || parsed.branch || 'Відділення №1',
            items: parsed.cart ? parsed.cart.map(c => ({ name: c.name, size_label: c.size, size_volume: `${c.price}₴`, quantity: c.quantity, price: c.price })) : [],
            comment: parsed.orderComment || parsed.comment || parsed.wishes || 'Помол: В зернах',
            created_at: parsed.date || new Date().toISOString(),
            payment_method: parsed.paymentMethod || 'Оплата карткою online',
            delivery_service: parsed.deliveryService || 'Нова пошта'
          });
        }
      }

      // Відфільтровуємо всі видалені користувачем замовлення
      fetchedData = fetchedData.filter(o => !deletedList.includes(String(o.id)));
    } catch (e) {
      console.warn('localStorage parse error:', e);
    }
    
    const prevIds = new Set(orders.map(o => o.id));
    const newOrders = fetchedData.filter(o => !prevIds.has(o.id));
    
    orders = fetchedData;
    
    if (prevIds.size > 0 && newOrders.length > 0) {
      playNotificationSound();
    }

    updateFilterCounts();
    updateStatistics();
    renderOrdersTable();

    const timeEl = document.getElementById('lastUpdatedTime');
    if (timeEl) {
      timeEl.textContent = `Оновлено: ${new Date().toLocaleTimeString('uk-UA')}`;
    }
  } catch (err) {
    console.error('❌ Помилка завантаження замовлень:', err);
    renderOrdersTable();
  }
}

// Оновлення статистики дашборду (AdminLTE Small Boxes)
function updateStatistics() {
  const completedOrders = orders.filter(o => o.status === 'completed');
  
  const totalRevenue = completedOrders.reduce((sum, order) => {
    if (!order.items) return sum;
    const orderTotal = order.items.reduce((itemSum, item) => itemSum + (item.price || 0) * (item.quantity || 1), 0);
    return sum + orderTotal;
  }, 0);

  const count = completedOrders.length;
  const average = count > 0 ? Math.round(totalRevenue / count) : 0;
  const newCount = orders.filter(o => o.status === 'new').length;

  const revEl = document.getElementById('statsRevenue');
  const countEl = document.getElementById('statsCount');
  const avgEl = document.getElementById('statsAverage');
  const newBoxEl = document.getElementById('countNewBox');

  if (revEl) revEl.textContent = formatPrice(totalRevenue);
  if (countEl) countEl.textContent = count;
  if (avgEl) avgEl.textContent = formatPrice(average);
  if (newBoxEl) newBoxEl.textContent = newCount;
}

// Оновлення кількості замовлень у табах фільтрів AdminLTE Card Header
function updateFilterCounts() {
  const counts = {
    all: orders.length,
    new: orders.filter(o => o.status === 'new').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    completed: orders.filter(o => o.status === 'completed').length
  };

  const setBadge = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setBadge('countAll', counts.all);
  setBadge('countNew', counts.new);
  setBadge('countPreparing', counts.preparing);
  setBadge('countReady', counts.ready);
  setBadge('countCompleted', counts.completed);
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

    if (!response.ok) {
      // Оновлюємо локально для відгуку UI
      const localOrder = orders.find(o => String(o.id) === String(orderId));
      if (localOrder) localOrder.status = newStatus;
    } else {
      const order = orders.find(o => String(o.id) === String(orderId));
      if (order) order.status = newStatus;
    }
    
    updateFilterCounts();
    updateStatistics();
    renderOrdersTable();
  } catch (err) {
    console.error('❌ Не вдалося оновити статус:', err);
  }
}

// Кастомний діалог підтвердження AdminLTE
function showAdminConfirm(title, message, onConfirm) {
  const titleEl = document.getElementById('confirmTitle');
  const messageEl = document.getElementById('confirmMessage');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  currentConfirmAction = onConfirm;

  if (confirmModal) {
    confirmModal.show();
  }
}

function initAdminConfirmModal() {
  const modalEl = document.getElementById('adminConfirmModal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    confirmModal = new bootstrap.Modal(modalEl);
  }

  const okBtn = document.getElementById('confirmOkBtn');
  okBtn?.addEventListener('click', () => {
    if (typeof currentConfirmAction === 'function') {
      currentConfirmAction();
    }
    confirmModal?.hide();
  });
}

// Видалення замовлення
async function deleteOrder(orderId) {
  showAdminConfirm(
    'Видалити замовлення?',
    `Ви дійсно хочете видалити замовлення #${orderId}? Цю дію неможливо скасувати.`,
    async () => {
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: 'DELETE',
          headers: getAuthHeader()
        });
      } catch (err) {
        console.warn('Network delete warning:', err);
      }

      // Запобігаємо повторному відновленню видаленого замовлення з localStorage
      try {
        const localLastOrder = localStorage.getItem('myko_last_order');
        if (localLastOrder) {
          const parsed = JSON.parse(localLastOrder);
          if (parsed && String(parsed.orderNumber) === String(orderId)) {
            localStorage.removeItem('myko_last_order');
          }
        }
        let deletedList = JSON.parse(localStorage.getItem('myko_deleted_orders') || '[]');
        deletedList.push(String(orderId));
        localStorage.setItem('myko_deleted_orders', JSON.stringify(deletedList));
      } catch (e) {}

      orders = orders.filter(o => String(o.id) !== String(orderId));
      updateFilterCounts();
      updateStatistics();
      renderOrdersTable();
    }
  );
}

// Видалення всіх замовлень
async function deleteAllOrders() {
  showAdminConfirm(
    'Видалити всі замовлення?',
    'Ви дійсно хочете очистити ВСІ замовлення з бази даних? Це очистить історію замовлень.',
    async () => {
      try {
        await fetch('/api/orders', {
          method: 'DELETE',
          headers: getAuthHeader()
        });
      } catch (err) {
        console.warn('Network delete all warning:', err);
      }
      orders = [];
      localStorage.removeItem('myko_last_order');
      localStorage.removeItem('myko_deleted_orders');
      updateFilterCounts();
      updateStatistics();
      renderOrdersTable();
    }
  );
}

// Отримання badge статусу AdminLTE
function getStatusBadgeHtml(status) {
  switch (status) {
    case 'new': return '<span class="badge bg-danger">Нове</span>';
    case 'preparing': return '<span class="badge bg-warning text-dark">Готується</span>';
    case 'ready': return '<span class="badge bg-info text-dark">Готово</span>';
    case 'completed': return '<span class="badge bg-success">Видано</span>';
    case 'cancelled': return '<span class="badge bg-secondary">Скасовано</span>';
    default: return `<span class="badge bg-secondary">${status}</span>`;
  }
}

// Показує модальне вікно з деталями замовлення
function showOrderDetailsModal(orderId) {
  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const modalTitle = document.getElementById('modalOrderTitle');
  const modalBody = document.getElementById('modalOrderBody');

  if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-receipt me-2"></i>Замовлення #${order.id}`;

  const itemsListHtml = (order.items || []).map(item => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div>
        <strong class="d-block text-dark">${item.name}</strong>
        <small class="text-muted">${item.size_label || ''} ${item.size_volume ? '· ' + item.size_volume : ''} · ${item.quantity || 1} шт.</small>
      </div>
      <span class="fw-bold text-dark">${formatPrice((item.price || 0) * (item.quantity || 1))}</span>
    </div>
  `).join('');

  const totalAmount = (order.items || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

  const commentText = order.comment || order.orderComment || order.wishes || '';
  const commentHtml = commentText ? `
    <div class="alert alert-warning border-0 text-dark p-3 mb-3 rounded-3" style="background-color: #fff8e1;">
      <h6 class="fw-bold mb-1 text-warning-emphasis"><i class="bi bi-chat-left-dots me-1.5"></i> Побажання / Коментар клієнта:</h6>
      <p class="mb-0 small fw-medium text-dark">${commentText}</p>
    </div>
  ` : '';

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-6">
          <label class="text-muted small d-block">Клієнт</label>
          <strong class="text-dark fs-6">${order.customer_name || 'Олексій Коваленко'}</strong>
        </div>
        <div class="col-6">
          <label class="text-muted small d-block">Телефон</label>
          <a href="tel:${order.customer_phone}" class="text-decoration-none fw-semibold">${order.customer_phone || '+380 (67) 123-45-67'}</a>
        </div>
        <div class="col-6">
          <label class="text-muted small d-block">Доставка / Пункт</label>
          <span class="badge bg-light text-dark border">${order.pickup_date || order.cityName || 'Миколаїв'}</span>
          <small class="d-block text-muted mt-1">${order.pickup_time || order.branchName || 'Відділення №1'}</small>
        </div>
        <div class="col-6">
          <label class="text-muted small d-block">Спосіб оплати</label>
          <span class="badge bg-light text-dark border">${order.payment_method || 'Оплата карткою online'}</span>
        </div>
      </div>

      ${commentHtml}

      <div class="card border-0 bg-light p-3 mb-3">
        <h6 class="fw-bold mb-2 text-dark"><i class="bi bi-cart-check me-1"></i> Товари у замовленні:</h6>
        ${itemsListHtml || '<p class="text-muted small mb-0">Кава Brazil Mogiana (240ml) × 1</p>'}
      </div>

      <div class="d-flex justify-content-between align-items-center p-3 bg-dark text-white rounded">
        <span>Загальна сума замовлення:</span>
        <h4 class="fw-bold mb-0 text-warning">${formatPrice(totalAmount || 1080)}</h4>
      </div>
    `;
  }

  if (orderDetailsModal) {
    orderDetailsModal.show();
  }
}

// Рендеринг таблиці замовлень в AdminLTE 4 Card Table
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('adminSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let filtered = activeFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === activeFilter);

  if (query) {
    filtered = filtered.filter(o => {
      const matchName = (o.customer_name || '').toLowerCase().includes(query);
      const matchPhone = (o.customer_phone || '').includes(query);
      const matchId = String(o.id) === query || `#${o.id}` === query;
      const matchItems = (o.items || []).some(item => (item.name || '').toLowerCase().includes(query));
      return matchName || matchPhone || matchId || matchItems;
    });
  }

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2 text-secondary opacity-50"></i>
          <p class="mb-1 fw-bold text-dark">Замовлень не знайдено</p>
          <small class="text-muted">Змініть фільтр або параметри пошуку</small>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((order) => {
    const tr = document.createElement('tr');
    tr.className = 'order-card-row';

    const dateStr = formatDate(order.created_at);
    const badgeHtml = getStatusBadgeHtml(order.status);
    const total = (order.items || []).reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

    const itemsSummary = (order.items || []).map(i => `${i.name} (${i.quantity} шт)`).join(', ') || 'Кава Brazil Mogiana';
    const commentText = order.comment || order.orderComment || order.wishes || '';
    const commentBadge = commentText ? `<div class="text-warning-emphasis small mt-1 fw-semibold text-truncate" style="max-width:210px;" title="${commentText}"><i class="bi bi-chat-left-dots me-1"></i>${commentText}</div>` : '';

    let actionButtonsHtml = '';
    if (order.status === 'new') {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-primary py-1 px-2 me-1" onclick="updateOrderStatus('${order.id}', 'preparing')" title="Прийняти в роботу">
          <i class="bi bi-play-fill me-1"></i>Прийняти
        </button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="updateOrderStatus('${order.id}', 'cancelled')" title="Скасувати">
          <i class="bi bi-x"></i>
        </button>
      `;
    } else if (order.status === 'preparing') {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-warning text-dark py-1 px-2" onclick="updateOrderStatus('${order.id}', 'ready')" title="Позначити готовність">
          <i class="bi bi-check2-circle me-1"></i>Готово
        </button>
      `;
    } else if (order.status === 'ready') {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-success py-1 px-2" onclick="updateOrderStatus('${order.id}', 'completed')" title="Видати клієнту">
          <i class="bi bi-box-arrow-up-right me-1"></i>Видати
        </button>
      `;
    } else {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-outline-secondary py-1 px-2 me-1" onclick="showOrderDetailsModal('${order.id}')" title="Деталі">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger py-1 px-2" onclick="deleteOrder('${order.id}')" title="Видалити">
          <i class="bi bi-trash"></i>
        </button>
      `;
    }

    tr.innerHTML = `
      <td class="ps-3 fw-bold text-dark">#${order.id}</td>
      <td class="small text-secondary">${dateStr}</td>
      <td class="fw-semibold text-dark">${order.customer_name || 'Клієнт'}</td>
      <td>
        <a href="tel:${order.customer_phone}" class="text-decoration-none small fw-medium">${order.customer_phone || '—'}</a>
      </td>
      <td class="small text-secondary">
        <span class="d-block fw-semibold text-dark">${order.pickup_date || order.cityName || 'Миколаїв'}</span>
        <span class="text-muted small">${order.pickup_time || order.branchName || 'Відділення №1'}</span>
      </td>
      <td class="small text-muted" style="max-width: 220px;">
        <span class="d-block text-truncate fw-medium text-dark">${itemsSummary}</span>
        ${commentBadge}
      </td>
      <td class="fw-bold text-dark">${formatPrice(total)}</td>
      <td>${badgeHtml}</td>
      <td class="text-end pe-3">
        ${actionButtonsHtml}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// Ініціалізація табів фільтрів
function initFilterTabs() {
  const tabBtns = document.querySelectorAll('#filterTabs .nav-link');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.status;
      renderOrdersTable();
    });
  });
}

// Ініціалізація сторінки AdminLTE 4
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('adminLoginOverlay');
  const loginForm = document.getElementById('adminLoginForm');
  const passInput = document.getElementById('adminPasswordInput');
  const errorMsg = document.getElementById('adminLoginError');
  const loginBtn = document.getElementById('adminLoginBtn');

  // Modal init
  const detailsModalEl = document.getElementById('orderDetailsModal');
  if (detailsModalEl && typeof bootstrap !== 'undefined') {
    orderDetailsModal = new bootstrap.Modal(detailsModalEl);
  }
  initAdminConfirmModal();

  function initAdmin() {
    overlay?.classList.add('hidden');
    initFilterTabs();
    
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
      renderOrdersTable();
    });

    fetchOrders();
    setInterval(fetchOrders, 10000);
  }

  // Авторизація сесії
  if (sessionStorage.getItem('admin_password')) {
    initAdmin();
    return;
  }

  // Обробка входу
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = passInput.value;
    if (!value) return;

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Перевірка...';

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });

      if (res.ok) {
        sessionStorage.setItem('admin_password', value);
        errorMsg.classList.add('d-none');
        initAdmin();
      } else {
        errorMsg.classList.remove('d-none');
        errorMsg.textContent = 'Невірний пароль. Спробуйте ще раз.';
        passInput.value = '';
        passInput.focus();
      }
    } catch (err) {
      errorMsg.classList.remove('d-none');
      errorMsg.textContent = 'Помилка з\'єднання з сервером.';
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Увійти в адмінку';
    }
  });
});
