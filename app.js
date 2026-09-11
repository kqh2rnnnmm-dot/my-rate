const $=id=>document.getElementById(id);
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=prefix=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
let profile=null,items=[],unit='hours',fx=null,selectedSaved=new Set(),openedSavedId=null,openedProjectId=null;
const wheelState={incomeCurrency:'RUB',itemCurrency:'RUB',period:'month',unit:'hours',savedUnit:'hours',projectUnit:'hours'};

function autoTitle(arr){if(!arr?.length)return 'Расчёт';if(arr.length===1){const x=arr[0];return `${x.name}${x.qty!==1?' ×'+fmt(x.qty,2):''}`}return arr.slice(0,2).map(x=>x.name).join(' + ')+(arr.length>2?` + ещё ${arr.length-2}`:'')}
function haptic(){try{if(typeof navigator.vibrate==='function')navigator.vibrate(7)}catch(e){}}

/* custom modal */
let modalResolve=null,modalFocus=null;
function modalShow({title='Сообщение',text='',ok='Понятно',cancel='',input=false,value='',placeholder=''}){return new Promise(resolve=>{if(modalResolve)modalClose(false);modalResolve=resolve;modalFocus=document.activeElement;$('modalTitle').textContent=title;$('modalText').textContent=text;$('modalOk').textContent=ok;$('modalCancel').textContent=cancel||'Отмена';$('modalCancel').classList.toggle('hidden',!cancel);$('modalInput').classList.toggle('hidden',!input);$('modalInput').value=value;$('modalInput').placeholder=placeholder;$('modalLayer').classList.remove('hidden');document.querySelector('main').inert=true;$('bottomNav').inert=true;$('combineDock').inert=true;setTimeout(()=>{(input?$('modalInput'):$('modalOk')).focus()},0)})}
function modalClose(result){$('modalLayer').classList.add('hidden');document.querySelector('main').inert=false;$('bottomNav').inert=false;$('combineDock').inert=false;modalFocus?.focus();const value=$('modalInput').value;const r=modalResolve;modalResolve=null;if(r)r({result,value})}
$('modalOk').onclick=()=>modalClose(true);$('modalCancel').onclick=()=>modalClose(false);$('modalLayer').addEventListener('click',e=>{if(e.target===$('modalLayer')&&!$('modalCancel').classList.contains('hidden'))modalClose(false)});$('modalInput').addEventListener('keydown',e=>{if(e.key==='Enter')modalClose(true)});
$('modalLayer').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();modalClose(false)}if(e.key==='Tab'){const nodes=[...$('modalLayer').querySelectorAll('input,button')].filter(x=>!x.classList.contains('hidden'));const i=nodes.indexOf(document.activeElement);e.preventDefault();nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus()}});
async function notify(title,text){await modalShow({title,text})}
async function confirmBox(title,text,ok='Удалить'){const r=await modalShow({title,text,ok,cancel:'Отмена'});return r.result}
async function promptBox(title,text,value=''){const r=await modalShow({title,text,ok:'Сохранить',cancel:'Отмена',input:true,value});return r.result?r.value.trim():null}

