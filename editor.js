/* v0.1.6: edits use an isolated copy; current draft and source snapshots stay intact. */
let recordEdit = null;

function editorRecords(kind) { return kind === 'project' ? getProjects() : getCalculations(); }
function editorCalculations() { return recordEdit.kind === 'project' ? recordEdit.draft.calculations : [recordEdit.draft]; }
function editorDirty() { return recordEdit && JSON.stringify(recordEdit.draft) !== recordEdit.original; }

function openRecordEditor(kind, id) {
  if (recordEdit || !['calculation', 'project'].includes(kind)) return;
  const original = editorRecords(kind).find(record => record.id === id);
  if (!original) return;
  recordEdit = {kind, id, original: JSON.stringify(original), draft: clone(original)};
  switchScreen('Editor');
  $('bottomNav').classList.add('hidden');
  document.body.classList.add('editing-record');
  $('editorHeading').textContent = kind === 'project' ? 'Изменить проект' : 'Изменить расчёт';
  $('editorNote').textContent = kind === 'project'
    ? 'Изменения касаются только этого проекта. Исходные сохранённые расчёты не изменятся. Доход, график и курсы каждого расчёта остаются прежними.'
    : 'Изменения касаются только этого расчёта. Его копии в проектах не изменятся. Доход, график и курсы остаются прежними.';
  $('editorTitle').value = original.title;
  $('editorError').textContent = '';
  renderRecordEditor();
  $('editorHeading').focus();
}

function finishRecordEditor() {
  if (!recordEdit) return;
  const {kind, id} = recordEdit;
  recordEdit = null;
  document.body.classList.remove('editing-record');
  $('bottomNav').classList.toggle('hidden', !profile);
  switchScreen(kind === 'project' ? 'Projects' : 'Saved');
  if (kind === 'project') openProject(id); else openSaved(id);
}

async function cancelRecordEditor() {
  if (!recordEdit) return;
  if (editorDirty() && !await confirmBox('Отменить изменения?', 'Несохранённые правки будут отменены. Исходная запись останется прежней.', 'Отменить изменения')) return;
  finishRecordEditor();
}

function editorField(container, caption, value, options, onInput) {
  const label = document.createElement('label');
  label.append(document.createTextNode(caption));
  const input = document.createElement('input');
  for (const [key, val] of Object.entries(options)) input.setAttribute(key, val);
  input.required = true;
  input.value = value;
  input.addEventListener('input', () => { onInput(input.type === 'number' ? Number(input.value) : input.value); $('editorError').textContent = ''; });
  label.append(input); container.append(label);
  return input;
}

function editorButton(container, title, callback, className = 'secondary') {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = title;
  button.onclick = callback; container.append(button); return button;
}

function renderRecordEditor() {
  if (!recordEdit) return;
  const project = recordEdit.kind === 'project';
  const container = $('editorGroups'); container.replaceChildren();
  editorCalculations().forEach((calculation, groupIndex) => {
    const group = document.createElement('section'); group.className = 'card editor-group';
    group.dataset.groupIndex = groupIndex;
    if (project) editorField(group, 'Название расчёта', calculation.title, {maxlength: '240'}, v => {calculation.title = v;});
    const note = document.createElement('p'); note.className = 'status';
    note.textContent = `Сохранённый доход: ${money(calculation.profile.income, calculation.profile.currency)} ${PERIODS[calculation.profile.period].toLowerCase()} · ${calculation.profile.days} дн./нед. · ${calculation.profile.hours} ч/день`;
    group.append(note);
    calculation.items.forEach((item, itemIndex) => {
      const row = document.createElement('div'); row.className = 'edit-item'; row.dataset.itemIndex = itemIndex;
      editorField(row, 'Что считаем?', item.name, {maxlength: '80'}, v => {item.name = v;});
      const pair = document.createElement('div'); pair.className = 'row2'; row.append(pair);
      editorField(pair, 'Цена за 1 шт.', item.price || '', {type: 'number', min: '0.01', max: '1000000000000000', step: 'any', inputmode: 'decimal'}, v => {item.price = v;});
      editorField(pair, 'Количество', item.qty, {type: 'number', min: '0.01', max: '1000000', step: 'any', inputmode: 'decimal'}, v => {item.qty = v;});
      const label = document.createElement('label'); label.append(document.createTextNode('Валюта цены'));
      const currency = document.createElement('select');
      for (const [code, symbol] of Object.entries(CURRENCIES)) {
        const option = document.createElement('option'); option.value = code; option.textContent = `${symbol} ${code}`; currency.append(option);
      }
      currency.value = item.currency;
      currency.addEventListener('change', () => {item.currency = currency.value; $('editorError').textContent = '';});
      label.append(currency); row.append(label);
      editorButton(row, 'Убрать позицию', () => {calculation.items.splice(itemIndex, 1); renderRecordEditor();}, 'linkbtn danger');
      group.append(row);
    });
    const actions = document.createElement('div'); actions.className = 'editor-group-actions';
    editorButton(actions, '+ Добавить позицию', () => {
      calculation.items.push({id: uid('item'), name: '', price: 0, qty: 1, currency: calculation.profile.currency});
      renderRecordEditor();
      const rows = $('editorGroups').querySelectorAll('.editor-group')[groupIndex].querySelectorAll('.edit-item');
      rows[rows.length - 1]?.querySelector('input')?.focus();
    });
    if (project) editorButton(actions, 'Убрать из проекта', () => {recordEdit.draft.calculations.splice(groupIndex, 1); renderRecordEditor();}, 'linkbtn danger');
    group.append(actions); container.append(group);
  });
  $('editorAddGroup').classList.toggle('hidden', !project);
  if (project) {
    const select = $('editorSource'); select.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Выбери сохранённый расчёт'; select.append(placeholder);
    const present = new Set(recordEdit.draft.calculations.map(c => c.id));
    const available = getCalculations().filter(c => !present.has(c.id));
    available.forEach(c => {const option = document.createElement('option'); option.value = c.id; option.textContent = c.title; select.append(option);});
    if (!available.length) placeholder.textContent = 'Нет других сохранённых расчётов';
    select.disabled = !available.length;
    $('editorAddCalculation').disabled = true;
  }
}

