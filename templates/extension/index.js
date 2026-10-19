// My Extension: shows how long each message is, beside its name; the extension
// settings can turn it off.
//
// SillyTavern and TauriTavern both load this file as an ES module, as manifest.json
// declares. Everything from the frontend comes through SillyTavern.getContext(), never
// from imports of its source: the context is the public interface, while module paths
// and exports in the source change between versions. Nor is the extension's folder
// name written in: installed with git, the folder takes the repository's name.
//
// Text on screen is written in English and goes through `t`, SillyTavern's
// localization. manifest.json's "i18n" maps a language to a file of translations,
// which the frontend loads for its own language before this file runs; `t` looks each
// text up there by its English, with ${0}, ${1}, … standing for the values, and keeps
// the English when there is no translation.

/** The settings live under this key of extensionSettings, saved with the frontend's settings.json. */
const SETTINGS_KEY = 'my_extension';
/** Every class the extension puts on the page starts with this, so none clashes with another's. */
const PREFIX = 'my-extension';

const { eventSource, eventTypes, extensionSettings, saveSettingsDebounced, t } =
  SillyTavern.getContext();

// Saved settings are read before extensions load; missing keys take their defaults.
const settings = (extensionSettings[SETTINGS_KEY] = {
  showLength: true,
  ...extensionSettings[SETTINGS_KEY],
});

/** The drawer in the extension settings; the frontend opens and closes it. */
function mountSettings() {
  const host = document.getElementById('extensions_settings2');
  if (!host) throw new Error('My Extension: no #extensions_settings2 on the page');

  const root = document.createElement('div');
  root.className = `${PREFIX}-settings`;
  root.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>${t`My Extension`}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label">
          <input type="checkbox" />
          <span>${t`Show character counts beside messages`}</span>
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

/** Labels each message in the chat with its length; removes the labels when turned off. */
function renderLengths() {
  const { chat } = SillyTavern.getContext();
  for (const message of document.querySelectorAll('#chat .mes')) {
    message.querySelector(`.${PREFIX}-length`)?.remove();
    const text = chat[Number(message.getAttribute('mesid'))]?.mes;
    const name = message.querySelector('.ch_name .name_text');
    if (!settings.showLength || text === undefined || !name) continue;

    const length = [...text].length;
    const badge = document.createElement('small');
    badge.className = `${PREFIX}-length`;
    badge.textContent = length === 1 ? t`1 char` : t`${length} chars`;
    name.after(badge);
  }
}

// APP_READY is replayed to listeners that come late: TauriTavern loads third-party
// extensions after it.
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
