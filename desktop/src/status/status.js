const params = new URLSearchParams(window.location.search);
const state = params.get('state');
const message = params.get('message');
const version = params.get('version');
const canRestart = params.get('canRestart') === 'true';
const canCheckUpdates = params.get('canCheckUpdates') === 'true';
const restartActivity = params.get('restartActivity');
const updateActivity = params.get('updateActivity');
const title = document.querySelector('#title');
const description = document.querySelector('#message');
const progress = document.querySelector('#progress');
const actions = document.querySelector('#actions');
const versionLabel = document.querySelector('#dsh-version');
const restartButton = document.querySelector('#restart-dsh');
const restartLabel = document.querySelector('#restart-label');
const restartSpinner = document.querySelector('#restart-spinner');
const updateButton = document.querySelector('#check-update');
const updateLabel = document.querySelector('#update-label');
const updateSpinner = document.querySelector('#update-spinner');

versionLabel.textContent = version ? `DSH ${version}` : 'DSH 版本未选择';
restartButton.disabled = !canRestart;
updateButton.disabled = !canCheckUpdates;
if (restartActivity === 'restarting') {
  restartButton.setAttribute('aria-busy', 'true');
  restartSpinner.hidden = false;
  restartLabel.textContent = '重启中…';
}
if (updateActivity === 'checking' || updateActivity === 'upgrading') {
  updateButton.setAttribute('aria-busy', 'true');
  updateSpinner.hidden = false;
  updateLabel.textContent = updateActivity === 'checking'
    ? '检查中…'
    : '升级中…';
}
restartButton.addEventListener('click', () => {
  window.location.href = 'dsh-desktop://restart';
});
updateButton.addEventListener('click', () => {
  window.location.href = 'dsh-desktop://check-update';
});

if (state === 'error') {
  title.textContent = 'DSH 未能启动';
  description.textContent = message || '请复制诊断信息后重试。';
  progress.hidden = true;
  actions.hidden = false;
} else if (message) {
  description.textContent = message;
}
