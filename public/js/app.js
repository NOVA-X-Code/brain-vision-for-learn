async function apiRequest(url, method = 'GET', data = null, isFormData = false) {
  const options = { method };
  if (data) {
    if (isFormData) options.body = data;
    else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(data);
    }
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Une erreur est survenue');
  }
  return response.json();
}

function logout() {
  apiRequest('/api/auth/logout', 'POST').then(() => window.location.href = '/');
}
