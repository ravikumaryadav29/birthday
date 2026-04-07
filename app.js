/* ================================================================
   app.js  —  Full application logic
   KEY FIX: Photos stored in IndexedDB (not localStorage).
            IndexedDB holds 100s of MB; localStorage only ~5 MB.
            Images persist through refresh, browser close, reopen.
================================================================ */

/* ────────────────────────────────────────────
   1.  IndexedDB  SETUP
──────────────────────────────────────────── */
var DB_NAME    = 'lovesiteDB';
var DB_VERSION = 1;
var STORE_PHOTOS   = 'photos';    // stores { id, src, caption, order }
var db = null;

function openDB(callback) {
  if (db) { callback(db); return; }
  var req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onupgradeneeded = function (e) {
    var _db = e.target.result;
    if (!_db.objectStoreNames.contains(STORE_PHOTOS)) {
      var store = _db.createObjectStore(STORE_PHOTOS, { keyPath: 'id', autoIncrement: true });
      store.createIndex('order', 'order', { unique: false });
    }
  };

  req.onsuccess = function (e) {
    db = e.target.result;
    callback(db);
  };

  req.onerror = function () {
    showToast('⚠️ Storage error — IndexedDB unavailable.');
  };
}

/* Save one photo record { src, caption, order } */
function dbAddPhoto(src, caption, order, callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readwrite');
    var store = tx.objectStore(STORE_PHOTOS);
    var req   = store.add({ src: src, caption: caption || '', order: order });
    req.onsuccess = function () { if (callback) callback(req.result); };
    req.onerror   = function () { showToast('⚠️ Could not save photo.'); };
  });
}

/* Get all photos sorted by .order */
function dbGetAllPhotos(callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readonly');
    var store = tx.objectStore(STORE_PHOTOS);
    var req   = store.getAll();
    req.onsuccess = function () {
      var rows = req.result || [];
      rows.sort(function (a, b) { return a.order - b.order; });
      callback(rows);
    };
    req.onerror = function () { callback([]); };
  });
}

/* Delete one photo by id */
function dbDeletePhoto(id, callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readwrite');
    var store = tx.objectStore(STORE_PHOTOS);
    var req   = store.delete(id);
    req.onsuccess = function () { if (callback) callback(); };
  });
}

/* Update caption for one photo */
function dbUpdateCaption(id, caption, callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readwrite');
    var store = tx.objectStore(STORE_PHOTOS);
    var getReq = store.get(id);
    getReq.onsuccess = function () {
      var rec = getReq.result;
      if (!rec) return;
      rec.caption = caption;
      var putReq = store.put(rec);
      putReq.onsuccess = function () { if (callback) callback(); };
    };
  });
}

/* Bulk update order of all photos */
function dbSaveOrder(rows, callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readwrite');
    var store = tx.objectStore(STORE_PHOTOS);
    rows.forEach(function (row, i) {
      row.order = i;
      store.put(row);
    });
    tx.oncomplete = function () { if (callback) callback(); };
  });
}

/* Delete ALL photos */
function dbClearAllPhotos(callback) {
  openDB(function (_db) {
    var tx    = _db.transaction(STORE_PHOTOS, 'readwrite');
    var store = tx.objectStore(STORE_PHOTOS);
    var req   = store.clear();
    req.onsuccess = function () { if (callback) callback(); };
  });
}

/* ────────────────────────────────────────────
   2.  localStorage  KEYS  (small data only)
──────────────────────────────────────────── */
var LS = {
  visits:       'ls_visits',
  lovePass:     'ls_lovepass',
  adminPass:    'ls_adminpass',
  loveLetter:   'ls_loveletter',
  startDate:    'ls_startdate',
  specialDate:  'ls_specialdate',
  specialLabel: 'ls_speciallabel'
};

/* ────────────────────────────────────────────
   3.  APP STATE
──────────────────────────────────────────── */
var state = {
  phone:     '',
  step:      1,
  lovePass:  localStorage.getItem(LS.lovePass)  || 'gungun143',
  adminPass: localStorage.getItem(LS.adminPass) || 'admin123',
  noClicks:  0,
  visits:    parseInt(localStorage.getItem(LS.visits) || '0') + 1
};
localStorage.setItem(LS.visits, state.visits);

/* In-memory cache of photos (loaded from DB on admin open / gallery open) */
var photoCache = [];   /* [{ id, src, caption, order }] */

/* Fullscreen state */
var fsIndex  = 0;

/* Caption modal state */
var captionEditId = null;

