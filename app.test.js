/**
 * Myko Coffee — Тести
 * =====================
 * Покриваємо чисті функції з app.js:
 *  - Утиліти ціноутворення (гривня ₴)
 *  - Управління кошиком
 *  - Валідація форми (українські правила)
 *  - Структура даних меню
 *  - Маска телефону (формат +38)
 */

'use strict';

const {
  coffeeMenu,
  calculatePrice,
  formatPrice,
  calculateCartTotal,
  validateName,
  validatePhone,
  validatePickupTime,
  PHONE_REGEX,
} = require('./app');


/* ==========================================================
   ГРУПА 1: Утиліти ціноутворення
   ========================================================== */
describe('calculatePrice', () => {
  test('S-розмір (multiplier=1.0) повертає базову ціну (кратну 10)', () => {
    // 60 вже кратне 10, тому округлення не змінює результат
    expect(calculatePrice(60, 1.0)).toBe(60);
  });

  test('basePrice некратна 10 округляється вгору до найближчого 10', () => {
    // 55 * 1.0 = 55 → Math.round(55/10)*10 = 60
    expect(calculatePrice(55, 1.0)).toBe(60);
  });

  test('округлює результат до 10', () => {
    // 75 * 1.3 = 97.5 → округлити до 100
    expect(calculatePrice(75, 1.3)).toBe(100);
  });

  test('подвійна ціна при multiplier=2.0', () => {
    expect(calculatePrice(110, 2.0)).toBe(220);
  });

  test('не повертає від\'ємного значення при нульовій базі', () => {
    expect(calculatePrice(0, 1.5)).toBe(0);
  });

  test('коректно працює з дробним коефіцієнтом', () => {
    expect(calculatePrice(100, 1.35)).toBe(140);
  });
});


/* ==========================================================
   ГРУПА 2: Форматування ціни (гривня ₴)
   ========================================================== */
describe('formatPrice', () => {
  test('додає символ ₴', () => {
    expect(formatPrice(340)).toBe('340 ₴');
  });

  test('нуль гривень', () => {
    expect(formatPrice(0)).toBe('0 ₴');
  });

  test('велика сума', () => {
    expect(formatPrice(1250)).toBe('1250 ₴');
  });

  test('НЕ містить символ ₽', () => {
    expect(formatPrice(100)).not.toContain('₽');
  });
});


/* ==========================================================
   ГРУПА 3: Розрахунок підсумкової суми кошика
   ========================================================== */
describe('calculateCartTotal', () => {
  test('порожній кошик = 0', () => {
    expect(calculateCartTotal([])).toBe(0);
  });

  test('одна позиція', () => {
    const cart = [{ price: 75, quantity: 1 }];
    expect(calculateCartTotal(cart)).toBe(75);
  });

  test('кілька позицій різної кількості', () => {
    const cart = [
      { price: 75,  quantity: 2 }, // 150
      { price: 115, quantity: 1 }, // 115
      { price: 65,  quantity: 3 }, // 195
    ];
    expect(calculateCartTotal(cart)).toBe(460);
  });

  test('враховує кількість товару > 1', () => {
    const cart = [{ price: 105, quantity: 4 }];
    expect(calculateCartTotal(cart)).toBe(420);
  });
});


/* ==========================================================
   ГРУПА 4: Валідація імені (українські правила)
   ========================================================== */
describe('validateName', () => {
  test('порожній рядок — невалідний', () => {
    expect(validateName('').valid).toBe(false);
  });

  test('рядок із пробілів — невалідний', () => {
    expect(validateName('   ').valid).toBe(false);
  });

  test('занадто коротке ім\'я (1 символ) — невалідне', () => {
    expect(validateName('А').valid).toBe(false);
  });

  test('ім\'я з двох символів — валідне', () => {
    expect(validateName('Ян').valid).toBe(true);
  });

  test('нормальне ім\'я — валідне', () => {
    expect(validateName('Іван Іваненко').valid).toBe(true);
  });

  test('повертає повідомлення про помилку при невалідному вводі', () => {
    const result = validateName('');
    expect(result.message).toBeTruthy();
  });

  test('повертає порожнє повідомлення при валідному вводі', () => {
    const result = validateName('Марія');
    expect(result.message).toBe('');
  });
});


/* ==========================================================
   ГРУПА 5: Валідація телефону (формат +38 / Україна)
   ========================================================== */
