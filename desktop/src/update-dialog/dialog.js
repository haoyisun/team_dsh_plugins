const params = new URLSearchParams(window.location.search);
const kind = params.get('kind') || 'info';
const title = params.get('title') || 'DSH 更新';
const message = params.get('message') || '';
const detail = params.get('detail') || '';
const primary = params.get('primary') || '确定';
const secondary = params.get('secondary');
const initialFocus = params.get('initialFocus');

const icon = document.querySelector('#dialog-icon');
const titleElement = document.querySelector('#dialog-title');
const messageElement = document.querySelector('#dialog-message');
const detailElement = document.querySelector('#dialog-detail');
const primaryAction = document.querySelector('#primary-action');
const secondaryAction = document.querySelector('#secondary-action');
const closeAction = document.querySelector('#close-action');

document.body.dataset.kind = kind;
icon.textContent = kind === 'warning' ? '!' : kind === 'error' ? '×' : 'i';
titleElement.textContent = title;
messageElement.textContent = message;
detailElement.textContent = detail;
detailElement.hidden = !detail;
primaryAction.textContent = primary;
secondaryAction.textContent = secondary || '';
secondaryAction.hidden = !secondary;

function choose(value) {
  window.location.href = `dsh-dialog://${value}`;
}

primaryAction.addEventListener('click', () => choose('primary'));
secondaryAction.addEventListener('click', () => choose('secondary'));
closeAction.addEventListener('click', () => choose('cancel'));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') choose('cancel');
});

(initialFocus === 'secondary' && secondary
  ? secondaryAction
  : primaryAction).focus();
