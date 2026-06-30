/* ============================================
   标签栏自动隐藏：向下滚动隐藏，向上滚动显示
   仅作用于 .md-tabs，顶部标题栏始终可见
   ============================================ */

(function () {
  let lastScrollY = window.scrollY;
  let ticking = false;
  const HIDE_THRESHOLD = 80;

  function update() {
    const tabs = document.querySelector('.md-tabs');
    if (!tabs) return;

    const currentScrollY = window.scrollY;
    const delta = currentScrollY - lastScrollY;

    // 向下滚动且超过阈值 → 隐藏标签栏
    if (delta > 2 && currentScrollY > HIDE_THRESHOLD) {
      tabs.classList.add('md-tabs--hidden');
    }
    // 向上滚动 → 显示标签栏
    else if (delta < -1) {
      tabs.classList.remove('md-tabs--hidden');
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
})();
