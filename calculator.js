const unitLabel={minutes:'мин',hours:'ч',days:'рабочих дн.',months:'рабочих мес.',years:'рабочих лет'};
function fmt(n,max=2){if(!Number.isFinite(n))return '—';return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:max}).format(n)}
function money(n,c){return fmt(n,2)+' '+(CURRENCIES[c]||c)}
function monthlyIncome(p){if(p.period==='week')return p.income*52/12;if(p.period==='year')return p.income/12;return p.income}
function monthlyHours(p){return p.days*p.hours*52/12}
function hourly(p){return monthlyIncome(p)/monthlyHours(p)}
function smart(n,u){let d=u==='minutes'?0:(Math.abs(n)>=100?0:Math.abs(n)>=10?1:2);if(n>0&&n<Math.pow(10,-d)/2)return `< ${fmt(Math.pow(10,-d),d)} ${unitLabel[u]}`;return `${fmt(n,d)} ${unitLabel[u]}`}
function unitValue(hours,u,p){if(u==='minutes')return hours*60;if(u==='days')return hours/p.hours;if(u==='months')return hours/monthlyHours(p);if(u==='years')return hours/(p.days*p.hours*52);return hours}
function toBaseFor(amount,currency,p,rateData){if(currency===p.currency)return amount;if(!rateData||rateData.base!==p.currency||!Number.isFinite(rateData.rates?.[currency])||rateData.rates[currency]<=0)return NaN;return amount/rateData.rates[currency]}
function hoursForItem(it,p,rateData){return toBaseFor(it.price*it.qty,it.currency,p,rateData)/hourly(p)}
