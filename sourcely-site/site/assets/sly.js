/* Sourcely shared helpers */
(function(){
  var API=window.SLY_API||'';
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function api(body){
    if(!API) return Promise.reject(new Error('no_api'));
    return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(r){return r.json();});
  }
  function inline(s){
    s=esc(s);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,function(m,t,u){
      if(!/^(https?:\/\/|mailto:|\/|#)/.test(u)) return m;
      return '<a href="'+u+'"'+(/^https?:/.test(u)?' target="_blank" rel="noopener noreferrer"':'')+'>'+t+'</a>';
    });
    s=s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g,'$1<i>$2</i>');
    return s;
  }
  function cells(l){ l=l.trim().replace(/^\|/,'').replace(/\|$/,''); return l.split('|').map(function(c){return c.trim();}); }
  /* markdown-lite: ## h2, ### h3, - bullets, 1. numbers, > aside, | tables |, **bold**, *italic*, [text](url) */
  function md(text){
    var lines=String(text||'').replace(/\r/g,'').split('\n'), out=[], para=[], list=null, i=0, m;
    function fp(){ if(para.length){ out.push('<p>'+inline(para.join(' '))+'</p>'); para=[]; } }
    function fl(){ if(list){ out.push('</'+list+'>'); list=null; } }
    while(i<lines.length){
      var l=lines[i].trim();
      if(!l){ fp(); fl(); i++; continue; }
      if(/^\|/.test(l)){
        fp(); fl();
        var rows=[]; while(i<lines.length&&/^\|/.test(lines[i].trim())){ rows.push(lines[i]); i++; }
        var head=cells(rows[0]), body=rows.slice(/^\|?[\s:|-]+\|?$/.test(rows[1]||'')?2:1).map(cells);
        out.push('<div class="tablewrap"><table><thead><tr>'+head.map(function(c){return '<th>'+inline(c)+'</th>';}).join('')+'</tr></thead><tbody>'+
          body.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+inline(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>');
        continue;
      }
      i++;
      if(/^-{3,}$/.test(l)){ fp(); fl(); continue; }
      if((m=l.match(/^#{1,2}\s+(.*)$/))){ fp(); fl(); out.push('<h2>'+inline(m[1])+'</h2>'); continue; }
      if((m=l.match(/^#{3,}\s+(.*)$/))){ fp(); fl(); out.push('<h3>'+inline(m[1])+'</h3>'); continue; }
      if((m=l.match(/^>\s?(.*)$/))){ fp(); fl(); out.push('<p class="aside">'+inline(m[1])+'</p>'); continue; }
      if((m=l.match(/^[-*]\s+(.*)$/))){ fp(); if(list!=='ul'){ fl(); out.push('<ul>'); list='ul'; } out.push('<li>'+inline(m[1])+'</li>'); continue; }
      if((m=l.match(/^\d+[.)]\s+(.*)$/))){ fp(); if(list!=='ol'){ fl(); out.push('<ol>'); list='ol'; } out.push('<li>'+inline(m[1])+'</li>'); continue; }
      fl(); para.push(l);
    }
    fp(); fl();
    return out.join('\n');
  }
  function fmt(d){ try{ return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }catch(e){ return d; } }
  function fmtT(d){ try{ return new Date(d).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }catch(e){ return d; } }
  function sc(s){ return 's-'+String(s).replace(/\s+/g,'-'); }
  function store(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} }
  function load(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  window.SLY={api:api,esc:esc,md:md,fmt:fmt,fmtT:fmtT,sc:sc,store:store,load:load,hasApi:!!API};

  /* free-spots badge, wherever one exists */
  var nodes=document.querySelectorAll('[data-spots]');
  if(nodes.length&&API){
    api({action:'spots'}).then(function(r){
      if(!r||!r.ok) return;
      [].forEach.call(nodes,function(n){
        n.textContent=r.remaining>0?'':'';
      });
    }).catch(function(){});
  }
})();
