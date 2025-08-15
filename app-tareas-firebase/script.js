// ===== CONFIGURA AQUI TU FIREBASE =====
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "",
  appId: ""
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===== Estado global =====
let currentUser = null;
let currentRole = null; // 'admin' | 'contributor' | null
let currentCoords = null; // [lat, lon]
let currentAddress = null;
let currentPhotoFile = null;
let mapPrev = null; let mapPrevInited = false;

// ===== Helpers =====
const $ = (id)=> document.getElementById(id);
const toast = (el, msg)=>{ el.textContent = msg; setTimeout(()=> el.textContent='', 2500); };

async function fetchRole(uid){
  const ref = db.collection('roles').doc(uid);
  const snap = await ref.get();
  return snap.exists ? snap.data().role : null;
}

// ===== Auth listeners =====
auth.onAuthStateChanged(async (user)=>{
  currentUser = user;
  if(user){
    currentRole = await fetchRole(user.uid);
    $('whoami').innerHTML = `Conectado como <b>${user.email}</b> — rol: <b>${currentRole || 'pendiente'}</b>`;
    $('btnLogout').disabled = false;
    $('userBox').textContent = user.email;
    loadTasks();
  }else{
    currentRole = null;
    $('whoami').textContent = '';
    $('btnLogout').disabled = true;
    $('userBox').textContent = '';
    $('taskList').innerHTML='';
  }
  updateScopeLabel();
});

function updateScopeLabel(){
  if(!currentUser){ $('scope').textContent = 'Inicia sesión para ver tus tareas.'; return; }
  if(currentRole==='admin'){ $('scope').textContent = 'Viendo TODAS las tareas (admin).'; }
  else if(currentRole==='contributor'){ $('scope').textContent = 'Viendo solo tus tareas (contributor).'; }
  else { $('scope').textContent = 'Tu cuenta está pendiente de aprobación por el admin.'; }
}

// ===== Login / Logout / Register =====
$('btnLogin').onclick = async ()=>{
  try{ await auth.signInWithEmailAndPassword($('loginEmail').value, $('loginPass').value); }
  catch(e){ alert(e.message); }
};
$('btnLogout').onclick = async ()=>{ await auth.signOut(); };
$('btnRegister').onclick = async ()=>{
  try{
    await auth.createUserWithEmailAndPassword($('regEmail').value, $('regPass').value);
    alert('Cuenta creada. Espera aprobación del admin para asignarte rol.');
  }catch(e){ alert(e.message); }
};

// ===== Ubicación + Nominatim + Leaflet preview =====
$('btnLoc').onclick = ()=>{
  if(!navigator.geolocation){ alert('Geolocalización no soportada.'); return; }
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    currentCoords = [lat, lon];
    $('locInfo').innerHTML = `<b>Coordenadas:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)} <br>Obteniendo dirección...`;
    try{
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { headers:{'Accept':'application/json'} });
      const data = await res.json();
      currentAddress = data.display_name || null;
    }catch(err){ currentAddress = null; }
    $('locInfo').innerHTML = `<b>Coordenadas:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br><b>Dirección:</b> ${currentAddress || 'No disponible'}`;
    $('mapPreview').classList.remove('hidden');
    if(!mapPrevInited){
      mapPrev = L.map('mapPreview').setView([lat, lon], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(mapPrev);
      L.marker([lat, lon]).addTo(mapPrev);
      mapPrevInited = true;
    }else{
      mapPrev.setView([lat, lon], 16);
      L.marker([lat, lon]).addTo(mapPrev);
    }
  }, (err)=> alert('No se pudo obtener ubicación: '+err.message));
};
$('btnClearLoc').onclick = ()=>{
  currentCoords = null; currentAddress = null;
  $('locInfo').textContent=''; $('mapPreview').classList.add('hidden');
  if(mapPrev){ mapPrev.remove(); mapPrev=null; mapPrevInited=false; }
};

// ===== Foto preview =====
$('tPhoto').addEventListener('change', (e)=>{
  currentPhotoFile = e.target.files[0] || null;
  if(currentPhotoFile){
    const reader = new FileReader();
    reader.onload = ()=>{ $('previewImg').src = reader.result; $('previewImg').classList.remove('hidden'); };
    reader.readAsDataURL(currentPhotoFile);
  }else{
    $('previewImg').classList.add('hidden');
  }
});

