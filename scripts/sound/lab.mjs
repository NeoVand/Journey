// The sound board: every cue's candidates side by side, to listen to and pick from.
// node scripts/sound/lab.mjs   then open http://localhost:5300
// Picks and notes are saved to sound-lab/picks.json as they're made.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { measure } from './measure.mjs';

const root = new URL('../../', import.meta.url);
const lab = new URL('sound-lab/', root);
const raw = new URL('raw/', lab);
const picksFile = new URL('picks.json', lab);
const statsFile = new URL('stats.json', lab);
const port = +(process.env.PORT ?? 5300);

const read = (u, fallback) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : fallback);

function state() {
	const cues = read(new URL('scripts/sound/prompts.json', root), []);
	const stats = read(statsFile, {});
	const files = existsSync(raw) ? readdirSync(raw).filter((f) => f.endsWith('.mp3')) : [];
	let measured = false;
	for (const f of files) {
		if (stats[f]) continue;
		try {
			stats[f] = measure(new URL(f, raw).pathname);
			measured = true;
		} catch {
			stats[f] = { error: true };
		}
	}
	if (measured) writeFileSync(statsFile, JSON.stringify(stats, null, 1));
	return {
		cues: cues.map((c) => ({ ...c, files: files.filter((f) => f.replace(/-\d+\.mp3$/, '') === c.id).sort((a, b) => parseInt(a.split('-').pop()) - parseInt(b.split('-').pop())) })),
		stats,
		picks: read(picksFile, {})
	};
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sound board</title>
<style>
:root { font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; color: #101a30; background: #eef5fc; }
body { max-width: 980px; margin: 0 auto; padding: 28px 22px 80px; }
h1 { font-size: 26px; margin: 0 0 4px; }
.lead { color: #33415c; margin: 0 0 22px; }
.group { margin: 30px 0 8px; font-size: 13px; font-weight: 700; color: #5a6680; }
.cue { background: #fff; border-radius: 14px; padding: 14px 16px; margin: 10px 0; box-shadow: 0 1px 0 rgb(16 26 48 / 0.08); }
.cue.done { box-shadow: inset 4px 0 0 #12a956, 0 1px 0 rgb(16 26 48 / 0.08); }
.head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.head b { font-size: 16px; }
.head code { color: #5a6680; font-size: 12px; }
.what { color: #33415c; margin: 2px 0 10px; }
.prompt { color: #7a8599; font-size: 12px; margin: -6px 0 10px; }
.takes { display: flex; flex-wrap: wrap; gap: 8px; }
.take { display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 6px; border-radius: 999px; background: #eef3fb; }
.take.picked { background: #d8f5e4; outline: 2px solid #12a956; }
.take button { border: 0; border-radius: 999px; width: 34px; height: 34px; background: #1f5fe0; color: #fff; font-size: 14px; cursor: pointer; }
.take button.playing { background: #101a30; }
.take label { display: flex; gap: 5px; align-items: center; cursor: pointer; font-size: 13px; }
.take small { color: #7a8599; font-size: 11px; }
.take.warn small { color: #c2410c; }
.note { margin-top: 10px; display: flex; gap: 8px; }
.note input { flex: 1; border: 1px solid #ccd6e6; border-radius: 10px; padding: 7px 10px; font: inherit; }
.none { font-size: 13px; color: #5a6680; display: flex; gap: 5px; align-items: center; }
.build { border: 0; border-radius: 999px; background: #101a30; color: #fff; padding: 9px 16px; font: 600 14px/1 inherit; cursor: pointer; }
.build:disabled { opacity: .5; }
#built { color: #33415c; font-size: 13px; margin-left: 8px; }
.saved { position: fixed; right: 18px; bottom: 18px; background: #101a30; color: #fff; padding: 8px 14px; border-radius: 999px; opacity: 0; transition: opacity .2s; }
.saved.on { opacity: 1; }
</style></head><body>
<h1>Sound board</h1>
<p class="lead"><button id="build" class="build">Use my picks on the site</button> <span id="built"></span></p>
<p class="lead">Each sound has a few takes. Press play to listen (they're levelled so quiet ones are easy to judge), pick the one that fits, or say what's wrong in the note and I'll make more. Everything saves as you go.</p>
<div id="list"></div>
<div class="saved" id="saved">Saved</div>
<script>
const ctx = new AudioContext();
let current = null;
const gainFor = (s) => (s && isFinite(s.peakDb) ? Math.min(30, Math.max(0, -3 - s.peakDb)) : 0);
async function play(file, btn, stats) {
  await ctx.resume();
  if (current) { current.src.stop(); current.btn.classList.remove('playing'); if (current.btn === btn) { current = null; return; } }
  const data = await (await fetch('/raw/' + file)).arrayBuffer();
  const buf = await ctx.decodeAudioData(data);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = Math.pow(10, gainFor(stats) / 20);
  src.connect(g).connect(ctx.destination); src.start();
  btn.classList.add('playing'); current = { src, btn };
  src.onended = () => { btn.classList.remove('playing'); if (current && current.src === src) current = null; };
}
let saveTimer;
async function save(picks) {
  await fetch('/picks', { method: 'POST', body: JSON.stringify(picks) });
  const s = document.getElementById('saved'); s.classList.add('on'); clearTimeout(saveTimer); saveTimer = setTimeout(() => s.classList.remove('on'), 900);
}
document.getElementById('build').onclick = async (e) => {
  const b = e.currentTarget; b.disabled = true; document.getElementById('built').textContent = 'Building…';
  const r = await fetch('/build', { method: 'POST' });
  document.getElementById('built').textContent = r.ok ? 'Done. Reload the site to hear them.' : 'Something went wrong: ' + (await r.text()).slice(0, 120);
  b.disabled = false;
};
fetch('/state').then((r) => r.json()).then(({ cues, stats, picks }) => {
  const list = document.getElementById('list');
  let group = null;
  for (const cue of cues) {
    if (cue.group !== group) { group = cue.group; const h = document.createElement('div'); h.className = 'group'; h.textContent = group || ''; list.append(h); }
    const el = document.createElement('div'); el.className = 'cue';
    const p = picks[cue.id] || {};
    const sync = () => el.classList.toggle('done', p.pick != null);
    el.innerHTML = '<div class="head"><b></b><code></code></div><div class="what"></div><div class="prompt"></div><div class="takes"></div><div class="note"><input placeholder="What would make it right? (heavier, shorter, less hiss...)"><label class="none"><input type="checkbox"> None of these</label></div>';
    el.querySelector('b').textContent = cue.title || cue.id;
    el.querySelector('code').textContent = cue.id + (cue.loop ? ' · loops' : '');
    el.querySelector('.what').textContent = cue.what || '';
    el.querySelector('.prompt').textContent = 'Asked for: ' + cue.prompt;
    const takes = el.querySelector('.takes');
    cue.files.forEach((f, i) => {
      const s = stats[f] || {};
      const t = document.createElement('div');
      // Room tones are meant to be quiet; a short sound this faint may be barely there.
      const quiet = !cue.loop && s.peakDb < -36;
      t.className = 'take' + (p.pick === i + 1 ? ' picked' : '') + (quiet ? ' warn' : '');
      t.innerHTML = '<button aria-label="Play">▶</button><label><input type="radio" name="' + cue.id + '"> Take ' + (i + 1) + '</label><small></small>';
      t.querySelector('small').textContent = (s.duration ? s.duration + 's' : '') + (quiet ? ' · barely there' : '');
      t.querySelector('button').onclick = (e) => play(f, e.currentTarget, s);
      const radio = t.querySelector('input');
      radio.checked = p.pick === i + 1;
      radio.onchange = () => { p.pick = i + 1; p.none = false; el.querySelector('.none input').checked = false; picks[cue.id] = p; takes.querySelectorAll('.take').forEach((x) => x.classList.remove('picked')); t.classList.add('picked'); sync(); save(picks); };
      takes.append(t);
    });
    if (!cue.files.length) takes.textContent = 'Not generated yet.';
    const note = el.querySelector('.note input');
    note.value = p.note || '';
    note.onchange = () => { p.note = note.value; picks[cue.id] = p; save(picks); };
    const none = el.querySelector('.none input');
    none.checked = !!p.none;
    none.onchange = () => { p.none = none.checked; if (none.checked) { p.pick = null; takes.querySelectorAll('.take').forEach((x) => x.classList.remove('picked')); takes.querySelectorAll('input').forEach((x) => (x.checked = false)); } picks[cue.id] = p; sync(); save(picks); };
    sync();
    list.append(el);
  }
});
</script></body></html>`;

createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/picks') {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			writeFileSync(picksFile, JSON.stringify(JSON.parse(body), null, 1));
			res.end('ok');
		});
		return;
	}
	if (req.method === 'POST' && req.url === '/build') {
		execFile('node', [new URL('build.mjs', import.meta.url).pathname], { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
			res.statusCode = err ? 500 : 200;
			res.end(err ? stderr || String(err) : stdout);
		});
		return;
	}
	if (req.url === '/state') {
		res.setHeader('content-type', 'application/json');
		return res.end(JSON.stringify(state()));
	}
	if (req.url?.startsWith('/raw/')) {
		const name = decodeURIComponent(req.url.slice(5));
		const file = new URL(name, raw);
		if (!name.includes('/') && existsSync(file)) {
			res.setHeader('content-type', 'audio/mpeg');
			return res.end(readFileSync(file));
		}
		res.statusCode = 404;
		return res.end();
	}
	res.setHeader('content-type', 'text/html; charset=utf-8');
	res.end(page);
}).listen(port, () => console.log(`Sound board on http://localhost:${port}`));