function addEditorCalculation() {
  if (recordEdit?.kind !== 'project') return;
  const source = getCalculations().find(c => c.id === $('editorSource').value);
  if (!source || recordEdit.draft.calculations.some(c => c.id === source.id)) return;
  recordEdit.draft.calculations.push(clone(source));
  renderRecordEditor();
}

function saveRecordEditor(event) {
  event?.preventDefault();
  if (!recordEdit) return;
  if (!$('recordEditForm').reportValidity()) return;
  const draft = clone(recordEdit.draft);
  draft.title = $('editorTitle').value.trim();
  const calculations = recordEdit.kind === 'project' ? draft.calculations : [draft];
  if (!draft.title || !calculations.length) { $('editorError').textContent = 'Укажи название и оставь хотя бы один расчёт.'; return; }
  for (const c of calculations) {
    c.title = c.title.trim(); c.items.forEach(it => {it.name = it.name.trim();});
    if (!c.title || !c.items.length || !validCalculation(c)) {
      $('editorError').textContent = 'В каждом расчёте должно быть название и хотя бы одна позиция с названием, положительной ценой и количеством.'; return;
    }
    if (!Number.isFinite(calculationSummary(c).h)) {
      $('editorError').textContent = `В расчёте «${c.title}» нет сохранённого курса для выбранной валюты. Укажи цену в валюте дохода (${c.profile.currency}) или в валюте с сохранённым курсом.`; return;
    }
  }
  try {
    const records = editorRecords(recordEdit.kind);
    const index = records.findIndex(r => r.id === recordEdit.id);
    if (index < 0 || JSON.stringify(records[index]) !== recordEdit.original) {
      $('editorError').textContent = 'Исходная запись уже изменена или удалена в другой вкладке. Правки не записаны. Скопируй нужные значения, отмени редактирование и открой запись заново.'; return;
    }
    draft.updatedAt = new Date().toISOString();
    records[index] = draft;
    if (recordEdit.kind === 'project') putProjects(records); else putCalculations(records);
    finishRecordEditor();
  } catch (error) {
    $('editorError').textContent = error.message || 'Не удалось сохранить изменения. Правки остались в форме.';
  }
}

// Use measured heights so wrapping text and text enlargement do not hide the last card.
function measureSelectionDock() {
  const navHeight = $('bottomNav').getBoundingClientRect().height;
  const dockHeight = $('combineDock').getBoundingClientRect().height;
  if (navHeight) document.documentElement.style.setProperty('--nav-height', `${navHeight}px`);
  if (dockHeight) document.documentElement.style.setProperty('--dock-height', `${dockHeight}px`);
}
if (typeof ResizeObserver === 'function') {
  const dockObserver = new ResizeObserver(measureSelectionDock);
  dockObserver.observe($('bottomNav')); dockObserver.observe($('combineDock'));
}
window.addEventListener('resize', measureSelectionDock);
$('editSaved').onclick = () => openRecordEditor('calculation', openedSavedId);
$('editProject').onclick = () => openRecordEditor('project', openedProjectId);
$('cancelEdit').onclick = cancelRecordEditor;
$('recordEditForm').addEventListener('submit', saveRecordEditor);
$('editorTitle').addEventListener('input', () => {if(recordEdit) recordEdit.draft.title = $('editorTitle').value;});
$('editorSource').addEventListener('change', () => {$('editorAddCalculation').disabled = !$('editorSource').value;});
$('editorAddCalculation').onclick = addEditorCalculation;
window.addEventListener('beforeunload', event => {if(editorDirty()) {event.preventDefault(); event.returnValue = '';}});
measureSelectionDock(); guardEvents();
