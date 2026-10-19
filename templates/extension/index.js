// 我的扩展：在每条消息的名字旁显示字数，可以在扩展设置里关掉。
//
// SillyTavern 与 TauriTavern 都按 manifest.json 把这个文件作为 ES module 载入。
// 前端的接口一律从 SillyTavern.getContext() 取，不从前端源码导入：前者是公开接口，
// 源码里的模块路径和导出随版本变化。也不写死扩展的文件夹名：用 git 安装时，
// 文件夹名取自仓库名。

/** 设置存在 extensionSettings 的这个键下，随前端的 settings.json 保存。 */
const SETTINGS_KEY = 'my_extension';
/** 页面里属于这个扩展的 class 都以它开头，避免与前端或其他扩展冲突。 */
const PREFIX = 'my-extension';

const { eventSource, eventTypes, extensionSettings, saveSettingsDebounced } =
  SillyTavern.getContext();

// 已保存的设置在扩展载入前就读好了；缺的键取默认值。
const settings = (extensionSettings[SETTINGS_KEY] = {
  showLength: true,
  ...extensionSettings[SETTINGS_KEY],
});

/** 扩展设置页里的抽屉，前端会处理它的展开和收起。 */
function mountSettings() {
  const host = document.getElementById('extensions_settings2');
  if (!host) throw new Error('我的扩展：页面上没有 #extensions_settings2，无法放置设置');

  const root = document.createElement('div');
  root.className = `${PREFIX}-settings`;
  root.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>我的扩展</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label">
          <input type="checkbox" />
          <span>在消息旁显示字数</span>
        </label>
      </div>
    </div>`;
  const checkbox = root.querySelector('input');
  checkbox.checked = settings.showLength;
  checkbox.addEventListener('change', () => {
    settings.showLength = checkbox.checked;
    saveSettingsDebounced();
    renderLengths();
  });
  host.append(root);
}

/** 给聊天里的每条消息标上字数；关掉时移除。 */
function renderLengths() {
  const { chat } = SillyTavern.getContext();
  for (const message of document.querySelectorAll('#chat .mes')) {
    message.querySelector(`.${PREFIX}-length`)?.remove();
    const text = chat[Number(message.getAttribute('mesid'))]?.mes;
    const name = message.querySelector('.ch_name .name_text');
    if (!settings.showLength || text === undefined || !name) continue;

    const badge = document.createElement('small');
    badge.className = `${PREFIX}-length`;
    badge.textContent = `${[...text].length} 字`;
    name.after(badge);
  }
}

// APP_READY 会重放给晚注册的监听者：TauriTavern 在它之后才载入第三方扩展。
eventSource.on(eventTypes.APP_READY, () => {
  mountSettings();
  renderLengths();
  for (const event of [
    eventTypes.CHAT_CHANGED,
    eventTypes.MORE_MESSAGES_LOADED,
    eventTypes.USER_MESSAGE_RENDERED,
    eventTypes.CHARACTER_MESSAGE_RENDERED,
    eventTypes.MESSAGE_UPDATED,
    eventTypes.MESSAGE_SWIPED,
    eventTypes.MESSAGE_DELETED,
  ]) {
    eventSource.on(event, renderLengths);
  }
});
