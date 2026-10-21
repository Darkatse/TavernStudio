# Theme project

This is a SillyTavern theme. `studio.json` mounts the project's files onto the settings SillyTavern reads when it starts:

- `theme.json` holds the fields of `power_user` that make up the theme's look. Changing them drives SillyTavern's own theme controls in the preview.
- `theme.css` is the theme's custom CSS, `power_user.custom_css`.
- `assets/` holds the theme's own images and fonts. The preview serves each at `/user/files/assets/<name>`, and the CSS refers to it by that path. The folder may be empty or missing.

The theme takes the project's name. Don't add a `theme` key to `theme.json`: it records which saved theme the user selected, and isn't part of the theme itself.

On export, `theme.json` and `theme.css` make one theme JSON that SillyTavern can import. It carries no files: a theme meant for others needs the files in `assets/` hosted where its users can reach them.
