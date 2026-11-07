(function(){
  var f=document.getElementById('orderForm'); if(!f) return;
  var S=window.SLY, msg=document.getElementById('formMsg'), btn=document.getElementById('submitBtn'), done=document.getElementById('done');
  var ERR={name:'Please add your name.',email:'That email address does not look right.',category:'Tell us what you want to source.',details:'Add a few more details (at least a sentence).',agree:'Please agree to the terms and privacy policy to continue.',rate:'Too many requests from this email. Please try again tomorrow.',no_api:'Orders are not connected yet. Please check back soon.',server:'Something went wrong on our side. Please try again in a minute.'};
  function show(t,cls){ msg.textContent=t; msg.className='msg '+(cls||''); }
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var d={action:'order_create',name:f.name.value,email:f.email.value,company:f.company.value,category:f.category.value,details:f.details.value,budget:f.budget.value,agree:f.agree.checked,caseStudy:f.caseStudy.checked,website:f.website.value};
    if(!d.name.trim()) return show(ERR.name,'err');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return show(ERR.email,'err');
    if(!d.category.trim()) return show(ERR.category,'err');
    if(d.details.trim().length<10) return show(ERR.details,'err');
    if(!d.agree) return show(ERR.agree,'err');
    btn.disabled=true; show('Sending your request...');
    S.api(d).then(function(r){
      btn.disabled=false;
      if(!r||!r.ok) return show(ERR[r&&r.error]||ERR.server,'err');
      f.hidden=true; done.hidden=false;
      var wl=r.status==='Waitlist';
      done.querySelector('[data-title]').textContent=wl?'You are on the waitlist':'Request received';
      done.querySelector('[data-body]').innerHTML=wl
        ?'We are at capacity right now. We saved your request (order <b>'+S.esc(r.orderId)+'</b>) and will email you when we have room.'
        :'Your order number is <b>'+S.esc(r.orderId)+'</b>. We are on it. Your factory comparison report will be ready within 48 hours.';
      var link=done.querySelector('[data-link]');
      if(r.token){ link.href='/portal/?t='+encodeURIComponent(r.token); } else { link.hidden=true; }
      done.querySelector('[data-mail]').textContent=r.mailed===false?'We could not send the confirmation email, so bookmark the button above. It is your private link.':'We also emailed your private link to '+d.email.trim()+'. Check spam if you do not see it.';
      window.scrollTo({top:done.offsetTop-120,behavior:'smooth'});
    }).catch(function(err){ btn.disabled=false; show(err&&err.message==='no_api'?ERR.no_api:ERR.server,'err'); });
  });
})();
