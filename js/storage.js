window.MyRateStorage = (() => {
  const KEY = 'myRate.profile.v1';

  function saveProfile(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return { saveProfile, loadProfile };
})();
