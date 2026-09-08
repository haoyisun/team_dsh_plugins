const params = new URLSearchParams(window.location.search);
const state = params.get('state');
const message = params.get('message');
const title = document.querySelector('#title');
const description = document.querySelector('#message');
const progress = document.querySelector('#progress');
const actions = document.querySelector('#actions');

if (state === 'error') {
  title.textContent = 'DSH 未能启动';
  description.textContent = message || '请复制诊断信息后重试。';
  progress.hidden = true;
  actions.hidden = false;
} else if (message) {
  description.textContent = message;
}
