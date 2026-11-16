// Nuvra's two scroll scenes, on the shared stage (assets/scenes/stage.js).
// Without GSAP, under reduced motion, or where a scene rests on a phone, each section shows its finished
// composition: the sentence and its English, the four steps and the pasted text.
(() => {
  if (!window.Stage) return;

  // position of el inside box, through the offset chain (transforms ignored, so tweens can read it live)
  const offset = (el, box) => {
    let x = 0, y = 0;
    for (let n = el; n && n !== box; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x, y };
  };

  // 1. The sentence turns: the English words you said are copied, exactly as said, from the Arabic sentence
  //    down to their places in the English one; the translation then arrives around them.
  Scenes.turn = (root, opts = {}) => Stage.scene(root, {
    hold: opts.hold ?? 1.5,
    scrub: Stage.lenis ? true : 0.5,
    build(tl, { q }) {
      const box = q('.turn-box')[0];
      // One tween per word: a staggered fromTo only applies its first word's starting state up front,
      // and every starting state must show at 0%.
      // The Arabic steps back first, still readable; the English words you said stay bright.
      tl.to(q('.turn-ar .t:not(.keep)'), { opacity: 0.45, duration: 0.14 }, 0.04);
      // Each English word you said leaves the Arabic sentence, slides along to its column, drops into its
      // place in the English one and stays there; a dimmed copy fills its slot in what you said. One after
      // the other, so the two never cross.
      q('.turn-ar .keep').forEach((word, i) => {
        const to = root.querySelector(`.turn-en .keep[data-keep="${word.dataset.keep}"]`);
        const at = 0.12 + i * 0.22, land = at + 0.26;
        tl.to(word, { x: () => offset(to, box).x - offset(word, box).x, duration: 0.26, ease: 'power2.out' }, at);
        tl.to(word, { y: () => offset(to, box).y - offset(word, box).y, duration: 0.26, ease: 'power2.in' }, at);
        tl.fromTo(to, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.001 }, land);
        tl.set(word, { x: 0, y: 0, opacity: 0 }, land);
        tl.to(word, { opacity: 0.45, duration: 0.08 }, land + 0.02);
      });
      // the English arrives around the kept words
      tl.fromTo(q('.cap-paste'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08 }, 0.46);
      q('.turn-en .t:not(.keep)').forEach((word, i) => {
        tl.fromTo(word, { autoAlpha: 0, yPercent: 70 }, { autoAlpha: 1, yPercent: 0, duration: 0.18, ease: 'power2.out' }, 0.5 + i * 0.045);
      });
    },
  });

  // 2. One shortcut, played: Ctrl + Alt + Space opens the pill, the words come while you talk, Enter
  //    finishes, and the English lands in the message field, unsent.
  Scenes.shortcut = (root, opts = {}) => Stage.scene(root, {
    hold: opts.hold ?? 3,
    beats: 4,
    phone: 'rest',
    scrub: Stage.lenis ? true : 0.5,
    build(tl, { q }) {
      const press = { y: 3, backgroundColor: '#e4f222', color: '#0b0c0d', duration: 0.03 };
      const release = { y: 0, backgroundColor: '#26272b', color: '#f2f2ee', duration: 0.03 };
      const shortcut = q('.k-ctrl, .k-alt, .k-space');
      const enter = q('.k-enter');
      const pill = q('.demo-pill');
      const said = q('.demo-said span');
      const out = q('.demo-out');

      // starting states are applied now, so 0% already shows the empty field (fromTo renders its start too)
      gsap.set(out, { display: 'none' });

      // step 1: the keypress
      tl.to(shortcut, { ...press, stagger: 0.012 }, 0.04);
      tl.fromTo(pill, { autoAlpha: 0, y: 16, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.08, ease: 'power3.out' }, 0.1);
      tl.to(shortcut, { ...release }, 0.16);
      // step 2: talking
      said.forEach((word, i) => tl.fromTo(word, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: 'power2.out' }, 0.27 + i * 0.05));
      // step 3: Enter, the pill closes, the English is pasted
      tl.to(enter, { ...press }, 0.52);
      tl.to(q('.demo-dots i'), { scale: 0.4, opacity: 0.4, duration: 0.04 }, 0.54);
      tl.to(enter, { ...release }, 0.58);
      tl.to(pill, { autoAlpha: 0, y: -10, scale: 0.96, duration: 0.06, ease: 'power2.in' }, 0.6);
      tl.to(said, { opacity: 0.45, duration: 0.05 }, 0.6);
      tl.set(q('.demo-placeholder'), { display: 'none' }, 0.66);
      tl.set(out, { display: 'inline' }, 0.66);
      tl.fromTo(out, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, 0.66);
      // step 4: it waits for you
      tl.fromTo(q('.demo-send'), { color: '#8a8f98' }, { color: '#e4f222', duration: 0.06 }, 0.8);
    },
  });

  Stage.smooth();
  Stage.init();
})();
