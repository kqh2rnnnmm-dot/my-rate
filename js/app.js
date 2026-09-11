(() => {
  const $ = (sel) => document.querySelector(sel);
  const screens = [...document.querySelectorAll('[data-screen]')];
  const calc = window.MyRateCalculator;
  const storage = window.MyRateStorage;

  let profile = storage.loadProfile();

  function show(name) {
    screens.forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function getProfileFromForm() {
    return {
      income: Number($('#income').value),
      incomePeriod: $('#income-period').value,
      daysPerWeek: Number($('#days-per-week').value),
      hoursPerDay: Number($('#hours-per-day').value),
      currency: $('#currency').value,
    };
  }

  function fillProfileForm(data) {
    if (!data) return;
    $('#income').value = data.income ?? '';
    $('#income-period').value = data.incomePeriod ?? 'month';
    $('#days-per-week').value = data.daysPerWeek ?? 5;
    $('#hours-per-day').value = data.hoursPerDay ?? 8;
    $('#currency').value = data.currency ?? '₽';
    updateRatePreview();
  }

  function updateRatePreview() {
    const draft = getProfileFromForm();
    const rate = calc.hourlyRate(draft);
    const preview = $('#rate-preview strong');
    preview.textContent = rate > 0
      ? `1 час ≈ ${calc.formatNumber(rate, 0)} ${draft.currency}`
      : 'Заполни доход';
  }

  function syncItemCurrency() {
    $('#item-currency').textContent = profile?.currency || '₽';
  }

  function renderResult(name, price) {
    const r = calc.calculateItem(profile, price);
    $('#result-item-name').textContent = name;
    $('#result-hours').textContent = calc.formatHours(r.hours);
    $('#result-days').textContent = calc.formatWorkDays(r.workDays, profile.hoursPerDay);
    $('#result-share').textContent = `${calc.formatNumber(r.share, 1)}%`;
    $('#result-rate').textContent = `1 час ≈ ${calc.formatNumber(r.rate, 0)} ${profile.currency}`;
  }

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'go-profile') {
      if (profile) fillProfileForm(profile);
      show('profile');
    }
    if (action === 'back-start') show('start');
    if (action === 'back-profile') show('profile');
    if (action === 'back-item') show('item');
    if (action === 'another-item') {
      $('#item-name').value = '';
      $('#item-price').value = '';
      show('item');
    }
    if (action === 'edit-profile') {
      fillProfileForm(profile);
      show('profile');
    }
  });

  ['#income', '#income-period', '#days-per-week', '#hours-per-day', '#currency'].forEach((sel) => {
    $(sel).addEventListener('input', updateRatePreview);
    $(sel).addEventListener('change', updateRatePreview);
  });

  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const draft = getProfileFromForm();
    if (!draft.income || !draft.daysPerWeek || !draft.hoursPerDay) return;
    profile = draft;
    storage.saveProfile(profile);
    syncItemCurrency();
    show('item');
  });

  $('#item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#item-name').value.trim();
    const price = Number($('#item-price').value);
    if (!name || !price || !profile) return;
    renderResult(name, price);
    show('result');
  });

  fillProfileForm(profile);
  syncItemCurrency();
})();
