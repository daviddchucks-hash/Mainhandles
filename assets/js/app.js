async function api(path, opts={}){
  const token = localStorage.getItem('handles_token');
  const headers = opts.headers||{};
  if (token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch((window.API_URL||'')+path, {...opts, headers});
  return res.json();
}

document.getElementById('btnRegister').addEventListener('click', async ()=>{
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const r = await api('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if (r.token){ localStorage.setItem('handles_token',r.token); showDashboard(); }
  else document.getElementById('authMessage').textContent = r.error || 'Registration failed';
});

document.getElementById('btnLogin').addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const r = await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if (r.token){ localStorage.setItem('handles_token',r.token); showDashboard(); }
  else document.getElementById('authMessage').textContent = r.error || 'Login failed';
});

document.getElementById('btnLogout').addEventListener('click', ()=>{ localStorage.removeItem('handles_token'); location.reload(); });

async function showDashboard(){
  document.getElementById('dashboard').style.display='block';
  document.getElementById('get-started').style.display='none';
  const r = await api('/api/dashboard');
  if (r.error){ document.getElementById('authMessage').textContent = r.error; return; }
  document.getElementById('stats').innerHTML = `<p>Websites: ${r.totalWebsites} — Forms: ${r.totalForms} — Submissions: ${r.totalSubmissions} — Unread: ${r.unread}</p>`;
  // fetch websites
  const w = await api('/api/websites');
  const container = document.getElementById('websites'); container.innerHTML='';
  if (w.websites){
    for (const id of Object.keys(w.websites)){
      const site = w.websites[id];
      const el = document.createElement('div'); el.className='site-card';
      el.innerHTML = `<strong>${site.name}</strong> <small>${site.url}</small>`;
      container.appendChild(el);
    }
  }
}

// Auto-login if token present
if (localStorage.getItem('handles_token')) showDashboard();
