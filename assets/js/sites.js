async function api(path, opts={}){
  const token = localStorage.getItem('handles_token');
  const headers = opts.headers||{};
  if (token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch((window.API_URL||'')+path, {...opts, headers});
  return res.json();
}

document.getElementById('addSite').addEventListener('click', async ()=>{
  const name = document.getElementById('siteName').value;
  const url = document.getElementById('siteUrl').value;
  const r = await api('/api/websites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,url})});
  if (r.id) { loadSites(); document.getElementById('siteName').value=''; document.getElementById('siteUrl').value=''; }
  else alert(r.error||'Failed');
});

async function loadSites(){
  const r = await api('/api/websites');
  const list = document.getElementById('sitesList'); list.innerHTML='';
  if (r.websites){
    for (const id of Object.keys(r.websites)){
      const s=r.websites[id];
      const el=document.createElement('div'); el.innerHTML=`<strong>${s.name}</strong> <small>${s.url}</small> <button data-id="${id}" class="del">Delete</button> <a href="forms.html?website=${id}">Manage forms</a>`;
      list.appendChild(el);
    }
  }
  document.querySelectorAll('.del').forEach(btn=>btn.addEventListener('click',async e=>{
    const id=e.target.getAttribute('data-id');
    if (!confirm('Delete website?')) return;
    const res=await api('/api/websites/'+id,{method:'DELETE'});
    if (res.ok) loadSites(); else alert(res.error||'Failed');
  }));
}

if (!localStorage.getItem('handles_token')){ alert('Please login first on index.html'); }
else loadSites();
