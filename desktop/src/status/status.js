const params = new URLSearchParams(window.location.search);
const state = params.get('state');
const message = params.get('message');
const version = params.get('version');
const canCheckUpdates = params.get('canCheckUpdates') === 'true';
const updateActivity = params.get('updateActivity');
const title = document.querySelector('#title');
const description = document.querySelector('#message');
const progress = document.querySelector('#progress');
const actions = document.querySelector('#actions');
const versionLabel = document.querySelector('#dsh-version');
const updateButton = document.querySelector('#check-update');
const updateLabel = document.querySelector('#update-label');
const updateSpinner = document.querySelector('#update-spinner');

versionLabel.textContent = version ? `DSH ${version}` : 'DSH 版本未选择';
updateButton.disabled = !canCheckUpdates;
if (updateActivity === 'checking' || updateActivity === 'upgrading') {
  updateButton.setAttribute('aria-busy', 'true');
  updateSpinner.hidden = false;
  updateLabel.textContent = updateActivity === 'checking'
    ? '检查中…'
    : '升级中…';
}
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
