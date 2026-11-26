// Vanilla JS, sin bundler — igual que enelmapa. Tres comportamientos chicos:
// menú móvil, acordeón de preguntas frecuentes, y el input oculto `tipo` del
// formulario único de contacto, que cualquier botón "Quiero este servicio"
// puede fijar antes de hacer scroll hasta el formulario.

(function () {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('is-open');
    });
    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => menu.classList.remove('is-open'));
    });
  }

  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-item__q');
    q.addEventListener('click', () => {
      const wasOpen = item.classList.contains('is-open');
      document.querySelectorAll('.faq-item.is-open').forEach((i) => i.classList.remove('is-open'));
      if (!wasOpen) item.classList.add('is-open');
    });
  });

  const tipoInput = document.getElementById('lead-tipo');
  const tipoLabel = document.getElementById('lead-tipo-label');

  function setTipo(tipo, etiqueta) {
    if (tipoInput) tipoInput.value = tipo;
    if (tipoLabel) tipoLabel.textContent = etiqueta;
  }

  document.querySelectorAll('[data-lead-tipo]').forEach((el) => {
    el.addEventListener('click', () => {
      setTipo(el.getAttribute('data-lead-tipo'), el.getAttribute('data-lead-etiqueta') || '');
    });
  });

  // El control segmentado del hero ya no necesita JavaScript: desde la Fase 2
  // "Comprar" y "Arrendar" son enlaces al catálogo filtrado por operación
  // (/propiedades?operacion=...), así que el estado visual lo marca el propio
  // navegador y la navegación funciona con JS deshabilitado.

  // Contador animado simple, para cuando haya una cifra real que mostrar.
  document.querySelectorAll('[data-counter]').forEach((el) => {
    const target = Number(el.getAttribute('data-counter')) || 0;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        let current = 0;
        const step = Math.max(1, Math.round(target / 40));
        const timer = setInterval(() => {
          current += step;
          if (current >= target) {
            current = target;
            clearInterval(timer);
          }
          el.textContent = current;
        }, 25);
        obs.unobserve(el);
      });
    }, { threshold: 0.4 });
    obs.observe(el);
  });
})();