/* wheel component */
function getWheel(name){return document.querySelector(`[data-wheel="${name}"]`)}
function setInteracting(wheel,on){wheel.parentElement.classList.toggle('interacting',on)}
function updateWheelVisual(name, fire=true, user=false) {
  const wheel=getWheel(name); if(!wheel || !wheel.getClientRects().length)return;
  const opts=[...wheel.children], idx=Math.max(0,Math.min(opts.length-1,Math.round(wheel.scrollTop/WHEEL_H)));
  if(!opts[idx])return;
  opts.forEach((o,i)=>{o.classList.toggle('selected',i===idx);o.setAttribute('aria-selected',String(i===idx))});
  const value=opts[idx].dataset.value;
  wheel.setAttribute('aria-activedescendant',opts[idx].id);
  if(!fire)return; // Selection and displayed result must change together, including during touch.
  if(wheelState[name]!==value){wheelState[name]=value;if(user)haptic();wheel._onChange?.(value)}
}
function finalizeWheel(name) {
 const wheel=getWheel(name);if(!wheel || !wheel.getClientRects().length || wheel._touching)return;
 updateWheelVisual(name,true,true);
 selectWheel(name,wheelState[name],false,false);
 setInteracting(wheel,false);
}
function setupWheel(name,entries,onChange) {
 const wheel=getWheel(name); if(!wheel)return;
 const labels={incomeCurrency:'Валюта дохода',itemCurrency:'Валюта цены',period:'Период дохода',unit:'Единица текущего расчёта',savedUnit:'Единица сохранённого расчёта',projectUnit:'Единица проекта'};
 wheel.setAttribute('role','listbox');wheel.setAttribute('aria-label',labels[name]);wheel.tabIndex=0;
 wheel.innerHTML=''; wheel._onChange=onChange?value=>{try{onChange(value)}catch(e){showStorageWarning(e.message);void notify('Не удалось сохранить',e.message)}}:null;
 entries.forEach(([value,label])=>{const el=document.createElement('div');el.className='wheel-option';el.id='wheel-'+name+'-'+value;el.dataset.value=value;el.textContent=label;el.setAttribute('role','option');el.onclick=()=>selectWheel(name,value,false,true);wheel.append(el)});
 wheel.addEventListener('scroll',()=>{updateWheelVisual(name,true,true);clearTimeout(wheel._scrollTimer);wheel._scrollTimer=setTimeout(()=>finalizeWheel(name),160)},{passive:true});
 wheel.addEventListener('touchstart',()=>{wheel._touching=true;setInteracting(wheel,true)},{passive:true});
 const endTouch=()=>{wheel._touching=false;clearTimeout(wheel._scrollTimer);wheel._scrollTimer=setTimeout(()=>finalizeWheel(name),180)};
 wheel.addEventListener('touchend',endTouch,{passive:true});wheel.addEventListener('touchcancel',endTouch,{passive:true});
 wheel.addEventListener('wheel',e=>{if(!e.deltaY)return;e.preventDefault();setInteracting(wheel,true);wheel.scrollTop+=Math.sign(e.deltaY)*WHEEL_H;clearTimeout(wheel._scrollTimer);wheel._scrollTimer=setTimeout(()=>finalizeWheel(name),120)},{passive:false});
 wheel.addEventListener('keydown',e=>{const keys=['ArrowDown','ArrowUp','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const opts=[...wheel.children];let i=opts.findIndex(o=>o.dataset.value===wheelState[name]);i=e.key==='Home'?0:e.key==='End'?opts.length-1:i+(e.key==='ArrowDown'?1:-1);selectWheel(name,opts[Math.max(0,Math.min(opts.length-1,i))].dataset.value,false,true)});
 selectWheel(name,wheelState[name],false,false);
}
function selectWheel(name,value,smooth=false,fire=true) {
 const wheel=getWheel(name);if(!wheel)return;
 clearTimeout(wheel._scrollTimer);
 const opts=[...wheel.children];let idx=opts.findIndex(o=>o.dataset.value===value);if(idx<0)idx=0;
 const old=wheelState[name];wheelState[name]=opts[idx]?.dataset.value||value;
 opts.forEach((o,i)=>{o.classList.toggle('selected',i===idx);o.setAttribute('aria-selected',String(i===idx))});
 if(opts[idx])wheel.setAttribute('aria-activedescendant',opts[idx].id);
 if(wheel.getClientRects().length)wheel.scrollTop=idx*WHEEL_H;
 if(fire && old!==wheelState[name])wheel._onChange?.(wheelState[name]);
}
function syncVisibleWheels(){document.querySelectorAll('[data-wheel]').forEach(w=>{if(w.getClientRects().length)selectWheel(w.dataset.wheel,wheelState[w.dataset.wheel],false,false)})}
function commitVisibleWheels(){document.querySelectorAll('[data-wheel]').forEach(w=>{if(w.getClientRects().length)finalizeWheel(w.dataset.wheel)})}
function initWheels(){setupWheel('incomeCurrency',Object.entries(CURRENCIES).map(([c,s])=>[c,`${s} ${c}`]));setupWheel('itemCurrency',Object.entries(CURRENCIES).map(([c,s])=>[c,`${s} ${c}`]));setupWheel('period',Object.entries(PERIODS));setupWheel('unit',Object.entries(UNITS),v=>{unit=v;renderCurrent()});setupWheel('savedUnit',Object.entries(UNITS),v=>changeOpenedSavedUnit(v));setupWheel('projectUnit',Object.entries(UNITS),v=>changeOpenedProjectUnit(v))}

/* navigation */
function switchScreen(name){['Current','Saved','Projects','Editor'].forEach(n=>$(`screen${n}`).classList.toggle('active',n===name));document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));if(name==='Saved'){closeSavedDetail();renderSaved()}if(name==='Projects'){closeProjectDetail();renderProjects()}updateSelected();syncVisibleWheels();window.scrollTo({top:0,behavior:'auto'})}
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>switchScreen(b.dataset.screen));