/* Drag-reorder state */
var dragSrcIdx = -1;

/* ────────────────────────────────────────────
   4.  TOAST
──────────────────────────────────────────── */
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2800);
}

/* ────────────────────────────────────────────
   5.  SPARKLE CANVAS
──────────────────────────────────────────── */
(function initSparkles() {
  var canvas = document.getElementById('sparkleCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];
  var colors = ['#ff4e8b', '#ffd700', '#ff99c8', '#fff', '#ffb347', '#a78bfa', '#7effb2'];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  function spawnAt(x, y, n) {
    var tog = document.getElementById('sparkleToggle');
    if (tog && !tog.classList.contains('on')) return;
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3 - 1.5,
        r: 2 + Math.random() * 3,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  document.addEventListener('mousemove', function (e) { spawnAt(e.clientX, e.clientY, 3); });
  document.addEventListener('touchmove', function (e) {
    var t = e.touches[0]; spawnAt(t.clientX, t.clientY, 2);
  }, { passive: true });

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.05;
      p.alpha -= 0.025 / p.life;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      var spikes = 4, outerR = p.r, innerR = p.r * 0.4;
      ctx.moveTo(p.x, p.y - outerR);
      for (var s = 0; s < spikes * 2; s++) {
        var radius = s % 2 === 0 ? outerR : innerR;
        var angle  = (s * Math.PI) / spikes - Math.PI / 2;
        ctx.lineTo(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(loop);
  }
  loop();
})();

/* ────────────────────────────────────────────
   6.  FLOATING HEARTS
──────────────────────────────────────────── */
var hearts = ['❤️', '💕', '💖', '💗', '💝', '🌸', '✨', '💫'];
function spawnHearts() {
  var bg = document.getElementById('heartBg');
  setInterval(function () {
    var tog = document.getElementById('heartToggle');
    if (tog && !tog.classList.contains('on')) return;
    var h = document.createElement('div');
    h.className = 'floating-heart';
    h.innerHTML = hearts[Math.floor(Math.random() * hearts.length)];
    h.style.left = Math.random() * 100 + 'vw';
    h.style.animationDuration = (4 + Math.random() * 4) + 's';
    h.style.fontSize = (12 + Math.random() * 16) + 'px';
    bg.appendChild(h);
    setTimeout(function () { h.remove(); }, 8000);
  }, 700);
}
spawnHearts();

/* ────────────────────────────────────────────
   7.  SCREEN SWITCHING
──────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

/* ────────────────────────────────────────────
   8.  LOGIN  FLOW
──────────────────────────────────────────── */
function goStep(n) {
  state.step = n;
  ['step1', 'step2', 'step3'].forEach(function (s, i) {
    document.getElementById(s).style.display = (i + 1 === n) ? 'block' : 'none';
  });
  ['dot1', 'dot2', 'dot3'].forEach(function (d, i) {
    var el = document.getElementById(d);
    el.className = 'step-dot' + (i + 1 < n ? ' done' : i + 1 === n ? ' active' : '');
  });
}

function sendOtp() {
  var p = document.getElementById('phoneInput').value.trim();
  if (p.length < 10) { document.getElementById('err1').textContent = 'Please enter a valid 10-digit number'; return; }
  state.phone = p;
  var boxes = document.getElementById('otpBoxes');
  boxes.innerHTML = '';
  for (var i = 0; i < 6; i++) {
    var inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 1;
    inp.style.cssText =
      'width:46px;height:52px;text-align:center;font-size:20px;font-weight:700;' +
      'border-radius:12px;background:rgba(255,255,255,0.1);' +
      'border:1px solid rgba(255,100,150,0.5);color:#fff;outline:none;';
    inp.addEventListener('input', function (e) {
      if (e.target.value && e.target.nextElementSibling) e.target.nextElementSibling.focus();
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !e.target.value && e.target.previousElementSibling)
        e.target.previousElementSibling.focus();
    });
    boxes.appendChild(inp);
  }
  document.getElementById('err1').textContent = '';
  goStep(2);
}

function gmailLogin() { document.getElementById('err1').textContent = ''; goStep(3); }

function verifyOtp() {
  var digits = Array.from(document.querySelectorAll('#otpBoxes input'))
    .map(function (i) { return i.value; }).join('');
  if (digits === '123456') { document.getElementById('err2').textContent = ''; goStep(3); }
  else document.getElementById('err2').textContent = 'Wrong OTP. Demo OTP is: 123456';
}

function togglePw() {
  var inp = document.getElementById('pwInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function verifyPass() {
  var pw = document.getElementById('pwInput').value;
  if (pw === state.lovePass) { document.getElementById('err3').textContent = ''; showScreen('screenProposal'); }
  else document.getElementById('err3').textContent = 'Wrong password. Hint: your name + 143 💔';
}

/* ────────────────────────────────────────────
   9.  PROPOSAL
──────────────────────────────────────────── */
function moveNo() {
  var btn = document.getElementById('noBtn');
  state.noClicks++;
  var pad = 60;
  btn.style.position = 'fixed';
  btn.style.top  = (pad + Math.random() * (window.innerHeight - pad * 2)) + 'px';
  btn.style.left = (pad + Math.random() * (window.innerWidth  - pad * 2)) + 'px';
  btn.style.zIndex = 99;
  if (state.noClicks === 3)  btn.textContent = 'Catch me if you can 😏';
  if (state.noClicks === 6)  btn.style.opacity = '0.3';
  if (state.noClicks === 10) btn.style.display = 'none';
}

function sayYes() {
  var musToggle = document.getElementById('musicToggle');
  if (!musToggle || musToggle.classList.contains('on')) {
    var music = document.getElementById('bgMusic');
    if (music) music.play().catch(function () {});
  }
  var noBtn = document.getElementById('noBtn');
  if (noBtn) noBtn.style.display = 'none';
  showScreen('screenBday');
  var bdToggle = document.getElementById('bdayToggle');
  if (!bdToggle || bdToggle.classList.contains('on')) setTimeout(launchConfetti, 300);
  setTimeout(startBdayTyping, 600);
}

/* ────────────────────────────────────────────
   10.  CONFETTI
──────────────────────────────────────────── */
function launchConfetti() {
  var box    = document.getElementById('confettiBox');
  var colors = ['#ff4e8b', '#ffd700', '#ff99c8', '#fff', '#ff2e63', '#ffb347', '#a78bfa'];
  for (var i = 0; i < 120; i++) {
    (function () {
      var p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left             = Math.random() * 100 + 'vw';
      p.style.background       = colors[Math.floor(Math.random() * colors.length)];
      p.style.width            = (6 + Math.random() * 10) + 'px';
      p.style.height           = (6 + Math.random() * 10) + 'px';
      p.style.borderRadius     = Math.random() > 0.5 ? '50%' : '2px';
      p.style.animationDelay    = Math.random() * 2 + 's';
      p.style.animationDuration = (2 + Math.random() * 2) + 's';
      box.appendChild(p);
      setTimeout(function () { p.remove(); }, 5000);
    })();
  }
}

/* ────────────────────────────────────────────
   11.  BIRTHDAY TYPING
──────────────────────────────────────────── */
var bdayText =
  'HAPPY BIRTHDAY To YOU (MISS GUNGUN JI) 🕉️\n\n' +
  'आप सिर्फ मेरी पसंद नहीं हो…\n' +
  'आप वो सुकून हो जो मुझे हर परेशानी में चाहिए।\n' +
  'जब भी दुनिया मुझे थका देती है,\n' +
  'आपकी मुस्कान मेरी हिम्मत बन जाती है।\n\n' +
  'love yourself, care yourself 💍\n' +
  'keep smiling always for me because i know you are special for me ❤️\n\n' +
  'शिव की कृपा से जन्मदिन पर खुशियों की बहार मिले।,\n' +
  'महादेव का आशीर्वाद आपके जीवन में प्यार, सफलता और उत्तम स्वास्थ्य लेकर आए|\n' +
  'यह जन्मदिन आपके लिए नई ऊंचाइयों और सुखद यादों के साथ मंगलमय हो।\n' +
  'आपको जन्मदिन की बहुत-बहुत बधाई" 🕉️💞\n\n' +
  '💖 Forever Together — हमेशा साथ रहेंगे 💖';

function startBdayTyping() {
  var el = document.getElementById('bdayTyping');
  var i = 0; el.textContent = '';
  var t = setInterval(function () {
    if (i < bdayText.length) { el.textContent += bdayText[i]; i++; }
    else clearInterval(t);
  }, 40);
}

/* ────────────────────────────────────────────
   12.  GALLERY  (reads from IndexedDB)
──────────────────────────────────────────── */
var defaultEmojis = ['🌸', '💕', '✨', '🎀', '👑', '💫', '🌹', '💎', '🦋', '🌙', '⭐', '💐'];

function showGallery() {
  showScreen('screenGallery');
  dbGetAllPhotos(function (rows) {
    photoCache = rows;
    renderGallery(rows);
  });
}

function renderGallery(rows) {
  var grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';

  if (!rows || rows.length === 0) {
    // Show default emoji tiles
    defaultEmojis.forEach(function (emoji, i) {
      var div = document.createElement('div');
      div.className = 'gallery-item';
      div.style.justifyContent  = 'center';
      div.style.animationDelay  = (i * 0.08) + 's';
      div.textContent = emoji;
      grid.appendChild(div);
    });
    return;
  }

  rows.forEach(function (row, i) {
    var div = document.createElement('div');
    div.className = 'gallery-item';
    div.style.animationDelay = (i * 0.08) + 's';

    var img = document.createElement('img');
    img.src = row.src; img.className = 'gallery-img';
    div.appendChild(img);

    if (row.caption) {
      var cap = document.createElement('div');
      cap.className = 'gallery-caption';
      cap.textContent = row.caption;
      div.appendChild(cap);
    }

    (function (idx) {
      div.onclick = function () { openFullscreen(idx); };
    })(i);

    grid.appendChild(div);
  });
}

/* ────────────────────────────────────────────
   13.  FULLSCREEN VIEWER
──────────────────────────────────────────── */
function openFullscreen(idx) {
  if (!photoCache || photoCache.length === 0) return;
  fsIndex = idx;
  showFullscreenPhoto();
  document.getElementById('fullscreenViewer').style.display = 'flex';
  setupSwipe();
}

function showFullscreenPhoto() {
  var imgEl   = document.getElementById('fullscreenImg');
  var capEl   = document.getElementById('fullscreenCaption');
  var cntEl   = document.getElementById('fullscreenCounter');
  var row     = photoCache[fsIndex];
  imgEl.style.opacity = '0';
  imgEl.src = row.src;
  imgEl.onload = function () { imgEl.style.opacity = '1'; };
  capEl.textContent = row.caption || '';
  cntEl.textContent = (fsIndex + 1) + ' / ' + photoCache.length;
}

function prevPhoto() { fsIndex = (fsIndex - 1 + photoCache.length) % photoCache.length; showFullscreenPhoto(); }
function nextPhoto() { fsIndex = (fsIndex + 1) % photoCache.length; showFullscreenPhoto(); }
function closeFullscreen() { document.getElementById('fullscreenViewer').style.display = 'none'; }

document.addEventListener('keydown', function (e) {
  var v = document.getElementById('fullscreenViewer');
  if (v && v.style.display === 'flex') {
    if (e.key === 'ArrowLeft')  prevPhoto();
    if (e.key === 'ArrowRight') nextPhoto();
    if (e.key === 'Escape')     closeFullscreen();
  }
});

var _swipeStartX = 0;
function setupSwipe() {
  var v = document.getElementById('fullscreenViewer');
  v.ontouchstart = function (e) { _swipeStartX = e.touches[0].clientX; };
  v.ontouchend   = function (e) {
    var dx = e.changedTouches[0].clientX - _swipeStartX;
    if (Math.abs(dx) > 50) { dx > 0 ? prevPhoto() : nextPhoto(); }
  };
}

/* ────────────────────────────────────────────
   14.  SORRY LETTER
──────────────────────────────────────────── */
var sorryText =
  'My dearest Gungun Ji...\n\n' +
  'I\'m sorry if anything ever made you sad. 💔\n\n' +
  'You deserve all the happiness in this world.\n' +
  'Every smile on your face is my reason to keep going.\n\n' +
  'Even in your sadness, you\'re the most beautiful\n' +
  'soul I have ever known.\n\n' +
  'Please know — I am always here for you.\n' +
  'No matter what, no matter when.\n\n' +
  'Bas ek baar muskura do... 🌸\n' +
  'Tumhari khushi hi meri dua hai.\n\n' +
  '— Forever Yours ❤️';

function showSorry() {
  showScreen('screenSorry');
  var el = document.getElementById('sorryTyping');
  var i = 0; el.textContent = '';
  var t = setInterval(function () {
    if (i < sorryText.length) { el.textContent += sorryText[i]; i++; }
    else clearInterval(t);
  }, 35);
}

/* ────────────────────────────────────────────
   15.  LOVE LETTER
──────────────────────────────────────────── */
var defaultLoveLetter =
  '🌹 मेरी रूह, मेरी कायनात के नाम... (जन्मदिन विशेषांक) 🎂\n\n' +
  'मेरी प्यारी गुनगुन जी,\n\n' +
  'आज दिल में बहुत कुछ था, सोचा एक खत के जरिए आपको बताऊं। वैसे तो हम रोज बातें अब नहीं करते हैं, लेकिन जो सुकून तुम्हें याद करते हुए लिखने में हो रही है, वो कहीं और नहीं। ❤️\n\n' +
  'By the time you\'re 19 you\'ve learned everything - you only have to remember it! Many happy returns on your birthday 🎂\n\n' +
  'आज का दिन कैलेंडर 🗓️ की कोई मामूली तारीख नहीं है, बल्कि मेरे लिए किसी त्यौहार 🎑 से भी बड़ा है। आज उस इंसान का जन्मदिन है जिसने मेरी बेरंग सी दुनिया में मोहब्बत के सारे रंग भर दिए। ❤️✨\n\n' +
  'जैसे हर तरफ खुशबू सी घुल गई है। तुम्हारी वो बातें, वो छोटी-छोटी शरारतें और ओ छोटी छोटी बातों पे मुझे से रूठना मेरे को मानने के लिए मजबूर करना और जब मैं रूठूं फिर प्यार से मना लेना—ये सब मेरी जिंदगी के सबसे खूबसूरत हिस्से हैं। ✨\n\n' +
  'जब मैं पीछे मुड़कर देखता हूं, तो समझ आता है कि तुम्हारे आने से पहले मैं बस जी रहा था, पर तुमने मुझे जिंदगी का सही मतलब सिखाया। बिना कहे सब समझ जाने वाली तुम्हारी वो जादुई आंखें ओ प्यारी प्यारी गाल 😳 की ओ निशानी और मीठी मीठी चुपड़ी चुपड़ी बाते.. सच कहूं तो मुझे हर बार आप से फिर से प्यार हो जाता है। 💖✨\n\n' +
  '── आपके लिए मेरी खास शायरी ──\n\n' +
  '"दुआ है मेरी कि हर लम्हा तेरे लबों पर मुस्कान रहे, 😊\n' +
  'आप जहां भी कदम रखे, वहां खुशियों का आसमान रहे। 🌈\n' +
  'जैसे फूल खिलते हैं बहारों के आने से, 🌸\n' +
  'आपकी जिंदगी में भी हर दिन खुशियों का ही पैगाम रहे।" 🎂🎁\n\n' +
  'Aapki surat mere dil ❤️ mein aise basi hai,\n' +
  'Jaise phoolon 🌿 mein khushbu basi hai,\n' +
  'Mubarak ho aapko aapka janamdin 🎂,\n' +
  'Hamari toh har dua mein aapki hansi 🙂 basi hai.\n\n' +
  '── हमारा सफर और मेरी भावनाएं ──\n\n' +
  'आपके साथ बिताया हर लम्हा ऐसा लगता है जैसे कोई खूबसूरत फिल्म चल रही हो। जब आप मेरे करीब होती हो, तो वक्त जैसे थम सा जाता है। 💓\n\n' +
  'आप सिर्फ एक साल और बड़ी नहीं हुई हो, आप और भी ज्यादा हसीन और समझदार हो गई हो। आपकी सादगी और आपका वो मासूम सा चेहरा 😍 देख कर दिल आज भी वैसी ही धड़कनें महसूस करता है जैसी पहली बार किया था। 💓💓\n\n' +
  'Happy Birthday 🎂 to the most beautiful girl in the world! My life was just a collection of moments until you walked in and turned it into a story worth telling. You are my best friend and my soulmate all wrapped into one perfect person. I hope today brings ⚡ you as much joy 😍 as you\'ve brought into my life since the moment we met.\n\n' +
  '── आज इस खास मौके पर मेरे कुछ वादे ──\n\n' +
  '🤝 साथ का वादा: दुनिया चाहे कितनी भी बदल जाए, मेरा साथ हमेशा आपके साथ ही रहेगा चाहे आप मेरे साथ रहो या ना रहो।\n\n' +
  '🛡️ खुशी का वादा: मैं कोशिश करूंगा कि तुम्हारी आंखों में कभी आंसू न आएं, और अगर आएं भी, तो वो सिर्फ खुशी के हों।\n\n' +
  '📈💖 बढ़ते प्यार का वादा: जैसे-जैसे साल बीतेंगे, मेरा आपके लिए सम्मान और प्यार और भी गहरा होता जाएगा।\n\n' +
  'आप सिर्फ मेरी प्रेमिका नहीं हो, आप मेरी सबसे अच्छी दोस्त, मेरी गाइड और मेरा सुकून हो। आपके इस नए साल में मैं दुआ करता हूं कि आपको वो सब मिले जिसकी आप हकदार हो—और आप दुनिया की हर खुशी की हकदार हो! 🌈👑\n\n' +
  'जन्मदिन की ढेर सारी शुभकामनाएं, मेरी गुनगुन (पल्लवी)! 🎈🎁🥂\n\n' +
  'हमेशा-हमेशा के लिए सिर्फ आपका,\n[ रवि ] ✍️❤️';

function showLoveLetter() {
  showScreen('screenLoveLetter');
  var text = localStorage.getItem(LS.loveLetter) || defaultLoveLetter;
  var el = document.getElementById('loveLetterTyping');
  var i = 0; el.textContent = '';
  var t = setInterval(function () {
    if (i < text.length) { el.textContent += text[i]; i++; }
    else clearInterval(t);
  }, 30);
}

function saveLoveLetter() {
  var text = document.getElementById('loveLetterInput').value.trim();
  if (!text) return;
  localStorage.setItem(LS.loveLetter, text);
  document.getElementById('letterSuccess').textContent = 'Love letter saved! 💌';
  setTimeout(function () { document.getElementById('letterSuccess').textContent = ''; }, 3000);
}

/* ────────────────────────────────────────────
   16.  COUNTDOWN
──────────────────────────────────────────── */
function showCountdown() { showScreen('screenCountdown'); renderCountdown(); }

function renderCountdown() {
  var startDate   = localStorage.getItem(LS.startDate);
  var specialDate = localStorage.getItem(LS.specialDate);
  var specialLbl  = localStorage.getItem(LS.specialLabel) || 'Special Day 🎉';
  var now = new Date();

  // Days together
  var dtEl = document.getElementById('daysTogether');
  if (startDate) {
    var days = Math.floor((now - new Date(startDate)) / 86400000);
    dtEl.textContent = days >= 0 ? days : 0;
  } else {
    dtEl.textContent = '?';
  }

  var grid = document.getElementById('countdownGrid');
  grid.innerHTML = '';

  if (specialDate) {
    var target = new Date(specialDate); target.setHours(0, 0, 0, 0);
    var diff = Math.max(0, target - now);
    var d2 = Math.floor(diff / 86400000);
    var h  = Math.floor((diff % 86400000) / 3600000);
    var m  = Math.floor((diff % 3600000) / 60000);
    var s  = Math.floor((diff % 60000) / 1000);

    var lbl = document.createElement('div');
    lbl.style.cssText = 'grid-column:1/-1;font-size:13px;color:rgba(255,200,150,.8);margin-bottom:4px;';
    lbl.textContent = 'Countdown to ' + specialLbl;
    grid.appendChild(lbl);

    [{ v: d2, l: 'Days' }, { v: h, l: 'Hours' }, { v: m, l: 'Mins' }, { v: s, l: 'Secs' }]
      .forEach(function (u) {
        var box = document.createElement('div'); box.className = 'cd-box';
        box.innerHTML = '<div class="cd-num">' + String(u.v).padStart(2, '0') +
          '</div><div class="cd-label">' + u.l + '</div>';
        grid.appendChild(box);
      });
    setTimeout(renderCountdown, 1000);
  } else {
    grid.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:13px;padding:8px;grid-column:1/-1">' +
      'Set a special date in Admin ⚙</div>';
  }
}

function saveCountdownDates() {
  var sd  = document.getElementById('startDateInput').value;
  var spd = document.getElementById('specialDateInput').value;
  var lbl = document.getElementById('specialDateLabel').value.trim();
  if (sd)  localStorage.setItem(LS.startDate, sd);
  if (spd) localStorage.setItem(LS.specialDate, spd);
  if (lbl) localStorage.setItem(LS.specialLabel, lbl);
  document.getElementById('countdownSuccess').textContent = 'Dates saved! ✓';
  setTimeout(function () { document.getElementById('countdownSuccess').textContent = ''; }, 3000);
}

/* ────────────────────────────────────────────
   17.  ADMIN — CHECK / VERIFY
──────────────────────────────────────────── */
function checkAdmin() {
  document.getElementById('adminModal').style.display = 'flex';
  document.getElementById('adminPwInput').value = '';
  document.getElementById('adminErr').textContent = '';
}
function closeAdminModal() { document.getElementById('adminModal').style.display = 'none'; }

function verifyAdmin() {
  var pw = document.getElementById('adminPwInput').value;
  if (pw !== state.adminPass) {
    document.getElementById('adminErr').textContent = 'Wrong password. Default: admin123';
    return;
  }
  document.getElementById('adminModal').style.display = 'none';
  document.getElementById('statVisits').textContent = state.visits;

  // Restore date fields
  var sd = localStorage.getItem(LS.startDate);
  var sp = localStorage.getItem(LS.specialDate);
  var sl = localStorage.getItem(LS.specialLabel);
  if (sd) document.getElementById('startDateInput').value = sd;
  if (sp) document.getElementById('specialDateInput').value = sp;
  if (sl) document.getElementById('specialDateLabel').value = sl;

  // Restore love letter
  var letter = localStorage.getItem(LS.loveLetter);
  if (letter) document.getElementById('loveLetterInput').value = letter;

  // Load photos from IndexedDB and render grid
  dbGetAllPhotos(function (rows) {
    photoCache = rows;
    document.getElementById('statImgs').textContent = rows.length;
    renderAdminGrid(rows);
  });

  showScreen('screenAdmin');
}

/* ────────────────────────────────────────────
   18.  ADMIN — UPLOAD  (saves to IndexedDB)
──────────────────────────────────────────── */
function uploadImages(e) {
  var files = Array.from(e.target.files);
  if (!files.length) return;

  var progress = document.getElementById('uploadProgress');
  if (progress) progress.style.display = 'block';

  var loaded = 0;
  var startOrder = photoCache.length; // append after existing

  files.forEach(function (file, fi) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var src = ev.target.result;
      dbAddPhoto(src, '', startOrder + fi, function () {
        loaded++;
        if (loaded === files.length) {
          // Reload grid from DB
          dbGetAllPhotos(function (rows) {
            photoCache = rows;
            if (progress) progress.style.display = 'none';
            document.getElementById('statImgs').textContent = rows.length;
            renderAdminGrid(rows);
            showToast('✅ ' + files.length + ' photo(s) saved permanently!');
          });
        }
      });
    };
    reader.readAsDataURL(file);
  });

  e.target.value = ''; // reset input
}

// Drag-and-drop onto upload area
document.addEventListener('DOMContentLoaded', function () {
  var area = document.getElementById('uploadArea');
  if (!area) return;
  area.addEventListener('dragover', function (e) { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', function () { area.classList.remove('drag-over'); });
  area.addEventListener('drop', function (e) {
    e.preventDefault(); area.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files.length)
      uploadImages({ target: { files: e.dataTransfer.files, value: '' } });
  });
});

/* ────────────────────────────────────────────
   19.  ADMIN — RENDER GRID
         (drag-to-reorder + caption + delete)
──────────────────────────────────────────── */
function renderAdminGrid(rows) {
  var grid = document.getElementById('adminImgGrid');
  var hint = document.getElementById('reorderHint');
  grid.innerHTML = '';

  if (!rows || rows.length === 0) {
    grid.innerHTML = '<div class="no-photos-msg">No photos yet. Upload above.</div>';
    if (hint) hint.style.display = 'none';
    return;
  }
  if (hint) hint.style.display = 'block';

  rows.forEach(function (row, i) {
    var div = document.createElement('div');
    div.className = 'img-thumb';
    div.draggable = true;
    div.dataset.idx = i;

    // drag handle indicator
    var handle = document.createElement('div');
    handle.className = 'drag-handle'; handle.textContent = '⠿';
    div.appendChild(handle);

    // photo
    var img = document.createElement('img'); img.src = row.src;
    div.appendChild(img);

    // caption badge
    if (row.caption) {
      var badge = document.createElement('div');
      badge.className = 'thumb-caption-badge';
      badge.textContent = row.caption;
      div.appendChild(badge);
    }

    // hover overlay with Caption + Remove buttons
    var overlay = document.createElement('div');
    overlay.className = 'thumb-overlay';

    var capBtn = document.createElement('button');
    capBtn.className = 'thumb-btn';
    capBtn.textContent = row.caption ? '✏️ Edit Caption' : '💬 Add Caption';
    (function (photoId) {
      capBtn.onclick = function (e) { e.stopPropagation(); openCaptionModal(photoId); };
    })(row.id);

    var delBtn = document.createElement('button');
    delBtn.className = 'thumb-btn del';
    delBtn.textContent = '🗑️ Remove Photo';
    (function (photoId) {
      delBtn.onclick = function (e) {
        e.stopPropagation();
        if (!confirm('Remove this photo?')) return;
        dbDeletePhoto(photoId, function () {
          dbGetAllPhotos(function (newRows) {
            photoCache = newRows;
            document.getElementById('statImgs').textContent = newRows.length;
            renderAdminGrid(newRows);
            showToast('🗑️ Photo removed.');
          });
        });
      };
    })(row.id);

    overlay.appendChild(capBtn);
    overlay.appendChild(delBtn);
    div.appendChild(overlay);

    // ── Drag-to-reorder ──
    div.addEventListener('dragstart', function (e) {
      dragSrcIdx = parseInt(this.dataset.idx);
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', function () {
      this.classList.remove('dragging');
      document.querySelectorAll('.img-thumb').forEach(function (t) { t.classList.remove('drag-over-th'); });
    });
    div.addEventListener('dragover', function (e) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.img-thumb').forEach(function (t) { t.classList.remove('drag-over-th'); });
      this.classList.add('drag-over-th');
    });
    div.addEventListener('drop', function (e) {
      e.preventDefault();
      var targetIdx = parseInt(this.dataset.idx);
      if (dragSrcIdx === targetIdx) return;
      // Reorder in-memory array
      var newRows = photoCache.slice();
      var moved = newRows.splice(dragSrcIdx, 1)[0];
      newRows.splice(targetIdx, 0, moved);
      // Save new order to DB then re-render
      dbSaveOrder(newRows, function () {
        dbGetAllPhotos(function (updatedRows) {
          photoCache = updatedRows;
          renderAdminGrid(updatedRows);
          showToast('↕ Order saved!');
        });
      });
    });

    grid.appendChild(div);
  });
}

/* ────────────────────────────────────────────
   20.  CAPTION MODAL
──────────────────────────────────────────── */
function openCaptionModal(photoId) {
  captionEditId = photoId;
  // Find photo in cache
  var row = photoCache.find(function (r) { return r.id === photoId; });
  if (!row) return;
  document.getElementById('captionPreviewImg').src = row.src;
  document.getElementById('captionInput').value   = row.caption || '';
  document.getElementById('captionModal').style.display = 'flex';
}

function closeCaptionModal() {
  document.getElementById('captionModal').style.display = 'none';
  captionEditId = null;
}

function saveCaption() {
  var text = document.getElementById('captionInput').value.trim();
  dbUpdateCaption(captionEditId, text, function () {
    closeCaptionModal();
    dbGetAllPhotos(function (rows) {
      photoCache = rows;
      renderAdminGrid(rows);
      showToast('💬 Caption saved!');
    });
  });
}

/* ────────────────────────────────────────────
   21.  ADMIN — CLEAR ALL
──────────────────────────────────────────── */
function clearAllPhotos() {
  if (!photoCache || photoCache.length === 0) { showToast('No photos to clear.'); return; }
  if (!confirm('Remove ALL ' + photoCache.length + ' photo(s) permanently?')) return;
  dbClearAllPhotos(function () {
    photoCache = [];
    document.getElementById('statImgs').textContent = 0;
    renderAdminGrid([]);
    showToast('🗑️ All photos cleared.');
  });
}

/* ────────────────────────────────────────────
   22.  ADMIN — CHANGE PASSWORDS
──────────────────────────────────────────── */
function changePw() {
  var np = document.getElementById('newPw').value.trim();
  if (np.length < 4) return;
  state.lovePass = np;
  localStorage.setItem(LS.lovePass, np);
  document.getElementById('pwSuccess').textContent = 'Love password updated! ✓';
  setTimeout(function () { document.getElementById('pwSuccess').textContent = ''; }, 3000);
  document.getElementById('newPw').value = '';
}

function changeAdminPw() {
  var np = document.getElementById('newAdminPw').value.trim();
  if (np.length < 4) return;
  state.adminPass = np;
  localStorage.setItem(LS.adminPass, np);
  document.getElementById('adminPwSuccess').textContent = 'Admin password updated! ✓';
  setTimeout(function () { document.getElementById('adminPwSuccess').textContent = ''; }, 3000);
  document.getElementById('newAdminPw').value = '';
}

/* ────────────────────────────────────────────
   23.  INIT  —  Pre-open the DB on page load
                so first actions are instant
──────────────────────────────────────────── */
openDB(function () {
  /* DB ready — nothing to do on startup for the user-facing side,
     photos load on-demand in showGallery() / verifyAdmin() */
});