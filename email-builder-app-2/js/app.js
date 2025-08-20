document.addEventListener('DOMContentLoaded', bindNav);

// Robust nav binder: any element with [data-nav] will navigate by hash
function bindNav(){
  // (Re)bind on demand
  document.querySelectorAll('[data-nav]').forEach(el => {
    if (el.__navBound) return;
    el.__navBound = true;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const dest = el.getAttribute('data-nav');
      if (dest){ location.hash = dest; }
    });
  });
}


function showStatus(msg){
  var el = document.getElementById('status-banner');
  if(el){
    el.innerText = msg;
    el.style.display = 'block';
  }
}

// Inline status bar helper used throughout the app
function setStatus(msg, type){
  const bar = document.getElementById('statusBar');
  if(!bar) return;

  // Reset previous state
  bar.classList.remove('hidden', 'ok', 'warn', 'err');
  bar.textContent = msg || '';

  // Apply new type if provided; hide if message empty
  if(!msg){
    bar.classList.add('hidden');
  } else if(type){
    bar.classList.add(type);
  }
}


// Global error guards to avoid silent failures that freeze routing
window.addEventListener('error', (e) => { console.warn('[app error]', e.message); showStatus('[Error] ' + e.message); });
window.addEventListener('unhandledrejection', (e) => { console.warn('[unhandled promise]', e.reason); showStatus('[Promise] ' + e.reason); });

/* ===== Storage keys ===== */
    const MODULES_KEY  = "pro_modules_v6";
    const PROJECTS_KEY = "pro_projects_v1";

    /* ===== State ===== */
    let modules = [];   // [{id, name, code}]
    let projects = [];  // [{id, name, instances:[{instanceId,moduleId,values:{}}], createdAt, updatedAt}]
    let editingModuleId = null;
    let currentProjectId = null;

    /* ===== DOM Helpers ===== */
    const $ = s => document.querySelector(s);
    const qs = (node, s) => node.querySelector(s);

    const views = {
      home: $("#view-home"),
      projects: $("#view-projects"),
      composer: $("#view-composer"),
      modules: $("#view-modules")
    };

    const nvGrid = $("#nvGrid");
    const previewCol = $("#previewCol");
    const addSelect = $("#addSelect");
    const btnAdd = $("#btnAdd");
    const btnCopy = $("#btnCopy");
    const projectsList = $("#projectsList");
    const composerProjectName = $("#composerProjectName");

    const repoList = $("#repoList");
    const modName = $("#modName");
    const modCode = $("#modCode");
    const modIdBadge = $("#modIdBadge");
    const btnNew = $("#btnNew");
    const btnSaveModule = $("#btnSaveModule");
    const btnDeleteModule = $("#btnDeleteModule");

    /* ===== Router ===== */
      function go(hash){ location.hash = hash; }
      window.addEventListener("hashchange", renderRoute);
      if (!location.hash) location.hash = "#/";
      renderRoute();

