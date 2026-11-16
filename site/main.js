// Nuvra landing page. Everything here is an enhancement: without it the page shows the first example and
// its answer and every section is visible. The scroll scenes live in scenes.js.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- entrances: once, as each part enters ----------
const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('is-in');
    reveal.unobserve(entry.target);
  }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

// ---------- loops pause when they are off screen ----------
const loops = new IntersectionObserver((entries) => {
  for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
});
document.querySelectorAll('.pill').forEach((el) => loops.observe(el));

// ---------- the live sentence ----------
const EXAMPLES = [
  {
    ar: 'راجع صفحة الـ login وحسّن الـ error messages',
    inline: [['Review the'], ' login ', ['page and improve the'], ' error messages'],
    structured: 'Review the login page and improve the error messages.',
  },
  {
    ar: 'ضيف زرار dark mode في الـ settings',
    inline: [['Add a toggle for'], ' dark mode ', ['in the'], ' settings'],
    structured: 'Add a dark mode toggle to the settings.',
  },
  {
    ar: 'الـ API بيرجّع 500 لما الـ token يخلص',
    inline: [['The'], ' API ', ['returns'], ' 500 ', ['when the'], ' token ', ['expires']],
    structured: 'When the token expires, the API returns a 500 error.',
  },
  {
    ar: 'عايز الـ form يعمل validate للـ email ولو فيه error اعرضه تحت الـ field',
    inline: [['I want the'], ' form ', ['to'], ' validate ', ['the'], ' email ', ['and if there is an'], ' error ', ['show it under the'], ' field'],
    structured: 'Update the form:\n• Validate the email.\n• If there is an error, show it under the field.',
  },
];

// Arabic letters, marks and the tatweel in الـ, as the app's inline mode treats them.
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿‌‍]+/g;
const normal = (s) => s.replace(/\s+/g, ' ').trim();
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Split what was said into runs of Arabic (translated) and everything else (kept as said).
function runs(text) {
  const out = [];
  const push = (ar, chunk) => {
    const last = out[out.length - 1];
    if (last && last.ar === ar) last.text += chunk; else out.push({ ar, text: chunk });
  };
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word)) { if (out.length) out[out.length - 1].text += word; continue; }
    let at = 0;
    for (const m of word.matchAll(ARABIC)) {
      if (m.index > at) push(false, word.slice(at, m.index));
      push(true, m[0]);
      at = m.index + m[0].length;
    }
    if (at < word.length) push(false, word.slice(at));
  }
  return out.map((r) => ({ ar: r.ar, text: r.text.trim() })).filter((r) => r.text);
}

const input = document.getElementById('say');
const answerText = document.getElementById('answer-text');
const answerNote = document.getElementById('answer-note');
const modeButtons = [...document.querySelectorAll('.answer-mode')];
const exampleButtons = [...document.querySelectorAll('[data-example]')];
let mode = 'inline';
const CARET = '<span class="answer-caret" aria-hidden="true"></span>';

function listKept(parts) {
  const words = parts.filter((r) => !r.ar).map((r) => r.text);
  return words.length ? words.join(', ') : '';
}

function render() {
  const said = normal(input.value);
  const example = EXAMPLES.find((e) => normal(e.ar) === said);
  const parts = runs(said);
  const arabic = parts.filter((r) => r.ar).length;
  const kept = listKept(parts);
  let html, note;

  exampleButtons.forEach((b) => b.setAttribute('aria-current', String(EXAMPLES[+b.dataset.example] === example)));

  if (!said) {
    html = '<span class="wait">Say something, or pick an example.</span>';
    note = 'Type what you would say into the line above.';
  } else if (mode === 'structured') {
    if (example) {
      html = escape(example.structured);
      note = 'Written by your Codex or Claude Code model, then pasted where your cursor was. Enter is still yours to press.';
    } else {
      html = '<span class="wait">In the app, your Codex or Claude Code model rewrites this whole request as clear instructions.</span>';
      note = 'Pick one of the examples to see a structured prompt.';
    }
  } else if (example) {
    html = example.inline.map((p) => (Array.isArray(p) ? `<span class="slot">${escape(p[0])}</span>` : escape(p))).join('');
    note = `Pasted where your cursor was. Kept as you said them: ${listKept(runs(example.ar))}. Enter is still yours to press.`;
  } else if (!arabic) {
    html = escape(said);
    note = 'No Arabic here, so it is pasted exactly as you said it.';
  } else {
    html = parts.map((r) => (r.ar ? `<span class="slot" lang="ar" dir="rtl">${escape(r.text)}</span>` : escape(r.text))).join(' ');
    note = kept
      ? `Nuvra translates the ${arabic === 1 ? 'highlighted phrase' : `${arabic} highlighted phrases`} and keeps the rest as you said it: ${kept}.`
      : 'All Arabic, so Nuvra translates the whole sentence.';
  }

  answerText.innerHTML = html + CARET;
  answerNote.textContent = note;
  if (!reduceMotion) { answerText.classList.remove('is-new'); void answerText.offsetWidth; answerText.classList.add('is-new'); }
}

// Keep the sentence on one line: shrink the type for a long sentence, down to a floor, then let it scroll.
const measure = document.createElement('canvas').getContext('2d');
function fitInput() {
  input.style.fontSize = '';
  const cs = getComputedStyle(input);
  const base = parseFloat(cs.fontSize);
  measure.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
  const width = measure.measureText(input.value || ' ').width;
  const room = input.clientWidth;
  if (width > room) input.style.fontSize = `${Math.max(base * 0.55, Math.floor(base * (room / width) * 0.97))}px`;
}

if (input) {
  input.addEventListener('input', () => { fitInput(); render(); });
  exampleButtons.forEach((b) => b.addEventListener('click', () => {
    input.value = EXAMPLES[+b.dataset.example].ar;
    fitInput();
    render();
  }));
  modeButtons.forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    modeButtons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    render();
  }));
  render();
}

// The app's shortcut works here too: it takes you to the line where you would speak.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && e.altKey && e.code === 'Space') || !input) return;
  e.preventDefault();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
});

if (input) {
  window.addEventListener('resize', fitInput);
  if (document.fonts) document.fonts.ready.then(fitInput);
  fitInput();
}
