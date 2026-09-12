// Node + jsdom behavioural checks. These simulate the DOM, not an iPhone renderer.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = fs.existsSync(path.resolve(__dirname,'../app.js')) ? path.resolve(__dirname,'..') : path.resolve(__dirname, '../my-rate-3');
const files = ['config.js', 'storage.js', 'calculator.js', 'collections.js', 'interface.js', 'app.js'];
const profile = { income: 800, currency: 'RUB', period: 'day', days: 5, hours: 8 };
const fx = { base: 'RUB', rates: { RUB: 1, USD: .01, EUR: .009, ILS: .035, GBP: .008 }, updated: 1700000000, savedAt: Date.now() };
const item = (name='Чай',price=100) => ({id:'item-'+name,name,price,qty:1,currency:'RUB'});
const card = (id, names=['Чай'], extra={}) => ({id,title:names.join(' + '),items:names.map(n=>item(n)),profile:{...profile},fx:structuredClone(fx),displayUnit:'hours',status:'favorite',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',...extra});
const saved = (calculations=[],projects=[]) => ({schema:2,profile:{...profile},fx:structuredClone(fx),calculations,projects,settings:{magic:false,jokes:true},introSeen:true});

async function boot(seed,options={}) {
  const errors=[];
  const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://myrate.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document,originalNow=Date.now();let time=0,serial=0,failFx=false,failCurrency=null;
  const timers=new Map(),requests=[];
  w.Date.now=()=>originalNow+time;
  w.performance.now=()=>time;
  w.setTimeout=(fn,ms=0)=>{const id=++serial;timers.set(id,{fn,time:time+Math.max(0,Number(ms)||0)});return id;};
  w.clearTimeout=id=>timers.delete(id);w.requestAnimationFrame=fn=>w.setTimeout(()=>fn(time),16);w.cancelAnimationFrame=w.clearTimeout;
  w.scrollTo=()=>{};w.matchMedia=()=>({matches:Boolean(options.reduced),addEventListener(){},removeEventListener(){}});
  w.fetch=async url=>{requests.push(url);const base=url.split('/').pop();if(failFx||base===failCurrency)throw Error('Network failure');return {ok:true,json:async()=>({result:'success',time_last_update_unix:1700000000,rates:base==='RUB'?{...fx.rates}:{RUB:100,USD:1,EUR:.9,ILS:3.5,GBP:.8}})};};
  const raw=seed===undefined?null:typeof seed==='string'?seed:JSON.stringify(seed);
  if(raw!==null)w.localStorage.setItem('myrate_state_v2',raw);
  if(options.storageFails)w.Storage.prototype.setItem=()=>{throw Error('Quota exceeded');};
  for(const f of files)w.eval(fs.readFileSync(path.join(root,f),'utf8'));
  const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
  async function tick(ms=0){const target=time+ms;await flush();let count=0;while(true){const due=[...timers.entries()].filter(([,v])=>v.time<=target).sort((a,b)=>a[1].time-b[1].time)[0];if(!due)break;if(++count>10000)throw Error('Timer loop');time=due[1].time;timers.delete(due[0]);due[1].fn();await flush();}time=target;await flush();}
  const $=selector=>d.querySelector(selector),all=selector=>[...d.querySelectorAll(selector)];
  const fill=(el,value)=>{if(typeof el==='string')el=$(el);el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const click=(selector)=>{const el=typeof selector==='string'?$(selector):selector;assert(el,'Missing button '+selector);assert(!el.disabled,'Disabled button '+el.textContent);el.click();};
  const button=(text,container='#dialogLayer')=>all(container+' button').find(b=>b.textContent.trim()===text);
  const choose=(text,container='#dialogLayer')=>click(button(text,container));
  const show=selector=>!$(selector).classList.contains('hidden');
  const state=()=>JSON.parse(w.localStorage.getItem('myrate_state_v2'));
  const pointer=(el,type,x,y=20)=>{const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:1},isPrimary:{value:true}});el.dispatchEvent(e);};
  const hide=hidden=>{Object.defineProperty(d,'hidden',{configurable:true,value:hidden});d.dispatchEvent(new w.Event('visibilitychange'));};
  async function add(name='Чай',price=100,qty=1){fill('#itemName',name);fill('#itemPrice',price);fill('#itemQty',qty);click('#addItem');await tick(3500);}
  await tick(6500);
  assert.equal(errors.length,0,errors.map(x=>x.message).join('\n'));
  return {w,d,$,all,fill,click,choose,button,show,state,tick,pointer,hide,add,requests,errors,raw,
    failFx:value=>{failFx=value;},failCurrency:value=>{failCurrency=value;},close:()=>dom.window.close()};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}