document.addEventListener('click', (e)=>{
  const t = e.target.closest('[data-nav]');
  if (t){
    const dest = t.getAttribute('data-nav');
    if (dest){ e.preventDefault(); location.hash = dest; }
  }
});


      function renderRoute(){
    setStatus('Navigating…','warn');
    bindNav();
    try{
      // hide all
      Object.values(views).forEach(v => v.classList.add("hidden"));
      btnCopy.classList.add("hidden");

      const [_, route, arg] = location.hash.split("/");
      switch(route){
        case "projects":
          views.projects.classList.remove("hidden");
          renderProjectsList();
          break;
        case "modules":
          views.modules.classList.remove("hidden");
          renderRepo();
          break;
        case "composer":
          currentProjectId = arg || null;
          if (!currentProjectId || !getProject(currentProjectId)){
            go("#/projects"); return;
          }
          views.composer.classList.remove("hidden");
          btnCopy.classList.remove("hidden");
          buildAddDropdown();
          renderComposerInputs();
          renderPreviewOnly();
          composerProjectName.textContent = getProject(currentProjectId).name;
          break;
        default:
          views.home.classList.remove("hidden");
      }
    }

    /* ===== Persistence ===== */
    function saveModules(){ localStorage.setItem(MODULES_KEY, JSON.stringify(modules)); }
    function saveProjects(){ localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); }

    async function loadAll(){
      modules = JSON.parse(localStorage.getItem(MODULES_KEY)  || "[]");
      projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
      if (modules.length === 0) await seedStarterModules();
      // scrub: ensure all project instances reference existing modules
      projects.forEach(p => {
        p.instances = (p.instances || []).filter(inst => modules.some(m => m.id === inst.moduleId));
        // normalize colors once on load
        (p.instances || []).forEach(inst => {
          if (!inst.values) return;
          Object.keys(inst.values).forEach(k => inst.values[k] = normalizeHexIfColor(k, inst.values[k]));
        });
      });
      saveModules(); saveProjects();
    }

    /* ===== Modules starter pack (header + 10 content + footer) ===== */
    function seedStarterModules(){
  // If running from local file://, skip fetch (browsers block it) and use inline seed
  if (location.protocol === 'file:') { inlineSeed(); return Promise.resolve(); }

  // Try to seed from /modules/manifest.json so modules live as files
  return fetch('modules/manifest.json')
    .then(r => r.ok ? r.json() : Promise.reject(new Error('No manifest')))
    .then(async (data) => {
      const list = (data && data.modules) ? data.modules : [];
      const seeded = [];
      for (const item of list){
        try{
          const resp = await fetch('modules/' + item.file);
          const html = await resp.text();
          seeded.push({ id: uid("mod"), name: item.name, code: html.trim() });
        }catch(e){ /* ignore individual failures */ }
      }
      if (seeded.length){
        modules = seeded;
        saveModules();
        return;
      }
      // If nothing loaded, fall back to inline defaults
      inlineSeed();
    })
    .catch(() => {
      // Fallback if manifest not found
      inlineSeed();
    });
    setStatus('Ready', 'ok');
  } catch(err){
    console.error('[route error]', err);
    setStatus('Navigation error: ' + err.message, 'err');
  }
}