describe('validatePhone', () => {
  test('порожній рядок — невалідний', () => {
    expect(validatePhone('').valid).toBe(false);
  });

  test('старий російський формат — невалідний', () => {
    expect(validatePhone('+7 (916) 123-45-67').valid).toBe(false);
  });

  test('вірний формат: +380 (67) 123-45-67 — валідний', () => {
    expect(validatePhone('+380 (67) 123-45-67').valid).toBe(true);
  });

  test('вірний формат: +380 (50) 987-65-43 — валідний', () => {
    expect(validatePhone('+380 (50) 987-65-43').valid).toBe(true);
  });

  test('вірний формат: +380 (73) 000-11-22 — валідний (Lifecell)', () => {
    expect(validatePhone('+380 (73) 000-11-22').valid).toBe(true);
  });

  test('частково заповнений номер — невалідний', () => {
    expect(validatePhone('+380 (67) 123').valid).toBe(false);
  });

  test('номер без +380 — невалідний', () => {
    expect(validatePhone('671234567').valid).toBe(false);
  });

  test('номер із зайвими символами — невалідний', () => {
    expect(validatePhone('+380 (67) 123-45-678').valid).toBe(false);
  });

  test('PHONE_REGEX відповідає формату з кодом оператора', () => {
    expect(PHONE_REGEX.test('+380 (99) 999-99-99')).toBe(true);
  });

  test('PHONE_REGEX не пропускає номер із зайвими цифрами у коді', () => {
    expect(PHONE_REGEX.test('+380 (067) 123-45-67')).toBe(false);
  });
});


/* ==========================================================
   ГРУПА 6: Валідація часу самовивозу
   ========================================================== */
describe('validatePickupTime', () => {
  test('порожній рядок — невалідний', () => {
    expect(validatePickupTime('').valid).toBe(false);
  });

  test('час до відкриття (07:59) — невалідний', () => {
    expect(validatePickupTime('07:59').valid).toBe(false);
  });

  test('час відкриття (08:00) — валідний', () => {
    expect(validatePickupTime('08:00').valid).toBe(true);
  });

  test('робочий час (13:30) — валідний', () => {
    expect(validatePickupTime('13:30').valid).toBe(true);
  });

  test('час закриття (22:00) — валідний', () => {
    expect(validatePickupTime('22:00').valid).toBe(true);
  });

  test('час після закриття (22:01) — невалідний', () => {
    expect(validatePickupTime('22:01').valid).toBe(false);
  });

  test('повідомлення про помилку містить часи роботи', () => {
    const result = validatePickupTime('23:00');
    expect(result.message).toContain('08:00');
    expect(result.message).toContain('22:00');
  });
});


/* ==========================================================
   ГРУПА 7: Структура даних меню coffeeMenu
   ========================================================== */
describe('coffeeMenu — структура даних', () => {
  test('масив не порожній', () => {
    expect(coffeeMenu.length).toBeGreaterThan(0);
  });

  test('кожен елемент має обов\'язкові поля', () => {
    coffeeMenu.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('emoji');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('basePrice');
      expect(item).toHaveProperty('sizes');
    });
  });

  test('кожен елемент має як мінімум один розмір', () => {
    coffeeMenu.forEach((item) => {
      expect(item.sizes.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('basePrice — додатнє число', () => {
    coffeeMenu.forEach((item) => {
      expect(item.basePrice).toBeGreaterThan(0);
    });
  });

  test('basePrice у гривнях (не більше 500 для одиниці)', () => {
    coffeeMenu.forEach((item) => {
      expect(item.basePrice).toBeLessThan(500);
    });
  });

  test('category входить у допустимі значення', () => {
    const allowed = ['classic', 'author', 'dessert'];
    coffeeMenu.forEach((item) => {
      expect(allowed).toContain(item.category);
    });
  });

  test('id унікальний для кожного напою', () => {
    const ids = coffeeMenu.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('коефіцієнт S-розміру завжди 1.0 (базова ціна)', () => {
    coffeeMenu.forEach((item) => {
      expect(item.sizes[0].multiplier).toBe(1.0);
    });
  });

  test('присутні всі три категорії', () => {
    const categories = new Set(coffeeMenu.map((item) => item.category));
    expect(categories.has('classic')).toBe(true);
    expect(categories.has('author')).toBe(true);
    expect(categories.has('dessert')).toBe(true);
  });

  test('об\'єм у назвах розмірів містить українські одиниці або описи', () => {
    const classicItems = coffeeMenu.filter((i) => i.category === 'classic');
    classicItems.forEach((item) => {
      item.sizes.forEach((size) => {
        // Об'єм повинен бути не порожнім
        expect(size.volume.length).toBeGreaterThan(0);
      });
    });
  });
});
