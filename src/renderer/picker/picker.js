const grid = document.getElementById('grid');

function renderSources(sources) {
  grid.innerHTML = '';

  sources.forEach((source) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.sourceId = source.id;

    const img = document.createElement('img');
    img.src = source.thumbnail;
    img.alt = source.name;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = source.name || '이름 없음';

    card.appendChild(img);
    card.appendChild(label);
    card.addEventListener('click', () => {
      window.pickerApi.select(source.id);
    });

    grid.appendChild(card);
  });
}

window.pickerApi.onSources(renderSources);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.pickerApi.cancel();
  }
});