/* profile and current calculation */
async function saveProfile(){
 commitVisibleWheels();
 const p={income:+$('income').value,currency:wheelState.incomeCurrency,period:wheelState.period,days:+$('days').value,hours:+$('hours').value};
 if(!validProfile(p) || !['income','days','hours'].every(id=>$(id).checkValidity())){await notify('Проверь данные','Доход должен быть больше нуля, дней в неделю — от 0,5 до 7, часов в день — от 0,5 до 24. Проверь допустимый шаг полей.');return}
 storeJSON(LS.profile,p); profile=p; if(fx?.base!==p.currency)fx=null;
 showProfile(); await loadFx(false);migrateLegacyOnce();
}
function showProfile(){if(!profile)return;$('profileEdit').classList.add('hidden');$('profileView').classList.remove('hidden');$('converter').classList.remove('hidden');$('bottomNav').classList.remove('hidden');$('rateText').textContent=`1 час = ${money(hourly(profile),profile.currency)}`;$('profileText').textContent=`${fmt(profile.income)} ${CURRENCIES[profile.currency]} ${PERIODS[profile.period].toLowerCase()} · ${profile.days} дн./нед. · ${profile.hours} ч/день`;selectWheel('itemCurrency',profile.currency,false,false);syncVisibleWheels();renderCurrent()}
function editProfile(){$('profileEdit').classList.remove('hidden');$('profileView').classList.add('hidden');$('converter').classList.add('hidden');$('income').value=profile.income;selectWheel('incomeCurrency',profile.currency,false,false);selectWheel('period',profile.period,false,false);$('days').value=profile.days;$('hours').value=profile.hours;syncVisibleWheels()}
let fxRequest=0;
async function loadFx(force=false){
 if(!profile)return;
 const base=profile.currency,request=++fxRequest;
 let cached=readJSON(LS.fx,null); if(!validFx(cached,base))cached=null;
 fx=cached;
 const fresh=cached && Date.now()-cached.savedAt>=0 && Date.now()-cached.savedAt<86400000;
 if(fresh&&!force){$('fxStatus').textContent=`Курс валют сохранён: ${new Date(cached.updated*1000).toLocaleDateString('ru-RU')}`;renderCurrent();return}
 $('fxStatus').textContent='Обновляю курсы валют…';renderCurrent();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const r=await fetch(`https://open.er-api.com/v6/latest/${base}`,{signal:controller.signal});
  if(!r.ok)throw new Error('HTTP');const d=await r.json();
  const next={base,rates:d.rates,updated:d.time_last_update_unix,savedAt:Date.now()};
  if(d.result!=='success'||d.base_code!==base||!validFx(next,base))throw new Error('Invalid rates');
  if(request!==fxRequest||profile.currency!==base)return;
  fx=next;try{storeJSON(LS.fx,fx)}catch(e){showStorageWarning(e.message)}
  $('fxStatus').textContent=`Курс валют обновлён: ${new Date(fx.updated*1000).toLocaleDateString('ru-RU')}`;
 }catch(e){
  if(request!==fxRequest||profile.currency!==base)return;
  fx=cached;$('fxStatus').textContent=cached?`Нет свежего курса — использую сохранённый от ${new Date(cached.updated*1000).toLocaleDateString('ru-RU')}.`:'Не удалось получить курс валют. В своей валюте считать можно.';
 }finally{clearTimeout(timer);if(request===fxRequest)renderCurrent()}
}
async function addItem(){
 if(!profile)return;commitVisibleWheels();
 const it={id:uid('item'),name:$('itemName').value.trim(),price:+$('itemPrice').value,qty:+$('itemQty').value,currency:wheelState.itemCurrency};
 if(!validItem(it)){await notify('Проверь данные','Укажи название, положительную цену и количество. Цена — от 0,01 до 1 000 000 000 000 000, количество — от 0,01 до 1 000 000.');return}
 if(!Number.isFinite(hoursForItem(it,profile,fx))){void loadFx(true);await notify('Нужен курс валют','Курс для этой валюты недоступен. Обновляю его; попробуй добавить позицию ещё раз.');return}
 items.push(it);$('itemName').value='';$('itemPrice').value='';$('itemQty').value=1;renderCurrent();
}
function currentSummary(){return calculationSummary({profile,items,fx})}
function renderCurrent(){if(!profile)return;saveDraft();$('saveSetActions').classList.toggle('hidden',items.length===0);$('currentTitle').textContent=items.length?`Текущий расчёт · ${items.length} ${positionWord(items.length)}`:'Текущий расчёт';const box=$('itemsList');box.innerHTML='';if(!items.length){box.innerHTML='<div class="empty">Добавь первую вещь — она появится здесь.</div>';$('totalCard').classList.add('hidden');return}for(const it of items){const h=hoursForItem(it,profile,fx),base=toBaseFor(it.price*it.qty,it.currency,profile,fx);const el=document.createElement('div');el.className='item';el.innerHTML=`<div class="item-top"><div class="item-title"></div><button class="remove" aria-label="Удалить">×</button></div><div class="item-result">${Number.isFinite(h)?smart(unitValue(h,unit,profile),unit):'нужен курс валют'}</div><div class="item-meta">${fmt(it.qty,2)} × ${money(it.price,it.currency)}${it.currency!==profile.currency&&Number.isFinite(base)?` ≈ ${money(base,profile.currency)}`:''}</div>`;el.querySelector('.item-title').textContent=it.name;el.querySelector('.remove').onclick=()=>{items=items.filter(x=>x.id!==it.id);renderCurrent()};box.append(el)}const total=currentSummary();$('totalCard').classList.toggle('hidden',items.length<2);$('totalValue').textContent=Number.isFinite(total.h)?smart(unitValue(total.h,unit,profile),unit):'Нужен курс валют';$('totalMoney').textContent=Number.isFinite(total.m)?`≈ ${money(total.m,profile.currency)} по текущему расчёту`:'Итог недоступен: не все позиции можно пересчитать';$('saveSet').disabled=!Number.isFinite(total.h)}

