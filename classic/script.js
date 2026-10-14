document.querySelectorAll('.card-head').forEach((head) => {
  head.addEventListener('click', () => {
    const card = head.closest('.card');
    const isOpen = card.classList.contains('open');

    document.querySelectorAll('.card.open').forEach((openCard) => {
      openCard.classList.remove('open');
      openCard.querySelector('.card-head').setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      card.classList.add('open');
      head.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  });
});