(async()=>{
  await test('first visit: explanation → setup → first wish; no premature units',async()=>{
    const a=await boot();assert(a.show('#welcome'));assert(!a.show('#profileEditor'));assert(!a.show('#converter'));
    a.click('#startSetup');assert(a.show('#profileEditor'));assert(!a.show('#welcome'));assert(a.$('#saveProfile').disabled);
    a.fill('#income','800');a.click('#saveProfile');await a.tick();assert(a.show('#converter'));assert(a.show('#quickProfile'));assert(!a.show('#currentUnitPicker'));assert(a.show('#firstWishGuide'));
    assert(a.$('#addItem').disabled);a.fill('#itemName','Чай');a.fill('#itemPrice','100');assert(a.$('#addItem').disabled);assert.equal(a.$('#itemQty').value,'');
    a.fill('#itemQty','2');a.click('#addItem');await a.tick(3500);assert(a.show('#currentUnitPicker'));assert(!a.show('#totalCard'));assert.equal(a.$('#itemQty').value,'');assert.equal(a.all('#itemsList .item-card').length,1);
    a.close();
  });
  await test('upgrade: exact backup, all old cards, nested snapshots and archive retained',async()=>{
    const c=card('old',['Чай','Кофе']),p={id:'p1',title:'Отпуск',createdAt:'2026-08-01',status:'active',calculations:[{...structuredClone(c),id:'pc1',sourceId:c.id}],displayUnit:'months'};
    const seed=saved([c,card('archive',['Шарф'],{status:'archived'})],[p]),a=await boot(seed);
    assert.equal(a.w.localStorage.getItem('myrate_backup_before_3'),a.raw);assert(!a.show('#welcome'));assert(a.show('#converter'));
    assert.equal(a.state().calculations.length,2);assert.equal(a.state().projects[0].calculations[0].items.length,2);assert.equal(a.state().schema,3);
    a.close();
  });
  await test('edit current name, price, quantity, currency; cancel retains old values',async()=>{
    const a=await boot(saved());await a.add('Чай');a.click('#itemsList .dots-button');a.choose('Изменить детали','#sheetLayer');
    const inputs=a.all('#dialogBody input');a.fill(inputs[0],'Кофе');a.fill(inputs[1],'200');a.fill(inputs[2],'3');a.choose('Сохранить изменения');await a.tick();
    assert.match(a.$('#itemsList').textContent,/Кофе/);assert.match(a.$('#itemsList').textContent,/6 ч работы/);
    a.click('#itemsList .dots-button');a.choose('Изменить детали','#sheetLayer');a.fill(a.all('#dialogBody input')[0],'Не сохранять');a.choose('Не менять');await a.tick();assert(!a.$('#itemsList').textContent.includes('Не сохранять'));
    a.click('#itemsList .dots-button');a.choose('Сделать копию','#sheetLayer');assert.equal(a.all('#itemsList .item-card').length,2);assert(a.show('#totalCard'));assert.equal(a.$('#saveCalculation').textContent,'Куда это всё?');
    a.click('#itemsList .dots-button');a.choose('Убрать из текущего','#sheetLayer');assert.equal(a.all('#itemsList .item-card').length,1);a.close();
  });
  for(const mode of ['Оставить одной карточкой','Разложить по карточкам','Собрать Большой план']) {
    await test('save path: '+mode,async()=>{
      const a=await boot(saved());await a.add('Чай');await a.add('Кофе');a.click('#saveCalculation');a.choose(mode);await a.tick();
      if(mode==='Собрать Большой план'){a.fill('#dialogBody input','Кухня');a.choose('Сохранить');await a.tick();assert.equal(a.state().projects.length,1);assert.equal(a.state().calculations.length,0);assert(a.$('#screenProjects').classList.contains('active'));assert.equal(a.state().projects[0].calculations.length,2);assert.equal(a.state().projects[0].calculations[0].sourceId,null);}
      else {assert.equal(a.state().calculations.length,mode==='Оставить одной карточкой'?1:2);assert.equal(a.state().calculations[0].items.length,mode==='Оставить одной карточкой'?2:1);}
      assert.equal(a.all('#itemsList .item-card').length,0);assert.equal(a.$('#itemQty').value,'');a.close();
    });
  }
  await test('cancel save choices and naming keeps the draft',async()=>{
    const a=await boot(saved());await a.add('Чай');await a.add('Кофе');a.click('#saveCalculation');a.choose('Пока ничего');await a.tick();assert.equal(a.all('#itemsList .item-card').length,2);
    a.click('#saveCalculation');a.choose('Собрать Большой план');await a.tick();a.choose('Отмена');await a.tick();assert.equal(a.all('#itemsList .item-card').length,2);assert.equal(a.state().projects.length,0);a.close();
  });
  for(const mode of ['Создать отдельные копии','Разделить и заменить']) {
    await test('split '+mode+' preserves rates, quantities and existing plans',async()=>{
      const source=card('c1',['Чай','Кофе']);source.items[0].qty=3;
      const plan={id:'p1',title:'План',calculations:[{...structuredClone(source),id:'pc1',sourceId:'c1'}],status:'active'};
      const a=await boot(saved([source],[plan]));const before=JSON.stringify(a.state().projects);
      a.click('[data-screen="Favorites"]');a.click('#favoritesList .dots-button');a.choose('Разделить карточку','#sheetLayer');a.choose(mode);await a.tick();
      assert.equal(a.state().calculations.length,mode==='Создать отдельные копии'?3:2);assert.equal(a.state().calculations[0].items[0].qty,3);assert.deepEqual(a.state().calculations[0].fx.rates,source.fx.rates);assert.equal(JSON.stringify(a.state().projects),before);a.close();
    });
  }
  await test('internal plan components survive rebuild without favorites and remain editable',async()=>{
    const plan={id:'p1',title:'Кухня',status:'active',calculations:[card('pc1',['Чай'],{sourceId:null}),card('pc2',['Кофе'],{sourceId:null})]};
    const a=await boot(saved([], [plan]));a.click('[data-screen="Projects"]');a.click('#projectsList .dots-button');a.choose('Пересобрать план','#sheetLayer');
    assert.equal(a.all('#dialogBody input[type=checkbox]').length,2);a.choose('Сохранить состав');await a.tick();assert.equal(a.state().projects[0].calculations.length,2);
    a.click('#projectsList .project-card');a.click('#projectDetailGroups .dots-button');a.choose('Изменить детали','#sheetLayer');
    const input=a.all('#dialogBody input');a.fill(input[input.length-1],'5');a.choose('Сохранить изменения');await a.tick();assert.equal(a.state().projects[0].calculations[0].items[0].qty,5);a.close();
  });
  await test('local search: nested names, case/ё, scopes, archive opens and back works',async()=>{
    const a=await boot(saved([card('1',['Ёлка'],{title:'Подарок'}),card('2',['Ёлка'],{status:'archived'})],[{id:'p',title:'Большой сюрприз',status:'active',calculations:[card('pc',['Ёлка'])]}]));
    const requests=a.requests.length;a.click('#searchButton');a.fill('#searchInput','ЕЛКА');assert.equal(a.all('.search-result').length,3);assert.equal(a.requests.length,requests);
    a.click('[data-search-filter="archive"]');assert.equal(a.all('.search-result').length,1);a.click('.search-result');await a.tick();assert(a.show('#favoriteDetailView'));assert.match(a.$('#favoriteDetailItems').textContent,/Ёлка/);
    a.click('#favoriteBack');assert(a.$('#screenArchive').classList.contains('active'));a.close();
  });
  await test('favorite selection: toggle, combine only for 2+, cancel and tab exit',async()=>{
    const a=await boot(saved([card('1'),card('2',['Кофе'])]));a.click('[data-screen="Favorites"]');a.click('#favoritesList .dots-button');a.choose('Выбрать','#sheetLayer');
    assert(!a.show('#combineSelected'));assert(a.show('#selectionHint'));assert(a.show('#cancelSelection'));
    a.click(a.all('#favoritesList .saved-card')[1]);assert(a.show('#combineSelected'));assert.equal(a.all('.saved-card.selected').length,2);
    a.click(a.all('#favoritesList .saved-card')[1]);assert(!a.show('#combineSelected'));assert.equal(a.all('.saved-card.selected').length,1);
    a.click('[data-screen="Projects"]');assert(!a.show('#selectionBar'));a.click('[data-screen="Favorites"]');assert.equal(a.all('.saved-card.selected').length,0);a.close();
  });
  await test('navigation gesture: tap, drag at release, long hold does not switch',async()=>{
    const a=await boot(saved([card('1'),card('2')]));const root=a.$('#navCapsule'),buttons=a.all('#navCapsule button');
    root.getBoundingClientRect=()=>({left:0,right:312,width:312});buttons.forEach((b,i)=>b.getBoundingClientRect=()=>({left:6+i*100,right:106+i*100,width:100}));
    a.pointer(buttons[0],'pointerdown',50);a.pointer(root,'pointermove',250);assert(a.$('#screenCurrent').classList.contains('active'));a.pointer(root,'pointerup',250);assert(a.$('#screenProjects').classList.contains('active'));
    a.pointer(buttons[1],'pointerdown',150);await a.tick(600);assert(a.show('#sheetLayer'));assert.equal(a.$('#sheetTitle').textContent,'Избранное');a.pointer(root,'pointerup',150);assert(a.$('#screenProjects').classList.contains('active'));a.click('#sheetCancel');
    a.pointer(buttons[1],'pointerdown',150);a.pointer(root,'pointerup',150);assert(a.$('#screenFavorites').classList.contains('active'));a.close();
  });
  await test('wheel: quick swipe scrolls, sustained hold drags both ways, commits on release',async()=>{
    const a=await boot(saved());await a.add('Чай');const wheel=a.$('[data-wheel="unit"]');
    const touch=(type,y)=>{const e=new a.w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientY:y}]});wheel.dispatchEvent(e);return e;};
    touch('touchstart',100);touch('touchmove',70);await a.tick(300);assert(!wheel.classList.contains('is-active'));touch('touchend',70);
    touch('touchstart',100);await a.tick(300);assert(wheel.classList.contains('is-active'));const move=touch('touchmove',58);assert(move.defaultPrevented);touch('touchmove',100);touch('touchmove',142);touch('touchend',142);await a.tick(500);
    assert(!wheel.classList.contains('is-active'));assert.match(a.$('#itemsList').textContent,/60 мин работы/);assert(a.state().onboarding.wheelLearned);a.close();
  });
  await test('storage quota failure never clears unsaved items or replaces originals',async()=>{
    const a=await boot(saved());await a.add('Чай');const original=a.w.localStorage.getItem('myrate_state_v2');
    a.w.Storage.prototype.setItem=()=>{throw Error('Quota');};a.click('#saveCalculation');await a.tick();assert.equal(a.all('#itemsList .item-card').length,1);assert.equal(a.w.localStorage.getItem('myrate_state_v2'),original);assert.match(a.$('#toast').textContent,/Не удалось сохранить/);a.close();
  });
  await test('multi-currency FX failure is atomic and every scope asks confirmation',async()=>{
    const usd=card('usd',['Trip']);usd.profile.currency='USD';usd.fx={base:'USD',rates:{USD:1,RUB:100},savedAt:Date.now()};
    const p={id:'p1',title:'Mixed',status:'active',calculations:[card('rub'),usd]};const a=await boot(saved([], [p]));
    a.click('[data-screen="Projects"]');a.click('#projectsList .dots-button');a.choose('Обновить курсы плана','#sheetLayer');const before=JSON.stringify(a.state().projects),requests=a.requests.length;
    assert.equal(a.requests.length,requests);a.failCurrency('USD');a.choose('Обновить весь план');await a.tick(4000);assert.equal(JSON.stringify(a.state().projects),before);assert.match(a.$('#toast').textContent,/Ничего не изменено/);a.close();
  });
  await test('intro lifecycle: cold load, short resume no intro, 15 min resume intro',async()=>{
    const a=await boot(saved());assert(!a.show('#introScreen'));a.hide(true);await a.tick(899000);a.hide(false);assert(!a.show('#introScreen'));
    a.hide(true);await a.tick(900000);a.hide(false);assert(a.show('#introScreen'));await a.tick(5000);assert(!a.show('#introScreen'));a.close();
  });
  await test('magic and jokes disabled: settings back and gear stay responsive',async()=>{
    const a=await boot(saved());a.click('#settingsButton');a.$('#magicToggle').checked=false;a.$('#magicToggle').dispatchEvent(new a.w.Event('change'));a.$('#jokesToggle').checked=false;a.$('#jokesToggle').dispatchEvent(new a.w.Event('change'));
    a.click('#settingsBack');assert(a.$('#screenCurrent').classList.contains('active'));a.click('#settingsButton');assert(a.$('#screenSettings').classList.contains('active'));a.click('#settingsBack');await a.add('Чай');assert.equal(a.all('#itemsList .item-card').length,1);a.close();
  });
  await test('markup and scripts: no duplicate ids, missing references or unsafe search HTML',async()=>{
    const a=await boot(saved([card('x',['<img src=x onerror=alert(1)>'])]));const ids=a.all('[id]').map(x=>x.id);assert.equal(ids.length,new Set(ids).size);
    for(const file of files)assert(fs.existsSync(path.join(root,file)));
    a.click('#searchButton');a.fill('#searchInput','img');assert.equal(a.all('#searchResults img').length,0);assert.match(a.$('#searchResults').textContent,/<img/);a.close();
  });
  for(const mode of ['Только новые карточки','Пересчитать всё активное']) {
    await test('profile update '+mode+': archive unchanged and current wish retained',async()=>{
      const plan={id:'p1',title:'План',status:'active',calculations:[card('pc1'),card('pc2')]};
      const a=await boot(saved([card('c1'),card('old',['Кофе'],{status:'archived'})],[plan]));await a.add('Черновик');
      a.click('#quickProfile');a.fill('#income','1600');a.click('#saveProfile');a.choose(mode);await a.tick();
      assert.equal(a.state().profile.income,1600);assert.equal(a.state().calculations[0].profile.income,mode==='Только новые карточки'?800:1600);
      assert.equal(a.state().projects[0].calculations[0].profile.income,mode==='Только новые карточки'?800:1600);
      assert.equal(a.state().calculations[1].profile.income,800);assert.match(a.$('#itemsList').textContent,/Черновик/);assert.match(a.$('#itemsList').textContent,/0,5 ч работы/);a.close();
    });
  }
  await test('global FX refresh includes current, favorites, plans, optional archive only',async()=>{
    const old=card('old',['Доллар'],{status:'archived'});old.fx.rates.USD=.05;
    const active=card('active');active.fx.rates.USD=.06;
    const p={id:'p1',title:'План',status:'active',calculations:[structuredClone(active)]};
    const seed=saved([active,old],[p]);seed.fx.rates.USD=.07;
    const a=await boot(seed);a.click('#settingsButton');a.click('#updateAllFx');const before=a.requests.length;
    a.choose('Не надо');await a.tick();assert.equal(a.requests.length,before);assert.equal(a.state().fx.rates.USD,.07);
    a.click('#updateAllFx');a.choose('Только активное');await a.tick(4000);assert.equal(a.state().fx.rates.USD,.01);assert.equal(a.state().calculations[0].fx.rates.USD,.01);assert.equal(a.state().projects[0].calculations[0].fx.rates.USD,.01);assert.equal(a.state().calculations[1].fx.rates.USD,.05);
    a.click('#updateAllFx');a.choose('Включая Архив');await a.tick(4000);assert.equal(a.state().calculations[1].fx.rates.USD,.01);a.close();
  });
  await test('sort is non-destructive; unknown exchange rates sort last',async()=>{
    const slow=card('slow',['Долго']);slow.items[0].price=900;
    const unknown=card('unknown',['Без курса']);unknown.items[0].currency='USD';unknown.fx={base:'RUB',rates:{RUB:1}};
    const a=await boot(saved([slow,card('fast',['Быстро']),unknown]));
    const list=a.w.MyRateCollections.sorted(a.w.MyRateStorage.load().calculations,'timeAsc');assert.equal(list[0].id,'fast');assert.equal(list.at(-1).id,'unknown');
    a.click('[data-screen="Favorites"]');a.click('[data-section-menu="Favorites"]');a.choose('Разложить по полочкам','#sheetLayer');a.choose('По алфавиту','#sheetLayer');await a.tick();assert.equal(a.state().sort.calculations,'name');assert.equal(a.state().calculations[0].id,'slow');a.close();
  });
  await test('all output units and all income periods convert correctly',async()=>{
    const a=await boot(saved()),c=a.w.MyRateCalculator;
    const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} ≈ ${expected}`);
    const h=c.itemSummary({price:100,qty:2,currency:'RUB'},profile,fx).hours;near(h,2);
    near(c.unitValue(h,'minutes',profile),120);near(c.unitValue(h,'hours',profile),2);near(c.unitValue(h,'days',profile),.25);near(c.unitValue(h,'weeks',profile),.05);
    near(c.unitValue(h,'months',profile),2/(5*8*52/12));near(c.unitValue(h,'years',profile),2/(5*8*52));
    for(const [period,income] of Object.entries({day:800,week:4000,month:4000*52/12,year:4000*52}))near(c.hourlyRate({...profile,period,income}),100);
    a.close();
  });
  await test('empty sections expose no delete-all and dialogs do not autofocus a keyboard',async()=>{
    const a=await boot(saved());a.click('[data-screen="Favorites"]');assert(!a.show('#clearFavorites'));a.click('[data-section-menu="Favorites"]');assert(!a.button('Удалить всё','#sheetLayer'));a.click('#sheetCancel');
    a.click('[data-screen="Projects"]');assert(!a.show('#clearProjects'));a.click('[data-screen="Current"]');await a.add('Чай');a.click('#itemsList .dots-button');a.choose('Изменить детали','#sheetLayer');assert.notEqual(a.d.activeElement.tagName,'INPUT');assert(a.$('#app').inert);a.choose('Не менять');await a.tick();assert(!a.$('#app').inert);a.close();
  });
  await test('search dismissal preserves unsaved form; Escape releases every overlay',async()=>{
    const a=await boot(saved());a.fill('#itemName','Не терять');a.click('#searchButton');a.fill('#searchInput','ничего');a.$('#searchLayer').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(!a.show('#searchLayer'));assert.equal(a.$('#itemName').value,'Не терять');assert(!a.$('#app').inert);assert(!a.d.body.classList.contains('keyboard-open'));
    a.click('[data-screen="Favorites"]');a.click('[data-section-menu="Favorites"]');a.$('#sheetLayer').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!a.show('#sheetLayer'));assert(!a.$('#app').inert);a.close();
  });
  await test('corrupt saved data and failed backup cannot be overwritten',async()=>{
    const a=await boot('{broken');assert.equal(a.w.localStorage.getItem('myrate_state_v2'),'{broken');assert(a.w.MyRateStorage.warning);assert.equal(a.w.MyRateStorage.save(saved()),false);a.close();
    const b=await boot(saved([card('keep')]),{storageFails:true});assert.equal(b.w.localStorage.getItem('myrate_state_v2'),b.raw);assert.equal(b.state().calculations[0].id,'keep');assert(b.w.MyRateStorage.warning);b.close();
  });
  await test('reduced-motion mode and cold reload keep the new launch rule',async()=>{
    const a=await boot(saved(),{reduced:true});assert(!a.show('#introScreen'));a.hide(true);await a.tick(900000);a.hide(false);assert(a.$('#introScreen').classList.contains('is-reduced'));await a.tick(2500);assert(!a.show('#introScreen'));a.close();
  });
  console.log('\n'+count+' behavioural checks passed. No real iPhone/browser rendering was simulated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