/* storage */
function getCalculations(){return readRecords(LS.calculations,validCalculation)}
function putCalculations(arr){storeJSON(LS.calculations,arr)}
function getProjects(){return readRecords(LS.projects,validProject)}
function putProjects(arr){storeJSON(LS.projects,arr)}
function snapshotCalculation(title=autoTitle(items)){return {id:uid('calc'),date:new Date().toISOString(),type:'calculation',title,items:clone(items),profile:clone(profile),fx:fx?clone(fx):null,displayUnit:unit}}
async function saveSet(){commitVisibleWheels();if(!items.length)return;if(!Number.isFinite(currentSummary().h)){await notify('Нужен курс валют','Дождись курса для всех позиций.');return}const calculations=getCalculations();calculations.unshift(snapshotCalculation());putCalculations(calculations);items=[];$('itemName').value='';$('itemPrice').value='';$('itemQty').value='1';renderCurrent();renderSaved();await notify('Сохранено','Текущий расчёт добавлен в сохранённые.')}
function calculationSummary(c){
 if(!validProfile(c.profile))return {h:NaN,m:NaN};
 let h=0,m=0;for(const it of c.items||[]){if(!validItem(it))return {h:NaN,m:NaN};h+=hoursForItem(it,c.profile,c.fx);m+=toBaseFor(it.price*it.qty,it.currency,c.profile,c.fx)}
 return {h,m};
}
function projectSummary(project){
 let h=0;const amounts={};
 for(const c of project.calculations||[]){const s=calculationSummary(c);h+=s.h;amounts[c.profile.currency]=(Object.hasOwn(amounts,c.profile.currency)?amounts[c.profile.currency]:0)+s.m}
 return {h,amounts};
}
function projectTime(project,u){let value=0;for(const c of project.calculations||[])value+=unitValue(calculationSummary(c).h,u,c.profile);return Number.isFinite(value)?smart(value,u):'Нужен курс валют'}
function projectMoney(project){const amounts=projectSummary(project).amounts;return Object.entries(amounts).map(([c,n])=>Number.isFinite(n)?money(n,c):`Нужен курс ${c}`).join(' + ')}
function migrateLegacyOnce(){
 if(!profile||readJSON(LS.migrated,null))return;
 const legacy=readJSON(LEGACY_SAVED,[]);
 if(!Array.isArray(legacy)){showStorageWarning('Старые записи имеют неизвестный формат. Исходные данные сохранены.');return}
 if(!legacy.length){storeJSON(LS.migrated,1);return}
 // v0.1.1 records without snapshots cannot be reconstructed faithfully.
 showStorageWarning('Найдены старые записи v0.1.1 без подтверждённого снимка дохода и курсов. Они сохранены в браузере, но не пересчитаны по сегодняшнему доходу. Для переноса требуется проверка старого формата.');
}

