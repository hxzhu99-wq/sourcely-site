(function(){
  var root=document.getElementById('portal'); if(!root) return;
  var S=window.SLY, esc=S.esc, KEY='sly_session';
  var params=new URLSearchParams(location.search), tok=params.get('t')||'';
  var ERR={email:'That email address does not look right.',code:'That code is not right or has expired. Request a new one.',rate:'Too many tries. Please wait a bit and try again.',no_api:'The portal is not connected yet. Please check back soon.',server:'Something went wrong. Please try again.'};
  var STEPS=[['Request received','We have your brief.'],['Factories contacted','We are reaching out and collecting quotes.'],['Report ready','Your comparison is below.']];
  function stepIndex(s){ return {New:0,Waitlist:-1,'In progress':1,'Report ready':2,Delivered:2,Closed:2}[s]; }
  function err(e){ return ERR[e&&e.message==='no_api'?'no_api':'server']; }
  function set(h){ root.innerHTML=h; }

  function loginCard(intro){
    return '<div class="card noprint" id="loginCard"><h3>'+esc(intro.title)+'</h3><p>'+esc(intro.text)+'</p>'+
      '<form id="lf1"><label for="em">Email</label><input type="email" id="em" autocomplete="email" required placeholder="you@example.com">'+
      '<div class="rowbtns"><button class="btn primary small" type="submit">Email me a code</button></div></form>'+
      '<form id="lf2" hidden><p class="hint" id="sent"></p><label for="cd">6-digit code</label><input type="text" id="cd" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required>'+
      '<div class="rowbtns"><button class="btn primary small" type="submit">Sign in</button></div></form><div class="msg" id="lm" role="status"></div></div>';
  }
  function wireLogin(after){
    var f1=document.getElementById('lf1'), f2=document.getElementById('lf2'), m=document.getElementById('lm'), email='';
    if(!f1) return;
    f1.addEventListener('submit',function(e){
      e.preventDefault(); email=document.getElementById('em').value.trim(); m.className='msg'; m.textContent='Sending...';
      S.api({action:'login_request',email:email}).then(function(r){
        if(!r.ok){ m.className='msg err'; m.textContent=ERR[r.error]||ERR.server; return; }
        f1.hidden=true; f2.hidden=false; document.getElementById('sent').textContent='If '+email+' has an order with us, a code is on its way. It works for 10 minutes.'; m.textContent='';
        document.getElementById('cd').focus();
      }).catch(function(x){ m.className='msg err'; m.textContent=err(x); });
    });
    f2.addEventListener('submit',function(e){
      e.preventDefault(); m.className='msg'; m.textContent='Checking...';
      S.api({action:'login_verify',email:email,code:document.getElementById('cd').value}).then(function(r){
        if(!r.ok){ m.className='msg err'; m.textContent=ERR[r.error]||ERR.server; return; }
        S.store(KEY,r.session); after();
      }).catch(function(x){ m.className='msg err'; m.textContent=err(x); });
    });
  }

  function showLogin(){
    set('<div class="narrow"><h1 style="font-size:clamp(34px,5vw,56px)">Your Sourcely orders</h1><p class="lead">Sign in with the email you used on your request. We will send you a 6-digit code. No password.</p><div style="margin-top:24px">'+
      loginCard({title:'Sign in or create your account',text:'Your account is created automatically the first time you sign in with a code. It is optional: your private order link always works without it.'})+'</div></div>');
    wireLogin(showMine);
  }

  function showMine(){
    var s=S.load(KEY); if(!s) return showLogin();
    set('<p>Loading your orders...</p>');
    S.api({action:'my_orders',session:s}).then(function(r){
      if(!r.ok){ S.store(KEY,null); return showLogin(); }
      var rows=r.orders.map(function(o){
        return '<a class="card" style="display:block;text-decoration:none;color:inherit" href="/portal/?t='+encodeURIComponent(o.token)+'"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>'+esc(o.id)+'</b><span class="status '+S.sc(o.status)+'">'+esc(o.status)+'</span></div><p style="margin:8px 0 0">'+esc(o.category)+'</p><p class="note" style="margin:4px 0 0">'+esc(S.fmt(o.created))+(o.hasReport?' · Report ready':'')+'</p></a>';
      }).join('');
      set('<div class="narrow"><h1 style="font-size:clamp(34px,5vw,56px)">Your orders</h1><p class="note">Signed in as '+esc(r.email)+'. <a href="#" id="out">Sign out</a></p><div class="grid" style="margin-top:24px;grid-template-columns:1fr">'+(rows||'<p>No orders yet.</p>')+'</div><p style="margin-top:28px"><a class="btn primary" href="/free-pilot/">Start a new request</a></p></div>');
      document.getElementById('out').addEventListener('click',function(e){ e.preventDefault(); S.api({action:'logout',session:s}).catch(function(){}); S.store(KEY,null); showLogin(); });
    }).catch(function(x){ set('<p class="msg err">'+esc(err(x))+'</p>'); });
  }

  function showTrack(t){
    set('<p>Loading your order...</p>');
    S.api({action:'track',token:t}).then(function(r){
      if(!r.ok){ set('<div class="narrow"><h1 style="font-size:clamp(34px,5vw,56px)">We could not find that order</h1><p class="lead">The link may be incomplete. Open the link from your confirmation email again, or sign in with your email.</p><p><a class="btn primary" href="/portal/">Sign in</a></p></div>'); return; }
      var o=r.order, idx=stepIndex(o.status), signed=!!S.load(KEY);
      var tl=o.status==='Waitlist'
        ?'<p class="card" style="background:#FFF3C4;border-color:#E6CF63">You are on the waitlist. All free pilot spots are taken right now. We will email you if a spot opens up.</p>'
        :'<ol class="tl">'+STEPS.map(function(st,i){ return '<li class="'+(i<idx?'done':i===idx?'now':'')+'"><b>'+(i<idx?'Done':i===idx?'Now':'Next')+'</b>'+esc(st[0])+'<br><span style="font-size:14px">'+esc(st[1])+'</span></li>'; }).join('')+'</ol>';
      var rep=r.report
        ?'<div class="paper prose" id="rep"><div class="noprint" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center"><span class="tag">Your report</span><button class="btn small" type="button" id="pr">Print or save as PDF</button></div><h2 style="margin-top:16px">'+esc(r.report.title)+'</h2>'+S.md(r.report.body)+(r.report.driveLink?'<p><a class="btn primary small" href="'+esc(r.report.driveLink)+'" target="_blank" rel="noopener noreferrer">Open the full file</a></p>':'')+'<p class="note">Updated '+esc(S.fmt(r.report.updated))+'</p></div>'
        :(o.status==='Waitlist'?'':'<div class="card"><h3>Your report is on its way</h3><p>We send it within 48 hours of your request. We will email you the moment it is ready, and it will appear right here.</p></div>');
      set('<div><p class="note"><a href="/">Sourcely</a> / Your order</p><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><h1 style="font-size:clamp(34px,5vw,56px)">Order '+esc(o.id)+'</h1><span class="status '+S.sc(o.status)+'">'+esc(o.status)+'</span></div>'+tl+
        '<div class="card" style="margin-bottom:20px"><h3>Your request</h3><p style="margin-bottom:6px"><b>'+esc(o.category)+'</b></p><p class="note" style="white-space:pre-wrap;margin:0">'+esc(o.details)+'</p></div>'+rep+
        '<div style="margin-top:28px;max-width:560px">'+(signed?'<p class="note noprint"><a href="/portal/">See all your orders</a></p>':loginCard({title:'Keep all your orders in one place',text:'Optional. Create a free account with your email and we will send you a 6-digit code whenever you sign in. No password.'}))+'</div>'+
        '<p class="note noprint" style="margin-top:24px">Anyone with this page address can view this order, so keep it private. Questions? Reply to any email from us.</p></div>');
      var pr=document.getElementById('pr'); if(pr) pr.addEventListener('click',function(){ window.print(); });
      wireLogin(function(){ location.href='/portal/'; });
    }).catch(function(x){ set('<p class="msg err">'+esc(err(x))+'</p>'); });
  }

  if(tok) showTrack(tok); else if(S.load(KEY)) showMine(); else showLogin();
})();
