const library = document.querySelector('#library');
const search = document.querySelector('#search');
const countEl = document.querySelector('#count');
const tagFilter = document.querySelector('#tagFilter');
const toastEl = document.querySelector('#toast');
let db = { prompts: [], sources: [], models: [] };
let currentPrompts = [];
let allTags = [];
let activeTag = null;
let currentDetail = null;
let previewEl = null;
let previewState = null;

function esc(v){return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(msg, isErr = false){ toastEl.textContent = msg; toastEl.classList.toggle('err', isErr); toastEl.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.hidden = true, 2200); }
function guard(fn){ return (...a) => Promise.resolve(fn(...a)).catch(err => toast(err.message || String(err), true)); }
function formatPrompt(text){ const t = String(text || '').trim(); const looksJson = (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']')); if (!looksJson) return text; try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return text; } }
function representative(p){ return (p.images || [])[0]; }
function representativePrompt(p){ const r = representative(p); return (r && r.prompt) || p.text || ''; }
function imagePrompt(p, img){ return (img && img.prompt) || representativePrompt(p); }
function isCoverImage(p, img){ return !!img && representative(p)?.id === img.id; }
function toSummary(p){ const imgs = p.images || []; const cover = imgs[0] || null; return { id:p.id, title:p.title||'', source:p.source||'', tags:p.tags||[], text:(p.text||'').slice(0,140), imageCount:imgs.length, cover: cover ? { id:cover.id, thumbUrl:cover.thumbUrl || cover.displayUrl || cover.imageUrl, imageUrl:cover.displayUrl || cover.imageUrl, width:cover.width||null, height:cover.height||null } : null, createdAt:p.createdAt, updatedAt:p.updatedAt }; }
function getDetail(id){ const p = db.prompts.find(p => p.id === id); if (!p) throw new Error('프롬프트를 찾을 수 없습니다.'); return p; }

async function load(){
  if (!db.prompts.length){ const res = await fetch('data/library.json'); if (!res.ok) throw new Error(`library.json 로드 실패: HTTP ${res.status}`); db = await res.json(); }
  const q = search.value.trim().toLowerCase();
  const filtered = (db.prompts || []).filter(p => !q || (p.text||'').toLowerCase().includes(q) || (p.title||'').toLowerCase().includes(q) || (p.tags||[]).some(t => String(t).toLowerCase().includes(q)));
  currentPrompts = filtered.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(toSummary);
  allTags = [...new Set((db.prompts || []).flatMap(p => p.tags || []))].sort((a,b)=>a.localeCompare(b));
  if (activeTag && !allTags.includes(activeTag)) activeTag = null;
  render();
}

function render(){
  const list = activeTag ? currentPrompts.filter(p => (p.tags || []).includes(activeTag)) : currentPrompts;
  countEl.textContent = currentPrompts.length ? (activeTag ? `${list.length} / ${currentPrompts.length}` : `${currentPrompts.length}`) : '';
  tagFilter.innerHTML = allTags.length ? [`<button type="button" class="tagChip${activeTag ? '' : ' on'}" data-tag="">전체</button>`, ...allTags.map(t => `<button type="button" class="tagChip${activeTag === t ? ' on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`)].join('') : '';
  if (!list.length){ library.innerHTML = `<p class="empty">${activeTag ? '해당 태그의 프롬프트가 없습니다.' : search.value ? '검색 결과가 없습니다.' : '저장된 프롬프트가 없습니다.'}</p>`; return; }
  const cs = getComputedStyle(library); const avail = library.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const gap = 12, target = window.innerWidth <= 640 ? 150 : 240; const n = Math.max(1, Math.floor((avail + gap) / (target + gap))); const colW = (avail - gap * (n - 1)) / n; const cols = Array.from({ length:n }, () => []); const heights = new Array(n).fill(0);
  for (const p of list){
    const img = p.cover; const label = esc(p.title || p.text.slice(0,60) || '무제'); const count = p.imageCount > 1 ? `<span class="countMark">${p.imageCount}</span>` : ''; const ratio = img?.width && img?.height ? img.height / img.width : 1; const ar = img?.width && img?.height ? ` style="aspect-ratio:${img.width} / ${img.height}"` : ''; const body = img ? `<img src="${esc(img.thumbUrl || img.imageUrl)}"${ar} loading="lazy" alt="">` : `<div class="ph">이미지 없음</div>`;
    let i = 0; for (let k = 1; k < n; k++) if (heights[k] < heights[i]) i = k; heights[i] += colW * ratio + 37 + gap;
    cols[i].push(`<article class="tile${img ? '' : ' emptyTile'}" data-open="${p.id}"><button class="tileBtn" type="button">${body}</button><div class="tileMeta"><span class="t">${label}</span>${count}</div></article>`);
  }
  library.innerHTML = cols.map(c => `<div class="mcol">${c.join('')}</div>`).join('');
}
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
tagFilter.addEventListener('click', e => { const btn = e.target.closest('[data-tag]'); if (!btn) return; activeTag = btn.dataset.tag || null; render(); });
library.addEventListener('click', e => { const btn = e.target.closest('[data-open]'); if (!btn) return; guard(openPreview)(btn.dataset.open, 0); });