/* saved calculations */
function renderSaved(){const calculations=getCalculations(),box=$('savedList');box.innerHTML='';selectedSaved=new Set([...selectedSaved].filter(id=>calculations.some(c=>c.id===id)));if(!calculations.length){box.innerHTML='<div class="empty">Пока ничего не сохранено.</div>';updateSelected();return}for(const c of calculations){const sum=calculationSummary(c),p=c.profile||profile,u=c.displayUnit||'hours';const e=document.createElement('div');e.className='saved-card';e.innerHTML=`<div class="saved-head"><input class="saved-check" type="checkbox" aria-label="Выбрать"><div class="saved-main"><div class="saved-title"></div><div class="saved-meta">${new Date(c.date).toLocaleDateString('ru-RU')} · ${(c.items||[]).length} поз.</div><div class="saved-summary">${Number.isFinite(sum.h)?smart(unitValue(sum.h,u,p),u):'Нужен курс валют'}${Number.isFinite(sum.m)?` · ${money(sum.m,p.currency)}`:''}</div><div class="saved-actions"><button class="linkbtn open">Открыть</button><button class="linkbtn edit">Изменить</button><button class="linkbtn rename">Переименовать</button><button class="linkbtn danger del">Удалить</button></div></div></div>`;e.querySelector('.saved-title').textContent=c.title;const ch=e.querySelector('.saved-check');ch.checked=selectedSaved.has(c.id);ch.onchange=()=>{ch.checked?selectedSaved.add(c.id):selectedSaved.delete(c.id);updateSelected()};e.querySelector('.open').onclick=()=>openSaved(c.id);e.querySelector('.edit').onclick=()=>openRecordEditor('calculation',c.id);e.querySelector('.rename').onclick=async()=>{const name=await promptBox('Переименовать','Как назвать этот расчёт?',c.title);if(!name)return;const arr=getCalculations(),target=arr.find(x=>x.id===c.id);if(target){target.title=name;putCalculations(arr);renderSaved()}};e.querySelector('.del').onclick=async()=>{if(!(await confirmBox('Удалить расчёт?',`«${c.title}» будет удалён.`)))return;putCalculations(getCalculations().filter(x=>x.id!==c.id));selectedSaved.delete(c.id);renderSaved()};box.append(e)}updateSelected()}
function updateSelected(){
 const n=selectedSaved.size;
 const show=n>=2 && $('screenSaved').classList.contains('active') && !$('savedListView').classList.contains('hidden');
 $('combineDock').classList.toggle('hidden',!show);
 $('combineSaved').disabled=!show;
 document.body.classList.toggle('selection-active',show);
 $('selectedCount').textContent=n?`Выбрано: ${n}`:'';
}
async function combineSelected(){const calculations=getCalculations(),chosen=calculations.filter(c=>selectedSaved.has(c.id));if(chosen.length<2)return;const name=await promptBox('Новый проект','Как назвать объединённый проект?','Новый проект');if(!name)return;const projects=getProjects();projects.unshift({id:uid('project'),date:new Date().toISOString(),type:'project',title:name,displayUnit:'hours',calculations:clone(chosen)});putProjects(projects);selectedSaved.clear();renderSaved();renderProjects();await notify('Проект создан',`Объединено расчётов: ${chosen.length}.`)}
function openSaved(id){const c=getCalculations().find(x=>x.id===id);if(!c)return;openedSavedId=id;$('savedListView').classList.add('hidden');$('savedDetailView').classList.remove('hidden');selectWheel('savedUnit',c.displayUnit||'hours',false,false);renderSavedDetail();updateSelected();syncVisibleWheels();window.scrollTo({top:0,behavior:'auto'})}
function closeSavedDetail(){openedSavedId=null;$('savedDetailView').classList.add('hidden');$('savedListView').classList.remove('hidden')}
function renderSavedDetail(){const c=getCalculations().find(x=>x.id===openedSavedId);if(!c)return;$('savedTotalCard').classList.toggle('hidden',c.items.length<2);const p=c.profile||profile,rates=c.fx,u=c.displayUnit||'hours',sum=calculationSummary(c);$('savedDetailTitle').textContent=c.title;$('savedDetailMeta').textContent=`${new Date(c.date).toLocaleDateString('ru-RU')} · ${(c.items||[]).length} поз.`;const box=$('savedDetailItems');box.innerHTML='';for(const it of c.items||[]){const h=hoursForItem(it,p,rates),base=toBaseFor(it.price*it.qty,it.currency,p,rates);const el=document.createElement('div');el.className='item';el.innerHTML=`<div class="item-title"></div><div class="item-result">${Number.isFinite(h)?smart(unitValue(h,u,p),u):'нужен курс валют'}</div><div class="item-meta">${fmt(it.qty,2)} × ${money(it.price,it.currency)}${it.currency!==p.currency&&Number.isFinite(base)?` ≈ ${money(base,p.currency)}`:''}</div>`;el.querySelector('.item-title').textContent=it.name;box.append(el)}$('savedDetailTotal').textContent=Number.isFinite(sum.h)?smart(unitValue(sum.h,u,p),u):'Нужен курс валют';$('savedDetailMoney').textContent=Number.isFinite(sum.m)?`≈ ${money(sum.m,p.currency)}`:''}
function changeOpenedSavedUnit(value){if(!openedSavedId)return;const arr=getCalculations(),c=arr.find(x=>x.id===openedSavedId);if(!c)return;c.displayUnit=value;putCalculations(arr);renderSavedDetail()}