// Original inline seeding moved into a helper so we can fall back gracefully
function inlineSeed(){
  const m = [];
  const add = (name, code) => m.push({ id: uid("mod"), name, code: code.trim() });
  // Minimal core to avoid bloating app.js; header + hero + headline-cta + footer
  add("HEADER — Wrapper + Preheader + Logo", `<!DOCTYPE html><html><head></head><body>{{preheaderText}}</body></html>`);
  add("Hero — Full Image", `<tr><td><img src="{{heroImageUrl}}" alt="{{heroAlt}}" width="600" style="width:100%;height:auto;"></td></tr>`);
  add("Section — Headline + Subhead + CTA", `<tr><td><div>{{headlineText}}</div><div>{{subheadText}}</div><a href="{{ctaURL}}">{{ctaText}}</a></td></tr>`);
  add("FOOTER — Social + Legal + Close", `</table></td></tr></table></body></html>`);
  modules = m;
  saveModules();
});

      // HEADER
      add("HEADER — Wrapper + Preheader + Logo", `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>{{emailTitle}}</title>
<style>
body { margin:0; padding:0; background:#f5f6fa; }
table { border-collapse:collapse; }
img { border:0; line-height:100%; outline:none; text-decoration:none; display:block; }
a { color: {{brandColor}}; }
@media only screen and (max-width:620px){ .container { width:100% !important; } .stack { display:block !important; width:100% !important; } }
</style>
</head>
<body style="margin:0; padding:0; background:#f5f6fa;">
<div style="display:none; font-size:0; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">{{preheaderText}}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f6fa; padding:24px 0;">
  <tr><td align="center">
    <table class="container" width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px; background:#ffffff; border-radius:12px; border:1px solid #e5e7eb; font-family:Arial, sans-serif;">
      <tr><td align="left" style="padding:20px 28px; border-bottom:1px solid #e5e7eb;">
        <a href="{{brandHomeUrl}}" style="text-decoration:none;"><img src="{{logoUrl}}" alt="Logo" width="140" style="height:auto;"></a>
      </td></tr>
`.trim());

      // 1–10 content modules
      add("Hero — Full Image", `
<tr><td align="center" style="padding:0;">
  <img src="{{heroImageUrl}}" alt="{{heroAlt}}" width="600" style="width:100%; height:auto; border-radius:0 0 12px 12px;">
</td></tr>
`.trim());

      add("Section — Headline + Subhead + CTA", `
<tr><td align="center" style="padding:32px 28px;">
  <div style="font-size:28px; color:#111827; font-weight:bold; padding-bottom:8px;">{{headlineText}}</div>
  <div style="font-size:16px; color:#6b7280; padding-bottom:20px;">{{subheadText}}</div>
  <a href="{{ctaURL}}" style="display:inline-block; background:{{ctaColor}}; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:bold;">{{ctaText}}</a>
</td></tr>
`.trim());

      add("2-Column — Text + Text", `
<tr><td align="center" style="padding:20px 28px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="50%" valign="top" style="padding:10px 10px 10px 0;">
        <div style="font-size:18px; font-weight:bold; color:#111827; padding-bottom:6px;">{{leftTitle}}</div>
        <div style="font-size:14px; color:#374151; line-height:1.6;">{{leftText}}</div>
      </td>
      <td class="stack" width="50%" valign="top" style="padding:10px 0 10px 10px;">
        <div style="font-size:18px; font-weight:bold; color:#111827; padding-bottom:6px;">{{rightTitle}}</div>
        <div style="font-size:14px; color:#374151; line-height:1.6;">{{rightText}}</div>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("2-Column — Image + Text", `
<tr><td align="center" style="padding:20px 28px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="50%" align="center" style="padding:10px;">
        <img src="{{leftImageUrl}}" width="260" style="border-radius:8px; display:block; width:100%; height:auto;" alt="">
        <div style="font-size:14px; color:#374151; padding-top:8px;">{{leftCaption}}</div>
      </td>
      <td class="stack" width="50%" align="center" style="padding:10px;">
        <img src="{{rightImageUrl}}" width="260" style="border-radius:8px; display:block; width:100%; height:auto;" alt="">
        <div style="font-size:14px; color:#374151; padding-top:8px;">{{rightCaption}}</div>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("3-Column — Feature Icons", `
<tr><td align="center" style="padding:24px 20px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="33.33%" align="center" style="padding:10px;">
        <img src="{{icon1Url}}" width="48" height="48" alt="" style="margin-bottom:8px;">
        <div style="font-size:16px; font-weight:bold; color:#111827;">{{title1}}</div>
        <div style="font-size:13px; color:#6b7280; line-height:1.6;">{{text1}}</div>
      </td>
      <td class="stack" width="33.33%" align="center" style="padding:10px;">
        <img src="{{icon2Url}}" width="48" height="48" alt="" style="margin-bottom:8px;">
        <div style="font-size:16px; font-weight:bold; color:#111827;">{{title2}}</div>
        <div style="font-size:13px; color:#6b7280; line-height:1.6;">{{text2}}</div>
      </td>
      <td class="stack" width="33.33%" align="center" style="padding:10px;">
        <img src="{{icon3Url}}" width="48" height="48" alt="" style="margin-bottom:8px;">
        <div style="font-size:16px; font-weight:bold; color:#111827;">{{title3}}</div>
        <div style="font-size:13px; color:#6b7280; line-height:1.6;">{{text3}}</div>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("Media — Image Left, Text Right", `
<tr><td align="center" style="padding:24px 28px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="40%" align="left" style="padding-right:16px;">
        <img src="{{mediaImageUrl}}" width="220" style="border-radius:8px; width:100%; height:auto;" alt="">
      </td>
      <td class="stack" width="60%" align="left" style="padding-left:16px;">
        <div style="font-size:20px; font-weight:bold; color:#111827; padding-bottom:6px;">{{mediaTitle}}</div>
        <div style="font-size:14px; color:#374151; line-height:1.6; padding-bottom:12px;">{{mediaText}}</div>
        <a href="{{mediaCtaUrl}}" style="display:inline-block; background:{{mediaCtaColor}}; color:#fff; text-decoration:none; padding:10px 16px; border-radius:6px; font-weight:bold;">{{mediaCtaText}}</a>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("Media — Text Left, Image Right", `
<tr><td align="center" style="padding:24px 28px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="60%" align="left" style="padding-right:16px;">
        <div style="font-size:20px; font-weight:bold; color:#111827; padding-bottom:6px;">{{media2Title}}</div>
        <div style="font-size:14px; color:#374151; line-height:1.6; padding-bottom:12px;">{{media2Text}}</div>
        <a href="{{media2CtaUrl}}" style="display:inline-block; background:{{media2CtaColor}}; color:#fff; text-decoration:none; padding:10px 16px; border-radius:6px; font-weight:bold;">{{media2CtaText}}</a>
      </td>
      <td class="stack" width="40%" align="left" style="padding-left:16px;">
        <img src="{{media2ImageUrl}}" width="220" style="border-radius:8px; width:100%; height:auto;" alt="">
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("Banner — CTA Strip", `
<tr><td align="center" style="padding:0;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="background:{{bannerBg}};">
    <tr>
      <td align="center" style="padding:16px 28px;">
        <div style="font-size:18px; color:#ffffff; font-weight:600; padding-bottom:10px;">{{bannerText}}</div>
        <a href="{{bannerCtaUrl}}" style="display:inline-block; background:#ffffff; color:{{bannerBg}}; text-decoration:none; padding:10px 16px; border-radius:6px; font-weight:bold;">{{bannerCtaText}}</a>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("Social Proof — Testimonial", `
<tr><td align="center" style="padding:28px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:10px;">
    <tr><td align="left" style="padding:20px;">
      <div style="font-size:18px; line-height:1.6; color:#111827; font-style:italic;">“{{quote}}”</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td width="40"><img src="{{avatarUrl}}" width="40" height="40" style="border-radius:999px;" alt=""></td>
          <td style="padding-left:10px;">
            <div style="font-size:14px; font-weight:bold; color:#111827;">{{author}}</div>
            <div style="font-size:12px; color:#6b7280;">{{role}}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>
`.trim());

      add("Grid — Products 2x2", `
<tr><td align="center" style="padding:20px 16px;">
  <table width="100%" role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stack" width="50%" align="center" style="padding:8px;">
        <img src="{{p1Image}}" width="260" style="border-radius:8px; width:100%; height:auto;" alt="">
        <div style="font-size:14px; font-weight:bold; color:#111827; padding-top:8px;">{{p1Title}}</div>
        <div style="font-size:13px; color:#6b7280; padding:4px 0 8px;">{{p1Desc}}</div>
        <a href="{{p1Url}}" style="display:inline-block; background:{{brandColor}}; color:#fff; text-decoration:none; padding:8px 14px; border-radius:6px; font-weight:bold;">{{p1Cta}}</a>
      </td>
      <td class="stack" width="50%" align="center" style="padding:8px;">
        <img src="{{p2Image}}" width="260" style="border-radius:8px; width:100%; height:auto;" alt="">
        <div style="font-size:14px; font-weight:bold; color:#111827; padding-top:8px;">{{p2Title}}</div>
        <div style="font-size:13px; color:#6b7280; padding:4px 0 8px;">{{p2Desc}}</div>
        <a href="{{p2Url}}" style="display:inline-block; background:{{brandColor}}; color:#fff; text-decoration:none; padding:8px 14px; border-radius:6px; font-weight:bold;">{{p2Cta}}</a>
      </td>
    </tr>
    <tr>
      <td class="stack" width="50%" align="center" style="padding:8px;">
        <img src="{{p3Image}}" width="260" style="border-radius:8px; width:100%; height:auto;" alt="">
        <div style="font-size:14px; font-weight:bold; color:#111827; padding-top:8px;">{{p3Title}}</div>
        <div style="font-size:13px; color:#6b7280; padding:4px 0 8px;">{{p3Desc}}</div>
        <a href="{{p3Url}}" style="display:inline-block; background:{{brandColor}}; color:#fff; text-decoration:none; padding:8px 14px; border-radius:6px; font-weight:bold;">{{p3Cta}}</a>
      </td>
      <td class="stack" width="50%" align="center" style="padding:8px;">
        <img src="{{p4Image}}" width="260" style="border-radius:8px; width:100%; height:auto;" alt="">
        <div style="font-size:14px; font-weight:bold; color:#111827; padding-top:8px;">{{p4Title}}</div>
        <div style="font-size:13px; color:#6b7280; padding:4px 0 8px;">{{p4Desc}}</div>
        <a href="{{p4Url}}" style="display:inline-block; background:{{brandColor}}; color:#fff; text-decoration:none; padding:8px 14px; border-radius:6px; font-weight:bold;">{{p4Cta}}</a>
      </td>
    </tr>
  </table>
</td></tr>
`.trim());

      add("Section — Rich Text", `
<tr><td align="left" style="padding:24px 28px;">
  <div style="font-size:20px; font-weight:bold; color:#111827; padding-bottom:8px;">{{richTitle}}</div>
  <div style="font-size:14px; color:#374151; line-height:1.7;">{{richBody}}</div>
</td></tr>
`.trim());

      // FOOTER
      add("FOOTER — Social + Legal + Close", `
<tr><td align="center" style="padding:24px 28px; border-top:1px solid #e5e7eb;">
  <table role="presentation" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:0 6px;"><a href="{{facebookUrl}}"><img src="{{facebookIconUrl}}" alt="Facebook" width="24" height="24"></a></td>
      <td style="padding:0 6px;"><a href="{{twitterUrl}}"><img src="{{twitterIconUrl}}" alt="Twitter" width="24" height="24"></a></td>
      <td style="padding:0 6px;"><a href="{{linkedinUrl}}"><img src="{{linkedinIconUrl}}" alt="LinkedIn" width="24" height="24"></a></td>
      <td style="padding:0 6px;"><a href="{{instagramUrl}}"><img src="{{instagramIconUrl}}" alt="Instagram" width="24" height="24"></a></td>
    </tr>
  </table>
  <div style="font-size:12px; color:#6b7280; line-height:1.6; padding-top:12px;">
    {{companyAddress}} • <a href="{{unsubscribeUrl}}" style="color:{{brandColor}}; text-decoration:underline;">Unsubscribe</a>
  </div>
</td></tr>
</table></td></tr></table></body></html>
`.trim());

      modules = m;
      saveModules();
    }

    /* ===== Utils ===== */
    function uid(p="id"){ return p+"_"+Math.random().toString(36).slice(2,8)+Date.now().toString(36); }
    function getProject(id){ return projects.find(p => p.id === id); }
    function getModule(id){ return modules.find(m => m.id === id); }
    function extractVars(code){ const m = code.match(/{{\s*([\w.\-]+)\s*}}/g) || []; return [...new Set(m.map(t => t.replace(/{{\s*|\s*}}/g,"")))] }
    function normalizeHexIfColor(key, value){
      if (!value) return value;
      if (!/(color|colour|bg|background|brand|ctaColor|bannerBg)/i.test(key)) return value;
      let v = String(value).trim(); if (!v) return v;
      if (v.startsWith("#")) v = v.slice(1);
      if (/^[0-9a-fA-F]{3}$/.test(v) || /^[0-9a-fA-F]{6}$/.test(v)) return "#" + v.toUpperCase();
      return value;
    }
    function applyValues(code, values){
      const normalized = {};
      for (const k in values) normalized[k] = normalizeHexIfColor(k, values[k]);
      return code.replace(/{{\s*([\w.\-]+)\s*}}/g, (_, k) => (normalized[k] ?? ""));
    }

    /* ===== Projects list ===== */
    function renderProjectsList(){
      projectsList.innerHTML = "";
      if (projects.length === 0){
        projectsList.innerHTML = `<div class="empty pill">No projects yet — click “New Project”.</div>`;
        return;
      }
      projects
        .slice()
        .sort((a,b)=> new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt))
        .forEach(p => {
          const row = document.createElement("div");
          row.className = "proj-row";
          const count = (p.instances||[]).length;
          row.innerHTML = `
            <div><strong>${p.name}</strong></div>
            <div class="pill">${count} module${count!==1?"s":""}</div>
            <div class="pill">${new Date(p.updatedAt||p.createdAt).toLocaleString()}</div>
            <div style="text-align:right;"><button class="btn" data-id="${p.id}">Open</button></div>
          `;
          qs(row, "button").addEventListener("click", ()=> go(`#/composer/${p.id}`));
          projectsList.appendChild(row);
        });
    }
    function newProject(){
      const name = prompt("Project name?");
      if (!name) return;
      const id = uid("proj");
      const now = new Date().toISOString();
      projects.push({ id, name, createdAt: now, updatedAt: now, instances: [] });
      saveProjects();
      go(`#/composer/${id}`);
    }

    /* ===== Composer (per project) ===== */
    function buildAddDropdown(){
      addSelect.innerHTML = `<option value="">Select a module…</option>`;
      modules.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id; opt.text = m.name;
        addSelect.appendChild(opt);
      });
      btnAdd.onclick = () => {
        const moduleId = addSelect.value;
        if (!moduleId) return;
        const mod = getModule(moduleId);
        const p = getProject(currentProjectId);
        const instance = { instanceId: uid("inst"), moduleId, values: {} };
        extractVars(mod.code).forEach(k => (instance.values[k] = ""));
        p.instances.push(instance);
        p.updatedAt = new Date().toISOString();
        saveProjects();
        addSelect.value = "";
        renderComposerInputs(); renderPreviewOnly();
      };
    }

    function renderComposerInputs(){
      const p = getProject(currentProjectId);
      const composer = p.instances || [];
      nvGrid.innerHTML = "";
      if (composer.length === 0){
        const empty = document.createElement("div");
        empty.className = "pill"; empty.style.gridColumn = "1 / span 2";
        empty.textContent = "No modules yet — add one below.";
        nvGrid.appendChild(empty);
        previewCol.innerHTML = `<div class="pill" style="display:inline-block">Nothing to preview yet.</div>`;
        return;
      }

      composer.forEach(inst => {
        const mod = getModule(inst.moduleId);
        if (!mod) return;
        const keys = extractVars(mod.code);
        inst.values = inst.values || {};
        keys.forEach(k => { if (!(k in inst.values)) inst.values[k] = ""; });

        // Separator row (drag handle + delete)
        const sep = document.createElement("div");
        sep.className = "sep"; sep.style.gridColumn = "1 / span 2"; sep.draggable = true;
        sep.dataset.instanceId = inst.instanceId;
        const handle = document.createElement("div");
        handle.className = "handle"; handle.innerHTML = `☰ ${mod.name}`;
        const del = document.createElement("button");
        del.className = "btn danger"; del.textContent = "Delete";
        del.onclick = () => {
          p.instances = p.instances.filter(x => x.instanceId !== inst.instanceId);
          p.updatedAt = new Date().toISOString();
          saveProjects();
          renderComposerInputs(); renderPreviewOnly();
        };
        sep.appendChild(handle); sep.appendChild(del);
        nvGrid.appendChild(sep);

        // Drop indicator
        const drop = document.createElement("div");
        drop.className = "drop";
        nvGrid.appendChild(drop);

        // Aligned rows (name | value)
        keys.forEach(k => {
          const nameCell = document.createElement("div");
          nameCell.className = "name-chip";
          nameCell.textContent = k;
          nvGrid.appendChild(nameCell);

          const valueCell = document.createElement("div");
          valueCell.className = "value-row";
          const input = document.createElement("input");
          input.placeholder = `Value for ${k}`;
          input.value = normalizeHexIfColor(k, inst.values[k] ?? "");
          input.dataset.instanceId = inst.instanceId;
          input.dataset.key = k;

          input.addEventListener("input", e => {
            const { instanceId, key } = e.target.dataset;
            const ci = p.instances.find(x => x.instanceId === instanceId);
            if (!ci) return;
            ci.values[key] = normalizeHexIfColor(key, e.target.value);
            p.updatedAt = new Date().toISOString();
            saveProjects();
            renderPreviewOnly();
          });
          input.addEventListener("blur", e => {
            const { instanceId, key } = e.target.dataset;
            const ci = p.instances.find(x => x.instanceId === instanceId);
            if (!ci) return;
            const norm = normalizeHexIfColor(key, e.target.value);
            e.target.value = norm;
            ci.values[key] = norm;
            p.updatedAt = new Date().toISOString();
            saveProjects();
          });

          valueCell.appendChild(input);
          nvGrid.appendChild(valueCell);
        });

        // DnD
        sep.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", inst.instanceId);
          sep.classList.add("dragging");
        });
        sep.addEventListener("dragend", () => {
          sep.classList.remove("dragging");
          [...nvGrid.querySelectorAll(".drop")].forEach(d => d.classList.remove("active"));
        });
      });

      // grid-level dragover/drop
      nvGrid.onDragOverAttached || (nvGrid.onDragOverAttached = (
        nvGrid.addEventListener("dragover", e => {
          e.preventDefault();
          const indicators = [...nvGrid.querySelectorAll(".drop")];
          let closest = null, closestDist = Infinity;
          indicators.forEach(ind => {
            const r = ind.getBoundingClientRect();
            const dist = Math.abs(e.clientY - r.top);
            if (dist < closestDist){ closestDist = dist; closest = ind; }
            ind.classList.remove("active");
          });
          if (closest) closest.classList.add("active");
        }, { passive:false })
      ));
      nvGrid.onDropAttached || (nvGrid.onDropAttached = (
        nvGrid.addEventListener("drop", e => {
          e.preventDefault();
          const p = getProject(currentProjectId);
          const srcId = e.dataTransfer.getData("text/plain");
          const indicators = [...nvGrid.querySelectorAll(".drop")];
          const activeIdx = indicators.findIndex(d => d.classList.contains("active"));
          indicators.forEach(d => d.classList.remove("active"));
          if (activeIdx < 0) return;

          const seps = [...nvGrid.querySelectorAll(".sep")];
          const destIndex = Math.min(activeIdx, seps.length);
          const srcIndex = p.instances.findIndex(i => i.instanceId === srcId);
          if (srcIndex < 0) return;

          const [moved] = p.instances.splice(srcIndex, 1);
          p.instances.splice(destIndex, 0, moved);
          p.updatedAt = new Date().toISOString();
          saveProjects();
          renderComposerInputs(); renderPreviewOnly();
        })
      ));
    }

    function renderPreviewOnly(){
      const p = getProject(currentProjectId);
      if (!p){ previewCol.innerHTML = ""; return; }
      let html = "";
      (p.instances || []).forEach(inst => {
        const mod = getModule(inst.moduleId); if (!mod) return;
        html += `<div class="frame">${applyValues(mod.code, inst.values||{})}</div>`;
      });
      previewCol.innerHTML = html || `<div class="pill" style="display:inline-block">Nothing to preview yet.</div>`;
    }

    /* ===== Modules Repo (Code Editor) ===== */
    function renderRepo(){
      repoList.innerHTML = "";
      modules.forEach(m => {
        const item = document.createElement("div");
        item.className = "repo-item";
        item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong>${m.name}</strong><span class="pill">${m.id}</span>
        </div>`;
        item.addEventListener("click", ()=> loadModuleForEdit(m.id));
        repoList.appendChild(item);
      });
      if (editingModuleId){
        const mm = modules.find(x => x.id === editingModuleId);
        if (mm){ modName.value = mm.name; modCode.value = mm.code; modIdBadge.textContent = mm.id; }
      } else {
        modName.value = ""; modCode.value = ""; modIdBadge.textContent = "New";
      }
    }
    function loadModuleForEdit(id){
      const m = modules.find(x => x.id === id); if (!m) return;
      editingModuleId = id; modName.value = m.name; modCode.value = m.code; modIdBadge.textContent = id;
    }
    btnNew.addEventListener("click", ()=>{ editingModuleId = null; modName.value = ""; modCode.value = ""; modIdBadge.textContent = "New"; });
    btnSaveModule.addEventListener("click", ()=>{
      const name = modName.value.trim(); const code = modCode.value;
      if (!name || !code){ alert("Please provide a module name and HTML"); return; }
      if (editingModuleId){
        const i = modules.findIndex(m => m.id === editingModuleId);
        if (i >= 0) modules[i] = { ...modules[i], name, code };
      } else {
        const id = uid("mod"); modules.push({ id, name, code }); editingModuleId = id; modIdBadge.textContent = id;
      }
      saveModules(); renderRepo(); // update composer add dropdown if currently in composer
      if (location.hash.startsWith("#/composer/")) buildAddDropdown();
    });
    btnDeleteModule.addEventListener("click", ()=>{
      if (!editingModuleId) return;
      const id = editingModuleId;
      // remove from modules
      modules = modules.filter(m => m.id !== id);
      saveModules();
      // remove instances referencing it
      projects.forEach(p => {
        const before = p.instances?.length || 0;
        p.instances = (p.instances || []).filter(inst => inst.moduleId !== id);
        if (p.instances.length !== before) p.updatedAt = new Date().toISOString();
      });
      saveProjects();
      editingModuleId = null; modName.value = ""; modCode.value = ""; modIdBadge.textContent = "New";
      renderRepo();
      if (location.hash.startsWith("#/composer/")){
        buildAddDropdown(); renderComposerInputs(); renderPreviewOnly();
      }
    });

    /* ===== Copy HTML from Composer ===== */
    btnCopy.addEventListener("click", async ()=>{
      if (!location.hash.startsWith("#/composer/")) return;
      try{
        await navigator.clipboard.writeText(previewCol.innerHTML);
        const old = btnCopy.textContent; btnCopy.textContent = "Copied!";
        setTimeout(()=> btnCopy.textContent = old, 1200);
      }catch{ alert("Copy failed. Select the preview and copy manually."); }
    });

    /* ===== Boot ===== */
    (async function init(){
      setStatus('Initializing…','warn');
      await loadAll();
      if (!location.hash) location.hash = '#/';
      bindNav();
      renderRoute();
    })();

// Rebind nav when DOM changes (e.g., after patches)
const __navObserver = new MutationObserver(() => bindNav());
__navObserver.observe(document.documentElement, { childList:true, subtree:true });

(function () {
  function $(s){return document.querySelector(s);}
  function show(v){
    const views = ["#view-auth", "#view-home", "#view-projects", "#view-composer", "#view-modules"]
      .map(id => document.querySelector(id))
      .filter(Boolean);
    views.forEach(el => el.classList.add("hidden"));
    v && v.classList.remove("hidden");
  }
  function simpleRoute(){
    const h = location.hash || "#/";
    if (h.startsWith("#/projects")) return show($("#view-projects"));
    if (h.startsWith("#/modules"))  return show($("#view-modules"));
    if (h.startsWith("#/auth"))     return show($("#view-auth"));
    return show($("#view-home"));
  }
  window.addEventListener("hashchange", simpleRoute);
  if (!location.hash) location.hash = "#/";
  simpleRoute();
})();
