# Verification boundaries

The release retains dependency-free automated tests for input/movement, collisions, camera transforms, scene reachability and selected interactions through DOM/canvas mocks. The Pixel Agents adaptation has its own deterministic self-tests. Build output comes only from the synthetic demo fixture.

The test command is `npm test`. A passing result checks only the scenarios implemented by these tests. In particular:

- Mocked browser history, pointer events, dialogs and canvas are not native browser acceptance.
- Scene-reachability checks exercise the movement engine on a 16-pixel search grid; they do not establish intuitive navigation or correct visual alignment.
- No physical-device, screen-reader, full accessibility, fullscreen or cross-browser acceptance has been completed.
- A prior real-browser test attempt in the development environment was blocked by its socket permission policy. No permission bypass is part of this project.
- No production readiness, finished interaction design or task-system integration is claimed.

The project remains paused and unfinished regardless of test results.