/* projects */
function renderProjects(){const projects=getProjects(),box=$('projectsList');box.innerHTML='';if(!projects.length){box.innerHTML='<div class="empty">Пока нет проектов.</div>';return}for(const pjt of projects){const sum=projectSummary(pjt),u=pjt.displayUnit||'hours',firstProfile=pjt.calculations?.[0]?.profile||profile;const e=document.createElement('div');e.className='saved-card';e.innerHTML=`<div class="saved-main"><div class="saved-title"></div><div class="saved-meta">${new Date(pjt.date).toLocaleDateString('ru-RU')} · ${(pjt.calculations||[]).length} расч.</div><div class="saved-summary">${projectTime(pjt,u)} · ${projectMoney(pjt)}</div><div class="saved-actions"><button class="linkbtn open">Открыть</button><button class="linkbtn edit">Изменить</button><button class="linkbtn rename">Переименовать</button><button class="linkbtn danger del">Удалить</button></div></div>`;e.querySelector('.saved-title').textContent=pjt.title;e.querySelector('.open').onclick=()=>openProject(pjt.id);e.querySelector('.edit').onclick=()=>openRecordEditor('project',pjt.id);e.querySelector('.rename').onclick=async()=>{const name=await promptBox('Переименовать','Как назвать этот проект?',pjt.title);if(!name)return;const arr=getProjects(),target=arr.find(x=>x.id===pjt.id);if(target){target.title=name;putProjects(arr);renderProjects()}};e.querySelector('.del').onclick=async()=>{if(!(await confirmBox('Удалить проект?',`«${pjt.title}» будет удалён.`)))return;putProjects(getProjects().filter(x=>x.id!==pjt.id));renderProjects()};box.append(e)}}
function openProject(id){const pjt=getProjects().find(x=>x.id===id);if(!pjt)return;openedProjectId=id;$('projectsListView').classList.add('hidden');$('projectDetailView').classList.remove('hidden');selectWheel('projectUnit',pjt.displayUnit||'hours',false,false);renderProjectDetail();syncVisibleWheels();window.scrollTo({top:0,behavior:'auto'})}
function closeProjectDetail(){openedProjectId=null;$('projectDetailView').classList.add('hidden');$('projectsListView').classList.remove('hidden')}
function renderProjectDetail(){const pjt=getProjects().find(x=>x.id===openedProjectId);if(!pjt)return;$('projectTotalCard').classList.toggle('hidden',pjt.calculations.length<2);const u=pjt.displayUnit||'hours',sum=projectSummary(pjt),firstProfile=pjt.calculations?.[0]?.profile||profile;$('projectDetailTitle').textContent=pjt.title;$('projectDetailMeta').textContent=`${new Date(pjt.date).toLocaleDateString('ru-RU')} · ${(pjt.calculations||[]).length} расч. · Время суммируется по графику каждого расчёта. Разные валюты показаны отдельно.`;const box=$('projectDetailGroups');box.innerHTML='';for(const c of pjt.calculations||[]){const p=c.profile||profile,rates=c.fx,s=calculationSummary(c);const group=document.createElement('div');group.className='group-card';const title=document.createElement('div');title.className='group-title';title.textContent=c.title;group.append(title);for(const it of c.items||[]){const h=hoursForItem(it,p,rates);const row=document.createElement('div');row.className='item-meta';row.style.margin='7px 0';row.textContent=`${it.name} · ${fmt(it.qty,2)} × ${money(it.price,it.currency)} · ${Number.isFinite(h)?smart(unitValue(h,u,p),u):'нужен курс валют'}`;group.append(row)}const total=document.createElement('div');total.className='group-total';total.textContent=Number.isFinite(s.h)?smart(unitValue(s.h,u,p),u):'Нужен курс валют';if(c.items.length>1)group.append(total);box.append(group)}$('projectDetailTotal').textContent=projectTime(pjt,u);$('projectDetailMoney').textContent=projectMoney(pjt)}
function changeOpenedProjectUnit(value){if(!openedProjectId)return;const arr=getProjects(),pjt=arr.find(x=>x.id===openedProjectId);if(!pjt)return;pjt.displayUnit=value;putProjects(arr);renderProjectDetail()}