// ===== Guardar tarea =====
$('btnSave').onclick = async ()=>{
  if(!currentUser){ alert('Inicia sesión.'); return; }
  if(currentRole!=='admin' && currentRole!=='contributor'){ alert('Tu cuenta aún no está aprobada.'); return; }

  const title = $('tTitle').value.trim();
  const number = parseInt($('tNumber').value,10);
  const notes = $('tNotes').value.trim();
  if(!title){ alert('Título requerido'); return; }
  if(!currentCoords){ alert('Obtén la ubicación'); return; }

  $('btnSave').disabled = true;
  let photoURL = null;
  try{
    if(currentPhotoFile){
      const path = `images/${currentUser.uid}/${Date.now()}_${currentPhotoFile.name}`;
      const ref = storage.ref().child(path);
      await ref.put(currentPhotoFile);
      photoURL = await ref.getDownloadURL();
    }
    const doc = {
      title, number: isNaN(number)? null:number, notes,
      coords: currentCoords, address: currentAddress||null,
      photoURL: photoURL||null,
      owner: currentUser.uid, ownerEmail: currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('tasks').add(doc);
    toast($('saveMsg'), 'Guardado ✅');
    clearForm(); loadTasks();
  }catch(e){
    alert('Error al guardar: '+e.message);
  }finally{
    $('btnSave').disabled = false;
  }
};

function clearForm(){
  $('tTitle').value=''; $('tNumber').value=''; $('tNotes').value='';
  $('tPhoto').value=''; $('previewImg').classList.add('hidden');
  $('btnClearLoc').click();
  currentPhotoFile=null;
}

// ===== Cargar tareas =====
async function loadTasks(){
  if(!currentUser) return;
  let q = db.collection('tasks').orderBy('createdAt','desc').limit(300);
  if(currentRole==='contributor') q = q.where('owner','==', currentUser.uid);
  const snap = await q.get();
  const list = $('taskList'); list.innerHTML='';

  snap.forEach(doc=>{
    const t = doc.data(); const id = doc.id;
    const item = document.createElement('div');
    item.className = 'card task';
    item.innerHTML = `
      <div class="head">
        <div>
          <div class="muted small">${t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : ''}</div>
          <h3 style="margin:4px 0 0">${t.title} ${t.number!=null?`<span class='pill'>#${t.number}</span>`:''}</h3>
        </div>
        <div class="pill">${t.ownerEmail||''}</div>
      </div>
      <div class="muted small"><b>Dirección:</b> ${t.address||'—'}</div>
      <div class="muted small"><b>Coords:</b> ${t.coords?`${t.coords[0].toFixed(6)}, ${t.coords[1].toFixed(6)}`:'—'}</div>
      <div id="map_${id}" class="map"></div>
      ${t.photoURL?`<div><img class="photo" src="${t.photoURL}" loading="lazy" /></div>`:''}
      ${t.notes?`<div class="muted"><b>Observaciones:</b> ${t.notes}</div>`:''}
      <div class="toolbar">
        ${currentRole==='admin'?`<button class="danger" onclick="deleteTask('${id}')">Eliminar</button>`:''}
      </div>
    `;
    list.appendChild(item);
    if(t.coords){
      const m = L.map(`map_${id}`, { attributionControl:false, zoomControl:false }).setView(t.coords, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 }).addTo(m);
      L.marker(t.coords).addTo(m);
    }
  });
}
$('btnRefresh').onclick = loadTasks;

// ===== Eliminar tarea (solo admin) =====
async function deleteTask(id){
  if(!confirm('¿Eliminar tarea?')) return;
  try{ await db.collection('tasks').doc(id).delete(); loadTasks(); }
  catch(e){ alert('No autorizado o error: '+e.message); }
}
window.deleteTask = deleteTask; // expose for onclick

// ===== Exportar a Excel (sin fotos, pero con enlace a URL opcional) =====
$('btnExport').onclick = async ()=>{
  if(!currentUser){ alert('Inicia sesión.'); return; }
  let q = db.collection('tasks').orderBy('createdAt','desc');
  if(currentRole==='contributor') q = q.where('owner','==', currentUser.uid);
  const snap = await q.get();
  const rows = [];
  snap.forEach(d=>{
    const t = d.data();
    rows.push({
      ID: d.id,
      Fecha: t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : '',
      Titulo: t.title||'',
      Numero: t.number||'',
      Observaciones: t.notes||'',
      Latitud: t.coords? t.coords[0]: '',
      Longitud: t.coords? t.coords[1]: '',
      Direccion: t.address||'',
      FotoURL: t.photoURL||'',
      Propietario: t.ownerEmail||''
    });
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
  XLSX.writeFile(wb, 'tareas_export.xlsx');
};
