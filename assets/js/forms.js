async function api(path, opts={}){
  const token = localStorage.getItem('handles_token');
  const headers = opts.headers||{};
  if (token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch((window.API_URL||'')+path, {...opts, headers});
  return res.json();
}

const websiteId = window.WEBSITE_ID;
if (!websiteId) { alert('No website specified'); }

document.getElementById('createForm').addEventListener('click', async ()=>{
  const name=document.getElementById('formName').value;
  const r=await api(`/api/websites/${websiteId}/forms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  if (r.id) { loadForms(); document.getElementById('formName').value=''; }
  else alert(r.error||'Failed');
});

async function loadForms(){
  const r=await api(`/api/websites/${websiteId}/forms`);
  const list=document.getElementById('formsList'); list.innerHTML='';
  if (r.forms){
    for (const id of Object.keys(r.forms)){
      const f=r.forms[id];
      const el=document.createElement('div');
      el.innerHTML=`<strong>${f.name}</strong> <label><input type=checkbox data-id="${id}" class="enabled" ${f.enabled?'checked':''}> Enabled</label> <button data-id="${id}" class="del">Delete</button> <a href="inbox.html?website=${websiteId}&form=${id}">Submissions</a> <div>Integration snippet: <code>&lt;form data-handles-form="${id}"&gt;...&lt;/form&gt;</code></div>`;
      list.appendChild(el);
    }
  }
  document.querySelectorAll('.enabled').forEach(ch=>ch.addEventListener('change',async e=>{
    const id=e.target.getAttribute('data-id');
    await api(`/api/websites/${websiteId}/forms/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:e.target.checked})});
  }));
  document.querySelectorAll('.del').forEach(btn=>btn.addEventListener('click',async e=>{
    const id=e.target.getAttribute('data-id'); if (!confirm('Delete form?')) return;
    const res=await api(`/api/websites/${websiteId}/forms/${id}`,{method:'DELETE'});
    if (res.ok) loadForms(); else alert(res.error||'Failed');
  }));
}

loadForms();
