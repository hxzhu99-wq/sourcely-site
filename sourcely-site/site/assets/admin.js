(function(){
  var root=document.getElementById('admin'); if(!root) return;
  var S=window.SLY, esc=S.esc, KEY='sly_admin';
  var st={orders:[],statuses:[],cap:10,sel:null,detail:null,filter:'',q:''};
  var TEMPLATE='## Summary\nOne or two sentences: which factory looks best and why.\n\n## Your request\n- Product:\n- Target quantity:\n- Target budget:\n\n## Factory comparison\n| | Factory A | Factory B | Factory C |\n|---|---|---|---|\n| Unit price | | | |\n| Minimum order (MOQ) | | | |\n| Lead time | | | |\n| Sample cost and time | | | |\n| Years in business | | | |\n| Certifications | | | |\n| How fast they replied | | | |\n\n## Our recommendation\nWrite your pick and the reasoning.\n\n## Watch-outs\n- \n\n## Suggested next steps\n1. \n2. \n';
  function sess(){ try{ return sessionStorage.getItem(KEY)||''; }catch(e){ return ''; } }
  function setSess(v){ try{ if(v) sessionStorage.setItem(KEY,v); else sessionStorage.removeItem(KEY); }catch(e){} }
  function call(a,extra){ return S.api(Object.assign({action:a,session:sess()},extra||{})).then(function(r){ if(!r.ok&&r.error==='auth'){ setSess(''); login('Session expired. Sign in again.'); throw new Error('auth'); } return r; }); }
  function $(id){ return document.getElementById(id); }

  function login(m){
    root.innerHTML='<div class="narrow"><h1 style="font-size:40px">Admin</h1><form class="form" id="lf" style="margin-top:20px"><label for="pw" style="margin-top:0">Password</label><input type="password" id="pw" autocomplete="current-password" required><div class="rowbtns"><button class="btn primary" type="submit">Sign in</button></div><div class="msg err" id="lm" role="status">'+esc(m||'')+'</div></form></div>';
    $('lf').addEventListener('submit',function(e){
      e.preventDefault(); $('lm').className='msg'; $('lm').textContent='Checking...';
      S.api({action:'admin_login',password:$('pw').value}).then(function(r){
        if(!r.ok){ $('lm').className='msg err'; $('lm').textContent='Wrong password.'; return; }
        setSess(r.session); load();
      }).catch(function(){ $('lm').className='msg err'; $('lm').textContent='Could not reach the server.'; });
    });
  }

  function load(keep){
    call('admin_orders').then(function(r){
      if(!r.ok) return; st.orders=r.orders; st.statuses=r.statuses; st.cap=r.cap; draw();
      if(keep&&st.sel) open(st.sel);
    }).catch(function(){});
  }

  function count(s){ return st.orders.filter(function(o){return o.status===s;}).length; }
  function draw(){
    var used=st.orders.filter(function(o){return o.pilot==='Yes';}).length;
    var stats=[['Total',st.orders.length],['New',count('New')],['In progress',count('In progress')],['Report ready',count('Report ready')+count('Delivered')],['Waitlist',count('Waitlist')],['Pilot spots',used+' / '+st.cap]];
    var shown=st.orders.filter(function(o){
      if(st.filter&&o.status!==st.filter) return false;
      var q=st.q.toLowerCase(); return !q||(o.id+' '+o.name+' '+o.email+' '+o.company+' '+o.category).toLowerCase().indexOf(q)>-1;
    });
    root.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><h1 style="font-size:40px">Orders</h1><div class="rowbtns" style="margin:0"><button class="btn small" id="rf" type="button">Refresh</button><button class="btn small" id="lo" type="button">Sign out</button></div></div>'+
      '<div class="stats">'+stats.map(function(s){return '<div class="stat"><b>'+esc(s[1])+'</b><span>'+esc(s[0])+'</span></div>';}).join('')+'</div>'+
      '<div class="adm"><div><div class="toolbar"><input type="text" id="q" placeholder="Search name, email, ID" value="'+esc(st.q)+'"><select id="fs"><option value="">All statuses</option>'+st.statuses.map(function(s){return '<option'+(st.filter===s?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select></div>'+
      '<div class="olist" id="ol">'+(shown.map(function(o){return '<button class="orow'+(st.sel===o.id?' on':'')+'" data-id="'+esc(o.id)+'" type="button"><span class="t"><span>'+esc(o.name)+'</span><span class="status '+S.sc(o.status)+'">'+esc(o.status)+'</span></span><span class="s">'+esc(o.id)+' · '+esc(o.category)+' · '+esc(S.fmt(o.created))+(o.report==='published'?' · report live':o.report==='draft'?' · report draft':'')+'</span></button>';}).join('')||'<p class="note">No orders match.</p>')+'</div></div><div id="det"><div class="card"><p class="note" style="margin:0">Pick an order to see details.</p></div></div></div>';
    $('rf').onclick=function(){ load(true); };
    $('lo').onclick=function(){ setSess(''); login(''); };
    $('q').oninput=function(){ st.q=this.value; var p=this.selectionStart; draw(); var n=$('q'); n.focus(); n.setSelectionRange(p,p); };
    $('fs').onchange=function(){ st.filter=this.value; draw(); };
    $('ol').onclick=function(e){ var b=e.target.closest('.orow'); if(b) open(b.getAttribute('data-id')); };
    if(st.sel&&st.detail) paint();
  }

  function open(id){
    st.sel=id; [].forEach.call(document.querySelectorAll('.orow'),function(b){ b.classList.toggle('on',b.getAttribute('data-id')===id); });
    $('det').innerHTML='<div class="card"><p class="note" style="margin:0">Loading...</p></div>';
    call('admin_order',{orderId:id}).then(function(r){ if(r.ok){ st.detail=r; paint(); } }).catch(function(){});
  }

  function paint(){
    var o=st.detail.order, rp=st.detail.report||{title:'Factory comparison report',body:'',published:false,driveLink:''};
    $('det').innerHTML='<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3>'+esc(o.id)+' · '+esc(o.name)+'</h3><span class="status '+S.sc(o.status)+'">'+esc(o.status)+'</span></div>'+
      '<dl class="kv"><dt>Email</dt><dd><a href="mailto:'+esc(o.email)+'">'+esc(o.email)+'</a></dd><dt>Company</dt><dd>'+esc(o.company||'-')+'</dd><dt>Wants</dt><dd>'+esc(o.category)+'</dd><dt>Budget</dt><dd>'+esc(o.budget||'-')+'</dd><dt>Brief</dt><dd style="white-space:pre-wrap">'+esc(o.details)+'</dd><dt>Created</dt><dd>'+esc(S.fmtT(o.created))+'</dd><dt>Case study OK</dt><dd>'+esc(o.caseStudy)+'</dd><dt>Pilot spot</dt><dd>'+esc(o.pilot)+'</dd></dl>'+
      '<div class="split"><div><label for="stx" style="margin-top:0">Status</label><select id="stx">'+st.statuses.map(function(s){return '<option'+(o.status===s?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select></div><div><label for="lk" style="margin-top:0">Client link</label><input type="text" id="lk" readonly value="'+esc(o.link)+'"></div></div>'+
      '<label for="nt">Private notes <span class="opt">(clients never see these)</span></label><textarea id="nt" style="min-height:90px">'+esc(o.notes)+'</textarea>'+
      '<div class="rowbtns"><button class="btn primary small" id="sv" type="button">Save status and notes</button><button class="btn small" id="cp" type="button">Copy client link</button><button class="btn small" id="dl" type="button" style="margin-left:auto;color:var(--bad);border-color:var(--bad)">Delete order</button></div><div class="msg" id="m1" role="status"></div></div>'+
      '<div class="card" style="margin-top:16px"><h3>Report</h3><label for="rt">Title</label><input type="text" id="rt" value="'+esc(rp.title)+'" maxlength="160">'+
      '<label for="rb">Report <span class="opt">(markdown: ## headings, - bullets, | tables |)</span></label><textarea id="rb" style="min-height:300px;font:500 14px/1.5 ui-monospace,Menlo,Consolas,monospace">'+esc(rp.body)+'</textarea>'+
      '<div class="rowbtns" style="margin-top:8px"><button class="btn small" id="tp" type="button">Insert template</button></div>'+
      '<label for="rl">Link to a file <span class="opt">(optional, https only, e.g. a Google Drive PDF with link sharing on)</span></label><input type="text" id="rl" value="'+esc(rp.driveLink)+'" placeholder="https://drive.google.com/...">'+
      '<div class="check-row"><input type="checkbox" id="rpub"'+(rp.published?' checked':'')+'><label for="rpub" style="margin:0;font-weight:700">Visible to the client</label></div>'+
      '<div class="rowbtns"><button class="btn small" id="rs" type="button">Save report</button><button class="btn primary small" id="rn" type="button">Publish and email client</button></div><div class="msg" id="m2" role="status"></div>'+
      '<h3 style="margin-top:28px;font-size:20px">Preview</h3><div class="paper prose" id="pv"></div></div>';
    function pv(){ $('pv').innerHTML=S.md($('rb').value)||'<p class="note">Nothing yet.</p>'; }
    pv(); $('rb').oninput=pv;
    $('tp').onclick=function(){ if(!$('rb').value.trim()||confirm('Replace the report text with the template?')){ $('rb').value=TEMPLATE; pv(); } };
    $('cp').onclick=function(){ var l=$('lk'); l.select(); try{ navigator.clipboard.writeText(l.value).then(function(){ msg('m1','Link copied.','ok'); }); }catch(e){ document.execCommand('copy'); msg('m1','Link copied.','ok'); } };
    $('sv').onclick=function(){ call('admin_update',{orderId:o.id,status:$('stx').value,notes:$('nt').value}).then(function(r){ msg('m1',r.ok?'Saved.':'Could not save.',r.ok?'ok':'err'); if(r.ok) load(true); }).catch(function(){}); };
    function saveReport(pub,cb){
      call('admin_report_save',{orderId:o.id,title:$('rt').value,body:$('rb').value,driveLink:$('rl').value,published:pub}).then(function(r){
        if(!r.ok){ msg('m2',r.error==='link'?'The file link must start with https://':'Could not save the report.','err'); return; } cb();
      }).catch(function(){});
    }
    $('rs').onclick=function(){ var pub=$('rpub').checked; saveReport(pub,function(){ msg('m2',pub?'Saved. The client can see it.':'Saved as a draft. The client cannot see it.','ok'); load(true); }); };
    $('rn').onclick=function(){
      if(!$('rb').value.trim()){ msg('m2','Write the report first.','err'); return; }
      if(!confirm('Publish this report and email '+o.email+' now?')) return;
      $('rpub').checked=true;
      saveReport(true,function(){ call('admin_notify',{orderId:o.id}).then(function(r){ msg('m2',r.ok?'Published and emailed '+o.email+'.':'Published, but the email did not send. Copy the client link and send it yourself.',r.ok?'ok':'err'); load(true); }).catch(function(){}); });
    };
    $('dl').onclick=function(){ if(!confirm('Delete '+o.id+' and its report for good?')) return; call('admin_delete',{orderId:o.id}).then(function(r){ if(r.ok){ st.sel=null; st.detail=null; load(); } }).catch(function(){}); };
  }
  function msg(id,t,c){ var n=$(id); if(n){ n.textContent=t; n.className='msg '+(c||''); } }

  if(sess()) load(); else login('');
})();
