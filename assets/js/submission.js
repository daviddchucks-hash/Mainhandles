async function api(path, opts={}){
  const token = localStorage.getItem('handles_token');
  const headers = opts.headers||{};
  if (token) headers['Authorization'] = 'Bearer '+token;
  const res = await fetch((window.API_URL||'')+path, {...opts, headers});
  return res.json();
}

const websiteId = window.WEBSITE_ID, formId = window.FORM_ID, subId = window.SUB_ID;
async function load(){
  const r = await api(`/api/submissions/${websiteId}/${formId}/${subId}`);
  if (r.submission){
    const s = r.submission;
    const el = document.getElementById('submissionDetail');
    el.innerHTML = `<p><strong>Submitted:</strong> ${new Date(s.createdAt).toLocaleString()}</p>`;
    const fields = s.fields || {};
    for (const k of Object.keys(fields)){
      const row = document.createElement('div'); row.innerHTML = `<strong>${k}</strong>: ${fields[k]}`; el.appendChild(row);
    }
  } else alert(r.error||'Not found');
}

document.getElementById('back').addEventListener('click',()=>history.back());
load();
