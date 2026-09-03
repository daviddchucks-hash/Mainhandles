async function api(path, opts={}){
  const token = localStorage.getItem('handles_token');
  const headers = opts.headers||{};
  if (token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch((window.API_URL||'')+path, {...opts, headers});
  return res.json();
}

const websiteId = window.WEBSITE_ID; const formId = window.FORM_ID;
async function load(q=''){
  let url = '/api/submissions/search?q='+encodeURIComponent(q||'');
  if (formId) url = `/api/submissions?websiteId=${websiteId}&formId=${formId}`;
  const r = await api(url);
  const list=document.getElementById('subsList'); list.innerHTML='';
  const subs = r.submissions||r.submissions||[];
  subs.forEach(s=>{
    const el=document.createElement('div');
    el.innerHTML = `<strong>${new Date(s.createdAt).toLocaleString()}</strong> <small>Form: ${s.formId}</small> <button data-id="${s.id}" class="view">Open</button> <button data-id="${s.id}" class="del">Delete</button> <button data-id="${s.id}" class="mark">Mark Read</button>`;
    list.appendChild(el);
  });
  document.querySelectorAll('.view').forEach(b=>b.addEventListener('click',e=>{
    const id=e.target.getAttribute('data-id'); location.href = `submission.html?website=${websiteId}&form=${formId}&submission=${id}`;
  }));
  document.querySelectorAll('.del').forEach(b=>b.addEventListener('click',async e=>{
    const id=e.target.getAttribute('data-id'); if (!confirm('Delete submission?')) return; const res=await api(`/api/submissions/${websiteId}/${formId}/${id}`,{method:'DELETE'}); if (res.ok) load(); else alert(res.error||'Failed');
  }));
  document.querySelectorAll('.mark').forEach(b=>b.addEventListener('click',async e=>{const id=e.target.getAttribute('data-id'); await api(`/api/submissions/${websiteId}/${formId}/${id}/read`,{method:'POST'}); load();}));
}

document.getElementById('doSearch').addEventListener('click',()=>{load(document.getElementById('search').value)});
load();
