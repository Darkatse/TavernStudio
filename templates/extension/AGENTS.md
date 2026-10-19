# Extension project

This is a SillyTavern extension. It needs no build step and runs on both SillyTavern and TauriTavern. The project root is the extension root: push it to GitHub, and SillyTavern can install it from the repository's URL.

`studio.json` mounts four files into `default-user/extensions/my-extension/`, where the frontend finds them as the installed third-party extension `third-party/my-extension`:

- `manifest.json`: read once when the frontend starts. It declares the display name, the loading order, the `index.js` and `style.css` to load, and the translation files under `i18n`. The preview reloads when it changes.
- `index.js`: the extension's code, loaded as an ES module. The preview reloads when it changes.
- `style.css`: the extension's styles. The preview swaps them in place, without reloading.
- `i18n/zh-cn.json`: the Chinese for the extension's text. The preview reloads when it changes.

Text the extension shows is written in English and goes through `t` from `SillyTavern.getContext()`, as in `` t`${length} chars` ``. A translation file maps that English to the language's text, with `${0}`, `${1}`, … standing for the values: `"${0} chars": "${0} 字"`. The frontend loads the file for its own language before `index.js` runs, and keeps the English for text the file lacks. To add a language, add its file, map SillyTavern's code for it (such as `zh-tw` or `ja-jp`) to the file under `i18n` in `manifest.json`, and mount the file.

Any new file, such as an HTML template, needs a Mount into `default-user/extensions/my-extension/` in `studio.json` too; otherwise neither the preview nor the export has it.

To rename the extension, change `my-extension` in every Mount, `PREFIX` in `index.js` and the class prefix in `style.css`. `SETTINGS_KEY` is the key the settings are saved under; don't change it once the extension is published.

Export gives `my-extension.zip`; unzipped into `data/default-user/extensions/`, it is the installed extension.
