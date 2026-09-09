const params = new URLSearchParams(window.location.search);
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
const recoveryLink = document.querySelector('#recovery-action');

const recoveryActions = {
  'reload-page': {
    href: 'dsh-desktop://reload-page',
    label: '重新加载页面',
  },
  'restart-runtime': {
    href: 'dsh-desktop://restart',
    label: '重新启动 DSH',
  },
  'retry-start': {
    href: 'dsh-desktop://retry',
    label: '重试启动',
  },
};
const errorTitles = {
  page: 'DSH 页面需要恢复',
  runtime: 'DSH 已意外退出',
  startup: 'DSH 未能启动',
  surface: 'DSH 页面显示异常',
};

let lastRevision = 0;

function render(model) {
  const revision = Number(model?.revision || 0);
  if (revision && revision <= lastRevision) return;
  if (revision) lastRevision = revision;

  const state = model?.state;
  const message = model?.message;
  const version = model?.version;
  const canRestart = String(model?.canRestart) === 'true';
  const canCheckUpdates = String(model?.canCheckUpdates) === 'true';
  const restartActivity = model?.restartActivity;
  const updateActivity = model?.updateActivity;
  const recovery = recoveryActions[model?.recoveryAction]
    || recoveryActions['retry-start'];

  versionLabel.textContent = version
    ? `DSH ${version}`
    : 'DSH 版本未选择';
  restartButton.disabled = !canRestart;
  restartButton.removeAttribute('aria-busy');
  restartSpinner.hidden = true;
  restartLabel.textContent = '重启 DSH';
  updateButton.disabled = !canCheckUpdates;
  updateButton.removeAttribute('aria-busy');
  updateSpinner.hidden = true;
  updateLabel.textContent = '检查更新';
  recoveryLink.href = recovery.href;
  recoveryLink.textContent = recovery.label;

  title.textContent = '正在启动 DSH';
  description.textContent = message
    || '首次启动可能需要从 npm 下载 DSH，请稍候。';
  progress.hidden = false;
  actions.hidden = true;

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

  if (state === 'error') {
    title.textContent = errorTitles[model?.errorKind]
      || errorTitles.startup;
    description.textContent = message || '请复制诊断信息后重试。';
    progress.hidden = true;
    actions.hidden = false;
  } else if (state === 'ready') {
    title.textContent = 'DSH 已启动';
    description.textContent = '正在显示 DSH 页面。';
    progress.hidden = true;
  }
}

restartButton.addEventListener('click', () => {
  window.location.href = 'dsh-desktop://restart';
});
updateButton.addEventListener('click', () => {
  window.location.href = 'dsh-desktop://check-update';
});

render(Object.fromEntries(params));
window.dshDesktopShell?.onState(render);
