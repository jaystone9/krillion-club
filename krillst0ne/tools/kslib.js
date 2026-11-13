window.KS=(()=>{
const WD='https://query.wikidata.org/sparql?format=json&query=';
const SBASE='https://apjlbzyiszkgwyhpvyiq.supabase.co/rest/v1/',SBK='sb_publishable_YM9K9YqwnTvz77h7Y-K_cQ_I8HQuWKT';
const Q={film:'Q11424',human:'Q5',song:'Q7366',single:'Q134556','tv series':'Q5398426',country:'Q6256','sovereign state':'Q3624078',city:'Q515',island:'Q23442',river:'Q4022',mountain:'Q8502',lake:'Q23397',volcano:'Q8072',novel:'Q8261',play:'Q25379',musical:'Q2743',album:'Q482994',taxon:'Q16521','dog breed':'Q39367',cocktail:'Q134768',cheese:'Q10943',museum:'Q33506',castle:'Q23413',bridge:'Q12280',airline:'Q46970','board game':'Q131436',constellation:'Q8928','chemical element':'Q11344','national park':'Q46169',desert:'Q8514',USA:'Q30',UK:'Q145',France:'Q142',Italy:'Q38',Spain:'Q29',Germany:'Q183',Japan:'Q17',Canada:'Q16',Australia:'Q408',India:'Q668',China:'Q148',Mexico:'Q96'};
const TIERS=[10,15,30,60,85,100];
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/['’.]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/^(the|a|an) /,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sparql(q,tries=2){for(let i=0;;i++){const r=await fetch(WD+encodeURIComponent(q),{headers:{Accept:'application/sparql-results+json'}});if(r.ok)return (await r.json()).results.bindings;const t=(await r.text()).slice(0,160).replace(/\s+/g,' ');if(i>=tries||!/429|50\d/.test(String(r.status)))throw new Error('sparql '+r.status+' '+t);await sleep(4000*(i+1))}}
const seen={};
async function ent(name){
  if(/^Q\d+$/.test(name))return name;
  let hint='';const m=name.split('~');if(m[1]){name=m[0];hint=m[1].toLowerCase()}
  if(Q[name]&&!hint){seen[name]=Q[name];return Q[name]}
  const j=await (await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=7&origin=*&search='+encodeURIComponent(name))).json();
  const hits=j.search||[];const h=(hint&&hits.find(x=>(x.description||'').toLowerCase().includes(hint)))||hits[0];
  if(!h)throw new Error('no entity for '+name);
  seen[name]=h.id+' ('+(h.label||'')+': '+(h.description||'').slice(0,50)+')';return h.id}
async function fill(where){const names=[...new Set((where.match(/\{[^}]+\}/g)||[]))];for(const n of names){const id=await ent(n.slice(1,-1));where=where.split(n).join('wd:'+id)}return where}
function cap(s){return s?s[0].toUpperCase()+s.slice(1):s}
async function build(spec){
  const [q,g,where,o={}]=spec;const out={q,g,t:{},notes:o.note||{}};const info={q,n:0};
  let ents=[];// {name,al:[],links}
  if(where){
    const w=await fill(where);const min=o.min||1;
    const query=`SELECT ?item ?itemLabel ?links (GROUP_CONCAT(DISTINCT ?alt;separator='|') AS ?alts) WHERE { ${w} ?item wikibase:sitelinks ?links. FILTER(?links>=${min}) OPTIONAL{?item skos:altLabel ?alt FILTER(lang(?alt)='en')} SERVICE wikibase:label{bd:serviceParam wikibase:language 'en'} } GROUP BY ?item ?itemLabel ?links ORDER BY DESC(?links) LIMIT ${o.limit||4000}`;
    const rows=await sparql(query);info.raw=rows.length;
    for(const b of rows){let name=b.itemLabel.value;if(/^Q\d+$/.test(name))continue;
      if(o.clean!==false)name=name.replace(/\s*\((?!.*\b(part|vol)\b)[^)]*\)\s*$/i,'');
      name=cap(name.trim());if(!name||name.length>70)continue;
      const al=(b.alts?b.alts.value.split('|'):[]).map(a=>a.trim()).filter(a=>a.length>1&&a.length<=45&&/^[\x20-\x7EÀ-ɏ’]+$/.test(a)&&!/[;|]/.test(a));
      if(/[;|]/.test(name))continue;
      ents.push({name,al,links:+b.links.value})}
  }
  const drops=(o.drop||[]).map(d=>d[0]==='/'?new RegExp(d.slice(1),'i'):norm(d));
  ents=ents.filter(e=>!drops.some(d=>d instanceof RegExp?d.test(e.name):d===norm(e.name)));
  // claim spellings in popularity order
  const key={},list=[];
  for(const e of ents){const k=norm(e.name);if(!k||key[k]!==undefined)continue;key[k]=list.length;list.push({name:e.name,al:[],links:e.links,raw:e.al})}
  if(o.sn){const cnt={};for(const e of list){const p=norm(e.name).split(' ');const s=p[p.length-1];cnt[s]=(cnt[s]||0)+1}
    for(const e of list){const p=e.name.split(' ');if(p.length>1){const s=p[p.length-1];if(s.length>3&&cnt[norm(s)]===1)e.raw.unshift(s)}}}
  list.forEach((e,i)=>{let c=0;for(const a of e.raw){const k=norm(a);if(!k||key[k]!==undefined)continue;if(c>=(o.maxAl||7))break;key[k]=i;e.al.push(a);c++}});
  const n=list.length;const r30=o.n30!=null?o.n30:Math.max(8,Math.min(40,Math.round(n*.05)));const r60=r30+(o.n60!=null?o.n60:Math.max(15,Math.min(350,Math.round(n*.22))));
  list.forEach((e,i)=>e.tier=i<r30?30:i<r60?60:85);
  const miss=[];
  const find=nm=>{const i=key[norm(nm.split('|')[0])];return i===undefined?null:list[i]};
  const put=(str,tier,must)=>{const parts=str.split('|').map(x=>x.trim());let e=find(parts[0]);
    if(!e){for(const a of parts.slice(1)){const i=key[norm(a)];if(i!==undefined){e=list[i];break}}}
    if(!e){if(must===false){miss.push(parts[0]);return}e={name:parts[0],al:[],links:0};key[norm(parts[0])]=list.length;list.push(e);if(must!=='add')miss.push('+'+parts[0])}
    e.tier=tier;const i=list.indexOf(e);for(const a of parts.slice(1)){const k=norm(a);if(k&&key[k]===undefined){key[k]=i;e.al.push(a)}}};
  for(const t of [85,60,30])for(const s of (o['t'+t]||[]))put(s,t,'add');
  for(const s of (o.add||[])){const m=s.match(/^(\d+):(.*)$/);put(m[2],+m[1],'add')}
  for(const s of (o.p15||[]))put(s,15);
  for(const s of (o.p10||[]))put(s,10);
  if(o.gem)put(o.gem,100);
  for(const t of TIERS)out.t[t]=list.filter(e=>e.tier===t).map(e=>[e.name,...e.al].join('|')).join(';');
  info.n=list.length;info.tiers=TIERS.map(t=>list.filter(e=>e.tier===t).length).join('/');
  info.miss=miss;info.t30=list.filter(e=>e.tier===30).slice(0,14).map(e=>e.name).join(', ');
  info.t60=list.filter(e=>e.tier===60).slice(0,8).map(e=>e.name).join(', ');
  const d=list.filter(e=>e.tier===85);info.t85=[0,.2,.4,.6,.8,.99].map(f=>d[Math.floor(f*(d.length-1))]).filter(Boolean).map(e=>e.name).join(', ');
  info.bad=TIERS.filter(t=>!out.t[t]).join(',');
  return {out,info}}
const dives={},log={};
async function dive(n,specs){log[n]={state:'running',info:[]};const prompts=[];
  for(const s of specs){try{const r=await build(s);prompts.push(r.out);log[n].info.push(r.info)}catch(e){prompts.push(null);log[n].info.push({q:s[0],err:String(e).slice(0,200)})}await sleep(700)}
  dives[n]=prompts;log[n].state=prompts.every(Boolean)&&log[n].info.every(i=>!i.bad)?'ok':'needs-fix';return log[n]}
function queue(obj){const ns=Object.keys(obj);(async()=>{for(const n of ns)await dive(n,obj[n])})();return 'queued '+ns.join(',')}
async function redo(n,i,spec){const r=await build(spec);dives[n][i]=r.out;log[n].info[i]=r.info;log[n].state=dives[n].every(Boolean)&&log[n].info.every(x=>!x.bad&&!x.err)?'ok':'needs-fix';return r.info}
function encode(obj){const b=new TextEncoder().encode(JSON.stringify(obj));let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(s).split('').reverse().join('')}
async function upload(n,nonce){if(!dives[n]||dives[n].length!==7||!dives[n].every(Boolean))return n+': not ready';const data=encode(dives[n]);
  const r=await fetch(SBASE+'krillst0ne_stage',{method:'POST',headers:{apikey:SBK,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({key:'dive-'+n+'-'+nonce,data})});return n+': '+r.status+' '+Math.round(data.length/1024)+'KB'}
function report(n){const L=log[n];if(!L)return n+': none';return {n,state:L.state,info:L.info}}
return {sparql,ent,build,dive,queue,redo,upload,report,dives,log,seen,norm}})();
'KS ready'
