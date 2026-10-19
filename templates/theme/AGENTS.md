# Theme project

This is a SillyTavern theme. `studio.json` mounts the project's files onto the settings SillyTavern reads when it starts:

- `theme.json` holds the fields of `power_user` that make up the theme's look. Changing them drives SillyTavern's own theme controls in the preview.
- `theme.css` is the theme's custom CSS, `power_user.custom_css`.

The theme takes the project's name. Don't add a `theme` key to `theme.json`: it records which saved theme the user selected, and isn't part of the theme itself.

On export, the two make one theme JSON that SillyTavern can import.