/* events */
$('saveProfile').onclick=saveProfile;$('editProfile').onclick=editProfile;$('addItem').onclick=addItem;$('clearItems').onclick=()=>{items=[];renderCurrent()};$('saveSet').onclick=saveSet;$('combineSaved').onclick=combineSelected;$('clearSaved').onclick=async()=>{const arr=getCalculations();if(!arr.length)return;if(await confirmBox('Удалить всё?','Все сохранённые расчёты будут удалены.')){putCalculations([]);selectedSaved.clear();renderSaved()}};$('savedBack').onclick=()=>{closeSavedDetail();renderSaved()};$('projectBack').onclick=()=>{closeProjectDetail();renderProjects()};$('savedDelete').onclick=async()=>{const c=getCalculations().find(x=>x.id===openedSavedId);if(!c)return;if(await confirmBox('Удалить расчёт?',`«${c.title}» будет удалён.`)){putCalculations(getCalculations().filter(x=>x.id!==c.id));closeSavedDetail();renderSaved()}};$('projectDelete').onclick=async()=>{const pjt=getProjects().find(x=>x.id===openedProjectId);if(!pjt)return;if(await confirmBox('Удалить проект?',`«${pjt.title}» будет удалён.`)){putProjects(getProjects().filter(x=>x.id!==pjt.id));closeProjectDetail();renderProjects()}};

