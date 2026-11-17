// One synchronous platform decision for downloads, keyboard labels and instructions.
// It does not depend on the release API or on Mac CPU architecture hints.
(() => {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)
    || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1);
  const os = mobile ? 'other' : /Win/i.test(platform) || /Windows NT/i.test(ua) ? 'windows'
    : /Mac/i.test(platform) || /Macintosh/i.test(ua) ? 'mac' : 'other';
  const keys = os === 'mac' ? { control: 'Control', alt: 'Option', finish: 'Return' }
    : { control: 'Ctrl', alt: 'Alt', finish: 'Enter' };
  window.nuvraPlatform = Object.freeze({ os, keys: Object.freeze(keys) });
  document.documentElement.dataset.platform = os;
  const otherDownloads = document.getElementById('other-platform-downloads');
  if (otherDownloads) {
    otherDownloads.hidden = os === 'windows';
    otherDownloads.open = os === 'other';
  }
  // Unsupported/mobile visitors retain the static instructions for both platforms.
  if (os === 'other') return;
  const t = (english, arabic) => document.documentElement.lang === 'ar' ? arabic : english;
  for (const node of document.querySelectorAll('[data-platform-key]')) {
    if (Object.hasOwn(keys, node.dataset.platformKey)) node.textContent = keys[node.dataset.platformKey];
  }
  const shortcut = `<kbd>${keys.control}</kbd> + <kbd>${keys.alt}</kbd> + <kbd>Space</kbd>`;
  const finish = `<kbd>${keys.finish}</kbd>`;
  const instructions = {
    start: t(`Press ${shortcut} in the field you are typing in.`, `دوس ${shortcut} في المكان اللي بتكتب فيه.`),
    finish: t(`Press ${finish} to finish. Clear English is pasted at your cursor.`, `دوس ${finish} عشان تخلّص. نص إنجليزي واضح بيتلصق مكان المؤشر.`),
  };
  const copy = {
    platformNote: os === 'mac' ? t('macOS 15+ preview · Also available for Windows', 'نسخة تجريبية لـ macOS 15+ · متاح كمان لويندوز')
      : t('Windows 10/11 · Also available as a macOS 15+ preview', 'ويندوز 10 و11 · متاح كمان كنسخة تجريبية لـ macOS 15+'),
    downloadIntro: os === 'mac'
      ? t('For macOS 15 or newer, on Apple Silicon and Intel. Free and open source.', 'لـ macOS 15 أو أحدث، على Apple Silicon وIntel. مجاني ومفتوح المصدر.')
      : t('For Windows 10 and 11, 64-bit. The installer adds Microsoft WebView2 if you need it. Free and open source.', 'لويندوز 10 و11 بنظام 64 بت. ملف التثبيت بيضيف Microsoft WebView2 لو محتاجه. مجاني ومفتوح المصدر.'),
    send: t(`Read it and send it yourself. Nuvra never presses ${keys.finish} in your app.`, `راجع النص وابعت بنفسك. Nuvra مش بيدوس ${keys.finish} في التطبيق بتاعك.`),
    demoSend: t(`${keys.finish} sends. Nuvra never presses it.`, `${keys.finish} بيبعت الرسالة. Nuvra مش بيدوسه.`),
    faqTitle: t(`Does Nuvra press ${keys.finish} or send anything for me?`, `هل Nuvra بيدوس ${keys.finish} أو بيبعت حاجة بدالي؟`),
    faqAnswer: t(`No. It pastes the text where your cursor was and stops there. Sending stays your action in your app. During a recording, ${keys.finish} only finishes the recording.`, `لأ. بيلصق النص مكان المؤشر وبس. إنت اللي بتبعت من التطبيق بتاعك. أثناء التسجيل، ${keys.finish} بيخلّص التسجيل بس.`),
  };
  for (const node of document.querySelectorAll('[data-platform-copy]')) {
    const key = node.dataset.platformCopy;
    // These templates contain only our fixed keyboard labels, never browser-provided text.
    if (Object.hasOwn(instructions, key)) node.innerHTML = instructions[key];
    else if (Object.hasOwn(copy, key)) node.textContent = copy[key];
  }
})();
