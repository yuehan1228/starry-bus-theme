# Changelog

## 1.1.1

- Fix manual Night/Day selections from the host theme picker being overwritten by Auto polling.
- Keep Auto under its own theme ID; update its light/dark palette without changing the selected theme ID.
- Persist all three modes when selected from the host, plugin panel, or commands.
- Restore the selected mode on reload and preserve unrelated themes.
- Add regression tests for host picker selection, repeated polling, Auto resume, and reload.

## 1.1.0

- Add OS light/dark detection, automatic switching, and manual pinning.
- Bundle illustration assets and bilingual theme controls.
