/* Keep v0.1.1/v0.1.3 storage keys so deployment retains saved data. */
const blockedKeys=new Set();
function readJSON(key,fallback){
 try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}
 catch(e){blockedKeys.add(key);showStorageWarning('Не удалось прочитать данные браузера. Исходные записи не перезаписываются.');return fallback}
}
function storeJSON(key,value){
 if(blockedKeys.has(key))throw new Error('Эта запись недоступна или повреждена. Она не перезаписана.');
 try{localStorage.setItem(key,JSON.stringify(value))}
 catch(e){throw new Error('Браузер не сохранил изменения. Возможно, хранилище заполнено или запись запрещена. Не закрывай вкладку до решения проблемы.')}
}
function positive(n,min,max){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max}
function validProfile(p){return !!p&&positive(p.income,0.01,1e12)&&positive(p.days,0.5,7)&&positive(p.hours,0.5,24)&&Object.hasOwn(CURRENCIES,p.currency)&&Object.hasOwn(PERIODS,p.period)}
function validItem(it){return !!it&&typeof it.name==='string'&&it.name.trim().length>0&&it.name.length<=80&&typeof it.id==='string'&&positive(it.price,0.01,1e15)&&positive(it.qty,0.01,1e6)&&Object.hasOwn(CURRENCIES,it.currency)}
function validFx(f,base){return !!f&&f.base===base&&f.rates&&Object.keys(CURRENCIES).every(c=>positive(f.rates[c],Number.MIN_VALUE,1e15))&&Math.abs(f.rates[base]-1)<1e-8&&positive(f.updated,1,1e12)&&positive(f.savedAt,1,1e16)}
function validCalculation(c){return !!c&&typeof c.id==='string'&&typeof c.title==='string'&&validProfile(c.profile)&&Array.isArray(c.items)&&c.items.every(validItem)&&(!c.displayUnit||Object.hasOwn(UNITS,c.displayUnit))}
function validProject(p){return !!p&&typeof p.id==='string'&&typeof p.title==='string'&&Array.isArray(p.calculations)&&p.calculations.length>0&&p.calculations.every(validCalculation)&&(!p.displayUnit||Object.hasOwn(UNITS,p.displayUnit))}
function readRecords(key,validate){
 const arr=readJSON(key,[]);
 if(!Array.isArray(arr)){blockedKeys.add(key);showStorageWarning('Список сохранённых записей повреждён. Исходные данные не перезаписаны.');return []}
 const good=arr.filter(validate);
 if(good.length!==arr.length){blockedKeys.add(key);showStorageWarning('Часть сохранённых записей повреждена. Доступные записи показаны; изменение этого списка заблокировано, чтобы сохранить оригинал.')}
 return good;
}
