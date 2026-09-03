// Simple integration helper (for static hosting):
(function(){
  function send(formId, data){
    try{fetch((window.HANDLES_API_URL||'https://mainhandles.onrender.com') + '/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({formId:formId,fields:data,origin:location.href})});}catch(e){}
  }
  function serialize(form){
    var obj={};
    new FormData(form).forEach(function(v,k){obj[k]=v});
    return obj;
  }
  function init(){
    var forms=document.querySelectorAll('form[data-handles-form]');
    forms.forEach(function(form){
      var id=form.getAttribute('data-handles-form');
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var data=serialize(form);
        send(id,data);
        var el=document.createElement('div');
        el.style.padding='10px';el.style.background='#e6ffed';el.style.border='1px solid #b7f2c9';el.style.marginTop='8px';
        el.textContent='Thanks — your message was sent.';
        form.parentNode.insertBefore(el,form.nextSibling);
        form.reset();
      });
    });
  }
  if (document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
