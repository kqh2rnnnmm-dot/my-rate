window.MyRateCalculator = (() => {
  const cfg = window.MY_RATE_CONFIG;

  function monthlyIncome(income, period) {
    if (period === 'week') return income * cfg.weeksPerYear / cfg.monthsPerYear;
    if (period === 'year') return income / cfg.monthsPerYear;
    return income;
  }

  function monthlyWorkHours(daysPerWeek, hoursPerDay) {
    return daysPerWeek * hoursPerDay * cfg.weeksPerYear / cfg.monthsPerYear;
  }

  function hourlyRate(profile) {
    const income = monthlyIncome(profile.income, profile.incomePeriod);
    const hours = monthlyWorkHours(profile.daysPerWeek, profile.hoursPerDay);
    return hours > 0 ? income / hours : 0;
  }

  function calculateItem(profile, price) {
    const rate = hourlyRate(profile);
    const hours = rate > 0 ? price / rate : 0;
    const workDays = profile.hoursPerDay > 0 ? hours / profile.hoursPerDay : 0;
    const monthIncome = monthlyIncome(profile.income, profile.incomePeriod);
    const share = monthIncome > 0 ? (price / monthIncome) * 100 : 0;
    return { rate, hours, workDays, share };
  }

  function formatNumber(value, maxFraction = 1) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxFraction }).format(value);
  }

  function formatHours(hours) {
    if (hours < 1) return `${Math.round(hours * 60)} мин`;
    return `${formatNumber(hours, hours < 10 ? 1 : 0)}`;
  }

  function formatWorkDays(days, hoursPerDay) {
    if (days < 1) {
      const hours = days * hoursPerDay;
      return hours < 1 ? `${Math.round(hours * 60)} мин` : `${formatNumber(hours, 1)} ч`;
    }
    const wholeDays = Math.floor(days);
    const remainingHours = Math.round((days - wholeDays) * hoursPerDay * 10) / 10;
    return remainingHours > 0 ? `${wholeDays} дн. ${formatNumber(remainingHours, 1)} ч` : `${wholeDays} дн.`;
  }

  return { monthlyIncome, monthlyWorkHours, hourlyRate, calculateItem, formatNumber, formatHours, formatWorkDays };
})();