async function openPreview(promptId, index = 0){ currentDetail = getDetail(promptId); previewState = { promptId, index }; if (!previewEl){ previewEl = document.createElement('div'); previewEl.className = 'overlay'; previewEl.innerHTML = `<div class="shade" data-close="1"></div><article class="previewDialog"><div class="viewer"><div class="viewerMain"><img data-img alt=""><button class="navBtn prev" type="button" data-nav="-1">‹</button><button class="navBtn next" type="button" data-nav="1">›</button><div class="counter" data-counter></div></div><div class="emptyViewer" data-noimg hidden>이미지 없음</div><div class="thumbStrip" data-strip></div></div><aside class="infoPanel" data-panel></aside></article>`; document.body.appendChild(previewEl); previewEl.addEventListener('click', e => { if (e.target.dataset.close) closePreview(); }); previewEl.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => navigate(Number(b.dataset.nav)))); } paint(); }
function navigate(delta){ if (!currentDetail) return; previewState.index += delta; paint(); }
function closePreview(){ previewEl?.remove(); previewEl = null; previewState = null; currentDetail = null; }
function paint(){ if (!previewEl || !currentDetail) return; const p = currentDetail; const images = p.images || []; const safe = images.length ? Math.max(0, Math.min(images.length - 1, previewState.index)) : 0; previewState.index = safe; const img = images[safe] || null; const main = previewEl.querySelector('.viewerMain'); const noimg = previewEl.querySelector('[data-noimg]'); const strip = previewEl.querySelector('[data-strip]'); if (img && (img.displayUrl || img.imageUrl)){ main.hidden = false; noimg.hidden = true; previewEl.querySelector('[data-img]').src = img.displayUrl || img.imageUrl; previewEl.querySelector('[data-counter]').textContent = `${safe + 1} / ${images.length}`; previewEl.querySelectorAll('[data-nav]').forEach(b => b.disabled = images.length <= 1); strip.innerHTML = images.length > 1 ? images.map((im,i)=>`<button type="button" class="${i===safe?'on':''}" data-jump="${i}"><img src="${esc(im.thumbUrl || im.displayUrl || im.imageUrl)}" loading="lazy" alt=""></button>`).join('') : ''; strip.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { previewState.index = Number(b.dataset.jump); paint(); })); strip.querySelector('.on')?.scrollIntoView({ block:'nearest', inline:'nearest' }); } else { main.hidden = true; noimg.hidden = false; strip.innerHTML = ''; } paintPanel(p,img); }
function paintPanel(p,img){ const panel = previewEl.querySelector('[data-panel]'); const cover = isCoverImage(p,img); const effPrompt = imagePrompt(p,img); const promptBadge = !img ? '' : cover ? '<span class="badge">대표</span>' : img.prompt ? '<span class="badge alt">이 사진 전용</span>' : '<span class="badge">대표 상속</span>'; const tags = p.tags || []; panel.innerHTML = `<div class="infoHead"><h2 title="${esc(p.title || '')}">${esc(p.title || p.text.slice(0,60) || '무제')}</h2><button class="iconBtn" type="button" data-close="1">×</button></div><div class="promptBox"><div class="head"><span class="lb">프롬프트 ${promptBadge}</span><button class="smallBtn" type="button" data-copy>복사</button></div><pre data-prompt-view>${esc(formatPrompt(effPrompt))}</pre></div><dl class="metaList"><dt>모델</dt><dd>${img ? esc(img.generationModel || '-') : '<span class="mut">-</span>'}</dd><dt>출처</dt><dd>${esc(p.source) || '<span class="mut">-</span>'}</dd><dt>태그</dt><dd><div class="tagRow">${tags.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div></dd><dt>코멘트</dt><dd>${img?.note ? esc(img.note) : '<span class="mut">-</span>'}</dd><dt>저장일</dt><dd class="mut">${esc((p.createdAt||'').slice(0,10))}</dd></dl><div class="infoActions"><button class="smallBtn" type="button" data-copy2>프롬프트 복사</button></div>`; panel.querySelector('[data-copy]').addEventListener('click', e => copyPrompt(imagePrompt(p,img), e.currentTarget)); panel.querySelector('[data-copy2]').addEventListener('click', e => copyPrompt(imagePrompt(p,img), e.currentTarget)); }
async function copyPrompt(text, btn){ try { await navigator.clipboard.writeText(text || ''); toast('프롬프트를 복사했습니다.'); if (btn){ const o=btn.textContent; btn.textContent='복사됨'; setTimeout(()=>btn.textContent=o,1200); } } catch { toast('복사에 실패했습니다.', true); } }
let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(guard(load), 120); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && previewEl) return closePreview(); if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft' && currentDetail) navigate(-1); if (e.key === 'ArrowRight' && currentDetail) navigate(1); });
guard(load)();