function positionWord(n){const a=n%100,b=n%10;return a>=11&&a<=14?'позиций':b===1?'позиция':b>=2&&b<=4?'позиции':'позиций'}
function showStorageWarning(message){$('storageStatus').textContent=message;$('storageStatus').classList.remove('hidden')}
function saveDraft(){try{storeJSON(LS.draft,{items,unit})}catch(e){showStorageWarning(e.message)}}
function guardEvents(){document.querySelectorAll('button,input').forEach(el=>{for(const event of ['onclick','onchange']){const action=el[event];if(!action||action._guarded)continue;const wrapped=async function(e){try{await action.call(this,e)}catch(error){showStorageWarning(error.message||'Не удалось сохранить изменения.');await notify('Не удалось сохранить',error.message||'Проверь доступное место в браузере.')}};wrapped._guarded=true;el[event]=wrapped}})}
new MutationObserver(guardEvents).observe(document.body,{childList:true,subtree:true});
initWheels();
profile=readJSON(LS.profile,null);
if(profile&&!validProfile(profile)){showStorageWarning('Сохранённый профиль повреждён. Введи доход заново. Исходная запись сохранена.');profile=null}
if(!profile){const old=readJSON('myRate.profile.v1',null);if(old){const currency=Object.keys(CURRENCIES).find(k=>CURRENCIES[k]===old.currency);const candidate={income:old.income,period:old.incomePeriod,days:old.daysPerWeek,hours:old.hoursPerDay,currency};if(validProfile(candidate)){profile=candidate;try{storeJSON(LS.profile,profile)}catch(e){showStorageWarning(e.message)}}}}
const draft=readJSON(LS.draft,null);
if(draft){if(Array.isArray(draft.items)&&draft.items.every(validItem)&&Object.hasOwn(UNITS,draft.unit)){items=draft.items;unit=draft.unit;wheelState.unit=unit}else{blockedKeys.add(LS.draft);showStorageWarning('Черновик повреждён. Он не перезаписан; сохранённые расчёты доступны.')}}
if(profile){wheelState.incomeCurrency=profile.currency;wheelState.period=profile.period;$('income').value=profile.income;$('days').value=profile.days;$('hours').value=profile.hours;showProfile();loadFx(false).then(()=>{try{migrateLegacyOnce();renderSaved();renderProjects()}catch(e){showStorageWarning(e.message)}})}
syncVisibleWheels();guardEvents();
